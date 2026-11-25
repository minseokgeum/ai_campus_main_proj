"""백테스트: 06:00 코스피200 야간선물 종가로 그날 09:00 시가(전일 종가 대비 등락률)를 계산하면 실제와 얼마나 맞나.

방식(10/26 대표님 요청과 같음): T일을 '오늘'로 놓고, T일 전까지의 자료(직전 250밤)로만 모델을 맞춘 뒤 T일 시가를 계산해
실제 시가와 비교한다. T를 하루씩 옮기며 반복한다(walk-forward). T일 이후 자료는 한 번도 쓰지 않는다.

    python src/backtest.py

산식
    r_야간(T) = 야간선물 종가(T일 06:00) / 주간 선물 종가(전날 15:45) − 1
    y_i(T)   = 종목 i 시가(T일 09:00) / 종목 i 종가(전날 15:30) − 1          ← 맞히려는 값(시가 등락률)
    M1:  ŷ_i = a_i + β_i · r_야간        (a_i, β_i는 직전 250밤 최소제곱)
    90% 범위: ŷ_i ± 1.645 · σ_i          (σ_i = 직전 250밤 잔차 표준편차)
    계좌: ŷ_계좌 = Σ w_i ŷ_i,  범위 ± 1.645 · √(wᵀ Σ w)   (w_i = 전날 종가 × 수량 / (평가액 + 현금), Σ = 잔차 공분산)

비교 모델(같은 방식으로 굴림)
    B0  0으로 놓기(야간선물을 안 봤을 때)       M0  ŷ = r_야간(β=1)
    M1  선형, 변수 1개(r_야간)                  M1b 선형, 변수 여러 개(FEATS_MULTI)
    M2g 그래디언트 부스팅(깊이 2)               M2r 랜덤 포레스트(잎 최소 10)
    트리는 계산량 때문에 5거래일마다 다시 맞춘다(그 사이에도 미래 자료는 안 씀).
"""
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor

from common import ACCOUNTS, DATA, INDEX, MIN_TRAIN, RESULTS, STOCKS, WINDOW, Z90

# 미국 변수는 06:00 전에 확정되는 것만 쓴다: SOX·EWY는 미국 현물 마감(여름 05:00, 겨울 06:00 KST).
# 나스닥·S&P 선물 일봉과 원/달러 일봉은 봉 마감 시각이 06:00 뒤일 수 있어(겨울 07:00 등) 넣지 않는다.
FEATS_MULTI = ["r_night", "night_range", "SOX", "EWY", "prev_intraday"]
SEP = ("20260901", "20260930")


def build_dataset(data=DATA) -> pd.DataFrame:
    """data: 자료 폴더(기본 data/). forward_log.py는 매일 새로 받은 사본 폴더를 넘긴다."""
    fut = pd.read_csv(data / "futures_daily.csv", dtype={"date": str, "code": str})
    day = fut[fut.session == "day"].set_index("date")
    night = fut[fut.session == "night"].set_index("date")
    days = list(day.index)
    rows = []
    for D, T in zip(days[:-1], days[1:]):
        if D not in night.index:
            continue
        if not (day.at[D, "code"] == day.at[T, "code"] == night.at[D, "code"]):
            continue                                    # 만기를 넘어가는 밤은 계약이 바뀌어 비교 불가 → 제외
        c0, n = day.at[D, "close"], night.at[D, "close"]
        rows.append({"T": T, "D": D, "r_night": n / c0 - 1, "night_range": (night.at[D, "high"] - night.at[D, "low"]) / c0,
                     "night_vol": night.at[D, "volume"], "y_FUT": day.at[T, "open"] / c0 - 1})
    base = pd.DataFrame(rows).set_index("T").sort_index()
    base["holiday_gap"] = [np.busday_count(pd.Timestamp(d).date(), pd.Timestamp(t).date()) > 1 for d, t in zip(base.D, base.index)]
    base["limit_hit"] = base.r_night.abs() >= 0.0795    # 야간 가격제한(±8%) 근처에서 멈춘 밤

    # 미국 일봉 수익률: 미국 D일 장 = 국내 D일 밤
    us = pd.read_csv(data / "us_daily.csv", dtype={"us_date": str})
    for sym in ("SOX", "EWY"):
        s = us[us.symbol == sym].set_index("us_date")["Close"].sort_index()
        base[sym] = s.pct_change().reindex(base.D).fillna(0.0).values   # 미국 휴장 밤은 0

    # 국내 시가 등락률
    kr = pd.read_csv(data / "kr_daily.csv", dtype={"date": str, "code": str})
    for code, g in kr.groupby("code"):
        g = g.sort_values("date").set_index("date")
        g = g[(g.Open > 0) & (g.Close > 0)]
        prev_date = pd.Series(g.index, index=g.index).shift(1)
        gap = g.Open / g.Close.shift(1) - 1
        ok = (prev_date.reindex(base.index).values == base.D.values) & (gap.reindex(base.index).abs() < 0.30).values
        base[f"y_{code}"] = np.where(ok, gap.reindex(base.index).values, np.nan)        # ±30% 넘으면 액면분할 등 → 제외
        base[f"pc_{code}"] = g.Close.shift(1).reindex(base.index).values                 # 전날 종가(계좌 비중용)
        base[f"in_{code}"] = (g.Close / g.Open - 1).shift(1).reindex(base.index).values  # 전날 장중 수익률
    return base


