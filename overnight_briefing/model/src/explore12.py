"""더 파 보기 12: 사용자 이야기에서 나온 재료(VIX·미국 5일 흐름·월말월초·지표 발표일·투자자 수급)
(2026-10-28, 돌리기 전에 정함. 결과를 본 뒤 이 머리말의 규칙은 바꾸지 않는다.)

    python src/collect_investor.py --env /경로/.env --universe   # data/investor_daily.csv (S6에 필요)
    python src/explore12.py

모두 06:00 전에 아는 값만 쓴다. 기준 계산은 F2, 표본 밖 238일, 앞 2025-10-29~2026-04-30 / 뒤 2026-05-01~2026-10-26.

모델 가설 5개(종목 15개 풀링, Holm 보정). 확인 = 두 기간 모두 |오차| 감소 + 전체 Holm p < 0.05
  ŷ = F2 + θ·z,  θ = T 전 250행의 (y − F2)를 z에 절편 없이 회귀한 기울기(z가 있는 행 최소 60). z가 없는 날은 F2 그대로.
  S1 VIX      z = VIX 종가 변화율(미국 D일, SOX와 같은 날짜 맞춤)
  S2 5일 흐름  z = F2 · tr,  tr = +1(야간선물 부호 = SOX 직전 5거래일 수익률 부호, D일 세션은 빼고) / −1(반대)
  S4 월말·월초 z = 1(T가 그달 마지막 거래일이거나 첫 3거래일) / 0
  S6a 수급(1일) z = (외국인 + 기관 순매수, D일) ÷ D일 거래대금
  S6b 수급(5일) z = D일까지 5거래일 (외국인 + 기관 순매수) 합 ÷ 같은 5일 거래대금 합

측정(판정 없음, 두 기간 같은 방향인지만 본다)
  M1 VIX 급등 밤(ΔVIX ≥ +10%): 지수·종목의 방향 일치, 오차, 평균 (y − F2)
  M2 국면: 충격(ΔVIX ≥ +15%) → 위험 회피(ΔVIX ≥ +5%이고 SOX < 0) → 위험 선호(ΔVIX ≤ −5%이고 SOX > 0) → 중립.
     국면별 지수 방향·오차, 종목 방향, 그리고 지수 '확실' 아침(explore9 규칙)의 방향 일치
  M3 미국 CPI·고용지표 발표 다음 아침(BLS 실제 발표일, 아래 목록. 발표는 한국 시각 21:30~22:30이라 그 밤 야간선물에 들어감)
  M4 월말·월초 아침의 방향·오차
  M5 수급 부호 = 시가 등락률 부호인 비율(종목)
"""
import math

import numpy as np
import pandas as pd

from backtest import build_dataset
from common import DATA, RESULTS
from explore9 import classify

DISC = ("20251029", "20260430")
CONF = ("20260501", "20261026")
CPI = ["20251024", "20251218", "20260113", "20260213", "20260311", "20260410", "20260512", "20260610", "20260714", "20260812",
       "20260911", "20261014"]   # https://www.bls.gov/bls/news-release/cpi.htm (2025-10 CPI는 셧다운으로 미발표)
NFP = ["20251120", "20251216", "20260109", "20260211", "20260306", "20260403", "20260508", "20260605", "20260702", "20260807",
       "20260904", "20261002"]   # https://www.bls.gov/bls/news-release/empsit.htm (2025-10 고용은 미발표)
MODELS = ["S1", "S2", "S4", "S6a", "S6b"]
LABEL = {"S1": "VIX 변화", "S2": "미국 5일 흐름과 같은 쪽인 밤", "S4": "월말·월초", "S6a": "전날 외국인+기관 순매수", "S6b": "5일 외국인+기관 순매수"}


def norm_p(z):
    return math.erfc(abs(z) / math.sqrt(2))


def pooled(P, m, period=None):
    g = P if period is None else P[(P["T"] >= period[0]) & (P["T"] <= period[1])]
    d = ((g.y - g.F2).abs() - (g.y - g[m]).abs()).groupby(g["T"]).mean()
    return d.mean() * 100, norm_p(d.mean() / (d.std(ddof=1) / math.sqrt(len(d)))), (g.y - g.F2).abs().mean() * 100, (g.y - g[m]).abs().mean() * 100


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = run
    return adj


def add_model(P, name, zcol):
    out = []
    for c, g in P.groupby("target"):
        g = g.sort_values("T").reset_index(drop=True)
        e = (g.y - g.F2).values
        z = g[zcol].values
        pred = []
        for i in range(len(g)):
            lo = max(0, i - 250)
            zz, ee = z[lo:i], e[lo:i]
            ok = ~np.isnan(zz)
            if ok.sum() < 60 or np.isnan(z[i]) or (zz[ok] @ zz[ok]) == 0:
                pred.append(g.F2[i])
            else:
                pred.append(g.F2[i] + (zz[ok] @ ee[ok]) / (zz[ok] @ zz[ok]) * z[i])
        out.append(pd.Series(pred, index=g.set_index(["T", "target"]).index))
    P[name] = pd.concat(out).reindex(pd.MultiIndex.from_frame(P[["T", "target"]])).values
    return P


