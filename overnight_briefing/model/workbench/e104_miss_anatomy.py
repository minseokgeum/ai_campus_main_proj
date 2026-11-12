"""E104: 빗나간 종목 해부(protocol_e104_miss_anatomy.json).
실행: ~/4Digit/.venv/bin/python workbench/e104_miss_anatomy.py [--no-news]"""
import argparse
import email.utils
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import pandas as pd

R = Path(__file__).resolve().parents[1]
W = Path(__file__).parent
FREEZE = "20261103"
ap = argparse.ArgumentParser()
ap.add_argument("--root", default="live/20261109", help="universe·kr_daily·공시를 읽을 live 폴더(workbench 기준). 11/10 장 마감 갱신부터 그날 폴더")
ap.add_argument("--no-news", action="store_true")
ap.add_argument("--segments", action="store_true", help="업종을 사업보고서 기준 상위 묶음(segments_final.csv final_parent)으로. 11/10 v2")
ap.add_argument("--out", default="runs/claude_miss_r1")
ARGS = ap.parse_args()
L = W / ARGS.root
OUT = W / ARGS.out
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(104)

S = pd.read_csv(W / "runs/claude_forward_r1/e100_stocks.csv", dtype={"T": str, "code": str})
u = pd.read_csv(L / "data/universe.csv", dtype=str).rename(columns={"Code": "code"})
if ARGS.segments:   # 법정 업종명(KSIC) 묶음 대신 사업보고서 기준 상위 묶음(지주사는 '지주')
    seg = pd.read_csv(W / "runs/claude_segments_r1/segments_final.csv", dtype={"code": str}).set_index("code").final_parent
    u["group"] = u.code.map(seg).fillna(u.group)
S = S.merge(u[["code", "group", "Industry", "Market", "etf"]], on="code", how="left")
S["e"] = S.y - S.H
S["common"] = S.groupby("T").e.transform("mean")
S["r"] = S.e - S.common
S["out"] = ~S.in80.astype(bool)
S["dist"] = np.where(S.y > S.U80, S.y - S.U80, np.where(S.y < S.L80, S.L80 - S.y, 0.0))


def kind(row):
    if not row.out:
        return "범위 안"
    if abs(row.y) < 0.001:
        return "보합"
    if np.sign(row.y) != np.sign(row.H):
        return "방향 반대"
    return "방향 맞고 더 크게" if abs(row.y) > abs(row.H) else "방향 맞고 덜"


S["type"] = S.apply(kind, axis=1)
S["side"] = np.where(S.y > S.U80, "띠 위", np.where(S.y < S.L80, "띠 아래", ""))

# ---- 업종 몫 ----
def r2(r, g):
    m = r.groupby(g).transform("mean")
    return float(((m - r.mean()) ** 2).sum() / ((r - r.mean()) ** 2).sum())


days = []
for T, d in S.groupby("T"):
    d = d.dropna(subset=["group"])
    obs = r2(d.r, d.group)
    perm = [r2(d.r, pd.Series(rng.permutation(d.group.values), index=d.index)) for _ in range(1000)]
    sec = d.groupby("group").agg(n=("r", "size"), r_mean=("r", "mean"), out=("out", "mean"), up=("side", lambda s: (s == "띠 위").mean()),
                                 down=("side", lambda s: (s == "띠 아래").mean())).sort_values("r_mean")
    tc = d[d.out].type.value_counts().to_dict()
    days.append(dict(T=T, group="확정 후" if T >= FREEZE else "확정 전", x=round(float(d.x.iloc[0]) * 100, 2),
                     in80=round(float((~d.out).mean() * 100), 1), common=round(float(d.e.mean() * 100), 2),
                     mean_H=round(float(d.H.mean() * 100), 2), mean_y=round(float(d.y.mean() * 100), 2),
                     resid_sd=round(float(d.r.std() * 100), 2), sector_R2=round(obs, 3),
                     sector_p=round(float((np.array(perm) >= obs).mean()), 3), types=tc,
                     sectors=[dict(group=g, n=int(v.n), r_mean=round(float(v.r_mean) * 100, 2), out=round(float(v.out) * 100, 1),
                                   up=round(float(v.up) * 100, 1), down=round(float(v.down) * 100, 1)) for g, v in sec.iterrows()]))

