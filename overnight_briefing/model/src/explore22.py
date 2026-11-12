"""더 파 보기 22(E32): 여러 정보를 '상태에 따라 얼마나 믿을지'로 조합하면 방향·설명력·범위 문제가 풀리나 — 종합 탐색
(2026-10-29, 돌리기 전에 정함. 결과를 본 뒤 이 머리말의 규칙은 바꾸지 않는다.)

    python src/explore22.py           # 처음 보는 종목 자료(data/universe_premarket.csv)가 다 모인 뒤

틀(관계표처럼 나눔)
  종속변수 y = 종목 시가 등락률(전날 공식 종가 대비).
  정보원(독립변수): 06:00 x(야간선물)·F2, 08:10 g(NXT 가격), 나스닥 선물 06→08(nq).
  조절변수 Z: 그 정보원을 '어떤 상태에서 얼마나 믿을지'를 바꾸는 값.
    달력: 월요일, 연휴 다음 날, 옵션 만기일, FOMC 결과 아침(연준 공식), CPI·고용보고서 다음 아침(FRED)
    시장 상태: VIX(log, 전날 미국), VIX 변화, 시장 변동성 국면(지수 EWMA σ, log), 그 종목 변동성(06:00 σ, log)
    밤사이 경로: 야간선물 거래량 비율(log), 자정 전 움직임 x_pre, 자정 뒤 움직임 x_post, |x|
    프리마켓(08:10만): NXT 거래대금 비율 zv, 08:00~08:10 가격 폭 ÷ σ, 08:00 → 08:10 흐름(g − g0800),
                      06:00 계산과 어긋난 정도 |g − F2| ÷ σ, 그 종목만의 움직임 |g − 그날 NXT 종목 중앙값|(당일 이슈 대용)
    종목: 선명도(직전 R²), 코스닥 여부, 전날 거래대금 비율(log, 관심도), 전날 외국인+기관 순매수 ÷ 거래대금
  (당일 뉴스 자체는 이 백테스트 자료에 없어, '그 종목만의 프리마켓 움직임'과 '전날 거래대금 급증'을 대용으로 쓴다.)

모델(모두 날마다 그날 전 자료로만 맞춤, 종목 풀링, 최소 60일)
  08:10 묶음(기준 B08 = g 그대로)
    M1 조절 선형: ŷ = F2 + (c₀ + Σc·Z)(g − F2) + d·nq        'NXT를 얼마나 믿을지'가 상태에 따라 바뀜
    M2 부스팅: ŷ = g + f(F2 − g, g, F2, nq, Z)  (HistGradientBoosting 깊이 3, 학습률 0.05, 200회, 잎 최소 50, 20거래일마다 다시 맞춤)
    M3 상호작용 LASSO: (g − F2)·[1, Z], F2·[1, Z], nq 를 넣고 BIC로 고름(5거래일마다)
  06:00 묶음(기준 B06 = F2)
    N1 조절 선형: ŷ = F2 + x·(Σb·Z06)                         '야간선물을 얼마나 따라갈지'가 상태에 따라 바뀜
    N2 부스팅: ŷ = F2 + f(x, F2, Z06)
    N3 상호작용 LASSO: x·[1, Z06], F2
  범위 묶음(80%, 배수는 그날 전 자료에서 실제 80%가 담기도록 맞춤 → 기준도 같은 방식)
    R08: 중심 g, σ = 종목별 (y − g) EWMA × exp(Σd·Z)  vs  σ = (y − g) EWMA 그대로
    R06: 중심 F2, σ = 06:00 σ × exp(Σd·Z06)          vs  σ = 06:00 σ 그대로
    점수: 구간 점수(폭 + 벗어난 만큼 × 10, 낮을수록 좋음)
판정(처음 보는 종목에서만): M1~M3·N1~N3은 |오차|, R08·R06은 구간 점수. 날마다 종목 평균 차이로 검정, 8개 Holm.
  (13:4x 덧붙임, 확인 결과를 보기 전: 날마다의 차이가 이어져 있을 수 있어 p는 Newey-West(HAC, 시차 5일)로 내고 판정에 쓴다. 단순 p도 같이 남긴다.)
  (13:5x 덧붙임, 개발 14종목 M1 점검 결과를 본 뒤·확인 종목 결과를 보기 전: ① 거래정지일 시가 0 행을 빼고(sector_study와 같은 규칙: 시가·종가 > 0)
   ② 전날 거래대금 0인 날의 비율은 빈칸으로 ③ 조절변수는 맞추는 자료의 1%·99% 분위에서 자른 뒤 표준화한다. 점검에서 σ 89%·폭 30배 같은 극단값이 나왔기 때문.)
  (14:1x 덧붙임, 확인 결과를 보기 전: 시가 = 전일 종가(보합 출발)인 날도 오차·범위 평가에 넣는다(실시간엔 미리 모름).
   방향 일치만 그날을 빼고 계산하고, 보합 출발 비율과 '보합 출발을 뺀 오차 차이'를 같이 남긴다.)
  (14:0x 덧붙임, 확인 결과를 보기 전: 보조 판정으로 Hansen SPA·StepM(arch 패키지, 날 단위 |오차| 평균, 블록 부트스트랩 블록 5일·1,000번)을
   08:10 묶음(g vs M1~M3)·06:00 묶음(F2 vs N1~N3)에 각각 낸다. '여러 개를 시도해서 하나가 우연히 좋아 보이는' 위험을 한 번에 본다. 주 판정은 위 Holm 그대로.)
  '해결 조합' = 기준보다 좋고 Holm p < 0.05, 앞(~2026-04-30)·뒤 기간 모두 좋음. 방향 일치는 같이 보고(판정 아님),
  문제였던 아침(특수일, FOMC·CPI, 근거 없는 큰 갭, 얇은 프리마켓, 7/14·7/29)에서 기준 대비 나아졌는지도 같이 본다.
자료 나누기: 개발 = NXT 14종목(가설을 만든 종목, 결과만 보고), 확인 = 200종목 중 나머지
  (08:10 묶음은 NXT 158종목, 06:00·범위 R06 묶음은 186종목). 계수는 확인 종목의 '그날 전' 자료로만 다시 맞춘다.
"""
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LassoLarsIC

