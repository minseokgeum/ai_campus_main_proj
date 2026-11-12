"""더 파 보기 8: 팀 회의(10/27)에서 나온 질문들(돌리기 전에 정함). 모델 F2, 표본 밖 238일.

    python src/explore8.py      (explore.py·explore3.py·explore4.py를 먼저 돌려 둘 것)

Q2 프리마켓 과열: 06:00 계산(F2)이 ±2% 넘는 '큰 갭 예상일'에 NXT 08:30 가격이 실제 시가보다 같은 방향으로 더 갔나(과열 뒤 시가에서 꺾임).
   과열 = sign(F2) × (NXT 08:30 등락률 − 실제 시가 등락률) > 0. 작은 날과 비교.
Q3 SOR 20:00 기준: 기준가를 KRX 15:30 종가 대신 NXT 20:00 마지막 체결가로, 야간선물도 20:00 → 06:00 변화로 놓고 계산해
   시가를 맞히면 더 정확한가(오차는 둘 다 KRX 전날 종가 대비 %p로 같은 잣대). 1분봉이 있는 2025-10-16 이후, 학습 최소 60행.
Q4 특수일: 옵션 만기일(매달 둘째 목요일, 휴장이면 앞 거래일)과 그다음 날, FOMC 결과가 나온 아침의 오차·방향.
Q6 금리: 미국 10년물 금리(^TNX) 밤사이 변화를 F2에 더하면 나아지나(직전 250일 잔차 회귀, 발견·확인 두 기간).
Q7 범위 폭: 80% 범위(EWMA)가 0을 걸치는 날(방향이 정해지지 않는 날) 비율과 실제 범위 안 비율, 종목별.
"""
import math

import numpy as np
import pandas as pd

from backtest import build_dataset
from common import DATA, RESULTS, STOCKS

DISC = ("20251029", "20260430")
CONF = ("20260501", "20261026")
FOMC_T = ["20251030", "20251211", "20260129", "20260319", "20260430", "20260618", "20260730", "20260917"]  # 결과 다음 날 아침(KST)
Z80 = 1.2816


def norm_p(z):
    return math.erfc(abs(z) / math.sqrt(2))


def hit(g, c):
    g = g[g.y != 0]
    return (np.sign(g[c]) == np.sign(g.y)).mean()


def option_expiries(days):
    """매달 둘째 목요일, 휴장이면 그 앞 거래일."""
    ds = pd.to_datetime(sorted(days), format="%Y%m%d")
    out = set()
    for (y, m), g in pd.Series(ds, index=ds).groupby([ds.year, ds.month]):
        first = pd.Timestamp(year=y, month=m, day=1)
        thu2 = first + pd.Timedelta(days=(3 - first.weekday()) % 7 + 7)
        prior = g[g <= thu2]
        if len(prior):
            out.add(prior.iloc[-1].strftime("%Y%m%d"))
    return out


