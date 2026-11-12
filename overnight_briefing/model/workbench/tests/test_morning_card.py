"""아침 카드: 미래 정보를 쓰지 않는지, 봉인 단계와 같은 계산인지, 확정된 문구만 내는지.
실제 연구 패널을 한 번 읽어 쓴다(약 1분).
"""
import json

import numpy as np
import pandas as pd
import pytest

from workbench import e62_band as e
from workbench import morning_card as mc

DAY = "20261026"


def _refresh_log():
    return {"started_at": "2026-10-26T08:12:00+09:00", "finished_at": "2026-10-26T08:13:00+09:00",
            "trading_day": {"date": DAY, "open": True, "checked_by": "synthetic"},
            "premarket_days": {"asked": [DAY], "fetched": [DAY], "skipped": []}}


@pytest.fixture(scope="module")
def frames():
    return e.load_frames()


def _core(card):
    return [(s["code"], s["H"], s["band80"], s["band90"], s["grade_0811"], [c["kind"] for c in s["cautions"]]) for s in card["stocks"]]


def test_no_lookahead(frames):
    z, n, dev, codes = frames
    a = mc.build_card(z, n, dev, codes, DAY)
    rng = np.random.default_rng(0)
    z2, n2 = z[z["T"] <= DAY].copy(), n[n["T"] <= DAY].copy()
    z2.loc[z2["T"] == DAY, "y"] = rng.normal(0, .05, int((z2["T"] == DAY).sum()))
    n2.loc[n2["T"] == DAY, "y"] = rng.normal(0, .05, int((n2["T"] == DAY).sum()))
    b = mc.build_card(z2, n2, dev, codes, DAY)
    assert _core(a) == _core(b)
    assert a["candidates"] == b["candidates"]


def test_same_as_sealed_routine(frames):
    z, n, dev, codes = frames
    design, sealed = e.split_stocks(codes, dev)
    ref = e.run_candidates(z, design, sealed, [DAY], specs={"S1": e.SPECS["S1"]}, asym=())["S1"].set_index("code")
    card = {s["code"]: s for s in mc.build_card(z, n, dev, codes, DAY)["stocks"]}
    for code, r in ref.iterrows():
        assert card[code]["band80"] == [round(float(r.L80), 6), round(float(r.U80), 6)]


def test_grade_same_as_validated_function(frames):
    """카드 등급 = E64와 같은 표(trust_targets D08)로 그날 이전 개발 종목만 학습한 logit_prob 결과."""
    z, n, dev, codes = frames
    design, _ = e.split_stocks(codes, dev)
    d08 = e.trust_targets(z, n)["D08"]
    train = d08[d08.code.isin(design) & (d08["T"] < DAY)]
    test = n[n["T"] == DAY]
    p = dict(zip(test.code, e.logit_prob(train, test, e.B1)))
    card = {s["code"]: s["grade_0811"] for s in mc.build_card(z, n, dev, codes, DAY)["stocks"]}
    graded = {c: g for c, g in card.items() if g is not None}
    assert graded and set(graded) <= set(p)
    for code, g in graded.items():
        lv = "낮음" if p[code] < mc.CUTS[0] else "보통" if p[code] < mc.CUTS[1] else "높음"
        assert g["level"] == lv and abs(g["p"] - round(p[code], 3)) < 1e-9


def test_only_confirmed_messages(frames):
    z, n, dev, codes = frames
    card = mc.build_card(z, n, dev, codes, DAY, accounts={"t": {"cash": 0, "hold": {"005930": 1, "091160": 1}}})
    kinds = {c["kind"] for s in card["stocks"] for c in s["cautions"]} | {c["kind"] for c in card["market"]["cautions"]}
    assert kinds <= {"e_earn", "mon"}
    acc = card["accounts"][0]
    assert acc["account_band"]["value"] is None
    assert [x["code"] for x in acc["excluded"]] == ["091160"]
    assert "after_open" not in card