from after_0600 import add_after
from backtest import build_dataset
from common import DATA, RESULTS
from explore16 import option_expiries
from explore21 import next_kr

DISC_END = "20260430"
EVENT = ["20260714", "20260729"]
Z06 = ["mon", "hol", "exp", "fomc", "cpi", "nfp", "vix", "dvix", "mreg", "lsd", "nvz", "x_pre", "x_post", "ax", "r2", "kq", "tv", "flow"]
Z08 = Z06 + ["zv", "rng", "drift", "dis", "idio"]


def norm_p(z):
    return math.erfc(abs(z) / math.sqrt(2))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for k, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = run
    return adj


def ewma_sd(e, lam=0.94, n=250, min_n=60):
    """e: 시간순 오차. 각 시점 '그 전' 값으로 EWMA σ."""
    out = np.full(len(e), np.nan)
    for i in range(len(e)):
        h = e[max(0, i - n):i]
        h = h[~np.isnan(h)]
        if len(h) >= min_n:
            w = lam ** np.arange(len(h))[::-1]
            out[i] = math.sqrt((w * h ** 2).sum() / w.sum())
    return out


def night_path(base):
    fut = pd.read_csv(DATA / "futures_daily.csv", dtype={"date": str, "code": str})
    day, night = fut[fut.session == "day"].set_index("date"), fut[fut.session == "night"].set_index("date")
    nm = pd.read_csv(DATA / "night_minutes.csv", dtype={"date": str, "code": str, "hhmmss": str})
    pre, post = {}, {}
    for (d, c), g in nm.groupby(["date", "code"]):
        if d not in night.index or night.at[d, "code"] != c or d not in day.index:
            continue
        g = g.sort_values("hhmmss")
        mid = g[g.hhmmss <= "240000"].price
        if mid.empty:
            continue
        c0, pm, cl = day.at[d, "close"], mid.iloc[-1], g.price.iloc[-1]
        pre[d], post[d] = pm / c0 - 1, cl / pm - 1
    return base.D.map(pre), base.D.map(post)


