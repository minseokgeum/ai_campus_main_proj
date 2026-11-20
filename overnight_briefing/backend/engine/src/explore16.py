"""더 파 보기 16(E26): 긴 기간 검증 — 2025-10~2026-10은 너무 센 장이었다. 다른 장에서도 버티나
(2026-10-29, 돌리기 전에 정함. 결과를 본 뒤 이 머리말의 규칙은 바꾸지 않는다.)

    python src/explore16.py      (인터넷 필요: yfinance EWY, FinanceDataReader KS200·USD/KRW)

왜: 강사님 10/29 "2026 상반기는 비정상 상승장이라 그 기간에 맞춘 결과는 다른 장에서 안 맞을 수 있다, 오르기 전 횡보장에서 확인하라".
    실제로 코스피200 하루 변동이 2023-01~2025-05 1.22%, 우리 검증 기간(2025-10-29~2026-10-26) 3.83%(앞 3.02, 뒤 4.53)다.
    KRX 자체 야간시장은 2025-06부터라 그 전 야간선물 자료가 없다 → 미국 상장 한국 ETF(EWY, KST 05:00/06:00 마감)를 대리 지표로 쓴다.

대리 지표(T일 아침, D = T 전 거래일, E(t) = t일 06:00 KST까지 마감한 마지막 EWY 수정종가, 즉 미국 날짜 ≤ t−1)
  V0  x = E(T)/E(D) − 1
  V1  x = E(T)/E(D) ÷ (종가 D / 시가 D) − 1            D일 낮 장 몫을 뺀 것(E(D)는 D일 시가 무렵 값이라)
  V2  V1 × (원/달러 변화, E와 같은 날짜 기준)          EWY는 달러라 환율 몫을 되돌린 것
  미국 휴장으로 E(T) = E(D)인 밤은 뺀다.
A단계(겹치는 기간 2025-06-10~2026-10-26, 야간선물 x와 비교): 셋 중 야간선물 x와 상관이 가장 큰 것을 고른다.
  통과 = 상관 ≥ 0.8 이고, 시가 y를 x로 회귀한 R²가 야간선물로 한 R²의 0.8배 이상. 통과 못 하면 B단계는 참고로만 본다.
B단계(2015-01~2026-10, 코스피200 지수 y = 시가/전날 종가 − 1, 매일 직전 250밤으로만 맞춤 = 지금 규칙과 같음)
  F2 = ((β̂+1)/2)·x, β̂ = 절편 없는 최소제곱 / M0 = x / M1 = a + βx / B0 = 0(밤사이 정보 안 봄)
  σ = (y − x)의 EWMA(λ 0.94), 80% 범위 = F2 ± 1.2816σ
  아침: 특수일(월요일·연휴 다음 날·옵션 만기일) → 확실(범위가 0을 안 걸침) → 보합권(|F2| < 0.5%) → 애매.
        FOMC 결과 아침은 2025 이전 날짜 목록이 없어 이번엔 뺀다(특수일이 조금 덜 잡힘).
  기간(달력으로 미리 나눔): R1 2015-01~2019-12 박스권 / R2 2020-02-15~2020-04-30 코로나 급락 / R3 2020-05~2021-06 유동성 상승
        R4 2021-07~2022-12 하락장 / R5 2023-01~2025-05 횡보(강사님이 말한 '오르기 전') / R6 2025-06~2026-10 급등·급락(지금 검증 기간 포함)
  판정(기간마다)
    ① 밤사이 정보가 시가를 설명: F2 오차 < B0 오차, Holm(6개 기간) p < 0.05
    ② 80% 범위가 이름값: 실제로 담긴 비율 75~85%
    ③ '확실한 아침' 방향 일치 ≥ 90%(y = 0인 날 빼고)
    ④ 특수일 방향 일치 < 특수일 아닌 날
  결론 규칙: R1·R5(횡보장)에서 ①~③이 모두 맞으면 "지금 규칙은 횡보장에서도 버틴다".
같이 보는 것: 기간별 β̂ 중앙값, 확실한 아침 비율, F2·M0·M1 오차, 큰 사건 아침(코로나·엔 캐리 청산·계엄·관세) 날짜별 표.
"""
import math

import numpy as np
import pandas as pd

from common import DATA, RESULTS