@pytest.fixture
def small_card(monkeypatch):
    """모형을 다시 맞추지 않고 시점·표시·금액 경계의 반례를 만든다."""
    z = pd.DataFrame({"T": [DAY] * 3, "D": ["20261023"] * 3,
                      "code": ["A", "B", "X"], "pc": [1e8, 1e8, 100.],
                      "y": [4e-9, 4e-9, 0.]})
    n = pd.DataFrame({"T": [DAY] * 2, "code": ["A", "B"], "g": [.01, -.01]})
    band = pd.DataFrame([dict(code=c, name=c, pc=1e8, H=4.9e-9,
                              L80=-5.1e-9, U80=5.1e-9, L90=-1e-8, U90=1e-8,
                              x=.01, ax=.01, mon=0., e_earn=0.) for c in ("A", "B")])
    gr = pd.DataFrame({"code": ["A", "B"], "g": [.01, -.01],
                       "p": [.95, .8], "level": ["높음", "보통"], "imputed_features": [[], []]})
    monkeypatch.setattr(mc, "stock_band", lambda *a: band.copy())
    monkeypatch.setattr(mc, "grade", lambda *a: gr.copy())
    monkeypatch.setattr(mc, "candidates", lambda *a: {})
    return z, n, [], ["A", "B"]


def test_0730_omits_later_grade_and_nxt_outcome(small_card, monkeypatch):
    z, n, dev, codes = small_card
    monkeypatch.setattr(mc, "grade", lambda *a: pytest.fail("0730 must not compute a current NXT grade"))
    card = mc.build_card(z, n, dev, codes, DAY, with_outcome=True, slot="0730")
    assert card["slot"] == "0730"
    assert all(s["grade_0811"] is None for s in card["stocks"])
    assert all(r["nxt_dir_match"] is None for r in card["after_open"]["rows"])
    n.loc[:, "g"] = 1e9
    changed = mc.build_card(z, n, dev, codes, DAY, with_outcome=True, slot="0730")
    assert card == changed


def test_0811_keeps_grade_but_replay_score_uses_exact_endpoints(small_card):
    card = mc.build_card(*small_card, DAY, with_outcome=True, slot="0811")
    assert card["slot"] == "0811"
    assert all(s["grade_0811"] is not None for s in card["stocks"])
    # 표시 끝점은 0으로 반올림되지만 원래 구간에는 4e-9가 포함된다.
    assert all(r["in_band80"] for r in card["after_open"]["rows"])
    assert [r["nxt_dir_match"] for r in card["after_open"]["rows"]] == [True, False]


def test_account_uses_exact_inputs_then_rounds_final_sum(small_card):
    accounts = {"p": {"cash": 500., "hold": {"A": 1, "B": 1, "X": 2}}}
    card = mc.build_card(*small_card, DAY, accounts=accounts, slot="0730")
    acc = card["accounts"][0]
    assert [r["H_amount"] for r in acc["holdings"]] == [0, 0]
    assert acc["H_sum_amount"] == 1  # round(.49 + .49), not round(.49) + round(.49)
    assert all(r["band80_amount"] == [-1, 1] for r in acc["holdings"])
    assert acc["summary_scope"] == "supported_holdings_only"
    v = acc["valuation"]
    assert v["status"] == "complete" and v["excluded_stock_value"] == 200
    assert v["total_stock_value"] == 200_000_200
    assert v["total_account_value"] == 200_000_700
    assert v["supported_stock_fraction"] == 200_000_000 / 200_000_200
    assert v["supported_account_fraction"] == 200_000_000 / 200_000_700
    assert acc["account_band"]["value"] is None


def test_unknown_excluded_price_leaves_total_and_coverage_unknown(small_card):
    accounts = {"p": {"cash": 500., "hold": {"A": 1, "X": 2, "MISSING": 3}}}
    acc = mc.build_card(*small_card, DAY, accounts=accounts, slot="0730")["accounts"][0]
    v = acc["valuation"]
    assert v["status"] == "incomplete" and v["unvalued_codes"] == ["MISSING"]
    assert v["known_excluded_stock_value"] == 200
    assert all(v[k] is None for k in ("excluded_stock_value", "total_stock_value", "total_account_value",
                                     "supported_stock_fraction", "supported_account_fraction"))
    assert acc["excluded"][-1]["value"] is None
    assert acc["stock_value"] == 100_000_000 and acc["summary_scope"] == "supported_holdings_only"


def test_account_position_values_are_not_rounded_before_multiplication_or_sum(small_card, monkeypatch):
    z, n, dev, codes = small_card
    z.loc[z.code.isin(codes), "pc"] = 1.49
    band = pd.DataFrame([dict(code=c, name=c, pc=1.49, H=.49,
                              L80=.1, U80=.9, L90=0., U90=1.,
                              x=.01, ax=.01, mon=0., e_earn=0.) for c in codes])
    monkeypatch.setattr(mc, "stock_band", lambda *a: band.copy())
    accounts = {"p": {"cash": 0., "hold": {"A": 1, "B": 1}}}
    acc = mc.build_card(z, n, dev, codes, DAY, accounts=accounts, slot="0730")["accounts"][0]
    assert [r["value"] for r in acc["holdings"]] == [1, 1]
    assert acc["stock_value"] == 3  # round(1.49 + 1.49), not 1 + 1
    assert [r["H_amount"] for r in acc["holdings"]] == [1, 1]  # round(1.49 * .49)
    assert acc["H_sum_amount"] == 1  # round(1.49 * .49 * 2), not 1 + 1