def build_panel():
    base = add_after(build_dataset())
    P = pd.read_csv(RESULTS / "sector_study_predictions.csv", dtype={"T": str, "code": str})[["T", "code", "y", "F2", "r2_prev"]]
    U = pd.read_csv(DATA / "universe.csv", dtype={"Code": str}).rename(columns={"Code": "code"})
    P = P.merge(U[["code", "Market"]], on="code")
    P["kq"] = (P.Market == "KOSDAQ").astype(float)
    P["r2"] = P.r2_prev
    # 06:00 σ(종목): y − x의 EWMA, 2024-11부터의 일봉으로
    ud = pd.read_csv(DATA / "universe_daily.csv", dtype={"date": str, "code": str}).sort_values(["code", "date"])
    ud = ud[(ud.Open > 0) & (ud.Close > 0)]                                 # 거래정지일(시가 0) 빼기, sector_study와 같은 규칙
    ud["pc"] = ud.groupby("code").Close.shift(1)
    ud["yy"] = ud.Open / ud.pc - 1
    xs = base.r_night
    sd = {}
    for c, g in ud.groupby("code"):
        g = g[g.date.isin(xs.index)]
        e = (g.yy - xs.reindex(g.date).values).values
        sd.update({(t, c): v for t, v in zip(g.date, ewma_sd(e))})
    P["sd06"] = [sd.get((t, c), np.nan) for t, c in zip(P["T"], P.code)]
    P["lsd"] = np.log(P.sd06)
    ix = base.y_KS200 - base.r_night
    mreg = pd.Series(ewma_sd(ix.values), index=base.index)
    pcs = ud.set_index(["date", "code"]).pc
    # 날 단위 값
    pre, post = night_path(base)
    vol = base.night_vol.where(base.night_vol > 0)
    nvz = np.log(vol / vol.shift(1).rolling(60, min_periods=20).median())
    vix = pd.read_csv(DATA / "vix_daily.csv", dtype={"us_date": str}).set_index("us_date").Close.sort_index()
    kr_days = list(base.index)
    fr = pd.read_csv(DATA / "fred_release_dates.csv", dtype={"us_date": str})
    fo = pd.read_csv(DATA / "fomc_dates.csv", dtype={"us_date": str})
    allkr = pd.read_csv(DATA / "ks200_long.csv", dtype={"Date": str}).iloc[:, 0].astype(str).tolist()
    mark = {k: set(next_kr(fr[fr.kind == k].us_date, allkr)) for k in ("CPI", "NFP")}
    mark["FOMC"] = set(next_kr(fo.us_date, allkr))
    exp = option_expiries(kr_days)
    Dd = pd.DataFrame(index=base.index)
    Dd["x"] = base.r_night
    Dd["nq"] = base.NQ_06_08.fillna(0.0)
    Dd["mon"] = (pd.to_datetime(Dd.index).weekday == 0).astype(float)
    Dd["hol"] = base.holiday_gap.astype(float)
    Dd["exp"] = Dd.index.isin(exp).astype(float)
    Dd["fomc"] = Dd.index.isin(mark["FOMC"]).astype(float)
    Dd["cpi"] = Dd.index.isin(mark["CPI"]).astype(float)
    Dd["nfp"] = Dd.index.isin(mark["NFP"]).astype(float)
    Dd["vix"] = np.log(vix.reindex(base.D.values).values)
    Dd["dvix"] = vix.pct_change().reindex(base.D.values).values
    Dd["mreg"] = np.log(mreg)
    Dd["nvz"] = nvz
    Dd["x_pre"], Dd["x_post"] = pre, post
    Dd["ax"] = base.r_night.abs()
    P = P.merge(Dd, left_on="T", right_index=True, how="left")
    # 전날 거래대금·수급
    F = pd.read_csv(DATA / "investor_daily.csv", dtype={"date": str, "code": str}).sort_values(["code", "date"])
    F["value"] = F.value.where(F.value > 0)                               # 거래대금 0(정지)은 빈칸
    F["tv"] = F.groupby("code").value.transform(lambda s: np.log(s / s.shift(1).rolling(20, min_periods=10).median()))
    F["flow"] = (F.frgn + F.orgn) / F.value.replace(0, np.nan)
    F[["tv", "flow"]] = F.groupby("code")[["tv", "flow"]].shift(1)     # T일 아침에 아는 건 전날 값
    P = P.merge(F[["date", "code", "tv", "flow"]].rename(columns={"date": "T"}), on=["T", "code"], how="left")
    # NXT 프리마켓(개발 14종목 + 확인 종목)
    a = pd.read_csv(DATA / "nxt_premarket.csv", dtype={"day": str, "code": str, "date": str, "hhmmss": str})
    a = a[(a.date == a.day)][["day", "code", "hhmmss", "price", "volume"]]
    b = pd.read_csv(DATA / "universe_premarket.csv", dtype={"day": str, "code": str, "hhmmss": str})
    b = b[~b.code.isin(a.code.unique())]
    pm = pd.concat([a, b]).dropna(subset=["price"])
    pm = pm[(pm.hhmmss >= "080000") & (pm.hhmmss <= "081000")].sort_values("hhmmss")
    pm["value"] = pm.price * pm.volume
    grp = pm.groupby(["day", "code"])
    nx = pd.DataFrame({"p10": grp.price.last(), "p00": grp.price.first(), "hi": grp.price.max(), "lo": grp.price.min(), "nv": grp.value.sum()})
    nx = nx.reset_index().rename(columns={"day": "T"})
    nx["pc"] = [pcs.get((t, c), np.nan) for t, c in zip(nx["T"], nx.code)]
    nx["g"], nx["g00"] = nx.p10 / nx.pc - 1, nx.p00 / nx.pc - 1
    nx = nx.sort_values(["code", "T"])
    nx["zv"] = nx.groupby("code").nv.transform(lambda s: np.log((s + 1) / (s.shift(1).rolling(20, min_periods=10).median() + 1)))
    nx["mkt_g"] = nx.groupby("T").g.transform("median")
    P = P.merge(nx[["T", "code", "g", "g00", "hi", "lo", "pc", "zv", "mkt_g"]], on=["T", "code"], how="left")
    P["rng"] = (P.hi - P.lo) / P.pc / P.sd06
    P["drift"] = P.g - P.g00
    P["dis"] = (P.g - P.F2).abs() / P.sd06
    P["idio"] = (P.g - P.mkt_g).abs()
    P = P.sort_values(["code", "T"])
    P["sd08"] = np.nan
    for c, g in P.groupby("code"):
        e = (g.y - g.g).values
        P.loc[g.index, "sd08"] = ewma_sd(e, min_n=20)
    P["dev"] = P.code.isin(a.code.unique())
    P["nxt"] = P.g.notna()
    return P.reset_index(drop=True)                                   # 보합 출발(y = 0)도 남김, 방향 계산에서만 뺌


