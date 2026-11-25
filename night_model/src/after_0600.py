"""06:00 뒤에 생긴 움직임이 시가 오차를 얼마나 만드나 + 미국 서머타임 앞뒤 비교.

가설: 야간선물은 06:00까지 열려 있으므로, 06:00~09:00 사이에 새 일이 없으면 시가는 야간선물을 따라가야 한다.
그렇다면 M1 오차(실제 − 계산)는 06:00 뒤 미국 선물·환율 움직임으로 상당 부분 설명돼야 한다.

    python src/after_0600.py        (backtest.py를 먼저 돌려 results/oos_predictions.csv가 있어야 함)

r_06→08 = 나스닥 선물(NQ) 08:00 가격 / 06:00 가격 − 1     ← 08:00에 알 수 있음(서비스에서 쓸 수 있음)
r_06→09 = 같은 식, 09:00까지                               ← 시가와 같은 시각이라 '설명용'(미리 알 수 없음)
겨울(미국 표준시)에는 미국 선물이 07:00~08:00 쉬므로 r_06→08은 사실상 06→07 움직임이다.
"""
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from backtest import _fit_lin, build_dataset, train_window
from common import DATA, MIN_TRAIN, RESULTS, STOCKS

NY = ZoneInfo("America/New_York")
SEMIS = ["005930", "000660", "042700"]


def price_moves() -> pd.DataFrame:
    h = pd.read_csv(DATA / "us_hourly.csv", parse_dates=["bar_end_utc"])
    out = {}
    for sym, g in h.groupby("symbol"):
        s = g.set_index("bar_end_utc")["Close"].sort_index()
        s = s[~s.index.duplicated()]
        out[sym] = s
    return out


def at(s: pd.Series, ts: pd.Timestamp):
    i = s.index.searchsorted(ts, side="right") - 1
    return s.iloc[i] if i >= 0 else np.nan


def add_after(base: pd.DataFrame) -> pd.DataFrame:
    S = price_moves()
    rows = []
    for T in base.index:
        t06 = pd.Timestamp(f"{T} 06:00", tz="Asia/Seoul").tz_convert("UTC")
        r = {"T": T}
        for sym in ("NQ", "ES", "USDKRW"):
            p6 = at(S[sym], t06)
            r[f"{sym}_06_08"] = at(S[sym], t06 + pd.Timedelta(hours=2)) / p6 - 1
            r[f"{sym}_06_09"] = at(S[sym], t06 + pd.Timedelta(hours=3)) / p6 - 1
        D = pd.Timestamp(base.at[T, "D"] + " 12:00", tz=NY)
        r["us_dst"] = bool(D.dst())               # 미국 서머타임이면 미국 장 마감 05:00 KST, 아니면 06:00
        rows.append(r)
    return base.join(pd.DataFrame(rows).set_index("T"))


