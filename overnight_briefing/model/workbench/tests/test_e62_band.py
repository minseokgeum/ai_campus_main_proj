import numpy as np
import pandas as pd
import pytest

from workbench import e62_band as e
from workbench.range_models import make_scale_model


def panel(days=140, codes=8, seed=1):
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2025-01-01", periods=days).strftime("%Y%m%d").tolist()
    rows = []
    for c in range(codes):
        for t in dates:
            x = rng.normal(0, .015)
            rows.append(dict(T=t, code=f"c{c}", x=x, ax=abs(x), g=x*.7, y=x*.7+rng.normal(0, .005+.5*abs(x)), sd08=.01, nvz=rng.normal(), tv=rng.normal(), vix=rng.normal(), e_earn=float(rng.random() < .01)))
    return pd.DataFrame(rows).sort_values(["T", "code"]).reset_index(drop=True)


def test_split_is_stable_disjoint_and_keeps_dev_in_design():
    codes = [f"{i:03d}" for i in range(200)]
    dev = codes[:14]
    a, b = e.split_stocks(codes, dev)
    assert (a, b) == e.split_stocks(list(reversed(codes)), dev)
    assert set(a).isdisjoint(b) and set(a) | set(b) == set(codes)
    assert set(dev) <= set(a) and len(b) == 93 and len(a) == 107


def test_classify_families_and_corrections():
    assert "e_earn" in e.classify("연결재무제표기준영업(잠정)실적(공정공시)")
    assert "e_earn" not in e.classify("[기재정정]연결재무제표기준영업(잠정)실적(공정공시)")
    assert "e_deal" in e.classify("단일판매ㆍ공급계약체결")
    assert "e_rumor" in e.classify("풍문또는보도에대한해명(미확정)")
    assert "e_periodic" in e.classify("분기보고서 (2026.03)")
    assert e.classify("임원ㆍ주요주주특정증권등소유상황보고서") == set()


def test_event_uses_d_to_before_t_and_never_t():
    cal = pd.DataFrame({"T": ["20260105", "20260106", "20260107"], "D": ["20260102", "20260105", "20260106"]})
    f = pd.DataFrame({"code": ["a", "a", "b", "c"], "rcept_dt": ["20260102", "20260103", "20260106", "20260107"], "report_nm": ["영업(잠정)실적(공정공시)", "단일판매ㆍ공급계약체결", "풍문또는보도에대한해명", "영업(잠정)실적(공정공시)"]})
    x = e.event_flags(f, cal).set_index(["T", "code"])
    assert x.loc[("20260105", "a"), "e_earn"] == 1 and x.loc[("20260105", "a"), "e_deal"] == 1
    assert x.loc[("20260107", "b"), "e_rumor"] == 1
    assert ("20260107", "c") not in x.index


def test_interval_score_matches_symmetric_form():
    y, c, h = np.array([.01, -.03, .0]), np.array([0., 0., .01]), np.array([.02, .02, .005])
    from workbench.range_models import interval_score as sym
    assert np.allclose(e.interval_score(y, c-h, c+h, .2), sym(y, c, h, .2))


def test_raw_band_rank_and_no_lookahead():
    a = np.arange(1, 101, dtype=float)/100
    out = e.raw_band(a, .8)
    assert np.isnan(out[79]) and np.isfinite(out[80])
    assert out[80] == np.sort(a[20:80])[48]
    b = a.copy()
    b[90:] = 99.
    assert np.allclose(e.raw_band(b, .8)[:91], out[:91], equal_nan=True)


def test_prior_rms_excludes_current_and_future():
    a = np.array([np.nan]+[.01]*30)
    b = a.copy()
    b[25:] = 5.
    assert np.allclose(e.prior_rms(a)[:26], e.prior_rms(b)[:26], equal_nan=True)


def test_fit_scale_matches_range_models_without_binary():
    p = panel()
    tr = p[p["T"] < sorted(p["T"].unique())[90]]
    a = e.fit_scale(tr, ["ax", "nvz"])(p)
    b = make_scale_model(tr, ["ax", "nvz"])(p)
    assert np.allclose(a, b)


def test_binary_event_is_not_clipped_away():
    p = panel()
    p.loc[p.e_earn > 0, "y"] = p.g + .05
    tr = p[p["T"] < sorted(p["T"].unique())[120]]
    m = e.fit_scale(tr, ["ax"], ["e_earn"])
    assert m.beta["e_earn"] > 0