def hit(g, col="F2"):
    g = g[g.y != 0]
    return (np.sign(g[col]) == np.sign(g.y)).mean() if len(g) else float("nan")


def mae(g, col="F2"):
    return (g.y - g[col]).abs().mean() * 100


if __name__ == "__main__":
    base = build_dataset()
    days = list(base.index)
    us = pd.read_csv(DATA / "us_daily.csv", dtype={"us_date": str})
    sox = us[us.symbol == "SOX"].set_index("us_date").Close.sort_index()
    vix = pd.read_csv(DATA / "vix_daily.csv", dtype={"us_date": str}).set_index("us_date").Close.sort_index()
    base["dVIX"] = vix.pct_change().reindex(base.D).values
    sox_tr = (sox.shift(1) / sox.shift(6) - 1)                                   # D일 세션을 뺀 직전 5거래일
    base["sox_tr"] = sox_tr.reindex(base.D).values
    T = pd.Series(days, index=days)
    month = T.str[:6]
    last = T.groupby(month).transform("max") == T
    first3 = T.groupby(month).rank(method="first") <= 3
    base["TOM"] = (last | first3).astype(float).values
    nxt = lambda d: next((t for t in days if t > d), None)
    macro = {nxt(d) for d in CPI + NFP if nxt(d)}
    cpi_m, nfp_m = {nxt(d) for d in CPI}, {nxt(d) for d in NFP}

    P = pd.read_csv(RESULTS / "explore_predictions.csv", dtype={"T": str, "target": str})[["T", "target", "y", "x", "F2", "sd_ewma"]]
    K = pd.read_csv(RESULTS / "explore9_index.csv", dtype={"T": str, "target": str})[["T", "target", "y", "x", "F2", "sd_ewma", "cls"]]
    P["cls"] = classify(P, base)
    for df in (P, K):
        for col in ("dVIX", "sox_tr", "TOM", "SOX"):
            df[col] = base[col].reindex(df["T"]).values
        df["z_S1"] = df.dVIX
        df["z_S2"] = df.F2 * np.where(np.sign(df.x) == np.sign(df.sox_tr), 1.0, -1.0)
        df.loc[df.sox_tr.isna(), "z_S2"] = np.nan
        df["z_S4"] = df.TOM

    inv_path = DATA / "investor_daily.csv"
    have_inv = inv_path.exists()
    if have_inv:
        inv = pd.read_csv(inv_path, dtype={"date": str, "code": str}).drop_duplicates(["date", "code"]).sort_values(["code", "date"])
        inv["fo"] = inv.frgn + inv.orgn
        inv["f1"] = inv.fo / inv.value.replace(0, np.nan)
        inv["f5"] = inv.groupby("code").fo.transform(lambda s: s.rolling(5).sum()) / inv.groupby("code").value.transform(lambda s: s.rolling(5).sum()).replace(0, np.nan)
        f = inv.set_index(["code", "date"])
        D = base.D.reindex(P["T"]).values
        P["z_S6a"] = [f.f1.get((c, d), np.nan) for c, d in zip(P.target, D)]
        P["z_S6b"] = [f.f5.get((c, d), np.nan) for c, d in zip(P.target, D)]
    else:
        P["z_S6a"] = P["z_S6b"] = np.nan

    for m in MODELS:
        P = add_model(P, m, f"z_{m}")
    P.to_csv(RESULTS / "explore12_predictions.csv", index=False)

    md = ["# 더 파 보기 12: 사용자 이야기에서 나온 재료\n",
          f"규칙은 파일 머리말(2026-10-28 돌리기 전). 종목 15개, 표본 밖 {P['T'].nunique()}일. 기준 F2. "
          f"VIX는 yfinance ^VIX, 수급은 한국투자증권 FHPTJ04160001({'있음' if have_inv else '없음'}).\n",
          "## 모델 가설(종목 15개 풀링, + = F2보다 오차가 작음)\n",
          "| 가설 | z가 있는 종목-날 | 앞 기간 | 뒤 기간 | 전체 오차 F2 → 가설 | 전체 p | Holm p | 판정 |", "|---|---|---|---|---|---|---|---|"]
    res = {m: (pooled(P, m, DISC), pooled(P, m, CONF), pooled(P, m)) for m in MODELS}
    adj = holm([res[m][2][1] for m in MODELS])
    for m, a in zip(MODELS, adj):
        d, c, t = res[m]
        n = int(P[f"z_{m}"].notna().sum())
        ok = d[0] > 0 and c[0] > 0 and a < 0.05
        md.append(f"| {m} {LABEL[m]} | {n} | {d[0]:+.3f} | {c[0]:+.3f} | {t[2]:.3f} → {t[3]:.3f} | {t[1]:.3f} | {a:.3f} | {'확인' if ok else '아님'} |")

    def per_period(df, mask, col="F2"):
        out = []
        for lab, (a, b) in (("전체", (DISC[0], CONF[1])), ("앞", DISC), ("뒤", CONF)):
            g = df[mask & (df["T"] >= a) & (df["T"] <= b)]
            out.append((lab, g["T"].nunique(), hit(g, col), mae(g, col), (g.y - g[col]).mean() * 100))
        return out

    md += ["\n## M1 VIX 급등 밤(ΔVIX ≥ +10%)\n", "| 대상 | 기간 | 날 | 방향 일치 | 오차 | 평균 (실제 − 계산) |", "|---|---|---|---|---|---|"]
    for nm, df in (("코스피200 지수", K), ("종목 15개", P)):
        for flag, lab in ((df.dVIX >= 0.10, "급등 밤"), (df.dVIX < 0.10, "그 밖")):
            for per, n, h, e, b in per_period(df, flag):
                md.append(f"| {nm} {lab} | {per} | {n} | {h:.0%} | {e:.2f}%p | {b:+.2f}%p |")

    def regime(df):
        return np.select([df.dVIX >= 0.15, (df.dVIX >= 0.05) & (df.SOX < 0), (df.dVIX <= -0.05) & (df.SOX > 0)], ["충격", "위험 회피", "위험 선호"], "중립")

    K["reg"], P["reg"] = regime(K), regime(P)
    md += ["\n## M2 국면별\n", "| 국면 | 날 | 지수 방향 · 오차 | 지수 방향(앞/뒤) | 종목 방향 · 오차 | 지수 '확실' 아침: 날 · 방향 |", "|---|---|---|---|---|---|"]
    for r in ["충격", "위험 회피", "위험 선호", "중립"]:
        k, p = K[K.reg == r], P[P.reg == r]
        ks = k[k.cls == "확실"]
        hd, hc = hit(k[k["T"] <= DISC[1]]), hit(k[k["T"] >= CONF[0]])
        md.append(f"| {r} | {k['T'].nunique()} | {hit(k):.0%} · {mae(k):.2f}%p | {hd:.0%} / {hc:.0%} | {hit(p):.0%} · {mae(p):.2f}%p | {len(ks)} · {hit(ks):.0%} |")

    special = set(K.loc[K.cls == "특수일", "T"])
    md += ["\n## M3 미국 CPI·고용지표 발표 다음 아침\n", "| 날 | 지수: 날 · 방향 · 오차 | 종목: 방향 · 오차 |", "|---|---|---|"]
    for lab, s in (("CPI 다음 아침", cpi_m), ("고용지표 다음 아침", nfp_m), ("둘 중 하나", macro), ("둘 중 하나, 다른 특수일 아님", macro - special), ("그 밖", set(K["T"]) - macro)):
        k, p = K[K["T"].isin(s)], P[P["T"].isin(s)]
        md.append(f"| {lab} | {k['T'].nunique()} · {hit(k):.0%} · {mae(k):.2f}%p | {hit(p):.0%} · {mae(p):.2f}%p |")
    md.append(f"\n고용지표 12번 중 다음 아침이 월요일인 날: {sum(pd.Timestamp(t).weekday() == 0 for t in nfp_m)}번(금요일 발표).")

    md += ["\n## M4 월말·월초 아침\n", "| 대상 | 날 | 기간 | 날 수 | 방향 | 오차 | 평균 (실제 − 계산) |", "|---|---|---|---|---|---|---|"]
    for nm, df in (("지수", K), ("종목 15개", P)):
        for flag, lab in ((df.TOM == 1, "월말·월초"), (df.TOM == 0, "그 밖")):
            for per, n, h, e, b in per_period(df, flag):
                md.append(f"| {nm} | {lab} | {per} | {n} | {h:.0%} | {e:.2f}%p | {b:+.2f}%p |")

    if have_inv:
        md += ["\n## M5 수급 부호 = 시가 등락률 부호(종목)\n", "| 재료 | 전체 | 앞 | 뒤 | 종목-날 |", "|---|---|---|---|---|"]
        for z, lab in (("z_S6a", "전날 외국인+기관"), ("z_S6b", "5일 외국인+기관")):
            g = P.dropna(subset=[z])
            g = g[(g.y != 0) & (g[z] != 0)]
            r = lambda h: (np.sign(h[z]) == np.sign(h.y)).mean()
            md.append(f"| {lab} | {r(g):.1%} | {r(g[g['T'] <= DISC[1]]):.1%} | {r(g[g['T'] >= CONF[0]]):.1%} | {len(g)} |")
        g = P.dropna(subset=["z_S6a"])
        md.append(f"\n같은 종목-날에서 야간선물 부호 = 시가 부호: {hit(g.assign(F2=g.x)):.1%}. 수급과 야간선물 변화의 상관 {g.z_S6a.corr(g.x):+.2f}.")
    (RESULTS / "explore12.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
