"""아침 카드: 07:30 종목 노란띠·주의 문구와 08:11 믿을 정도 등급을 화면 데이터(JSON)로 낸다.

규칙은 protocol_e62_band.json v2에서 봉인을 통과한 것만 쓴다.
- 노란띠: S1(중심 H, 폭 = 평소 오차 × 밤 크기로 조절), 80%는 화면, 90%는 자세히 보기.
- 믿을 정도: D08(NXT 08:10 방향 = 시가 방향) 로짓 3변수, 경계 0.75/0.90.
- 주의 문구: 어제 실적 공시(e_earn, D <= 접수일 < T), 월요일.
계수는 그날 이전의 설계 종목 행으로만 학습한다(계약과 같음). 그날 시가(y)는 계산 입력에서 지운다.
계좌 띠(AS1)·E73 두 신호 같은 후보는 candidates에 기록만 하고 문구를 만들지 않는다. 종목 띠를 더해 계좌 띠로 부르지 않는다.

모드: replay = 연구 패널(입력 해시 고정, 2025-07~2026-10-26). 실제 날짜는 입력 어댑터가 같은 열의 패널을 만들어 build_card에 넣는다.
    PYTHONPATH=.:src .venv/bin/python -m workbench.morning_card --date 20261026 --out /tmp/card.json [--with-outcome]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from workbench import e62_band as e

ROOT = Path(__file__).resolve().parents[1]
BAND = "S1"
CUTS = e.CUTS["D08"]
MSG = {"e_earn": "어제 실적 공시가 나온 종목이에요. 과거 이런 아침엔 시가가 범위 밖으로 더 자주 나갔어요.",
       "mon": "월요일 아침이에요. 과거 월요일엔 시가가 범위 밖으로 더 자주 나갔어요."}
DETAIL = {"e_earn": "봉인 구간 56종목-날: 화면 띠(S1) 안 49.5% vs 공시 없는 종목 79.3%(E64, 과거 자료)",
          "mon": "띠 안 74.2% vs 다른 요일 80.0%, 평소보다 약 19% 더 빗나감(E67, 과거 자료)"}
LEAK = ["y", "e", "target_observed"]
REPLAY_NOTE = "모든 수치는 과거 자료 재생이고 사전 예측 기록이 아니다."
LIVE_NOTE = "실제 날짜용 자료 폴더에서 만든 스냅샷이다. 이 모드와 생성 시각만으로 장전 봉인·I16 승인·미래 검증 기록을 뜻하지 않으며, 각각 별도 증거가 필요하다."


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _past_cut(series, day, q=2/3, window=250):
    """그날 이전 window개 값의 분위. 앞으로의 기록에서도 같은 방식으로 계산할 수 있게 과거만 쓴다."""
    s = series[series.index < day].dropna().tail(window)
    return float(s.quantile(q)) if len(s) >= 60 else None


def stock_band(z, design, day):
    """봉인 단계와 같은 run_candidates를 하루치로 부른다(학습 행 거르기·평가 행에서 y 빼기가 같다)."""
    codes = sorted(z.code.unique())
    out = e.run_candidates(z, design, codes, [day], specs={BAND: e.SPECS[BAND]}, asym=()).get(BAND)
    if out is None or out.empty:
        return None
    today = z[z["T"] == day].drop(columns=[c for c in LEAK if c in z.columns])
    return out.merge(today[["code", "name", "pc", "H", "x", "ax", "mon", "e_earn"]], on="code", how="left")


def grade(n, design, day):
    directional = np.isfinite(n.g) & (n.g != 0)
    past = n[(n["T"] < day) & n.code.isin(design) & np.isfinite(n.y) & (n.y != 0) & directional]
    train = past.assign(t=(np.sign(past.g) == np.sign(past.y)).astype(float))  # e62_band.trust_targets의 D08과 같은 정의
    test = n[(n["T"] == day) & directional].drop(columns=[c for c in LEAK if c in n.columns])
    if train.empty or test.empty or train["T"].nunique() < 60:
        return pd.DataFrame(columns=["code", "g", "p", "level", "imputed_features"])
    p = np.asarray(e.logit_prob(train, test, e.B1))
    usable = np.isfinite(p) & (p >= 0) & (p <= 1)
    test, p = test.loc[usable], p[usable]
    lv = np.select([p < CUTS[0], p < CUTS[1]], ["낮음", "보통"], "높음")
    missing = ~np.isfinite(test[e.B1].to_numpy(dtype=float))
    imputed = [[c for c, flag in zip(e.B1, row) if flag] for row in missing]
    return pd.DataFrame({"code": test.code.to_numpy(), "g": test.g.to_numpy(), "p": p, "level": lv,
                         "imputed_features": imputed})


def candidates(z, day):
    """E73 후보 두 개. 과거 분위만 쓴다. 화면 문구 없음."""
    d = z.groupby("T").apply(lambda g: float(((g.y - g.H).abs() / g.sd08).where(g.sd08 > 0).mean()), include_groups=False).sort_index()
    prev = [t for t in d.index if t < day]
    out = {}
    if prev:
        y1prev = d[prev[-1]]
        cut = _past_cut(d, prev[-1])
        out["어제 시가가 크게 빗나감"] = dict(value=round(y1prev, 3), cut=None if cut is None else round(cut, 3), on=None if cut is None else bool(y1prev >= cut), status="후보·표시 안 함(E73)")
    return out


REASONS = {"missing_night": "전날 밤 야간선물 자료가 없어요(연휴 앞 휴장이거나, 선물 만기일 밤이라 새 근월물 자료를 받지 않았어요)","contract_mismatch": "전날 주간과 야간 선물 계약이 달라 비교할 수 없어요",
           "unknown_flag": "야간 무거래 표시를 확인하지 못했어요", "official_no_trade": "전날 야간 세션에 거래가 없었어요",
           "invalid_price_or_volume": "야간 가격·거래량이 비어 있어요", "not_in_calendar": "거래일 매칭 표에 없는 날짜예요",
           "no_eligible_stocks": "가격과 범위를 확인할 수 있는 종목이 없어 오늘 종목 범위를 내지 않아요",
           "holiday": "KRX 휴장일이에요"}
LIVE_REASONS = {
    "refresh_manifest_missing": "자료 갱신 기록이 없어 준비 상태를 확인할 수 없어요.",
    "refresh_manifest_invalid": "자료 갱신 기록의 형식이나 시간대를 확인할 수 없어요.",
    "refresh_incomplete": "자료 갱신이 끝났다는 기록이 없어요.",
    "refresh_time_order_invalid": "자료 갱신의 시작·완료 시각 순서가 맞지 않아요.",
    "refresh_time_in_future": "자료 갱신 기록에 현재보다 미래인 시각이 있어요.",
    "refresh_target_mismatch": "자료 갱신 기록의 대상일이 이 카드의 날짜와 달라요.",
    "night_reference_unconfirmed": "야간 자료의 기준 거래일을 확인하지 못했어요.",
    "night_refresh_started_too_early": "해당 야간 자료를 받을 수 있는 시각 전에 갱신을 시작했어요.",
    "night_input_missing_unknown_reason": "필요한 야간 자료가 없어요. 누락 원인은 아직 확인되지 않았어요.",
    "slot_0730": "07:30 카드에서는 NXT 등급을 계산하지 않아요.",
    "premarket_refresh_started_too_early": "해당 날짜 08:11 전에 갱신을 시작해 NXT 등급을 계산하지 않아요.",
    "premarket_manifest_unconfirmed": "해당 날짜의 NXT 수집 기록을 확인할 수 없어요.",
    "premarket_day_skipped": "갱신 기록에서 해당 날짜의 NXT 수집이 생략됐어요.",
    "premarket_day_not_fetched": "갱신 기록에 해당 날짜의 NXT 수집 시도가 없어요.",
    "premarket_input_missing_unknown_reason": "해당 날짜의 NXT 입력이 없어요. 누락 원인은 아직 확인되지 않았어요.",
    "no_valid_nxt_direction": "해당 날짜에 방향을 계산할 수 있는 유효한 NXT 값이 없어요.",
    "grade_not_estimable": "입력 준비 조건을 확인했지만 등급을 계산할 수 있는 종목이 없어요.",
    "band_unavailable": "종목 범위를 낼 수 없는 상태라 NXT 등급도 내지 않아요.",
}


def status_card(day, status, reason, D=None, x=None):
    """구간을 내지 않는 날의 카드. 숫자 칸은 비우고 사유만 남긴다."""
    return dict(case_id=f"morning_{day}", status=status, reason=reason, reason_text=REASONS.get(reason, reason), T=day, D=D,
                market=dict(x=x, cautions=[]), stocks=[], accounts=[], candidates={},
                notes=["오늘은 06시 참고값과 시가 참고 범위를 내지 않아요."])


def build_card(z, n, dev, codes, day, accounts=None, with_outcome=False, signal=None, slot=None, allow_current_grade=True):
    """slot은 자료 시점 경계다. None의 자동 선택은 과거 재생 호환용이다."""
    if slot not in (None, "0730", "0811"):
        raise ValueError("slot must be 0730 or 0811")
    if signal is not None and not signal.get("valid", True):
        card = status_card(day, "no_signal", signal.get("reason", "unknown"), signal.get("D"), signal.get("x"))
        card["slot"] = slot or "0730"
        return card
    if not (z["T"] == day).any():
        card = status_card(day, "no_signal", "not_in_calendar")
        card["slot"] = slot or "0730"
        return card
    design, _sealed = e.split_stocks(codes, dev)
    band = stock_band(z, design, day)
    if band is None:
        raise SystemExit(f"{day}: 구간 학습 자료가 60거래일 미만이라 구간을 계산하지 않음")
    keep = np.isfinite(band.pc) & (band.pc > 0) & np.isfinite(band.H) & np.isfinite(band.L80) & np.isfinite(band.U80) & np.isfinite(band.L90) & np.isfinite(band.U90)
    dropped = sorted(band.loc[~keep, "code"].tolist())
    band = band[keep]
    if band.empty:
        D = str(z.loc[z["T"] == day, "D"].iloc[0])
        card = status_card(day, "no_signal", "no_eligible_stocks", D=D)
        card.update(slot=slot or "0730", dropped=dropped)
        return card
    gr = pd.DataFrame(columns=["code", "g", "p", "level", "imputed_features"]) if slot == "0730" or not allow_current_grade else grade(n, design, day)
    slot = slot or ("0811" if not gr.empty else "0730")
    band = band.merge(gr, on="code", how="left")
    mon = bool(band["mon"].iloc[0] > 0)
    D = str(z.loc[z["T"] == day, "D"].iloc[0])
    stocks = []
    for r in band.itertuples(index=False):
        caut = []
        if r.e_earn > 0:
            caut.append(dict(kind="e_earn", text=MSG["e_earn"], detail=DETAIL["e_earn"]))
        stocks.append(dict(
            code=r.code, name=r.name, kind="모델 추정", base_close=dict(value=float(r.pc), date=D, kind="관측"),
            H=round(float(r.H), 6),
            band80=[round(float(r.L80), 6), round(float(r.U80), 6)], band90=[round(float(r.L90), 6), round(float(r.U90), 6)],
            target_coverage=0.8, eligibility_status="ok",
            cautions=caut,
            grade_0811=None if pd.isna(r.level) else dict(level=str(r.level), p=round(float(r.p), 3), nxt_g=round(float(r.g), 6),
                                                       imputed_features=r.imputed_features, imputation_method="training_median",
                                                       kind="NXT 08:10 관측으로 계산한 등급"),
        ))
    # 금액 계산은 표시 반올림 전의 모델 값과 가격으로 한다.
    by = {r.code: r for r in band.itertuples(index=False)}
    today_prices = z[z["T"] == day].set_index("code").pc
    acc_out = []
    for name, a in (accounts or {}).items():
        rows, excl = [], []
        supported_value, supported_H, known_excluded_value = 0., 0., 0.
        unvalued = []
        for code, q in a["hold"].items():
            s = by.get(code)
            if s is None:
                pc = today_prices.get(code)
                valued = pc is not None and np.isfinite(pc) and pc > 0
                value = float(q) * float(pc) if valued else None
                if valued:
                    known_excluded_value += value
                else:
                    unvalued.append(code)
                excl.append(dict(code=code, q=q, value=None if value is None else round(value),
                                 base_close=None if not valued else dict(value=float(pc), date=D, kind="관측"),
                                 valuation_status="known" if valued else "unknown",
                                 reason="이 날 범위 계산 대상이 아님(ETF·이력 부족 등)"))
                continue
            v = float(q) * float(s.pc)
            h = v * float(s.H)
            supported_value += v
            supported_H += h
            rows.append(dict(code=code, q=q, value=round(v), H_amount=round(h),
                             band80_amount=[round(v * float(s.L80)), round(v * float(s.U80))]))
        total_stock = None if unvalued else supported_value + known_excluded_value
        total_account = None if total_stock is None else total_stock + float(a["cash"])
        acc_out.append(dict(name=name, cash=a["cash"], holdings=rows, excluded=excl,
                            stock_value=round(supported_value), H_sum_amount=round(supported_H),
                            summary_scope="supported_holdings_only",
                            valuation=dict(base_date=D, status="incomplete" if unvalued else "complete",
                                           supported_stock_value=round(supported_value),
                                           known_excluded_stock_value=round(known_excluded_value),
                                           excluded_stock_value=None if unvalued else round(known_excluded_value),
                                           total_stock_value=None if total_stock is None else round(total_stock),
                                           total_account_value=None if total_account is None else round(total_account),
                                           supported_stock_fraction=None if total_stock is None or total_stock <= 0 else supported_value / total_stock,
                                           supported_account_fraction=None if total_account is None or total_account <= 0 else supported_value / total_account,
                                           unvalued_codes=unvalued),
                            account_band=dict(status="후보(봉인 미달, E63) · 표시 방식 팀 결정 대기", value=None,
                                              note="종목 띠 금액을 더한 값은 계좌 범위가 아니다")))
    card = dict(
        case_id=f"morning_{day}", status="ok", mode="historical_replay", T=day, D=D, slot=slot,
        timeline={"band": "T 06:00 자료로 07:30 표시", "grade": "T 08:10 NXT 관측 뒤 08:11 표시"},
        versions=dict(band=BAND, grade="D08 B1 로짓", contract="protocol_e62_band.json v2",
                      protocol_sha256=sha(e.PROTOCOL), e62_band_sha256=sha(Path(e.__file__)), morning_card_sha256=sha(__file__)),
        market=dict(x=round(float(band.x.iloc[0]), 6), x_kind="관측(야간선물 06:00 종가 ÷ 전일 15:45 주간 종가 − 1)",
                    cautions=[dict(kind="mon", text=MSG["mon"], detail=DETAIL["mon"])] if mon else []),
        stocks=stocks, dropped=dropped, accounts=acc_out, candidates=candidates(z, day),
        notes=["노란띠는 시가 참고 범위이자 만약에의 기본 범위다. 확률이나 확신의 표시가 아니다.",
               REPLAY_NOTE])
    if with_outcome:
        y = z[z["T"] == day].set_index("code").y
        nn = n[n["T"] == day].set_index("code")
        rows = []
        for s in stocks:
            v = y.get(s["code"])
            if v is None or pd.isna(v):
                continue
            raw = by[s["code"]]
            g = nn.loc[s["code"], "g"] if slot == "0811" and s["code"] in nn.index else np.nan
            rows.append(dict(code=s["code"], y=round(float(v), 6), in_band80=bool(raw.L80 <= v <= raw.U80),
                             nxt_dir_match=None if not np.isfinite(g) or g == 0 or v == 0 else bool(np.sign(g) == np.sign(v))))
        card["after_open"] = dict(label="사후 결과(개장 뒤)", rows=rows,
                                  in_band80_share=round(float(np.mean([r["in_band80"] for r in rows])) * 100, 1) if rows else None)
    return card


def card_path(out, out_dir, day, slot):
    """덮어쓰지 않는 저장 경로. --out이 없으면 card_<T>_<slot>.json, 이미 있으면 _v2, _v3 …을 붙인다."""
    p = Path(out) if out else Path(out_dir) / f"card_{day}_{slot}.json"
    k, q = 2, p
    while q.exists():
        q = p.with_name(f"{p.stem}_v{k}{p.suffix}")
        k += 1
    return q


def issuance_timing(day, slot, issued_at, historical_replay=False):
    """실제 생성 시각과 목표 표시 시각의 관계만 기록한다. 장전 봉인 자격을 부여하지 않는다."""
    midnight = pd.to_datetime(day, format="%Y%m%d").tz_localize("Asia/Seoul")
    nominal = midnight + pd.Timedelta(hours=int(slot[:2]), minutes=int(slot[2:]))
    issued = pd.Timestamp(issued_at)
    if issued.tzinfo is None:
        raise ValueError("issued_at must include a timezone")
    if historical_replay:
        status = "historical_replay"
    elif slot == "0730" and issued >= midnight + pd.Timedelta(hours=8, minutes=10):
        status = "0730_issued_at_or_after_0810"
    else:
        status = "before_nominal" if issued < nominal else "after_nominal" if issued > nominal else "at_nominal"
    return dict(slot_nominal_at=nominal.isoformat(timespec="seconds"), timing_status=status)


def load_refresh_manifest(root, day, now):
    """완료된 해당 날짜 갱신 기록만 받는다. 기록이 있다는 사실은 수신 품질의 증명이 아니다."""
    path = Path(root) / "refresh_manifest.json"
    try:
        refresh = json.loads(path.read_text())
        json.dumps(refresh, allow_nan=False)  # JSON의 NaN/Infinity 확장을 준비 기록으로 받아들이지 않는다.
    except FileNotFoundError:
        return None, "refresh_manifest_missing"
    except (OSError, ValueError):
        return None, "refresh_manifest_invalid"
    if not isinstance(refresh, dict):
        return None, "refresh_manifest_invalid"
    if not refresh.get("finished_at"):
        return refresh, "refresh_incomplete"
    try:
        started, finished = pd.Timestamp(refresh["started_at"]), pd.Timestamp(refresh["finished_at"])
        if any(pd.isna(t) or t.tzinfo is None for t in (started, finished)):
            return refresh, "refresh_manifest_invalid"
    except (KeyError, TypeError, ValueError):
        return refresh, "refresh_manifest_invalid"
    if finished < started:
        return refresh, "refresh_time_order_invalid"
    if started > now or finished > now:
        return refresh, "refresh_time_in_future"
    td = refresh.get("trading_day")
    if not isinstance(td, dict) or not isinstance(td.get("open"), bool) or not isinstance(td.get("date"), str):
        return refresh, "refresh_manifest_invalid"
    if td["date"] != day:
        return refresh, "refresh_target_mismatch"
    return refresh, None


def night_readiness(refresh, day, signal):
    """live_refresh.finished와 같은 D+1 06:05를 쓴다. 휴일 뒤 T 06:05로 바꾸지 않는다."""
    signal = signal or {}
    D = signal.get("D")
    try:
        if not isinstance(D, str) or len(D) != 8 or not D.isdigit() or D >= day:
            raise ValueError("unconfirmed D")
        threshold = pd.to_datetime(D, format="%Y%m%d").tz_localize("Asia/Seoul") + pd.Timedelta(days=1, hours=6, minutes=5)
    except ValueError:
        return dict(status="data_not_ready", reason="night_reference_unconfirmed")
    meta = dict(night_collection_threshold_at=threshold.isoformat(timespec="seconds"))
    if pd.Timestamp(refresh["started_at"]) < threshold:
        return dict(status="data_not_ready", reason="night_refresh_started_too_early", **meta)
    if signal.get("reason") in ("missing_night", "not_in_calendar"):
        return dict(status="data_not_ready", reason="night_input_missing_unknown_reason", **meta)
    return dict(status="collection_gate_passed", reason=None, **meta)


def grade_readiness(refresh, day, n):
    """fetched는 시도 날짜일 뿐이다. 현재 방향 입력까지 있어야 등급 계산을 허용한다."""
    threshold = pd.to_datetime(day, format="%Y%m%d").tz_localize("Asia/Seoul") + pd.Timedelta(hours=8, minutes=11)
    if pd.Timestamp(refresh["started_at"]) < threshold:
        return dict(status="data_not_ready", reason="premarket_refresh_started_too_early")
    pm = refresh.get("premarket_days")
    if not isinstance(pm, dict) or any(not isinstance(pm.get(k), list) or not all(isinstance(v, str) for v in pm[k]) for k in ("asked", "fetched", "skipped")):
        return dict(status="data_not_ready", reason="premarket_manifest_unconfirmed")
    if day in pm["skipped"]:
        return dict(status="data_not_ready", reason="premarket_day_skipped")
    if day not in pm["asked"] or day not in pm["fetched"]:
        return dict(status="data_not_ready", reason="premarket_day_not_fetched")
    today = n[n["T"] == day]
    if today.empty:
        return dict(status="unavailable", reason="premarket_input_missing_unknown_reason")
    if not (np.isfinite(today.g) & (today.g != 0)).any():
        return dict(status="unavailable", reason="no_valid_nxt_direction")
    return dict(status="collection_gate_passed", reason=None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--out", help="저장 경로. 없으면 --out-dir/card_<T>_<slot>.json. 같은 이름이 있으면 _v2…를 붙여 새로 저장")
    ap.add_argument("--out-dir", default=str(ROOT / "workbench/runs/claude_live_r1"))
    ap.add_argument("--slot", choices=("0730", "0811"), help="실제 날짜 자료(--root)는 필수. 과거 재생에서만 생략 시 NXT 등급 유무로 자동 선택")
    ap.add_argument("--with-outcome", action="store_true")
    ap.add_argument("--root", help="실제 날짜용 자료 폴더(data/ 아래 같은 파일 이름). 없으면 연구 패널 재생")
    ap.add_argument("--events", help="--root와 함께: DART 공시 목록 CSV")
    a = ap.parse_args()
    if a.root and not a.slot:
        ap.error("--root requires an explicit --slot 0730 or 0811")
    if a.root and a.with_outcome:
        ap.error("--with-outcome is for historical replay only; live snapshots must keep outcomes separate")
    from common import ACCOUNTS
    signal = None
    if a.root:
        refresh, error = load_refresh_manifest(a.root, a.date, pd.Timestamp.now(tz="Asia/Seoul"))
        readiness = dict(status="data_not_ready", reason=error)
        grade_state = dict(status="not_requested", reason="slot_0730") if a.slot == "0730" else dict(status="unavailable", reason=error or "band_unavailable")
        if error:
            card, manifest = status_card(a.date, "data_not_ready", error), {}
        elif not refresh["trading_day"]["open"]:
            card, manifest = status_card(a.date, "holiday", "holiday"), dict(trading_day=refresh["trading_day"])
            readiness = dict(status="not_applicable", reason="holiday")
        else:
            from workbench import live_panel
            (z, n, dev, codes), manifest = live_panel.frames(a.root, a.events, T=a.date)
            signal = manifest.get("signal_T")
            readiness = night_readiness(refresh, a.date, signal)
            if readiness["status"] != "collection_gate_passed":
                card = status_card(a.date, "data_not_ready", readiness["reason"], (signal or {}).get("D"))
            else:
                if a.slot == "0811":
                    grade_state = grade_readiness(refresh, a.date, n)
                card = build_card(z, n, dev, codes, a.date, ACCOUNTS, a.with_outcome, signal=signal, slot=a.slot,
                                  allow_current_grade=grade_state["status"] == "collection_gate_passed")
                if grade_state["status"] == "collection_gate_passed":
                    count = sum(s["grade_0811"] is not None for s in card["stocks"])
                    reason = None if count else "grade_not_estimable" if card["status"] == "ok" else "band_unavailable"
                    grade_state = dict(status="available" if count else "unavailable", reason=reason, graded_count=count)
        manifest["refresh_manifest"] = refresh
        card["data_readiness"] = {**readiness, "reason_text": LIVE_REASONS.get(readiness["reason"], readiness["reason"])}
        card["grade_status"] = {**grade_state, "reason_text": LIVE_REASONS.get(grade_state["reason"], grade_state["reason"])}
        if card.get("reason") in LIVE_REASONS:
            card["reason_text"] = LIVE_REASONS[card["reason"]]
    else:
        z, n, dev, codes = e.load_frames()
        manifest = None
        card = build_card(z, n, dev, codes, a.date, ACCOUNTS, a.with_outcome, slot=a.slot)
    if manifest is not None:
        card["mode"] = "live_snapshot"
        card["inputs"] = manifest
        card["notes"] = [note for note in card["notes"] if note != REPLAY_NOTE] + [LIVE_NOTE]
    graded = sum(s.get("grade_0811") is not None for s in card["stocks"])
    slot = a.slot or card.get("slot", "0730")
    card["slot"] = slot
    card["issued_at"] = pd.Timestamp.now(tz="Asia/Seoul").isoformat(timespec="seconds")
    card.update(issuance_timing(a.date, slot, card["issued_at"], historical_replay=not bool(a.root)))
    out = card_path(a.out, a.out_dir, a.date, slot)
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(card, ensure_ascii=False, indent=1, allow_nan=False)
    out.write_text(text)
    Path(str(out) + ".sha256").write_text(hashlib.sha256(text.encode()).hexdigest() + "  " + out.name + "\n")
    print("saved", out, "status", card["status"], "stocks", len(card["stocks"]), "graded", graded, "issued", card["issued_at"])


if __name__ == "__main__":
    main()
