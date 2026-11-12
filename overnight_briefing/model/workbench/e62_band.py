"""E62-E64: 07:30 노란띠, 계좌 띠, 믿을 정도 표시. protocol_e62_band.json이 계약이다.

순수 함수는 합성 자료로 시험한다. 봉인 단계는 선택 파일 해시를 확인하고 한 번만 돈다.
    PYTHONPATH=.:src .venv/bin/python -m workbench.e62_band --stage design
    PYTHONPATH=.:src .venv/bin/python -m workbench.e62_band --stage sealed
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from workbench.range_models import bootstrap_mean, day_weights, holm, split_history, weighted_quantile

ROOT = Path(__file__).resolve().parents[1]
WB = ROOT / "workbench"
PROTOCOL = WB / "protocol_e62_band.json"
OUT = WB / "runs/claude_band_design_r1"
EVENTS = WB / "runs/claude_events_r1/dart_filings.csv"
SEED = 20261102
SPLIT_T = "20260731"
RES = {"e_earn": re.compile(r"잠정\)?실적|영업실적|매출액또는손익구조"),
       "e_deal": re.compile(r"단일판매|공급계약|유상증자|무상증자|합병|분할결정|자기주식|타법인주식|신규시설투자|상장결정|증권예탁증권|소송|영업정지|주요사항보고서"),
       "e_rumor": re.compile(r"풍문|해명|조회공시|투자판단"),
       "e_periodic": re.compile(r"분기보고서|반기보고서|사업보고서")}
FAMILIES = list(RES)
SPECS = {"E0": ([], []), "S1": (["ax"], []), "A1": (["ax"], []), "S2": (["ax", "nvz", "tv", "vix"], []),
         "S3": (["ax", "nvz", "tv", "vix"], ["e_earn", "e_deal", "e_rumor", "mon", "hol", "exp", "fomc", "cpi", "nfp"])}
ORDER = ["E0", "S1", "A1", "S2", "S3"]
NIGHTS = [("0.5% 미만", 0, .005), ("0.5~2%", .005, .02), ("2% 이상", .02, 9)]


def split_stocks(codes, dev):
    rest = sorted(set(codes) - set(dev))
    order = np.random.default_rng(SEED).permutation(rest)
    half = len(rest) // 2
    sealed = sorted(order[:half].tolist())
    return sorted(set(codes) - set(sealed)), sealed


def classify(name):
    corrected = name.startswith("[기재정정]")
    out = {k for k, r in RES.items() if r.search(name)}
    if corrected:
        out.discard("e_earn")
    return out


def event_flags(filings, calendar):
    """calendar: T, D. 이벤트는 D <= 접수일 < T. T 당일 공시는 들어가지 않는다."""
    days = calendar.sort_values("T")
    rows = []
    f = filings.assign(fam=filings.report_nm.map(classify))
    f = f[f.fam.map(len) > 0]
    t, d = days["T"].to_numpy(), days["D"].to_numpy()
    for r in f.itertuples(index=False):
        i = np.searchsorted(t, r.rcept_dt, side="right")
        if i >= len(t) or not (d[i] <= r.rcept_dt < t[i]):
            continue
        for fam in r.fam:
            rows.append((t[i], r.code, fam))
    if not rows:
        return pd.DataFrame(columns=["T", "code"] + FAMILIES)
    e = pd.DataFrame(rows, columns=["T", "code", "fam"]).drop_duplicates().assign(v=1.0)
    return e.pivot_table(index=["T", "code"], columns="fam", values="v", fill_value=0).reindex(columns=FAMILIES, fill_value=0).reset_index()


def interval_score(y, low, high, alpha):
    y, low, high = np.asarray(y, float), np.asarray(low, float), np.asarray(high, float)
    return (high-low) + (2/alpha)*(np.maximum(low-y, 0) + np.maximum(y-high, 0))


def raw_band(errors, level, minimum=80):
    """각 행의 반폭은 그 행보다 앞선 유효 오차만 쓴다."""
    a = np.asarray(errors, float)
    rank = math.ceil(61*level) - 1
    out = np.full(len(a), np.nan)
    hist = []
    for i, v in enumerate(a):
        if len(hist) >= minimum:
            out[i] = np.sort(np.abs(hist[-60:]))[rank]
        if np.isfinite(v):
            hist.append(v)
    return out


def prior_rms(errors, minimum=20, window=250, lam=.94):
    a = np.asarray(errors, float)
    out = np.full(len(a), np.nan)
    hist = []
    for i, v in enumerate(a):
        if len(hist) >= minimum:
            h = np.asarray(hist[-window:])
            w = lam ** np.arange(len(h))[::-1]
            out[i] = np.sqrt(w @ (h*h) / w.sum())
        if np.isfinite(v):
            hist.append(v)
    return out


def fit_scale(train, cont, binary=()):
    """range_models.make_scale_model과 같은 계산. 이항 변수는 절단하지 않는다(드문 이벤트가 0이 되지 않게)."""
    columns = list(cont) + list(binary)
    if not columns:
        return lambda d: d.sd08.to_numpy(float)
    X = train[columns].replace([np.inf, -np.inf], np.nan)
    lo, hi = X[list(cont)].quantile(.01), X[list(cont)].quantile(.99)

    def clipped(d):
        Z = d[columns].replace([np.inf, -np.inf], np.nan).copy()
        if len(cont):
            Z[list(cont)] = Z[list(cont)].clip(lo, hi, axis=1)
        return Z
    Xc = clipped(train)
    mu, sd = Xc.mean(), Xc.std().replace(0, 1).fillna(1)

    def design(d):
        z = ((clipped(d)-mu)/sd).fillna(0).to_numpy(float)
        return np.column_stack([np.ones(len(d)), z])
    A = design(train)
    target = np.log(np.abs(train.y.to_numpy()-train.g.to_numpy())/train.sd08.to_numpy()+1e-3)
    base = day_weights(train)
    weights = base.copy()
    beta = np.zeros(A.shape[1])
    for _ in range(8):
        root = np.sqrt(weights)
        beta = np.linalg.lstsq(A*root[:, None], target*root, rcond=None)[0]
        err = target-A@beta
        scale = max(float(np.median(np.abs(err-np.median(err)))/.67448975), 1e-6)
        weights = base*np.minimum(1, 1.35*scale/np.maximum(np.abs(err), 1e-12))
    fitted = lambda d: d.sd08.to_numpy(float)*np.exp(np.clip(design(d)@beta, -8, 8))
    fitted.beta = dict(zip(["const"]+columns, map(float, beta)))
    return fitted


def forecast_day(hist, today, spec, asym=False):
    """hist는 그날 이전 설계 표. today에는 y를 쓰지 않는다."""
    parts = split_history(hist, today["T"].iloc[0])
    if parts is None or today.empty:
        return None
    train, cal = parts
    cont, binary = spec
    scale = fit_scale(train, cont, binary)
    s_cal, w = scale(cal), day_weights(cal)
    s = scale(today)
    out = today[["T", "code"]].copy()
    g = today.g.to_numpy(float)
    if asym:
        sign_cal = np.where(cal.x.to_numpy(float) >= 0, 1., -1.)
        r = sign_cal*(cal.y.to_numpy()-cal.g.to_numpy())/s_cal
        sign = np.where(today.x.to_numpy(float) >= 0, 1., -1.)
        for lv, a in ((80, .2), (90, .1)):
            lo, hi = weighted_quantile(r, w, a/2), weighted_quantile(r, w, 1-a/2)
            b1, b2 = g+sign*lo*s, g+sign*hi*s
            out[f"L{lv}"], out[f"U{lv}"] = np.minimum(b1, b2), np.maximum(b1, b2)
    else:
        u = np.abs(cal.y.to_numpy()-cal.g.to_numpy())/s_cal
        for lv, q in ((80, .8), (90, .9)):
            h = weighted_quantile(u, w, q)*s
            out[f"L{lv}"], out[f"U{lv}"] = g-h, g+h
    return out


def run_candidates(frame, train_codes, eval_codes, days, specs=SPECS, asym=("A1",)):
    cols = ["T", "code", "y", "g", "sd08", "x"] + sorted({c for s in specs.values() for part in s for c in part})
    usable = frame[np.isfinite(frame.y) & np.isfinite(frame.g) & np.isfinite(frame.sd08) & (frame.sd08 > 0)][cols]
    tr = usable[usable.code.isin(train_codes)]
    ev = frame[frame.code.isin(eval_codes) & np.isfinite(frame.sd08) & (frame.sd08 > 0)][[c for c in cols if c != "y"]]
    res = {k: [] for k in specs}
    for day in days:
        hist, today = tr[tr["T"] < day], ev[ev["T"] == day]
        if today.empty:
            continue
        for name, spec in specs.items():
            f = forecast_day(hist, today, spec, asym=name in asym)
            if f is not None:
                res[name].append(f)
    return {k: pd.concat(v, ignore_index=True) for k, v in res.items() if v}


def attach(scored, frame):
    return scored.merge(frame[["T", "code", "y", "ax", "g"]], on=["T", "code"], how="inner")


def daily(z, level=80):
    a = 1-level/100
    lo, hi = z[f"L{level}"].to_numpy(), z[f"U{level}"].to_numpy()
    d = pd.DataFrame({"T": z["T"].to_numpy(), "score": interval_score(z.y, lo, hi, a)*100, "cov": ((z.y >= lo) & (z.y <= hi)).to_numpy()*100., "width": (hi-lo)*100, "up": (z.y.to_numpy() > hi)*100., "dn": (z.y.to_numpy() < lo)*100., "ax": z.ax.to_numpy()})
    return d.groupby("T").agg(score=("score", "mean"), cov=("cov", "mean"), width=("width", "mean"), up=("up", "mean"), dn=("dn", "mean"), ax=("ax", "first"))


def describe(day):
    out = dict(days=len(day), score=float(day.score.mean()), cov=float(day["cov"].mean()), width=float(day.width.mean()), up=float(day.up.mean()), dn=float(day.dn.mean()), worst16=float(day["cov"].rolling(16).mean().min()) if len(day) >= 16 else None)
    out["nights"] = {n: dict(days=int(((day.ax >= a) & (day.ax < b)).sum()), cov=float(day.loc[(day.ax >= a) & (day.ax < b), "cov"].mean()), width=float(day.loc[(day.ax >= a) & (day.ax < b), "width"].mean())) for n, a, b in NIGHTS}
    return out


def compare(base, cand, block):
    d = (base.score-cand.score).dropna()
    b = bootstrap_mean(d, block, reps=5000, seed=SEED)
    mid = d.index[len(d)//2]
    return dict(delta=float(d.mean()), rel=float(d.mean()/base.score.reindex(d.index).mean()*100), ci=[b["ci_low"], b["ci_high"]], p=b["p"], early=float(d[d.index < mid].mean()), late=float(d[d.index >= mid].mean()), days=len(d))


def choose(names, comps, descr, base_big, order, extra=None):
    """사전 규칙. 통과 후보 중 가장 단순한 것, 복잡한 후보는 추가 개선이 있을 때만."""
    passed = []
    for n in order:
        if n not in comps:
            continue
        c, s = comps[n], descr[n]
        big = s["nights"]["2% 이상"]["cov"]
        ok = c["delta"] > 0 and c["ci"][0] > 0 and c.get("holm", 1) < .05 and c["early"] > 0 and c["late"] > 0 and c["rel"] >= 1 and 75 <= s["cov"] <= 85 and abs(big-80) < abs(base_big-80)
        c["pass"] = bool(ok)
        if ok:
            passed.append(n)
    pick = None
    for n in passed:
        if pick is None:
            pick = n
        elif extra and (x := extra(pick, n)) and x["rel"] >= 1 and x["ci"][0] > 0:
            pick = n
    return pick


def account_set(codes, n_each=150, sizes=(1, 3, 5, 10), seed=SEED):
    rng = np.random.default_rng(seed)
    out = []
    for size in sizes:
        for i in range(n_each):
            cs = sorted(rng.choice(sorted(codes), size, replace=False).tolist())
            w = rng.dirichlet(np.ones(size)) if size > 1 else np.ones(1)
            out.append((f"n{size}_{i}", size, cs, w))
    return out


def account_frame(E, x, accounts):
    rows = []
    for name, size, cs, w in accounts:
        e = (E[cs]*w).sum(axis=1, skipna=False).to_numpy()
        rows.append(pd.DataFrame({"T": E.index, "code": name, "size": size, "y": e, "g": 0., "sd08": prior_rms(e), "raw80": raw_band(e, .8), "raw90": raw_band(e, .9)}))
    a = pd.concat(rows, ignore_index=True)
    a["x"] = a["T"].map(x)
    a["ax"] = a.x.abs()
    return a


def logit_prob(train, test, cols):
    med = train[cols].median()
    a, b = train[cols].replace([np.inf, -np.inf], np.nan).fillna(med), test[cols].replace([np.inf, -np.inf], np.nan).fillna(med)
    mu, sd = a.mean(), a.std().replace(0, 1).fillna(1)
    w = 1/train.groupby("T").t.transform("size")
    m = LogisticRegression(C=1., max_iter=400).fit((a-mu)/sd, train.t, sample_weight=w/w.mean())
    return m.predict_proba((b-mu)/sd)[:, 1]


def trust_eval(z, train_codes, eval_codes, days, cols_list, block):
    z = z.dropna(subset=["t"]).copy()
    z["t"] = z.t.astype(int)
    tr, ev = z[z.code.isin(train_codes)], z[z.code.isin(eval_codes)]
    alld = sorted(tr["T"].unique())
    usable = [d for d in days if int(np.searchsorted(alld, d)) >= 60]
    out = []
    for k in range(0, len(usable), 5):
        chunk = usable[k:k+5]
        train, test = tr[tr["T"] < chunk[0]], ev[ev["T"].isin(chunk)].copy()
        if test.empty:
            continue
        test["p0"] = train.groupby("T").t.mean().mean()
        for n, cols in cols_list.items():
            test[n] = logit_prob(train, test, cols)
        out.append(test)
    g = pd.concat(out)
    res = dict(rows=len(g), days=int(g["T"].nunique()), base=float(g.groupby("T").t.mean().mean()*100))
    briers = pd.DataFrame({n: ((g[n]-g.t)**2).groupby(g["T"]).mean() for n in ["p0"]+list(cols_list)})
    mid = briers.index[len(briers)//2]

    def cmp(a, b):
        d = briers[a]-briers[b]
        bo = bootstrap_mean(d, block, reps=5000, seed=SEED)
        return dict(delta=float(d.mean()), rel=float(d.mean()/briers[a].mean()*100), ci=[bo["ci_low"], bo["ci_high"]], p=bo["p"], early=float(d[d.index < mid].mean()), late=float(d[d.index >= mid].mean()))
    res["vs_base"] = {n: cmp("p0", n) for n in cols_list}
    if "ev" in cols_list:
        res["event_vs_b1"] = cmp("b1", "ev")
    res["calibration"] = {}
    for n in cols_list:
        rk = g.groupby("T")[n].rank(pct=True)
        spread = {}
        for lab, q in [("early", g["T"] < mid), ("late", g["T"] >= mid)]:
            hi = g[q & (rk > .8)].groupby("T").t.mean().mean()*100
            lo = g[q & (rk <= .2)].groupby("T").t.mean().mean()*100
            spread[lab] = float(hi-lo)
        cuts = pd.qcut(g[n].rank(method="first"), 5, labels=False)
        tb = g.groupby(cuts).agg(pred=(n, lambda s: s.mean()*100), act=("t", lambda s: s.mean()*100))
        res["calibration"][n] = dict(spread=spread, table=tb.round(1).values.tolist(), max_gap=float((tb.pred-tb.act).abs().max()))
    c, v = res["calibration"]["b1"], res["vs_base"]["b1"]
    res["pass"] = bool(v["ci"][0] > 0 and v["early"] > 0 and v["late"] > 0 and c["spread"]["early"] >= 15 and c["spread"]["late"] >= 15 and c["max_gap"] <= 5)
    res["frame"] = g
    return res


def display_levels(g, column, cuts):
    a, b = cuts
    lv = np.select([g[column] < a, g[column] < b], ["낮음", "보통"], "높음")
    t = g.assign(level=lv).groupby(["T", "level"]).t.mean().groupby("level").mean()*100
    n = pd.Series(lv).value_counts(normalize=True)*100
    return {k: dict(actual=float(t.get(k, np.nan)), share=float(n.get(k, 0))) for k in ("높음", "보통", "낮음")}


def event_effect(z, fam, block):
    """같은 날 이벤트 종목과 나머지 비교. 정규화 오차, 띠 포함률, 방향."""
    q = z.dropna(subset=["sd08"]).copy()
    q["ne"] = (q.y-q.g).abs()/q.sd08
    q["sign"] = np.where((q.y != 0) & (q.g != 0), (np.sign(q.y) == np.sign(q.g))*100., np.nan)
    q["inb"] = np.where(np.isfinite(q.raw80), ((q.y-q.g).abs() <= q.raw80)*100., np.nan)
    on, off = q[q[fam] > 0].groupby("T"), q[q[fam] == 0].groupby("T")
    d = (on.ne.mean()-off.ne.mean()).dropna()
    b = bootstrap_mean(d, block, reps=5000, seed=SEED)
    mid = d.index[len(d)//2] if len(d) else None
    return dict(rows=int((q[fam] > 0).sum()), share=float((q[fam] > 0).mean()*100), days=len(d), ne_on=float(on.ne.mean().mean()), ne_off=float(off.ne.mean().mean()), delta=float(d.mean()), ci=[b["ci_low"], b["ci_high"]], p=b["p"],
                early=float(d[d.index < mid].mean()) if mid else None, late=float(d[d.index >= mid].mean()) if mid else None,
                band_on=float(on.inb.mean().mean()), band_off=float(off.inb.mean().mean()), dir_on=float(on.sign.mean().mean()), dir_off=float(off.sign.mean().mean()))


def load_frames():
    from workbench import i24_panel as ip
    p6 = ip.load_panel("06:00")
    p8 = ip.load_panel("08:11")
    dev = json.loads((WB/"protocol_i24_features.json").read_text())["development_codes"]
    cal = p6[["T", "D"]].drop_duplicates().sort_values("T")
    filings = pd.read_csv(EVENTS, dtype=str)
    ev = event_flags(filings, cal)
    z = p6[np.isfinite(p6.H)].sort_values(["code", "T"]).copy()
    z["g"] = z.H
    z["e"] = z.y-z.H
    z["sd08"] = z.groupby("code").e.transform(lambda v: prior_rms(v.to_numpy()))
    z["raw80"] = z.groupby("code").e.transform(lambda v: raw_band(v.to_numpy(), .8))
    z["raw90"] = z.groupby("code").e.transform(lambda v: raw_band(v.to_numpy(), .9))
    z["size"] = z.H.abs()
    z = z.merge(ev, on=["T", "code"], how="left")
    z[FAMILIES] = z[FAMILIES].fillna(0.)
    n = p8[p8.nxt & np.isfinite(p8.g) & np.isfinite(p8.y)].copy()
    n["size"] = n.g.abs()
    n = n.merge(ev, on=["T", "code"], how="left")
    n[FAMILIES] = n[FAMILIES].fillna(0.)
    return z, n, dev, sorted(z.code.unique())


def trust_targets(z, n):
    a = n[(n.y != 0) & (n.g != 0)].copy()
    a["t"] = (np.sign(a.g) == np.sign(a.y)).astype(float)
    b = z[np.isfinite(z.y)].copy()
    b["t"] = ((b.y-b.H).abs() <= .01).astype(float)
    c = z[np.isfinite(z.y) & (z.y != 0) & (z.H != 0)].copy()
    c["t"] = (np.sign(c.H) == np.sign(c.y)).astype(float)
    return {"D08": a, "N06": b, "D06": c}


B1 = ["size", "lsd", "r2"]
CUTS = {"D08": (.75, .90), "N06": (.40, .55), "D06": (.60, .80)}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def stage_design():
    OUT.mkdir(parents=True, exist_ok=True)
    z, n, dev, codes = load_frames()
    design, sealed = split_stocks(codes, dev)
    days = sorted(t for t in z["T"].unique() if t <= SPLIT_T)
    bands = run_candidates(z, design, design, days)
    start = max(f["T"].min() for f in bands.values())
    frame = z[z.code.isin(design) & (z["T"] >= start) & (z["T"] <= SPLIT_T) & np.isfinite(z.y) & np.isfinite(z.raw80)]
    keys = frame[["T", "code"]]
    for f in bands.values():
        keys = keys.merge(f[["T", "code"]], on=["T", "code"])
    base = keys.merge(frame.assign(L80=frame.g-frame.raw80, U80=frame.g+frame.raw80, L90=frame.g-frame.raw90, U90=frame.g+frame.raw90)[["T", "code", "L80", "U80", "L90", "U90", "y", "ax", "g"]], on=["T", "code"])
    dR = daily(base)
    descr = {"R0": describe(dR)}
    descr90 = {"R0": describe(daily(base, 90))}
    dailies = {}
    for name, f in bands.items():
        m = attach(keys.merge(f, on=["T", "code"]), z)
        dailies[name] = daily(m)
        descr[name], descr90[name] = describe(dailies[name]), describe(daily(m, 90))
    comps = {k: compare(dR, dailies[k], 10) for k in ORDER}
    for k, h in zip(ORDER, holm([comps[k]["p"] for k in ORDER])):
        comps[k]["holm"] = float(h)

    def extra(a, b):
        return compare(dailies[a], dailies[b], 10)
    pick = choose(ORDER, comps, descr, descr["R0"]["nights"]["2% 이상"]["cov"], ORDER, extra) or "R0"
    s3s2 = compare(dailies["S2"], dailies["S3"], 10)

    E = z[z.code.isin(design)].pivot_table(index="T", columns="code", values="e", dropna=False)
    x = z.groupby("T").x.first()
    acc = account_set(design)
    af = account_frame(E, x, acc)
    aspec = {"A0": ([], []), "AS1": (["ax"], [])}
    adays = [d for d in days if d >= start]
    ab = run_candidates(af, [a[0] for a in acc], [a[0] for a in acc], adays, specs=aspec, asym=())
    afr = af[(af["T"] >= start) & (af["T"] <= SPLIT_T) & np.isfinite(af.y) & np.isfinite(af.raw80)]
    akeys = afr[["T", "code"]]
    for f in ab.values():
        akeys = akeys.merge(f[["T", "code"]], on=["T", "code"])
    abase = akeys.merge(afr.assign(L80=-afr.raw80, U80=afr.raw80, L90=-afr.raw90, U90=afr.raw90)[["T", "code", "L80", "U80", "L90", "U90", "y", "ax", "g"]], on=["T", "code"])
    aR = daily(abase)
    adescr = {"AR0": describe(aR)}
    addaily = {}
    sizes = dict(zip(af.code, af["size"]))
    astrata = {"AR0": {int(s): float(aR_s) for s, aR_s in abase.assign(size=abase.code.map(sizes), c=(abase.y >= abase.L80) & (abase.y <= abase.U80)).groupby(["T", "size"]).c.mean().groupby("size").mean().mul(100).items()}}
    for name, f in ab.items():
        m = akeys.merge(f, on=["T", "code"]).merge(afr[["T", "code", "y", "ax", "g"]], on=["T", "code"])
        addaily[name] = daily(m)
        adescr[name] = describe(addaily[name])
        astrata[name] = {int(s): float(v) for s, v in m.assign(size=m.code.map(sizes), c=(m.y >= m.L80) & (m.y <= m.U80)).groupby(["T", "size"]).c.mean().groupby("size").mean().mul(100).items()}
    acomps = {k: compare(aR, addaily[k], 10) for k in aspec}
    for k, h in zip(aspec, holm([acomps[k]["p"] for k in aspec])):
        acomps[k]["holm"] = float(h)
    apick = choose(list(aspec), acomps, adescr, adescr["AR0"]["nights"]["2% 이상"]["cov"], list(aspec), lambda a, b: compare(addaily[a], addaily[b], 10)) or "AR0"
    H80 = z[z.code.isin(design)].pivot_table(index="T", columns="code", values="raw80", dropna=False).reindex(columns=design)
    joint, summed = [], []
    for name, size, cs, w in acc:
        if size == 1:
            continue
        joint.append(afr.loc[afr.code == name, ["T", "raw80"]].set_index("T").raw80)
        summed.append((H80[cs]*w).sum(axis=1, skipna=False).reindex(joint[-1].index))
    sumw = dict(joint=float(np.nanmean(pd.concat(joint).to_numpy())*200), summed=float(np.nanmean(pd.concat(summed).to_numpy())*200))

    tg = trust_targets(z, n)
    trust = {}
    for name, frame_t in tg.items():
        dd = sorted(t for t in frame_t["T"].unique() if t <= SPLIT_T and t >= start)
        r = trust_eval(frame_t, design, design, dd, {"b1": B1, "ev": B1+["e_earn", "e_deal", "e_rumor"]}, 10)
        g = r.pop("frame")
        r["levels"] = display_levels(g, "b1", CUTS[name])
        trust[name] = r
    for name, h in zip(trust, holm([trust[k]["event_vs_b1"]["p"] for k in trust])):
        trust[name]["event_vs_b1"]["holm"] = float(h)
        c = trust[name]["event_vs_b1"]
        trust[name]["event_adopted"] = bool(c["ci"][0] > 0 and h < .05 and c["early"] > 0 and c["late"] > 0 and c["rel"] >= 1)
    ee = z[z.code.isin(design) & (z["T"] >= start) & (z["T"] <= SPLIT_T) & np.isfinite(z.y)]
    effects = {f: event_effect(ee, f, 10) for f in FAMILIES}
    for f, h in zip(["e_earn", "e_deal", "e_rumor"], holm([effects[f]["p"] for f in ("e_earn", "e_deal", "e_rumor")])):
        c = effects[f]
        c["holm"] = float(h)
        c["pass"] = bool(c["ci"][0] > 0 and h < .05 and c["early"] > 0 and c["late"] > 0)
    betas = {}
    tr = z[z.code.isin(design) & np.isfinite(z.y) & np.isfinite(z.sd08) & (z.sd08 > 0) & (z["T"] <= SPLIT_T)]
    for k in ("S1", "S3"):
        betas[k] = fit_scale(tr, *SPECS[k]).beta
    res = dict(experiment="E62-E64 design", protocol_sha256=sha(PROTOCOL), code_sha256=sha(Path(__file__)), design_stocks=len(design), sealed_stocks=len(sealed), start=start, band=dict(rows=len(keys), base=descr["R0"], cand=descr, cand90=descr90, compare=comps, s3_vs_s2=s3s2, pick=pick, coef=betas),
               account=dict(rows=len(akeys), accounts=len(acc), desc=adescr, strata=astrata, compare=acomps, pick=apick, sum_width=sumw), trust=trust, events=effects)
    (OUT/"e62_design.json").write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    choice = dict(stock=pick, account=apick, trust={k: bool(v["pass"]) for k, v in trust.items()}, event_trust={k: bool(v["event_adopted"]) for k, v in trust.items()}, events=[f for f in ("e_earn", "e_deal", "e_rumor") if effects[f]["pass"]], design_sha256=sha(OUT/"e62_design.json"), code_sha256=sha(Path(__file__)), protocol_sha256=sha(PROTOCOL))
    (OUT/"e62_choice.json").write_text(json.dumps(choice, ensure_ascii=False, indent=1))
    return res, choice


def amended_pass(desc, cmp_, base_score, strata=None):
    """계약 v2: 전체·밤 크기별 포함률과 구간점수 비열등."""
    nights = [v["cov"] for v in desc["nights"].values() if v["days"]]
    ok = 75 <= desc["cov"] <= 85 and all(75 <= c <= 85 for c in nights)
    ok = ok and cmp_["ci"][0] is not None and cmp_["ci"][0] > -.03*base_score
    if strata is not None:
        ok = ok and min(strata.values()) >= 72
    return bool(ok)


def stage_sealed():
    if (OUT/"e62_sealed.json").exists():
        raise SystemExit("봉인 결과가 이미 있습니다. 다시 열지 않습니다.")
    choice = json.loads((OUT/"e62_choice_v2.json").read_text())
    if choice["design_sha256"] != sha(OUT/"e62_design.json") or choice["protocol_sha256"] != sha(PROTOCOL) or choice["code_sha256"] != sha(Path(__file__)):
        raise SystemExit("개정 뒤 코드·계약·결과가 바뀌어 봉인을 열지 않습니다.")
    z, n, dev, codes = load_frames()
    design, sealed = split_stocks(codes, dev)
    days = sorted(t for t in z["T"].unique() if t > SPLIT_T)
    out = dict(experiment="E62-E64 sealed", choice=choice, sealed_stocks=len(sealed))
    frame = z[z.code.isin(sealed) & (z["T"] > SPLIT_T) & np.isfinite(z.y) & np.isfinite(z.raw80)]
    bands = run_candidates(z, design, sealed, days, specs={k: SPECS[k] for k in ("S1", "S2")}, asym=())
    keys = frame[["T", "code"]]
    for f in bands.values():
        keys = keys.merge(f[["T", "code"]], on=["T", "code"])
    base = keys.merge(frame.assign(L80=frame.g-frame.raw80, U80=frame.g+frame.raw80, L90=frame.g-frame.raw90, U90=frame.g+frame.raw90), on=["T", "code"])
    dR = daily(base)
    r0, r090 = describe(dR), describe(daily(base, 90))
    r0_ok = bool(75 <= r0["cov"] <= 85 and r0["nights"]["2% 이상"]["cov"] >= 75)
    desc, desc90, cmps, dd, passed, merged = {}, {}, {}, {}, {}, {}
    for k, f in bands.items():
        m = attach(keys.merge(f, on=["T", "code"]), z)
        merged[k] = m
        dd[k] = daily(m)
        desc[k], desc90[k] = describe(dd[k]), describe(daily(m, 90))
        cmps[k] = compare(dR, dd[k], 5)
        passed[k] = amended_pass(desc[k], cmps[k], r0["score"])
    s2s1 = compare(dd["S1"], dd["S2"], 5)
    pick = "R0" if r0_ok else "없음"
    if passed["S1"]:
        pick = "S1"
        if passed["S2"] and s2s1["rel"] >= 1 and s2s1["ci"][0] > 0:
            pick = "S2"
    elif passed["S2"]:
        pick = "S2"
    out["band"] = dict(pick=pick, rows=len(keys), v1_pick=choice["v1"]["stock"], R0=r0, R0_90=r090, R0_v1_passed=r0_ok, cand=desc, cand90=desc90, compare=cmps, s2_vs_s1=s2s1, passed=passed)
    E = z[z.code.isin(sealed)].pivot_table(index="T", columns="code", values="e", dropna=False)
    x = z.groupby("T").x.first()
    acc = account_set(sealed, seed=SEED+1)
    af = account_frame(E, x, acc)
    sizes = dict(zip(af.code, af["size"]))
    afr = af[(af["T"] > SPLIT_T) & np.isfinite(af.y) & np.isfinite(af.raw80)]
    Ed = z[z.code.isin(design)].pivot_table(index="T", columns="code", values="e", dropna=False)
    fd = account_frame(Ed, x, account_set(design))
    trd = fd[np.isfinite(fd.y) & np.isfinite(fd.sd08) & (fd.sd08 > 0)]
    rows = []
    for day in days:
        today = af[(af["T"] == day) & np.isfinite(af.sd08) & (af.sd08 > 0)].drop(columns=["y"])
        if today.empty:
            continue
        f = forecast_day(trd[trd["T"] < day], today, (["ax"], []))
        if f is not None:
            rows.append(f)
    fa = pd.concat(rows, ignore_index=True)
    akeys = afr[["T", "code"]].merge(fa[["T", "code"]], on=["T", "code"])
    m = akeys.merge(fa, on=["T", "code"]).merge(afr[["T", "code", "y", "ax", "g"]], on=["T", "code"])
    abase = akeys.merge(afr.assign(L80=-afr.raw80, U80=afr.raw80, L90=-afr.raw90, U90=afr.raw90), on=["T", "code"])
    aR, aS = daily(abase), daily(m)
    ar0, as1 = describe(aR), describe(aS)
    acmp = compare(aR, aS, 5)

    def strata(t):
        return {int(s): float(v) for s, v in t.assign(size=t.code.map(sizes), c=(t.y >= t.L80) & (t.y <= t.U80)).groupby(["T", "size"]).c.mean().groupby("size").mean().mul(100).items()}
    st0, st1 = strata(abase), strata(m)
    a_ok = amended_pass(as1, acmp, ar0["score"], st1)
    ar0_ok = bool(75 <= ar0["cov"] <= 85 and ar0["nights"]["2% 이상"]["cov"] >= 75 and min(st0.values()) >= 72)
    H80 = z[z.code.isin(sealed)].pivot_table(index="T", columns="code", values="raw80", dropna=False)
    joint, summed = [], []
    for name, size, cs, w in acc:
        if size > 1:
            j = afr.loc[afr.code == name, ["T", "raw80"]].set_index("T").raw80
            joint.append(j)
            summed.append((H80[cs]*w).sum(axis=1, skipna=False).reindex(j.index))
    out["account"] = dict(pick="AS1" if a_ok else ("AR0" if ar0_ok else "없음"), rows=len(akeys), AR0=ar0, AS1=as1, AS1_90=describe(daily(m, 90)), compare=acmp, strata=dict(AR0=st0, AS1=st1), passed=a_ok, AR0_v1_passed=ar0_ok, sum_width=dict(joint=float(np.nanmean(pd.concat(joint).to_numpy())*200), summed=float(np.nanmean(pd.concat(summed).to_numpy())*200)))
    tg = trust_targets(z, n)
    tr = {}
    for name, frame_t in tg.items():
        dd_t = sorted(t for t in frame_t["T"].unique() if t > SPLIT_T)
        r = trust_eval(frame_t, design, sealed, dd_t, {"b1": B1}, 5)
        g = r.pop("frame")
        r["levels"] = display_levels(g, "b1", CUTS[name])
        r["checked"] = bool(choice["v1"]["trust"].get(name))
        tr[name] = r
    out["trust"] = tr
    ee = z[z.code.isin(sealed) & (z["T"] > SPLIT_T) & np.isfinite(z.y)]
    out["events"] = {f: event_effect(ee, f, 5) for f in FAMILIES}
    for f in choice["v1"]["events"]:
        c = out["events"][f]
        c["passed"] = bool(c["delta"] > 0 and c["ci"][0] is not None and c["ci"][0] > 0)
    use = pick if pick in merged else "S1"
    q = merged[use].merge(z[["T", "code", "e_earn"]], on=["T", "code"])
    q["c"] = (q.y >= q.L80) & (q.y <= q.U80)
    out["events"]["e_earn"]["chosen_band"] = dict(band=use, on=float(q[q.e_earn > 0].groupby("T").c.mean().mean()*100), off=float(q[q.e_earn == 0].groupby("T").c.mean().mean()*100), rows_on=int((q.e_earn > 0).sum()))
    (OUT/"e62_sealed.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=float))
    return out


def main():
    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["design", "sealed"], required=True)
    a = ap.parse_args()
    if a.stage == "design":
        res, choice = stage_design()
        print(json.dumps(choice, ensure_ascii=False))
    else:
        stage_sealed()
        print("sealed done")


if __name__ == "__main__":
    main()