def train_window(d: pd.DataFrame, T: str) -> pd.DataFrame:
    """T일 계산에 쓰는 학습 구간: T보다 앞선 날짜 중 마지막 WINDOW개. 모든 모델이 이 함수만 쓴다."""
    tr = d[d.index < T].tail(WINDOW)
    assert (tr.index < T).all()                         # 미래 자료 금지
    return tr


def _fit_lin(X, y):
    X1 = np.column_stack([np.ones(len(X)), X])
    coef, *_ = np.linalg.lstsq(X1, y, rcond=None)
    res = y - X1 @ coef
    return coef, res.std(ddof=X1.shape[1])


def walk_forward(base: pd.DataFrame, target: str, test_idx, trees: bool = True) -> pd.DataFrame:
    """target: 'FUT', 'KS200' 또는 종목 코드. T마다 직전 WINDOW밤으로만 추정."""
    ycol = f"y_{target}"
    d = base.copy()
    d["prev_intraday"] = d[f"in_{target}"] if f"in_{target}" in d else 0.0
    d = d.dropna(subset=[ycol, "prev_intraday"])
    out, models, k = [], {}, 0
    for T in test_idx:
        if T not in d.index:
            continue
        tr = train_window(d, T)
        if len(tr) < MIN_TRAIN:
            continue
        y, x_t, row = tr[ycol].values, d.loc[T], {"T": T, "target": target, "y": d.at[T, ycol], "r_night": d.at[T, "r_night"]}
        row["B0"], row["sd_B0"] = 0.0, math.sqrt((y ** 2).mean())
        row["M0"], row["sd_M0"] = x_t.r_night, (y - tr.r_night.values).std(ddof=1)
        coef, sd = _fit_lin(tr[["r_night"]].values, y)
        row["M1"], row["sd_M1"], row["beta"], row["alpha"] = coef[0] + coef[1] * x_t.r_night, sd, coef[1], coef[0]
        coef, sd = _fit_lin(tr[FEATS_MULTI].values, y)
        row["M1b"], row["sd_M1b"] = coef[0] + coef[1:] @ x_t[FEATS_MULTI].values.astype(float), sd
        if trees:
            if k % 5 == 0:
                models["M2g"] = GradientBoostingRegressor(max_depth=2, n_estimators=150, learning_rate=0.05, subsample=0.8,
                                                          random_state=0).fit(tr[FEATS_MULTI], y)
                models["M2r"] = RandomForestRegressor(n_estimators=200, min_samples_leaf=10, max_features=0.6, random_state=0,
                                                      n_jobs=-1).fit(tr[FEATS_MULTI], y)
            for m in ("M2g", "M2r"):
                row[m] = float(models[m].predict(d.loc[[T], FEATS_MULTI])[0])
        k += 1
        out.append(row)
    return pd.DataFrame(out)


def walk_forward_accounts(base: pd.DataFrame, test_idx) -> pd.DataFrame:
    out = []
    for name, acc in ACCOUNTS.items():
        codes = list(acc["hold"])
        ycols, pcs = [f"y_{c}" for c in codes], [f"pc_{c}" for c in codes]
        d = base[["r_night"] + ycols + pcs].dropna()
        for T in test_idx:
            if T not in d.index:
                continue
            tr = train_window(d, T)
            if len(tr) < MIN_TRAIN:
                continue
            X1 = np.column_stack([np.ones(len(tr)), tr.r_night.values])
            Y = tr[ycols].values
            coef, *_ = np.linalg.lstsq(X1, Y, rcond=None)
            cov = np.atleast_2d(np.cov((Y - X1 @ coef).T, ddof=2))
            vals = np.array([acc["hold"][c] * d.at[T, f"pc_{c}"] for c in codes])
            total = vals.sum() + acc["cash"]
            w = vals / total
            pred = float(w @ (coef[0] + coef[1] * d.at[T, "r_night"]))
            sd = float(np.sqrt(w @ cov @ w))
            act = float(w @ d.loc[T, ycols].values.astype(float))
            out.append({"T": T, "account": name, "total": total, "r_night": d.at[T, "r_night"], "acct_beta": float(w @ coef[1]),
                        "y": act, "M1": pred, "sd_M1": sd, "M0": float(w.sum() * d.at[T, "r_night"]), "B0": 0.0,
                        "sd_B0": float(np.sqrt(((Y @ w) ** 2).mean()))})
    return pd.DataFrame(out)