Z80 = 1.2816
REG = [("R1 박스권", "20150101", "20191231"), ("R2 코로나 급락", "20200215", "20200430"), ("R3 유동성 상승", "20200501", "20210630"),
       ("R4 하락장", "20210701", "20221231"), ("R5 횡보(오르기 전)", "20230101", "20250531"), ("R6 급등·급락", "20250601", "20261026")]
OVERLAP = ("20250610", "20261026")
EVENTS = ["20200309", "20200313", "20200316", "20200319", "20200320", "20200324", "20240805", "20240806", "20241204", "20250407", "20250410"]


def norm_p(z):
    return math.erfc(abs(z) / math.sqrt(2))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = run
    return adj


def option_expiries(days):
    ds = pd.to_datetime(sorted(days), format="%Y%m%d")
    out = set()
    for (y, m), g in pd.Series(ds, index=ds).groupby([ds.year, ds.month]):
        first = pd.Timestamp(year=y, month=m, day=1)
        thu2 = first + pd.Timedelta(days=(3 - first.weekday()) % 7 + 7)
        prior = g[g <= thu2]
        if len(prior):
            out.add(prior.iloc[-1].strftime("%Y%m%d"))
    return out


def load():
    import FinanceDataReader as fdr
    import yfinance as yf
    k = fdr.DataReader("KS200", "2013-06-01", "2026-10-29")[["Open", "Close"]]
    k.index = pd.to_datetime(k.index).strftime("%Y%m%d")
    e = yf.download("EWY", start="2013-05-01", end="2026-10-30", auto_adjust=False, progress=False)
    e = (e["Adj Close"].iloc[:, 0] if isinstance(e.columns, pd.MultiIndex) else e["Adj Close"]).dropna()
    e.index = pd.to_datetime(e.index).strftime("%Y%m%d")
    fx = fdr.DataReader("USD/KRW", "2013-05-01", "2026-10-30")["Close"].dropna()
    fx.index = pd.to_datetime(fx.index).strftime("%Y%m%d")
    k.to_csv(DATA / "ks200_long.csv"); e.rename("ewy_adj").to_csv(DATA / "ewy_long.csv"); fx.rename("usdkrw").to_csv(DATA / "usdkrw_long.csv")
    return k, e, fx


def last_before(s, day):
    """day(YYYYMMDD) 06:00 KST까지 마감한 마지막 값 = 미국 날짜 ≤ day−1."""
    lim = (pd.Timestamp(day) - pd.Timedelta(days=1)).strftime("%Y%m%d")
    i = s.index.searchsorted(lim, side="right") - 1
    return (s.index[i], s.iloc[i]) if i >= 0 else (None, np.nan)


def build(k, e, fx):
    days = list(k.index)
    rows = []
    for D, T in zip(days[:-1], days[1:]):
        uD, eD = last_before(e, D); uT, eT = last_before(e, T)
        if uD is None or uT is None or uT <= uD:
            continue                                     # 그 밤에 미국 장이 없었음
        _, fD = last_before(fx, D); _, fT = last_before(fx, T)
        oD, cD, oT = k.at[D, "Open"], k.at[D, "Close"], k.at[T, "Open"]
        if not (oD > 0 and cD > 0 and oT > 0):
            continue
        g = eT / eD
        rows.append({"T": T, "D": D, "V0": g - 1, "V1": g / (cD / oD) - 1, "V2": g / (cD / oD) * (fT / fD) - 1, "y": oT / cD - 1,
                     "gap": np.busday_count(pd.Timestamp(D).date(), pd.Timestamp(T).date()) > 1})
    return pd.DataFrame(rows).set_index("T")


def walk(B, xcol):
    out = []
    idx = list(B.index)
    for i, T in enumerate(idx):
        if T < "20150101" or i < 250:
            continue
        tr = B.iloc[i - 250:i]
        x, y = tr[xcol].values, tr.y.values
        xt = B.at[T, xcol]
        bn = (x @ y) / (x @ x)
        X = np.column_stack([np.ones(len(x)), x]); a, b = np.linalg.lstsq(X, y, rcond=None)[0]
        w = 0.94 ** np.arange(len(x))[::-1]; sd = math.sqrt((w * (y - x) ** 2).sum() / w.sum())
        out.append({"T": T, "x": xt, "y": B.at[T, "y"], "F2": (bn + 1) / 2 * xt, "M0": xt, "M1": a + b * xt, "B0": 0.0, "beta": bn, "sd": sd,
                    "gap": B.at[T, "gap"]})
    P = pd.DataFrame(out)
    exp = option_expiries(P["T"])
    special = P.gap | P["T"].isin(exp) | (pd.to_datetime(P["T"]).dt.weekday == 0)
    lo, hi = P.F2 - Z80 * P.sd, P.F2 + Z80 * P.sd
    P["lo"], P["hi"] = lo, hi
    P["cls"] = np.select([special, (lo > 0) | (hi < 0), P.F2.abs() < 0.005], ["특수일", "확실", "보합권"], "애매")
    P["in80"] = (P.y >= lo) & (P.y <= hi)
    return P