def ols_line(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    x, y = x[m], y[m]
    b = np.cov(x, y)[0, 1] / np.var(x, ddof=1)
    return b, np.corrcoef(x, y)[0, 1], int(m.sum())


def wf_with(base, target, extra, test_idx):
    """M1에 06:00 뒤 변수를 더한 모델을 같은 방식으로 굴린다."""
    ycol = f"y_{target}"
    d = base.dropna(subset=[ycol] + extra)
    out = []
    for T in test_idx:
        if T not in d.index:
            continue
        tr = train_window(d, T)
        if len(tr) < MIN_TRAIN:
            continue
        coef, _ = _fit_lin(tr[["r_night"] + extra].values, tr[ycol].values)
        out.append({"T": T, "pred": coef[0] + coef[1:] @ d.loc[T, ["r_night"] + extra].values.astype(float)})
    return pd.DataFrame(out).set_index("T")["pred"] if out else pd.Series(dtype=float)


if __name__ == "__main__":
    base = add_after(build_dataset())
    pred = pd.read_csv(RESULTS / "oos_predictions.csv", dtype={"T": str, "target": str})
    pred["resid"] = pred.y - pred.M1
    P = pred.merge(base[["NQ_06_08", "NQ_06_09", "ES_06_09", "USDKRW_06_09", "us_dst"]], left_on="T", right_index=True)
    lines = ["# 06:00 뒤 움직임과 서머타임\n", f"표본 밖 {P['T'].nunique()}일({P['T'].min()}~{P['T'].max()}). 오차 = 실제 시가 등락률 − M1 계산값.\n"]

    # (a) 오차가 06:00 뒤 움직임과 같이 움직이나
    lines.append("## 1. M1 오차 ~ 06:00 뒤 움직임\n\n| 대상 | 변수 | 기울기 | 상관 | 일수 |\n|---|---|---|---|---|")
    for tgt, nm in (("KS200", "코스피200 지수"), ("FUT", "코스피200 선물(08:45)"), ("000660", "SK하이닉스"), ("005930", "삼성전자")):
        g = P[P.target == tgt]
        for v in ("NQ_06_08", "NQ_06_09", "ES_06_09", "USDKRW_06_09"):
            b, c, n = ols_line(g[v].values, g.resid.values)
            lines.append(f"| {nm} | {v} | {b:+.2f} | {c:+.2f} | {n} |")

    # (b) 조용한 아침 vs 움직인 아침
    lines.append("\n## 2. 06:00~09:00 나스닥 선물이 조용했던 아침 vs 움직인 아침(M1)\n\n| 대상 | 아침 | 일수 | MAE %p | 방향 일치 |\n|---|---|---|---|---|")
    for tgt, nm in (("KS200", "코스피200 지수"), ("ACC_STOCKS", "종목 15개 평균")):
        g = P[P.target == tgt] if tgt != "ACC_STOCKS" else P[P.target.isin(list(STOCKS))]
        for lab, m in (("조용(|NQ|<0.2%)", g.NQ_06_09.abs() < 0.002), ("보통", (g.NQ_06_09.abs() >= 0.002) & (g.NQ_06_09.abs() < 0.005)),
                       ("움직임(|NQ|≥0.5%)", g.NQ_06_09.abs() >= 0.005)):
            s = g[m]
            if len(s):
                agree = (np.sign(s.M1) == np.sign(s.y))[s.y != 0].mean()
                lines.append(f"| {nm} | {lab} | {s['T'].nunique()} | {(s.y - s.M1).abs().mean() * 100:.2f} | {agree:.0%} |")

    # (c) 08:00 갱신의 값: M1 + NQ 06→08 (그리고 설명용 상한 06→09)
    test = sorted(P["T"].unique())
    lines.append("\n## 3. 08:00에 한 번 더 계산하면(표본 밖, M1 대비)\n\n| 대상 | M1 MAE | +NQ 06→08 MAE | +NQ 06→09 MAE(설명용 상한) | M1 R² | +06→08 R² | +06→09 R² |\n|---|---|---|---|---|---|---|")
    for tgt in ["KS200"] + list(STOCKS):
        g = P[P.target == tgt].set_index("T")
        p8 = wf_with(base, tgt, ["NQ_06_08"], test)
        p9 = wf_with(base, tgt, ["NQ_06_09"], test)
        idx = g.index.intersection(p8.index).intersection(p9.index)
        y, m1 = g.loc[idx, "y"], g.loc[idx, "M1"]
        r2 = lambda p: 1 - ((y - p) ** 2).sum() / (y ** 2).sum()
        nm = "코스피200 지수" if tgt == "KS200" else STOCKS[tgt]
        lines.append(f"| {nm} | {(y - m1).abs().mean() * 100:.2f} | {(y - p8[idx]).abs().mean() * 100:.2f} | {(y - p9[idx]).abs().mean() * 100:.2f} | "
                     f"{r2(m1):.2f} | {r2(p8[idx]):.2f} | {r2(p9[idx]):.2f} |")

    # (d) 서머타임 앞뒤
    lines.append("\n## 4. 미국 서머타임(장 마감 05:00 KST) vs 표준시(06:00 KST) — M1\n\n| 대상 | 기간 | 일수 | MAE %p | R² | 방향 일치 |\n|---|---|---|---|---|---|")
    for tgt, nm in (("KS200", "코스피200 지수"), ("000660", "SK하이닉스"), ("005930", "삼성전자")):
        g = P[P.target == tgt]
        for lab, m in (("서머타임", g.us_dst), ("표준시", ~g.us_dst)):
            s = g[m]
            lines.append(f"| {nm} | {lab} | {len(s)} | {(s.y - s.M1).abs().mean() * 100:.2f} | {1 - ((s.y - s.M1) ** 2).sum() / (s.y ** 2).sum():.2f} | "
                         f"{(np.sign(s.M1) == np.sign(s.y))[s.y != 0].mean():.0%} |")

    # (e) 미국 장 마감 직후 실적이 나온 밤(표준시)
    lines.append("\n## 5. 미국 장 마감 직후 실적이 나온 밤(표준시: 야간선물 마감 뒤 발표)\n\n| T일 | 사건 | 야간선물 | NQ 06→09 | 대상 | 계산 | 실제 | 오차 |\n|---|---|---|---|---|---|---|---|")
    for T, ev in (("20251120", "엔비디아 실적(11/19 美 장 마감 뒤)"), ("20251218", "마이크론 실적(12/17 美 장 마감 뒤)")):
        for tgt in ("KS200", "000660", "005930", "042700"):
            g = P[(P["T"] == T) & (P.target == tgt)]
            if len(g):
                r = g.iloc[0]
                nm = "코스피200" if tgt == "KS200" else STOCKS[tgt]
                lines.append(f"| {T} | {ev} | {r.r_night:+.2%} | {r.NQ_06_09:+.2%} | {nm} | {r.M1:+.2%} | {r.y:+.2%} | {r.y - r.M1:+.2%} |")

    # (f) 06:00 뒤 나스닥 선물이 가장 크게 움직인 아침 10개
    g = P[P.target == "KS200"].assign(a=lambda x: x.NQ_06_09.abs()).nlargest(10, "a")
    lines.append("\n## 6. 06:00~09:00 나스닥 선물이 가장 크게 움직인 아침 10개(코스피200 지수)\n\n| T일 | NQ 06→09 | 야간선물 | 계산 | 실제 | 오차 |\n|---|---|---|---|---|---|")
    for _, r in g.sort_values("T").iterrows():
        lines.append(f"| {r['T']} | {r.NQ_06_09:+.2%} | {r.r_night:+.2%} | {r.M1:+.2%} | {r.y:+.2%} | {r.y - r.M1:+.2%} |")

    (RESULTS / "after_0600.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    P.to_csv(RESULTS / "oos_with_after0600.csv", index=False)
    print("\n".join(lines))