def test_all_invalid_stocks_return_status_card_with_dropped_codes(small_card, monkeypatch):
    z, n, dev, codes = small_card
    band = mc.stock_band(z, [], DAY)
    band["pc"] = np.nan
    monkeypatch.setattr(mc, "stock_band", lambda *a: band)
    monkeypatch.setattr(mc, "grade", lambda *a: pytest.fail("No eligible stock needs a grade"))
    card = mc.build_card(z, n, dev, codes, DAY, slot="0811")
    assert card["status"] == "no_signal" and card["reason"] == "no_eligible_stocks"
    assert card["slot"] == "0811" and card["D"] == "20261023"
    assert card["dropped"] == ["A", "B"] and card["stocks"] == [] and card["accounts"] == []
    assert card["market"]["x"] is None


def test_grade_requires_direction_and_finite_probability(monkeypatch):
    past = pd.DataFrame({"T": pd.bdate_range("2026-01-01", periods=60).strftime("%Y%m%d"),
                         "code": "A", "y": .01, "g": .01})
    bad_past = pd.DataFrame({"T": ["20260101"] * 4, "code": "A",
                             "y": [.01, np.inf, 0., .01], "g": [np.inf, .01, .01, 0.]})
    current = pd.DataFrame({"T": DAY, "code": ["zero", "nan", "inf", "ok", "bad_p"],
                            "y": np.nan, "g": [0., np.nan, np.inf, .01, -.01]})
    n = pd.concat([past, bad_past, current], ignore_index=True).assign(size=.01, lsd=0., r2=.5)
    n.loc[n.code == "ok", ["lsd", "r2"]] = [np.nan, np.inf]

    def predict(train, test, cols):
        assert len(train) == 60 and set(test.code) == {"ok", "bad_p"}
        assert "y" not in test
        assert test.loc[test.code == "ok", "lsd"].isna().all()
        assert np.isinf(test.loc[test.code == "ok", "r2"]).all()
        return np.array([.95, np.nan])

    monkeypatch.setattr(e, "logit_prob", predict)
    gr = mc.grade(n, ["A"], DAY)
    assert gr.code.tolist() == ["ok"] and gr.level.tolist() == ["높음"]
    assert gr.imputed_features.tolist() == [["lsd", "r2"]]


@pytest.mark.parametrize("args", [
    ["--root", "/not/read"],
    ["--root", "/not/read", "--slot", "0730", "--with-outcome"],
    ["--slot", "wrong"],
])
def test_invalid_live_or_slot_options_fail_before_loading(monkeypatch, args):
    monkeypatch.setattr("sys.argv", ["morning_card", "--date", DAY, *args])
    with pytest.raises(SystemExit) as exc:
        mc.main()
    assert exc.value.code == 2


def test_live_cli_preserves_0730_contract_and_labels_input_evidence(small_card, monkeypatch, tmp_path):
    import common
    from workbench import live_panel

    manifest = {"signal_T": {"valid": True, "D": "20261023"}, "inputs_sha256": {}}
    (tmp_path / "refresh_manifest.json").write_text(json.dumps(_refresh_log()))
    monkeypatch.setattr(live_panel, "frames", lambda *a, **k: (small_card, manifest))
    monkeypatch.setattr(common, "ACCOUNTS", {"p": {"cash": 500., "hold": {"A": 1, "B": 1, "X": 2}}})
    monkeypatch.setattr(mc, "grade", lambda *a: pytest.fail("0730 CLI must not compute a current NXT grade"))
    out = tmp_path / "card.json"
    monkeypatch.setattr("sys.argv", ["morning_card", "--date", DAY, "--root", str(tmp_path),
                                     "--slot", "0730", "--out", str(out)])
    mc.main()
    card = json.loads(out.read_text())
    assert card["mode"] == "live_snapshot" and card["slot"] == "0730"
    assert card["inputs"] == manifest and card["issued_at"]
    assert mc.REPLAY_NOTE not in card["notes"] and mc.LIVE_NOTE in card["notes"]
    assert all(s["grade_0811"] is None for s in card["stocks"]) and "after_open" not in card
    assert card["accounts"][0]["H_sum_amount"] == 1
    assert card["accounts"][0]["valuation"]["total_account_value"] == 200_000_700
    assert card["slot_nominal_at"] == "2026-10-26T07:30:00+09:00"
    assert pd.Timestamp(card["issued_at"]).tzinfo is not None