@pytest.mark.parametrize("asym", [False, True])
def test_forecast_ignores_todays_and_future_targets(asym):
    p = panel()
    days = sorted(p["T"].unique())
    day = days[100]
    hist, today = p[p["T"] < day], p[p["T"] == day].drop(columns="y")
    a = e.forecast_day(hist, today, (["ax"], []), asym=asym)
    changed = p.copy()
    changed.loc[changed["T"] >= day, "y"] = 9.
    b = e.forecast_day(changed[changed["T"] < day], changed[changed["T"] == day].drop(columns="y"), (["ax"], []), asym=asym)
    assert np.allclose(a[["L80", "U80", "L90", "U90"]], b[["L80", "U80", "L90", "U90"]])
    assert (a.U80 >= a.L80).all() and (a.U90-a.L90 >= a.U80-a.L80-1e-12).all()


def test_candidates_train_only_on_training_codes():
    p = panel()
    days = sorted(p["T"].unique())[100:103]
    tr, ev = ["c0", "c1", "c2", "c3"], ["c4", "c5"]
    specs = {"S1": (["ax"], [])}
    a = e.run_candidates(p, tr, ev, days, specs=specs)["S1"]
    q = p.copy()
    q.loc[q.code.isin(ev), "y"] = 7.
    b = e.run_candidates(q, tr, ev, days, specs=specs)["S1"]
    assert np.allclose(a[["L80", "U80"]], b[["L80", "U80"]])


def test_choose_prefers_simplest_passing_and_requires_all_conditions():
    good = dict(delta=.1, rel=2., ci=[.01, .2], holm=.01, early=.1, late=.1)
    bad = dict(good, late=-.1)
    s = dict(cov=80., nights={"2% 이상": dict(cov=79.)})
    assert e.choose(None, {"E0": dict(bad), "S1": dict(good), "S2": dict(good)}, {"E0": s, "S1": s, "S2": s}, 72., ["E0", "S1", "S2"], lambda a, b: dict(rel=.1, ci=[.0, .1])) == "S1"
    assert e.choose(None, {"S1": dict(good), "S2": dict(good)}, {"S1": s, "S2": s}, 72., ["S1", "S2"], lambda a, b: dict(rel=2., ci=[.01, .1])) == "S2"
    far = dict(cov=80., nights={"2% 이상": dict(cov=60.)})
    assert e.choose(None, {"S1": dict(good)}, {"S1": far}, 72., ["S1"]) is None


def test_account_frame_uses_only_same_day_joint_errors():
    idx = pd.Index([f"2026{i:04d}" for i in range(1, 121)], name="T")
    rng = np.random.default_rng(3)
    E = pd.DataFrame(rng.normal(0, .01, (120, 3)), index=idx, columns=["a", "b", "c"])
    x = pd.Series(.01, index=idx)
    acc = [("n2_0", 2, ["a", "b"], np.array([.25, .75]))]
    f = e.account_frame(E, x, acc)
    assert np.allclose(f.y, E.a*.25+E.b*.75)
    assert np.isnan(f.raw80.iloc[79]) and np.isfinite(f.raw80.iloc[80])


def test_sealed_refuses_to_run_twice(tmp_path, monkeypatch):
    (tmp_path/"e62_choice.json").write_text("{}")
    (tmp_path/"e62_sealed.json").write_text("{}")
    monkeypatch.setattr(e, "OUT", tmp_path)
    with pytest.raises(SystemExit):
        e.stage_sealed()


def test_amended_gate_requires_every_night_bucket_and_noninferior_score():
    good = dict(cov=80., nights={"a": dict(cov=78., days=9), "b": dict(cov=82., days=9), "c": dict(cov=76., days=9)})
    low = dict(cov=80., nights={"a": dict(cov=78., days=9), "b": dict(cov=82., days=9), "c": dict(cov=70., days=9)})
    ok, bad = dict(ci=[-.1, .2]), dict(ci=[-.5, .2])
    assert e.amended_pass(good, ok, 8.)
    assert not e.amended_pass(low, ok, 8.)
    assert not e.amended_pass(good, bad, 8.)
    assert not e.amended_pass(good, dict(ci=[None, None]), 8.)
    assert not e.amended_pass(good, ok, 8., {1: 71., 3: 80.})