def walk(S, fit, every=1, min_days=60):
    """S: 한 종목 묶음의 행. fit(train, test) → 예측. 날마다(또는 every일마다 다시 맞추고 그 사이엔 같은 모델) 그날 전 자료로."""
    days = sorted(S["T"].unique())
    pred = pd.Series(np.nan, index=S.index)
    model = None
    for k, T in enumerate(days):
        tr = S[S["T"] < T]
        if tr["T"].nunique() < min_days:
            continue
        te = S[S["T"] == T]
        if model is None or k % every == 0:
            model = fit(tr)
        pred.loc[te.index] = model(te)
    return pred


def zscale(tr, cols):
    T = tr[cols].replace([np.inf, -np.inf], np.nan)
    lo, hi = T.quantile(0.01), T.quantile(0.99)
    T = T.clip(lo, hi, axis=1)
    mu, sdv = T.mean(), T.std().replace(0, 1).fillna(1)
    return lambda d: ((d[cols].replace([np.inf, -np.inf], np.nan).clip(lo, hi, axis=1) - mu) / sdv).fillna(0.0).values


# 08:10 모델
def fit_M1(tr):
    zs = zscale(tr, Z08); Z = zs(tr); u = (tr.g - tr.F2).values[:, None]
    X = np.column_stack([u, u * Z, tr.nq.values]); c, *_ = np.linalg.lstsq(X, (tr.y - tr.F2).values, rcond=None)
    return lambda te: te.F2.values + np.column_stack([(te.g - te.F2).values[:, None], (te.g - te.F2).values[:, None] * zs(te), te.nq.values]) @ c


def fit_M2(tr):
    cols = ["F2", "g", "nq"] + Z08
    X = tr[cols].assign(u=tr.F2 - tr.g).values
    m = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=50, random_state=0).fit(X, (tr.y - tr.g).values)
    return lambda te: te.g.values + m.predict(te[cols].assign(u=te.F2 - te.g).values)