def wilson(k, n, z=1.96):
    if n == 0:
        return (np.nan, np.nan)
    p = k / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return c - h, c + h


def metrics(df: pd.DataFrame, model: str) -> dict:
    y, p = df["y"].values, df[model].values
    e = y - p
    nz = y != 0
    agree = (np.sign(p) == np.sign(y))[nz]
    big = (np.abs(p) >= 0.005) & nz
    agree_big = (np.sign(p) == np.sign(y))[big]
    lo, hi = wilson(agree.sum(), len(agree))
    r = {"n": len(df), "MAE_%p": np.abs(e).mean() * 100, "RMSE_%p": np.sqrt((e ** 2).mean()) * 100,
         "MAE_0으로놓기_%p": np.abs(y).mean() * 100,
         "R2_oos(0 대비)": 1 - (e ** 2).sum() / (y ** 2).sum(),
         "corr": np.corrcoef(y, p)[0, 1] if np.std(p) > 0 else np.nan,
         "방향일치": agree.mean() if model != "B0" else np.nan, "방향일치_95%CI": f"{lo:.0%}~{hi:.0%}" if model != "B0" else "",
         "n_|계산|≥0.5%": int(big.sum()), "방향일치_|계산|≥0.5%": agree_big.mean() if big.sum() and model != "B0" else np.nan}
    if f"sd_{model}" in df:
        sd = df[f"sd_{model}"].values
        r["90%범위_안"] = (np.abs(e) <= Z90 * sd).mean()
        r["범위_반폭_%p"] = (Z90 * sd).mean() * 100
    return r


def summarize(pred: pd.DataFrame, models, label: str) -> pd.DataFrame:
    rows = []
    for tgt, g in pred.groupby("target", sort=False):
        for m in models:
            if m in g and g[m].notna().all():
                rows.append({"기간": label, "대상": tgt, "모델": m, **metrics(g, m)})
    return pd.DataFrame(rows)


def name_of(t):
    return {"FUT": "코스피200 선물(08:45 시가)", **INDEX, **STOCKS}.get(t, t)


if __name__ == "__main__":
    RESULTS.mkdir(exist_ok=True)
    base = build_dataset()
    base.to_csv(RESULTS / "dataset.csv")
    print(f"밤 {len(base)}개: {base.index[0]} ~ {base.index[-1]} (휴장 건너뛴 밤 {int(base.holiday_gap.sum())}, 제한폭 근처 {int(base.limit_hit.sum())})")

    # 0) 예전 숫자 재현(같은 식, 전 기간 한 번에 맞춤 = 사후 적합): 선물 다음 날 시가 ~ 야간선물
    b = base.dropna(subset=["y_FUT"])
    slope = np.cov(b.r_night, b.y_FUT)[0, 1] / np.var(b.r_night, ddof=1)
    r2 = np.corrcoef(b.r_night, b.y_FUT)[0, 1] ** 2
    print(f"[재현] 선물 다음 날 시가 갭 ~ 야간선물(전 기간 사후 적합): 기울기 {slope:.2f}, R² {r2:.2f}, 밤 {len(b)}")

    test_all = [t for t in base.index if (base.index < t).sum() >= MIN_TRAIN]
    targets = ["FUT", "KS200"] + list(STOCKS)
    preds = []
    for tgt in targets:
        preds.append(walk_forward(base, tgt, test_all))
        print(f"  {name_of(tgt)}: {len(preds[-1])}일 계산", flush=True)
    pred = pd.concat(preds, ignore_index=True)
    pred["name"] = pred.target.map(name_of)
    pred = pred.merge(base[["holiday_gap", "limit_hit"]], left_on="T", right_index=True)
    pred.to_csv(RESULTS / "oos_predictions.csv", index=False)

    acct = walk_forward_accounts(base, test_all)
    acct["target"] = acct.account
    acct.to_csv(RESULTS / "oos_accounts.csv", index=False)

    models = ["B0", "M0", "M1", "M1b", "M2g", "M2r"]
    sep = pred[(pred["T"] >= SEP[0]) & (pred["T"] <= SEP[1])]
    sep_a = acct[(acct["T"] >= SEP[0]) & (acct["T"] <= SEP[1])]
    summ = pd.concat([
        summarize(sep, models, "2026-09(대표님 방식)"), summarize(sep_a, ["B0", "M0", "M1"], "2026-09(대표님 방식)"),
        summarize(pred, models, f"전체 {test_all[0]}~{test_all[-1]}"), summarize(acct, ["B0", "M0", "M1"], f"전체 {test_all[0]}~{test_all[-1]}"),
    ], ignore_index=True)
    summ["대상"] = summ["대상"].map(name_of)
    summ.to_csv(RESULTS / "summary_metrics.csv", index=False, encoding="utf-8-sig")
    print(f"완료: 테스트 {test_all[0]}~{test_all[-1]} ({len(test_all)}일), 9월 {sep['T'].nunique()}일")
