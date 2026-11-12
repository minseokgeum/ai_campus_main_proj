"""더 파 보기: 결과를 보기 전에 정한 가설을 같은 방식으로 돌리고, 발견·확인 두 기간에서 모두 나아져야 '발견'으로 친다.

    python src/explore.py        (backtest.py를 먼저 돌려 둘 필요는 없음)

규칙(2026-10-27, 돌리기 전에 정함)
- 기준 모델은 M0(ŷ = r_야간). 10/26 비교에서 M1과 같거나 더 나았기 때문.
- 표본 밖 238일을 둘로 나눈다. 발견 2025-10-29~2026-04-30, 확인 2026-05-01~2026-10-26.
- 종목 15개의 하루 |오차| 차이를 평균해 한 줄로 만들고(풀링), Diebold-Mariano 검정 p값을 낸다.
- 가설 A~F 7개에 Holm 보정을 한다. '발견' = 두 기간 모두 MAE가 줄고, 전체 기간 Holm 보정 p < 0.05.
- G(범위)와 H(방향)는 모델 비교가 아니라 측정이라 따로 본다.

가설
A  관계표 짝 종목: ŷ = a + β·r + γ·(미국 짝 종목 − SPY)     짝은 common.US_PEERS
B  비대칭:        ŷ = a + β⁺·max(r,0) + β⁻·min(r,0)         내린 밤과 오른 밤의 전달이 다른가
C  비선형:        ŷ = a + β·r + δ·r·|r|                     크게 움직인 밤은 더/덜 전달되나
D  야간장 모양:   ŷ = a + β·r + c₁·CLV + c₂·고저폭            CLV = 야간 종가가 고저 범위의 어디서 끝났나(−1 저가 ~ +1 고가)
E  월요일:        ŷ = a + β·r + βₘ·r·월요일
F1 짧은 창:       M1을 직전 60밤으로
F2 β 반쯤 1로:    ŷ = ((β̂ + 1) / 2)·r                     β̂는 절편 없는 최소제곱
G  범위 보정(M0 중심): 고정 σ / 큰 밤일수록 넓게(σ² = s₀ + s₁·r²) / 최근 변동성(EWMA λ=0.94)
H  야간선물 변화 크기별 방향 일치율(M0)
"""
import math

import numpy as np
import pandas as pd

from backtest import build_dataset, name_of, train_window
from common import DATA, MIN_TRAIN, RESULTS, STOCKS, US_PEERS, Z90

DISC = ("20251029", "20260430")
CONF = ("20260501", "20261026")
HYPS = ["A", "B", "C", "D", "E", "F1", "F2"]
LABEL = {"A": "관계표 짝 종목", "B": "비대칭", "C": "비선형", "D": "야간장 모양", "E": "월요일", "F1": "짧은 창(60밤)", "F2": "β 반쯤 1로"}


def norm_p(z):
    return math.erfc(abs(z) / math.sqrt(2))


def lin(X, y):
    X1 = np.column_stack([np.ones(len(y)), X])
    coef, *_ = np.linalg.lstsq(X1, y, rcond=None)
    return coef


def add_features(base):
    b = base.copy()
    rng = (b.night_range * 0).values   # 자리만
    fut = pd.read_csv(DATA / "futures_daily.csv", dtype={"date": str, "code": str})
    night = fut[fut.session == "night"].set_index("date")
    hi, lo, cl = night.high.reindex(b.D).values, night.low.reindex(b.D).values, night.close.reindex(b.D).values
    b["clv"] = np.where(hi > lo, 2 * (cl - lo) / (hi - lo) - 1, 0.0)
    b["mon"] = (pd.to_datetime(b.index, format="%Y%m%d").weekday == 0).astype(float)
    pe = pd.read_csv(DATA / "us_peers_daily.csv", dtype={"us_date": str})
    ret = {}
    for sym, g in pe.groupby("symbol"):
        s = g.set_index("us_date")["Close"].sort_index()
        ret[sym] = s.pct_change().reindex(b.D).fillna(0.0).values
    for code, sym in US_PEERS.items():
        b[f"peer_{code}"] = ret[sym] - ret["SPY"]
    return b