def fit_M3(tr):
    zs = zscale(tr, Z08)
    def feats(d):
        Z = zs(d); u = (d.g - d.F2).values[:, None]; f = d.F2.values[:, None]
        return np.column_stack([u, u * Z, f, f * Z, d.nq.values])
    m = LassoLarsIC(criterion="bic").fit(feats(tr), (tr.y - tr.F2).values)
    return lambda te: te.F2.values + m.predict(feats(te))


# 06:00 모델
def fit_N1(tr):
    zs = zscale(tr, Z06); X = tr.x.values[:, None] * zs(tr)
    c, *_ = np.linalg.lstsq(X, (tr.y - tr.F2).values, rcond=None)
    return lambda te: te.F2.values + (te.x.values[:, None] * zs(te)) @ c


def fit_N2(tr):
    cols = ["x", "F2"] + Z06
    m = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=50, random_state=0).fit(tr[cols].values, (tr.y - tr.F2).values)
    return lambda te: te.F2.values + m.predict(te[cols].values)


def fit_N3(tr):
    zs = zscale(tr, Z06)
    feats = lambda d: np.column_stack([d.x.values[:, None], d.x.values[:, None] * zs(d), d.F2.values])
    m = LassoLarsIC(criterion="bic").fit(feats(tr), (tr.y - tr.F2).values)
    return lambda te: te.F2.values + m.predict(feats(te))


# 범위
def band_fit(center, sdcol, zcols):
    def fit(tr):
        r = (tr.y - tr[center]).abs() / tr[sdcol]
        if zcols:
            zs = zscale(tr, zcols)
            d, *_ = np.linalg.lstsq(np.column_stack([np.ones(len(tr)), zs(tr)]), np.log(r.values + 1e-3), rcond=None)
            s = lambda D: D[sdcol].values * np.exp(np.column_stack([np.ones(len(D)), zs(D)]) @ d)
        else:
            s = lambda D: D[sdcol].values
        k = np.quantile((tr.y - tr[center]).abs().values / s(tr), 0.8)
        return lambda te: k * s(te)
    return fit


def iscore(y, c, h):
    lo, hi = c - h, c + h
    return (hi - lo) + 10 * np.clip(lo - y, 0, None) + 10 * np.clip(y - hi, 0, None)


def compare(S, base_err, alt_err):
    import statsmodels.api as sm
    d = (base_err - alt_err).groupby(S["T"]).mean()
    d = d.dropna()
    t = d.mean()
    p_naive = norm_p(t / (d.std(ddof=1) / math.sqrt(len(d))))
    p = float(sm.OLS(d.values, np.ones(len(d))).fit(cov_type="HAC", cov_kwds={"maxlags": 5}).pvalues[0])
    compare.naive = p_naive
    h = [d[d.index <= DISC_END].mean(), d[d.index > DISC_END].mean()]
    return t, p, h, len(d)