if __name__ == "__main__":
    base = build_dataset()
    S = pd.read_csv(RESULTS / "explore_predictions.csv", dtype={"T": str, "target": str})
    md = ["# 더 파 보기 8: 팀 회의 질문들\n"]

    # Q2
    P4 = pd.read_csv(RESULTS / "explore4_predictions.csv", dtype={"T": str, "code": str}).dropna(subset=["g_083000"])
    P4["over"] = np.sign(P4.F2) * (P4.g_083000 - P4.y)
    md.append("## Q2 큰 갭 예상일에 프리마켓이 먼저 과열되나(NXT 08:30 vs 실제 시가)\n\n| 06:00 계산 | 종목-날 | NXT 08:30이 시가보다 더 간 비율 | 평균으로 더 간 폭 | 08:30 → 시가 방향 일치(NXT) |\n|---|---|---|---|---|")
    for lab, m in (("|F2| ≥ 2%", P4.F2.abs() >= 0.02), ("1~2%", (P4.F2.abs() >= 0.01) & (P4.F2.abs() < 0.02)), ("< 1%", P4.F2.abs() < 0.01)):
        g = P4[m]
        md.append(f"| {lab} | {len(g)} | {(g.over > 0).mean():.0%} | {g.over.mean() * 100:+.2f}%p | {hit(g, 'g_083000'):.0%} |")
    big = P4[P4.F2.abs() >= 0.02]
    md.append(f"\n큰 갭 예상일 발견/확인: 더 간 비율 {(big[big['T'] <= DISC[1]].over > 0).mean():.0%} / {(big[big['T'] >= CONF[0]].over > 0).mean():.0%}, "
              f"평균 {big[big['T'] <= DISC[1]].over.mean() * 100:+.2f} / {big[big['T'] >= CONF[0]].over.mean() * 100:+.2f}%p\n")

    # Q3
    nx = pd.read_csv(DATA / "nxt_daily.csv", dtype={"date": str, "code": str})
    kr = pd.read_csv(DATA / "kr_daily.csv", dtype={"date": str, "code": str})
    nm = pd.read_csv(DATA / "night_minutes.csv", dtype={"date": str, "hhmmss": str})
    p20 = nm[nm.hhmmss <= "200000"].sort_values("hhmmss").groupby("date").price.last()      # 야간선물 20:00 가격
    fut = pd.read_csv(DATA / "futures_daily.csv", dtype={"date": str})
    night_close = fut[fut.session == "night"].set_index("date").close
    rows = []
    for c in [c for c in STOCKS if (nx.code == c).any()]:
        n = nx[nx.code == c].set_index("date").close
        k = kr[kr.code == c].set_index("date")
        d = base[["D", "r_night", f"y_{c}"]].dropna().copy()
        d["kc"] = k.Close.reindex(d.D).values
        d["s20"] = n.reindex(d.D).values
        d["x20"] = night_close.reindex(d.D).values / p20.reindex(d.D).values - 1
        d["y20"] = (1 + d[f"y_{c}"]) * d.kc / d.s20 - 1
        d = d.dropna(subset=["s20", "x20"])
        for T in d.index:
            tr = d[d.index < T].tail(250)
            if len(tr) < 60 or T < "20251029":
                continue
            x, y = tr.r_night.values, tr[f"y_{c}"].values
            b1 = (x @ y) / (x @ x)
            x2, y2 = tr.x20.values, tr.y20.values
            b2 = (x2 @ y2) / (x2 @ x2)
            t = d.loc[T]
            pred_now = (b1 + 1) / 2 * t.r_night                                    # KRX 종가 대비
            pred_sor = (1 + (b2 + 1) / 2 * t.x20) * t.s20 / t.kc - 1                # 20:00 가격에서 출발해 KRX 종가 대비로 환산
            rows.append({"T": T, "code": c, "y": t[f"y_{c}"], "now": pred_now, "sor": pred_sor, "ah": t.s20 / t.kc - 1})
    Q3 = pd.DataFrame(rows)
    dd = (np.abs(Q3.y - Q3.now) - np.abs(Q3.y - Q3.sor)).groupby(Q3["T"]).mean()
    z = dd.mean() / (dd.std(ddof=1) / math.sqrt(len(dd)))
    md.append("## Q3 SOR 20:00 가격을 기준으로 하면\n")
    md.append(f"종목 {Q3.code.nunique()}개, {Q3['T'].nunique()}일({Q3['T'].min()}~). 오차(KRX 전날 종가 대비): 지금 방식 {(Q3.y - Q3.now).abs().mean() * 100:.2f}%p → "
              f"20:00 기준 {(Q3.y - Q3.sor).abs().mean() * 100:.2f}%p (하루 평균 개선 {dd.mean() * 100:+.3f}%p, p {norm_p(z):.3f}; "
              f"발견 {dd[dd.index <= DISC[1]].mean() * 100:+.3f} / 확인 {dd[dd.index >= CONF[0]].mean() * 100:+.3f}). "
              f"방향 일치 {hit(Q3, 'now'):.0%} → {hit(Q3, 'sor'):.0%}.\n")
    bigah = Q3[Q3.ah.abs() > 0.01]
    md.append(f"전날 15:30 → 20:00 사이 ±1% 넘게 움직인 종목-날 {len(bigah)}개({len(bigah) / len(Q3):.0%})에서: 오차 {(bigah.y - bigah.now).abs().mean() * 100:.2f}%p → "
              f"{(bigah.y - bigah.sor).abs().mean() * 100:.2f}%p, 방향 {hit(bigah, 'now'):.0%} → {hit(bigah, 'sor'):.0%}.\n")

    # Q4
    exp = option_expiries(base.index)
    nxt_day = {d: base.index[i + 1] for i, d in enumerate(base.index[:-1])}
    after_exp = {nxt_day[d] for d in exp if d in nxt_day}
    S["special"] = np.select([S["T"].isin(exp), S["T"].isin(after_exp), S["T"].isin(FOMC_T)], ["옵션 만기일", "만기 다음 날", "FOMC 결과 아침"], "보통 날")
    md.append("## Q4 특수일(종목 15개, F2)\n\n| 날 | 일수 | 오차 | 방향 일치 |\n|---|---|---|---|")
    for lab, g in S.groupby("special"):
        md.append(f"| {lab} | {g['T'].nunique()} | {(g.y - g.F2).abs().mean() * 100:.2f}%p | {hit(g, 'F2'):.0%} |")

    # Q6
    us = pd.read_csv(DATA / "us_daily.csv", dtype={"us_date": str})
    tnx_path = DATA / "tnx_daily.csv"
    if not tnx_path.exists():
        import yfinance as yf
        t = yf.download("^TNX", start="2024-11-01", end="2026-10-27", progress=False, auto_adjust=False)
        t.columns = [c[0] if isinstance(c, tuple) else c for c in t.columns]
        t.index = pd.to_datetime(t.index).strftime("%Y%m%d")
        t[["Close"]].rename_axis("us_date").reset_index().to_csv(tnx_path, index=False)
    tnx = pd.read_csv(tnx_path, dtype={"us_date": str}).set_index("us_date").Close.sort_index()
    base["dy"] = tnx.diff().reindex(base.D).fillna(0).values / 100      # 금리 변화(%p → 소수)
    out = []
    for c, g in S.groupby("target"):
        g = g.set_index("T").join(base[["dy"]])
        e = g.y - g.F2
        for T in g.index:
            tr = g[g.index < T].tail(250)
            if len(tr) < 60:
                continue
            x = tr.dy.values; ee = (tr.y - tr.F2).values
            out.append({"T": T, "y": g.at[T, "y"], "F2": g.at[T, "F2"], "R": g.at[T, "F2"] + (x @ ee) / (x @ x) * g.at[T, "dy"]})
    Q6 = pd.DataFrame(out)
    dd = (np.abs(Q6.y - Q6.F2) - np.abs(Q6.y - Q6.R)).groupby(Q6["T"]).mean()
    md.append(f"\n## Q6 미국 10년물 금리 변화를 더하면\n\n개선 {dd.mean() * 100:+.3f}%p (p {norm_p(dd.mean() / (dd.std(ddof=1) / math.sqrt(len(dd)))):.3f}), "
              f"발견 {dd[dd.index <= DISC[1]].mean() * 100:+.3f} / 확인 {dd[dd.index >= CONF[0]].mean() * 100:+.3f}.\n")

    # Q7
    md.append("## Q7 80% 범위(EWMA, F2 중심)가 0을 걸치는 날\n\n| 종목 | 범위 반폭 중앙값 | 0을 걸치는 날 | 범위 안 비율 | 범위가 한쪽(오름 또는 내림)에만 있을 때 방향 일치 |\n|---|---|---|---|---|")
    S2 = S.copy()
    S2["half"] = Z80 * S2.sd_ewma
    S2["straddle"] = (S2.F2 - S2.half < 0) & (S2.F2 + S2.half > 0)
    rows = []
    for c, g in S2.groupby("target"):
        one = g[~g.straddle]
        rows.append((g.half.median(), c, g.straddle.mean(), ((g.y - g.F2).abs() <= g.half).mean(), hit(one, "F2") if len(one) else np.nan, len(one)))
    for h, c, st, cov, hh, n1 in sorted(rows):
        md.append(f"| {STOCKS.get(c, c)} | ±{h * 100:.1f}% | {st:.0%} | {cov:.0%} | {hh:.0%} ({n1}일) |")
    (RESULTS / "explore8.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