def run_target(b, code, test):
    ycol = f"y_{code}"
    d = b.dropna(subset=[ycol])
    out = []
    for T in test:
        if T not in d.index:
            continue
        tr = train_window(d, T)
        if len(tr) < MIN_TRAIN:
            continue
        x, y, t = tr.r_night.values, tr[ycol].values, d.loc[T]
        xt = t.r_night
        row = {"T": T, "target": code, "y": t[ycol], "x": xt}
        row["M0"] = xt
        a, be = lin(x, y); row["M1"] = a + be * xt
        if code in US_PEERS:
            p = tr[f"peer_{code}"].values
            c = lin(np.column_stack([x, p]), y); row["A"] = c[0] + c[1] * xt + c[2] * t[f"peer_{code}"]
            row["gamma"] = c[2]
        c = lin(np.column_stack([np.maximum(x, 0), np.minimum(x, 0)]), y)
        row["B"] = c[0] + c[1] * max(xt, 0) + c[2] * min(xt, 0); row["b_up"], row["b_dn"] = c[1], c[2]
        c = lin(np.column_stack([x, x * np.abs(x)]), y); row["C"] = c[0] + c[1] * xt + c[2] * xt * abs(xt)
        c = lin(np.column_stack([x, tr.clv.values, tr.night_range.values]), y)
        row["D"] = c[0] + c[1] * xt + c[2] * t.clv + c[3] * t.night_range
        c = lin(np.column_stack([x, x * tr.mon.values]), y); row["E"] = c[0] + c[1] * xt + c[2] * xt * t.mon
        tr60 = tr.tail(60); a6, b6 = lin(tr60.r_night.values, tr60[ycol].values); row["F1"] = a6 + b6 * xt
        bn = (x @ y) / (x @ x); row["F2"] = (bn + 1) / 2 * xt
        # G: M0 중심 범위
        e = y - x
        row["sd_const"] = e.std(ddof=1)
        s0, s1 = lin(x ** 2, e ** 2); row["sd_het"] = math.sqrt(max(s0 + s1 * xt ** 2, 1e-8))
        w = 0.94 ** np.arange(len(e))[::-1]; row["sd_ewma"] = math.sqrt((w * e ** 2).sum() / w.sum())
        out.append(row)
    return pd.DataFrame(out)


def dm_pooled(P, m, base="M0", period=None):
    g = P if period is None else P[(P["T"] >= period[0]) & (P["T"] <= period[1])]
    g = g.dropna(subset=[m])
    d = (np.abs(g.y - g[base]) - np.abs(g.y - g[m])).groupby(g["T"]).mean()
    z = d.mean() / (d.std(ddof=1) / math.sqrt(len(d)))
    mae_b = (g.y - g[base]).abs().mean() * 100
    mae_m = (g.y - g[m]).abs().mean() * 100
    return mae_b, mae_m, d.mean() * 100, norm_p(z), len(d)


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = run
    return adj


def interval_score(y, c, sd, alpha=0.10):
    lo, hi = c - Z90 * sd, c + Z90 * sd
    return (hi - lo) + 2 / alpha * (lo - y) * (y < lo) + 2 / alpha * (y - hi) * (y > hi)