if __name__ == "__main__":
    P = build_panel()
    P.to_csv(RESULTS / "explore22_panel.csv", index=False)
    out, rows = {}, []
    sets = {"08": (P[P.nxt & P.dev], P[P.nxt & ~P.dev]), "06": (P[P.dev], P[~P.dev])}
    sets = {k: (a.dropna(subset=["sd06", "F2"]), b.dropna(subset=["sd06", "F2"])) for k, (a, b) in sets.items()}
    for k in ("08",):
        sets[k] = tuple(s.dropna(subset=["g", "zv", "sd08"]) for s in sets[k])
    spec = [("M1 조절 선형(08:10)", "08", fit_M1, 1, "B08"), ("M2 부스팅(08:10)", "08", fit_M2, 20, "B08"), ("M3 상호작용 LASSO(08:10)", "08", fit_M3, 5, "B08"),
            ("N1 조절 선형(06:00)", "06", fit_N1, 1, "B06"), ("N2 부스팅(06:00)", "06", fit_N2, 20, "B06"), ("N3 상호작용 LASSO(06:00)", "06", fit_N3, 5, "B06")]
    res = []
    for name, grp, f, every, bname in spec:
        for part, S in zip(("개발", "확인"), sets[grp]):
            S = S.copy()
            S["pred"] = walk(S, f, every)
            S = S.dropna(subset=["pred"])
            S["base"] = S.g if grp == "08" else S.F2
            t, p, h, n = compare(S, (S.y - S.base).abs(), (S.y - S.pred).abs())
            nz = S[S.y != 0]
            hit = lambda c: (np.sign(nz[c]) == np.sign(nz.y)).mean()
            t0, *_ = compare(nz, (nz.y - nz.base).abs(), (nz.y - nz.pred).abs())
            r = dict(name=name, part=part, n=len(S), days=n, base_mae=(S.y - S.base).abs().mean() * 100, mae=(S.y - S.pred).abs().mean() * 100,
                     d=t * 100, p=p, p_naive=compare.naive, h0=h[0] * 100, h1=h[1] * 100, hit_b=hit("base"), hit_m=hit("pred"),
                     d_nz=t0 * 100, flat=(S.y == 0).mean())
            rows.append(r)
            out[(name, part)] = S
            print(name, part, f"{r['base_mae']:.3f} → {r['mae']:.3f}  d {r['d']:+.3f} p {p:.3g}", flush=True)
    for name, grp, center, sdcol, zc in (("R08 범위(08:10, 중심 g)", "08", "g", "sd08", Z08), ("R06 범위(06:00, 중심 F2)", "06", "F2", "sd06", Z06)):
        for part, S in zip(("개발", "확인"), sets[grp]):
            S = S.copy()
            S["hb"] = walk(S, band_fit(center, sdcol, []), 1)
            S["hm"] = walk(S, band_fit(center, sdcol, zc), 1)
            S = S.dropna(subset=["hb", "hm"])
            ib, im = iscore(S.y, S[center], S.hb), iscore(S.y, S[center], S.hm)
            t, p, h, n = compare(S, ib, im)
            cov = lambda hcol: ((S.y - S[center]).abs() <= S[hcol]).mean()
            r = dict(name=name, part=part, n=len(S), days=n, base_mae=ib.mean() * 100, mae=im.mean() * 100, d=t * 100, p=p, p_naive=compare.naive,
                     h0=h[0] * 100, h1=h[1] * 100, hit_b=cov("hb"), hit_m=cov("hm"))
            rows.append(r); out[(name, part)] = S
            print(name, part, f"IS {r['base_mae']:.3f} → {r['mae']:.3f}  d {r['d']:+.3f} p {p:.3g}", flush=True)
    from arch.bootstrap import SPA, StepM
    spa_lines = []
    for grp, names, bcol in (("08", [n for n, g, *_ in spec if g == "08"], "B08"), ("06", [n for n, g, *_ in spec if g == "06"], "B06")):
        S0 = out[(names[0], "확인")]
        L = pd.DataFrame({"base": (S0.y - S0.base).abs().groupby(S0["T"]).mean()})
        for n in names:
            S = out[(n, "확인")]
            L[n] = (S.y - S.pred).abs().groupby(S["T"]).mean()
        L = L.dropna()
        sp = SPA(L.base.values, L[names].values, reps=1000, block_size=5, seed=7); sp.compute()
        st = StepM(L.base.values, L[names].values, size=0.05, reps=1000, block_size=5, seed=7); st.compute()
        sup = [names[i] for i in (st.superior_models or [])] if st.superior_models is not None else []
        spa_lines.append(f"| {grp} 묶음 | {len(L)} | {sp.pvalues['consistent']:.3g} | {', '.join(map(str, sup)) or '없음'} |")
    R = pd.DataFrame(rows)
    conf = R[R.part == "확인"].reset_index(drop=True)
    conf["holm"] = holm(conf.p.tolist())
    conf["ok"] = (conf.d > 0) & (conf.holm < 0.05) & (conf.h0 > 0) & (conf.h1 > 0)
    R.to_csv(RESULTS / "explore22_summary.csv", index=False)

    md = ["# 더 파 보기 22(E32): 상태에 따라 정보를 얼마나 믿을지 조합 — 종합 탐색\n", "규칙은 파일 머리말(2026-10-29 돌리기 전).\n",
          "## 판정(확인 종목, + = 모델이 기준보다 좋음)\n",
          "| 모델 | 종목-날(날) | 기준 → 모델(오차 %p, 범위는 구간 점수) | 차이 | p(HAC) · 단순 p | Holm p | 앞 | 뒤 | 방향 일치 기준 → 모델(범위는 80% 안 비율) | 판정 |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for _, r in conf.iterrows():
        md.append(f"| {r['name']} | {r.n}({r.days}) | {r.base_mae:.3f} → {r.mae:.3f} | {r.d:+.3f} | {r.p:.3g} · {r.p_naive:.3g} | {r.holm:.3g} | {r.h0:+.3f} | {r.h1:+.3f} | "
                  f"{r.hit_b:.1%} → {r.hit_m:.1%} | {'해결 조합' if r.ok else '아님'} |")
    md += ["\n## 보합 출발(시가 = 전일 종가) 처리\n", "오차·범위는 보합 출발한 날까지 넣어 평가했다(위 표). 방향 일치는 그날을 뺐다. 아래는 보합 출발한 날을 뺐을 때의 오차 차이.\n",
           "| 모델 | 보합 출발 비율 | 차이(모든 날) | 차이(보합 출발 뺌) |", "|---|---|---|---|"]
    for _, r in R[(R.part == "확인") & R.d_nz.notna()].iterrows():
        md.append(f"| {r['name']} | {r.flat:.1%} | {r.d:+.3f} | {r.d_nz:+.3f} |")
    md += ["\n## 보조 판정: 여러 모델을 한꺼번에 본 SPA·StepM(확인 종목)\n", "| 묶음 | 날 | SPA p(기준보다 나은 모델이 하나라도 있나) | StepM이 고른 '기준보다 나은' 모델 |", "|---|---|---|---|"] + spa_lines
    md += ["\n## 개발 종목(14종목, 참고)\n", "| 모델 | 종목-날 | 기준 → 모델 | 차이 | p | 앞 | 뒤 | 방향(범위) 기준 → 모델 |", "|---|---|---|---|---|---|---|---|"]
    for _, r in R[R.part == "개발"].iterrows():
        md.append(f"| {r['name']} | {r.n} | {r.base_mae:.3f} → {r.mae:.3f} | {r.d:+.3f} | {r.p:.3g} | {r.h0:+.3f} | {r.h1:+.3f} | {r.hit_b:.1%} → {r.hit_m:.1%} |")
    # 문제였던 아침(확인 종목)
    md += ["\n## 문제였던 아침에서(확인 종목, 오차 기준 → 모델 / 방향 기준 → 모델)\n", "| 모델 | 특수일 | FOMC | CPI | 근거 없는 큰 갭 | 얇은 프리마켓 | 7/14·7/29 |", "|---|---|---|---|---|---|---|"]
    for name, grp, *_ in spec:
        S = out[(name, "확인")]
        groups = {"특수일": (S.mon + S.hol + S.exp + S.fomc) > 0, "FOMC": S.fomc > 0, "CPI": S.cpi > 0,
                  "근거 없는 큰 갭": (S.g.abs() >= 0.0264) & (S.F2.abs() < 0.01) if grp == "08" else S.index < 0,
                  "얇은 프리마켓": (S.zv <= -0.361) if grp == "08" else S.index < 0, "7/14·7/29": S["T"].isin(EVENT)}
        cells = []
        for g, m in groups.items():
            s = S[m]
            if len(s) < 10:
                cells.append("-"); continue
            s0 = s[s.y != 0]
            hb, hm = (np.sign(s0.base) == np.sign(s0.y)).mean(), (np.sign(s0.pred) == np.sign(s0.y)).mean()
            cells.append(f"{(s.y - s.base).abs().mean() * 100:.2f}→{(s.y - s.pred).abs().mean() * 100:.2f} / {hb:.0%}→{hm:.0%} ({len(s)})")
        md.append(f"| {name} | " + " | ".join(cells) + " |")
    md.append("\n주의: 확인 종목은 개발 종목과 같은 날짜를 쓴다(다른 날에도 되는지는 매일 기록으로만 확인). 당일 뉴스는 자료에 없어 대용 변수만 썼다. "
              "독립 감사(10/29)에서 미래 정보 누수는 없었다. 다만 ① 1분봉 이름이 그 분의 시작 시각이라 '08:10 가격'은 08:10:59까지의 체결(실제 기준 08:11, 기준과 모델 모두 같음) "
              "② 보합 출발(약 7%)은 오차·범위엔 넣고 방향 일치에서만 뺐다 ③ VIX 종가는 겨울에 06:15 KST라 06:00 모델엔 15분 늦은 값 ④ 지표 날짜는 실제 발표일(일정 변경 반영)이다.")
    (RESULTS / "explore22.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