if __name__ == "__main__":
    k, e, fx = load()
    B = build(k, e, fx)
    print(f"짝 {len(B)}밤 {B.index.min()}~{B.index.max()}, y=0인 날 {(B.y == 0).mean():.1%}", flush=True)
    md = ["# 더 파 보기 16(E26): 긴 기간 검증(미국 상장 한국 ETF를 대리 지표로)\n",
          f"규칙은 파일 머리말(2026-10-29 돌리기 전). 자료: 코스피200 일봉(FinanceDataReader), EWY 수정종가(yfinance), 원/달러(FinanceDataReader). "
          f"짝지은 밤 {len(B)}개({B.index.min()}~{B.index.max()}).\n"]

    # A단계: 겹치는 기간에서 야간선물 x와 비교
    from backtest import build_dataset
    nb = build_dataset()[["r_night"]]
    O = B.join(nb, how="inner")
    O = O[(O.index >= OVERLAP[0]) & (O.index <= OVERLAP[1])].dropna(subset=["r_night"])
    r2 = lambda x, y: np.corrcoef(x, y)[0, 1] ** 2
    md += ["## A단계: 대리 지표가 야간선물을 대신할 수 있나(겹치는 기간)\n", f"겹치는 밤 {len(O)}개.\n",
           "| 대리 지표 | 야간선물 x와 상관 | 시가 y 설명력 R² | 야간선물 R² 대비 |", "|---|---|---|---|"]
    r2n = r2(O.r_night, O.y)
    best, bestc = None, -1
    for v in ("V0", "V1", "V2"):
        c = np.corrcoef(O[v], O.r_night)[0, 1]
        md.append(f"| {v} | {c:.3f} | {r2(O[v], O.y):.3f} | {r2(O[v], O.y) / r2n:.2f} |")
        if c > bestc:
            best, bestc = v, c
    md.append(f"| (야간선물 x) | 1 | {r2n:.3f} | 1 |")
    passA = bestc >= 0.8 and r2(O[best], O.y) >= 0.8 * r2n
    md.append(f"\n고른 대리 지표: **{best}**(상관 {bestc:.3f}). A단계 {'통과' if passA else '미통과 → B단계는 참고로만'}.\n")

    P = walk(B, best)
    P.to_csv(RESULTS / "explore16_predictions.csv", index=False)
    md += ["## B단계: 기간별 판정\n",
           "| 기간 | 밤 | 하루 변동(시가 갭 |y| 평균) | β̂ 중앙값 | 오차 B0 → F2 (M0 · M1) | ① p(Holm) | ② 80% 범위 안 | 확실한 아침 비율 | ③ 확실 방향 | ④ 특수일 / 그 밖 방향 | 판정 |",
           "|---|---|---|---|---|---|---|---|---|---|---|"]
    res = []
    for name, a, b in REG:
        g = P[(P["T"] >= a) & (P["T"] <= b)]
        d = ((g.y - g.B0).abs() - (g.y - g.F2).abs())
        p = norm_p(d.mean() / (d.std(ddof=1) / math.sqrt(len(d))))
        res.append((name, g, d.mean(), p))
    adj = holm([r[3] for r in res])
    verdict = {}
    for (name, g, dm, p), pa in zip(res, adj):
        nz = g[g.y != 0]
        hit = lambda z: (np.sign(z.F2) == np.sign(z.y)).mean() if len(z) else np.nan
        c1 = dm > 0 and pa < 0.05
        cov = g.in80.mean(); c2 = 0.75 <= cov <= 0.85
        sure = hit(nz[nz.cls == "확실"]); c3 = sure >= 0.90
        sp, ot = hit(nz[nz.cls == "특수일"]), hit(nz[nz.cls != "특수일"]); c4 = sp < ot
        verdict[name] = (c1, c2, c3, c4)
        mae = lambda m: (g.y - g[m]).abs().mean() * 100
        md.append(f"| {name} | {len(g)} | {g.y.abs().mean() * 100:.2f}% | {g.beta.median():.2f} | {mae('B0'):.2f} → {mae('F2'):.2f}%p ({mae('M0'):.2f} · {mae('M1'):.2f}) | "
                  f"{pa:.3g} | {cov:.0%} | {(g.cls == '확실').mean():.0%} | {sure:.0%} ({int((nz.cls == '확실').sum())}) | {sp:.0%} / {ot:.0%} | "
                  f"{''.join('O' if c else 'X' for c in (c1, c2, c3, c4))} |")
    side = all(all(verdict[n][:3]) for n in ("R1 박스권", "R5 횡보(오르기 전)"))
    md.append(f"\n판정 칸은 ①②③④ 순서(O 맞음 / X 아님). 결론 규칙(R1·R5에서 ①~③ 모두): **{'지금 규칙은 횡보장에서도 버틴다' if side else '횡보장에서 일부가 안 맞는다(아래 참고)'}**.\n")

    md += ["## 사후 참고(결과를 본 뒤 더 센 것, 판정에 안 씀): 조용한 장에서는 아침이 어떻게 생겼나\n",
           "| 기간 | 보합권 | 확실 | 애매 | 특수일 | 시가 갭 ±1% 넘은 아침(1년 환산) | ±2% 넘은 아침 | 방향 일치 F2 · M1 |", "|---|---|---|---|---|---|---|---|"]
    for name, a, b in REG:
        g = P[(P["T"] >= a) & (P["T"] <= b)]; nz = g[g.y != 0]; sh = g.cls.value_counts(normalize=True)
        big = (g.y.abs() >= 0.01).mean()
        md.append(f"| {name} | {sh.get('보합권', 0):.0%} | {sh.get('확실', 0):.0%} | {sh.get('애매', 0):.0%} | {sh.get('특수일', 0):.0%} | {big:.0%}({big * 250:.0f}일) | "
                  f"{(g.y.abs() >= 0.02).mean():.0%} | {(np.sign(nz.F2) == np.sign(nz.y)).mean():.0%} · {(np.sign(nz.M1) == np.sign(nz.y)).mean():.0%} |")
    md.append("\n대리 지표의 β̂가 0.3~0.4라 F2의 '1 쪽으로 당기기'가 과하고(M1이 더 작은 오차), (y − x)로 잡은 σ가 커서 80% 범위가 90%대로 넓다. "
              "이건 대리 지표의 성질이라 야간선물 규칙의 결함으로 읽으면 안 된다.\n")
    md += ["## 큰 사건 아침\n", "| 날 | 아침 | x(대리) | 06:00 계산 F2 | 80% 범위 | 실제 시가 | 방향 | 범위 안 |", "|---|---|---|---|---|---|---|---|"]
    for t in EVENTS:
        r = P[P["T"] == t]
        if len(r):
            r = r.iloc[0]
            md.append(f"| {t} | {r.cls} | {r.x * 100:+.2f}% | {r.F2 * 100:+.2f}% | {r.lo * 100:+.2f} ~ {r.hi * 100:+.2f}% | {r.y * 100:+.2f}% | "
                      f"{'맞음' if np.sign(r.F2) == np.sign(r.y) else '틀림'} | {'안' if r.in80 else '밖'} |")
    md.append("\n주의: 대리 지표는 MSCI Korea(EWY, 달러)라 코스피200 야간선물과 같지 않다. 지수 하나만 봤고 종목은 보지 않았다. "
              "FOMC 결과 아침을 특수일에서 뺐다. 2015~2019 FinanceDataReader 지수 시가는 첫 체결이 늦은 날 전일 종가와 같게 찍혔을 수 있다(y = 0 비율 참고).")
    yz = P.groupby(P["T"].str[:4]).apply(lambda g: (g.y == 0).mean())
    md.append("\n연도별 y = 0 비율: " + ", ".join(f"{i} {v:.0%}" for i, v in yz.items()))
    (RESULTS / "explore16.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