if __name__ == "__main__":
    b = add_features(build_dataset())
    test = [t for t in b.index if (b.index < t).sum() >= MIN_TRAIN]
    P = pd.concat([run_target(b, c, test) for c in list(STOCKS)], ignore_index=True)
    K = run_target(b, "KS200", test)
    P.to_csv(RESULTS / "explore_predictions.csv", index=False)
    md = ["# 더 파 보기: 미리 정한 가설 검증\n",
          f"표본 밖 {len(test)}일. 발견 {DISC[0]}~{DISC[1]}, 확인 {CONF[0]}~{CONF[1]}. 기준 모델 M0(ŷ = r_야간). "
          "'개선'은 하루 평균 |오차| 감소(%p, 종목 15개 평균). '발견' = 두 기간 모두 개선 + 전체 기간 Holm 보정 p < 0.05.\n",
          "## 가설 A~F (종목 15개 풀링)\n",
          "| 가설 | 발견 기간 개선 | 확인 기간 개선 | 전체 MAE: M0 → 가설 | 전체 p | Holm p | 판정 |", "|---|---|---|---|---|---|---|"]
    rows = []
    for h in HYPS:
        _, _, dd, _, _ = dm_pooled(P, h, period=DISC)
        _, _, dc, _, _ = dm_pooled(P, h, period=CONF)
        mb, mm, da, pa, n = dm_pooled(P, h)
        rows.append([h, dd, dc, mb, mm, pa])
    adj = holm([r[5] for r in rows])
    for r, a in zip(rows, adj):
        ok = r[1] > 0 and r[2] > 0 and a < 0.05
        worse = r[1] < 0 and r[2] < 0
        md.append(f"| {r[0]} {LABEL[r[0]]} | {r[1]:+.3f} | {r[2]:+.3f} | {r[3]:.3f} → {r[4]:.3f} | {r[5]:.3f} | {a:.3f} | "
                  f"{'발견' if ok else ('두 기간 모두 나빠짐' if worse else '아님')} |")
    md.append("\n참고: M1(종목별 절편·기울기) vs M0도 같은 기준으로 보면 "
              + "발견 {:+.3f}, 확인 {:+.3f}, 전체 p {:.3f}.\n".format(dm_pooled(P, "M1", period=DISC)[2], dm_pooled(P, "M1", period=CONF)[2], dm_pooled(P, "M1")[3]))

    # 종목별 A(관계표) 상세
    md.append("## A 관계표 짝 종목: 종목별\n\n| 종목 | 짝 | 평균 γ | MAE M0 | MAE A | 개선 | p | 발견 개선 | 확인 개선 |\n|---|---|---|---|---|---|---|---|---|")
    for code in STOCKS:
        g = P[P.target == code]
        d = np.abs(g.y - g.M0) - np.abs(g.y - g.A)
        z = d.mean() / (d.std(ddof=1) / math.sqrt(len(d)))
        dd = d[(g["T"] >= DISC[0]) & (g["T"] <= DISC[1])].mean() * 100
        dc = d[(g["T"] >= CONF[0]) & (g["T"] <= CONF[1])].mean() * 100
        md.append(f"| {STOCKS[code]} | {US_PEERS[code]} | {g.gamma.mean():+.2f} | {(g.y - g.M0).abs().mean() * 100:.2f} | {(g.y - g.A).abs().mean() * 100:.2f} | "
                  f"{d.mean() * 100:+.3f} | {norm_p(z):.3f} | {dd:+.3f} | {dc:+.3f} |")

    # B 비대칭 계수
    md.append("\n## B 비대칭: 학습 구간 기울기 평균(오른 밤 β⁺ / 내린 밤 β⁻)\n\n| 대상 | β⁺ | β⁻ |\n|---|---|---|")
    for code, g in [("KS200", K)] + [(c, P[P.target == c]) for c in STOCKS]:
        md.append(f"| {name_of(code)} | {g.b_up.mean():.2f} | {g.b_dn.mean():.2f} |")

    # G 범위
    md.append("\n## G 범위 보정(M0 중심, 목표 90%)\n\n| 대상 | 방식 | 범위 안(전체) | 발견 | 확인 | 평균 반폭 %p | 구간 점수(낮을수록 좋음) |\n|---|---|---|---|---|---|---|")
    for lab, G in (("코스피200 지수", K), ("종목 15개", P)):
        for sd in ("sd_const", "sd_het", "sd_ewma"):
            e = (G.y - G.M0).abs()
            cov = (e <= Z90 * G[sd]).mean()
            cd = (e <= Z90 * G[sd])[(G["T"] >= DISC[0]) & (G["T"] <= DISC[1])].mean()
            cc = (e <= Z90 * G[sd])[(G["T"] >= CONF[0]) & (G["T"] <= CONF[1])].mean()
            isc = interval_score(G.y.values, G.M0.values, G[sd].values).mean() * 100
            nm = {"sd_const": "고정 σ(지금)", "sd_het": "큰 밤일수록 넓게", "sd_ewma": "최근 변동성(EWMA)"}[sd]
            md.append(f"| {lab} | {nm} | {cov:.0%} | {cd:.0%} | {cc:.0%} | {(Z90 * G[sd]).mean() * 100:.2f} | {isc:.2f} |")

    # H 크기별 방향
    md.append("\n## H 야간선물 변화 크기별 방향 일치율(M0: 야간선물 부호 = 시가 부호?)\n\n| |r_야간| | 밤 수 | 코스피200 지수 | 종목 15개 평균 | 지수 발견 / 확인 |\n|---|---|---|---|---|")
    bins = [(0, 0.003), (0.003, 0.01), (0.01, 0.02), (0.02, 1)]
    for lo, hi in bins:
        k = K[(K.x.abs() >= lo) & (K.x.abs() < hi) & (K.y != 0)]
        s = P[(P.x.abs() >= lo) & (P.x.abs() < hi) & (P.y != 0)]
        agree = lambda g: (np.sign(g.x) == np.sign(g.y)).mean()
        kd = k[(k["T"] >= DISC[0]) & (k["T"] <= DISC[1])]; kc = k[(k["T"] >= CONF[0]) & (k["T"] <= CONF[1])]
        md.append(f"| {lo:.1%} ~ {hi:.1%} | {len(k)} | {agree(k):.0%} | {agree(s):.0%} | {agree(kd):.0%} / {agree(kc):.0%} |".replace("100.0%", "∞"))

    (RESULTS / "explore.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