@pytest.mark.parametrize("issued_at,status", [
    ("2026-10-26T07:29:59+09:00", "before_nominal"),
    ("2026-10-26T07:30:00+09:00", "at_nominal"),
    ("2026-10-26T08:09:59+09:00", "after_nominal"),
    ("2026-10-26T08:10:00+09:00", "0730_issued_at_or_after_0810"),
    ("2026-10-27T07:00:00+09:00", "0730_issued_at_or_after_0810"),
])
def test_0730_issuance_timing_exposes_late_generation(issued_at, status):
    timing = mc.issuance_timing(DAY, "0730", issued_at)
    assert timing["slot_nominal_at"] == "2026-10-26T07:30:00+09:00"
    assert timing["timing_status"] == status
    replay = mc.issuance_timing(DAY, "0730", issued_at, historical_replay=True)
    assert replay["timing_status"] == "historical_replay"


@pytest.mark.parametrize("case,reason", [
    ("missing", "refresh_manifest_missing"),
    ("bad_json", "refresh_manifest_invalid"),
    ("not_object", "refresh_manifest_invalid"),
    ("nonfinite_json", "refresh_manifest_invalid"),
    ("naive_time", "refresh_manifest_invalid"),
    ("missing_finished", "refresh_incomplete"),
    ("reverse_time", "refresh_time_order_invalid"),
    ("future_started", "refresh_time_in_future"),
    ("future_finished", "refresh_time_in_future"),
    ("other_target", "refresh_target_mismatch"),
])
def test_live_manifest_failures_stop_before_loading_panels(tmp_path, monkeypatch, case, reason):
    from workbench import live_panel

    refresh = _refresh_log()
    if case == "naive_time":
        refresh["started_at"] = "2026-10-26T08:12:00"
    elif case == "nonfinite_json":
        refresh["finished_at"] = np.nan
    elif case == "missing_finished":
        del refresh["finished_at"]
    elif case == "reverse_time":
        refresh["finished_at"] = "2026-10-26T08:11:59+09:00"
    elif case in ("future_started", "future_finished"):
        refresh["finished_at"] = "2099-01-01T08:13:00+09:00"
        if case == "future_started":
            refresh["started_at"] = "2099-01-01T08:12:00+09:00"
    elif case == "other_target":
        refresh["trading_day"] = {"date": "20261023", "open": False}  # 휴장으로 오인하면 안 됨
    if case != "missing":
        (tmp_path / "refresh_manifest.json").write_text("{" if case == "bad_json" else "[]" if case == "not_object" else json.dumps(refresh))
    monkeypatch.setattr(live_panel, "frames", lambda *a, **k: pytest.fail("Unconfirmed refresh must not load panels"))
    out = tmp_path / "card.json"
    monkeypatch.setattr("sys.argv", ["morning_card", "--date", DAY, "--root", str(tmp_path), "--slot", "0811", "--out", str(out)])
    mc.main()
    card = json.loads(out.read_text())
    assert card["status"] == "data_not_ready" and card["reason"] == reason
    assert card["grade_status"]["reason"] == reason and card["stocks"] == []
    assert card["slot"] == "0811"


def test_night_readiness_uses_signal_day_across_weekend_and_actual_start():
    refresh = _refresh_log()
    refresh["started_at"] = "2026-10-26T05:50:00+09:00"  # 월요일 T의 06:05 전이어도 금 D 밤은 이미 끝남
    result = mc.night_readiness(refresh, DAY, {"valid": True, "D": "20261023"})
    assert result["status"] == "collection_gate_passed"
    assert result["night_collection_threshold_at"] == "2026-10-24T06:05:00+09:00"
    refresh["started_at"] = "2026-10-26T21:04:59+00:00"  # 화요일 KST 06:04:59
    refresh["finished_at"] = "2026-10-27T07:32:00+09:00"
    early = mc.night_readiness(refresh, "20261027", {"valid": True, "D": "20261026"})
    assert early["reason"] == "night_refresh_started_too_early"  # 완료가 늦어도 시작 기준
    refresh["started_at"] = "2026-10-26T21:05:00+00:00"
    assert mc.night_readiness(refresh, "20261027", {"valid": True, "D": "20261026"})["status"] == "collection_gate_passed"