# 기준선: 1년 재생에서 날마다 업종 몫(R²)과 그날 띠 안 비율
rp = pd.read_csv(Path.home() / "4Digit/src/app/data/model/track_stocks.csv.gz", dtype={"T": str, "code": str})
rp = rp[(rp["T"] < "20261027") & rp.y.notna()].merge(u[["code", "group"]], on="code", how="inner")
rp["e"] = rp.y - rp.H
rp["r"] = rp.e - rp.groupby("T").e.transform("mean")
base = pd.DataFrame([dict(T=T, R2=r2(d.r, d.group), cov=float(d.in80.astype(bool).mean())) for T, d in rp.groupby("T")])
baseline = dict(days=len(base), R2_median=round(float(base.R2.median()), 3), R2_q90=round(float(base.R2.quantile(.9)), 3),
                corr_R2_cov=round(float(base[["R2", "cov"]].corr().iloc[0, 1]), 3),
                cov_when_R2_top=round(float(base[base.R2 >= base.R2.quantile(2 / 3)]["cov"].mean() * 100), 1),
                cov_when_R2_rest=round(float(base[base.R2 < base.R2.quantile(2 / 3)]["cov"].mean() * 100), 1))
for d in days:
    d["sector_R2_pct_in_replay"] = round(float((base.R2 < d["sector_R2"]).mean() * 100), 1)

typ = S[S.out].groupby(S["T"] >= FREEZE).type.value_counts(normalize=True).mul(100).round(1)
type_share = {("확정 후" if k[0] else "확정 전"): {} for k in typ.index}
for (a, t), v in typ.items():
    type_share["확정 후" if a else "확정 전"][t] = float(v)

# ---- 뉴스 ----
cal = sorted(pd.read_csv(L / "data/kr_daily.csv", dtype={"date": str}).query("code=='KS200'").date)
prev = {cal[i]: cal[i - 1] for i in range(1, len(cal))}


# 11/10 정정: 처음 판은 구글 뉴스 검색 RSS로 종목 기사를 찾았으나 news.google.com robots.txt가 수집을 막고 있어 뺐다.
# 그 결과(e104_news.csv·e104_market_news.csv)는 runs/claude_miss_r1/_withdrawn_google_rss/로 격리했고 판정에 쓰지 않는다.
news_rows, mkt_rows, errs = [], [], []
if not ARGS.no_news:
    raise SystemExit("뉴스 비교는 거둬들였다. --no-news로만 실행한다(공시 비교는 별도 정리 예정).")
N = pd.DataFrame(news_rows)
M = pd.DataFrame(mkt_rows)
dart = pd.read_csv(L / "dart_filings.csv", dtype=str)
def dart_for(T, code):
    p = prev[T]
    q = dart[(dart.code == code) & (dart.rcept_dt >= p) & (dart.rcept_dt < T)]
    return " | ".join(q.report_nm.str.strip().head(4))
if not N.empty:
    N["dart"] = [dart_for(T, c) for T, c in zip(N["T"], N.code)]
    N = N.merge(S[["T", "code", "group", "H", "L80", "U80", "y", "type", "side", "r"]], on=["T", "code"], how="left")
    news_cmp = {g: dict(n=len(v), with_title_news=round(float((v.n_title > 0).mean() * 100), 1), with_dart=round(float((v.dart != "").mean() * 100), 1))
                for g, v in N.groupby("grp")}
    news_cmp_after = {g: dict(n=len(v), with_title_news=round(float((v.n_title > 0).mean() * 100), 1), with_dart=round(float((v.dart != "").mean() * 100), 1))
                      for g, v in N[N["T"] >= FREEZE].groupby("grp")}
else:
    news_cmp = news_cmp_after = {}

res = dict(experiment="E104", protocol="workbench/protocol_e104_miss_anatomy.json", replay_sector_baseline=baseline, days=days, type_share=type_share,
           news_compare_all=news_cmp, news_compare_after_freeze=news_cmp_after, news_errors=errs)
(OUT / "e104.json").write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
S.to_csv(OUT / "e104_stocks.csv", index=False)
if not N.empty:
    N.to_csv(OUT / "e104_news.csv", index=False)
if not M.empty:
    M.to_csv(OUT / "e104_market_news.csv", index=False)

pd.set_option("display.width", 250)
print(pd.DataFrame([{k: v for k, v in d.items() if k not in ("sectors",)} for d in days]).to_string(index=False))
print("재생 기준선:", baseline, "\n확정 뒤 날 R2 백분위:", [(d["T"], d["sector_R2"], d["sector_R2_pct_in_replay"]) for d in days])
print("유형 비율:", json.dumps(type_share, ensure_ascii=False))
print("뉴스 비교(전체):", news_cmp, "\n뉴스 비교(확정 후):", news_cmp_after, "\n오류:", len(errs))
for d in days:
    if d["group"] == "확정 후" or d["in80"] < 70:
        s = pd.DataFrame(d["sectors"])
        print(d["T"], "업종 R2", d["sector_R2"], "p", d["sector_p"])
        print(s.sort_values("r_mean").to_string(index=False))