@pytest.mark.parametrize("started,reason", [
    ("2026-10-24T06:04:59+09:00", "night_refresh_started_too_early"),
    ("2026-10-26T07:31:00+09:00", "night_input_missing_unknown_reason"),
])
def test_live_missing_night_does_not_infer_holiday_or_expiry(small_card, monkeypatch, tmp_path, started, reason):
    from workbench import live_panel

    refresh = _refresh_log()
    refresh["started_at"] = started
    (tmp_path / "refresh_manifest.json").write_text(json.dumps(refresh))
    manifest = {"signal_T": {"valid": False, "reason": "missing_night", "D": "20261023", "x": None}}
    monkeypatch.setattr(live_panel, "frames", lambda *a, **k: (small_card, manifest))
    monkeypatch.setattr(mc, "stock_band", lambda *a: pytest.fail("Not ready must not calculate a band"))
    out = tmp_path / "card.json"
    monkeypatch.setattr("sys.argv", ["morning_card", "--date", DAY, "--root", str(tmp_path), "--slot", "0730", "--out", str(out)])
    mc.main()
    card = json.loads(out.read_text())
    assert card["status"] == "data_not_ready" and card["reason"] == reason
    assert "휴장" not in card["reason_text"] and "만기" not in card["reason_text"]
    assert card["slot"] == "0730" and card["grade_status"]["status"] == "not_requested"


@pytest.mark.parametrize("case,reason", [
    ("early", "premarket_refresh_started_too_early"),
    ("skipped", "premarket_day_skipped"),
    ("not_fetched", "premarket_day_not_fetched"),
    ("invalid_record", "premarket_manifest_unconfirmed"),
    ("no_current_rows", "premarket_input_missing_unknown_reason"),
    ("zero_direction", "no_valid_nxt_direction"),
    ("model_unavailable", "grade_not_estimable"),
    ("ready", None),
])
def test_live_0811_grade_gate_keeps_band_and_explains_missing_grade(small_card, monkeypatch, tmp_path, case, reason):
    from workbench import live_panel

    refresh = _refresh_log()
    z, n, dev, codes = small_card
    if case == "early":
        refresh["started_at"] = "2026-10-25T23:10:59+00:00"  # KST 08:10:59, 완료는 08:13
    elif case == "skipped":
        refresh["premarket_days"] = {"asked": [DAY], "fetched": [], "skipped": [DAY]}
    elif case == "not_fetched":
        refresh["premarket_days"] = {"asked": [], "fetched": [], "skipped": []}
    elif case == "invalid_record":
        refresh["premarket_days"] = {"asked": DAY, "fetched": DAY, "skipped": []}
    elif case == "no_current_rows":
        n = n.iloc[:0]
    elif case == "zero_direction":
        n = n.assign(g=0.)
    elif case == "model_unavailable":
        monkeypatch.setattr(mc, "grade", lambda *a: pd.DataFrame(columns=["code", "g", "p", "level", "imputed_features"]))
    elif case == "ready":
        refresh["started_at"] = "2026-10-25T23:11:00+00:00"  # 정확히 KST 08:11
    (tmp_path / "refresh_manifest.json").write_text(json.dumps(refresh))
    manifest = {"signal_T": {"valid": True, "D": "20261023"}}
    monkeypatch.setattr(live_panel, "frames", lambda *a, **k: ((z, n, dev, codes), manifest))
    if reason and case != "model_unavailable":
        monkeypatch.setattr(mc, "grade", lambda *a: pytest.fail("Blocked NXT must not reach the grade model"))
    out = tmp_path / "card.json"
    monkeypatch.setattr("sys.argv", ["morning_card", "--date", DAY, "--root", str(tmp_path), "--slot", "0811", "--out", str(out)])
    mc.main()
    card = json.loads(out.read_text())
    assert card["status"] == "ok" and card["slot"] == "0811" and len(card["stocks"]) == 2
    assert card["data_readiness"]["status"] == "collection_gate_passed"
    assert card["grade_status"]["reason"] == reason
    assert all((s["grade_0811"] is None) == bool(reason) for s in card["stocks"])
    if not reason:
        assert card["grade_status"]["status"] == "available" and card["grade_status"]["graded_count"] == 2
