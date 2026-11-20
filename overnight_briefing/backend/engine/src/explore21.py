"""더 파 보기 21(E31): 미국 지표·FOMC 다음 아침은 덜 맞나 — FRED 공식 발표일로 11년치 다시 보기
(2026-10-29, 돌리기 전에 정함. 결과를 본 뒤 이 머리말의 규칙은 바꾸지 않는다.)

    python src/explore21.py     (FRED_API_KEY가 든 .env, explore16.py 결과(results/explore16_predictions.csv, data/ks200_long.csv))

왜: 지금 특수일에 FOMC 결과 아침이 들어 있고(explore9), CPI·고용지표 아침은 1년치(E21)로는 기간마다 엇갈려 넣지 않았다.
    발표일을 코드에 손으로 적어 두었고, 긴 기간 검증(E26)은 2025 이전 FOMC 날짜가 없어 뺐다. FRED 공식 발표일로 둘 다 메운다.

자료: FRED release/dates — CPI(id 10), 고용보고서 Employment Situation(id 50), 2014-01~2026-10.
  FOMC는 연준 공식 일정(federalreserve.gov fomccalendars·fomchistorical 연도별 페이지)의 성명 발표일 → data/fomc_dates.csv(임시 회의 표시).
  (처음엔 FRED 'FOMC Press Release'(id 101)를 쓰려 했으나 매일 갱신되는 묶음이라 발표일이 3,824개로 나와 회의일로 쓸 수 없었다. 결과를 보기 전 자료만 바꿨다.)
  미국 발표일 u → 한국 아침 T = u 다음 한국 거래일(CPI·고용 08:30 ET, FOMC 14:00 ET 모두 한국 밤 → 다음 아침).
① 날짜 대조: explore12의 CPI·NFP 목록(미국 날짜), explore8의 FOMC_T(한국 아침)를 FRED와 맞춰 본다.
② 11년치(E26 대리 지표 예측, 코스피200 지수, 2015-01~2026-10): 지표 아침과 비교 아침의 F2 방향 일치·80% 범위 안 비율·|오차|.
   비교 아침: CPI·FOMC는 '보통 아침'(월요일·연휴 다음 날·옵션 만기일·다른 지표 아침이 아닌 날),
             고용보고서는 거의 다 금요일 발표 → 한국 월요일이라 '고용보고서가 아닌 월요일'.
   특수일에 넣을 근거 = 방향 일치가 비교보다 5%p 이상 낮고, 80% 범위 안 비율도 5%p 이상 낮고, 앞(2015~2020)·뒤(2021~2026) 모두 그렇고,
                        방향 일치 차이의 95% 부트스트랩(아침 단위 2,000번) 위쪽 끝 < 0.
   E26 대리 지표는 야간선물보다 약하다(A단계 미달). 같은 대리 지표 안에서 아침끼리 견주는 것이라 상대 비교로만 읽는다.
③ 야간선물 기간(2025-10~2026-10, explore 예측의 지수·종목): 같은 비교를 참고로만(아침 수가 적음).
"""
import json
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd

from common import DATA, RESULTS
from explore12 import CPI as CPI_HAND, NFP as NFP_HAND
from explore8 import FOMC_T as FOMC_HAND

RID = {"CPI": 10, "NFP": 50}
KINDS = ["CPI", "NFP", "FOMC"]
rng = np.random.default_rng(31)


def fred_key(env="/Users/betterkim/4Digit-solo/.env"):
    for line in open(env, encoding="utf-8"):
        if line.startswith("FRED_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')


def fetch_dates():
    key, rows = fred_key(), []
    for name, rid in RID.items():
        q = urllib.parse.urlencode({"release_id": rid, "realtime_start": "2014-01-01", "realtime_end": "2026-10-28",
                                    "include_release_dates_with_no_data": "false", "limit": 10000, "api_key": key, "file_type": "json"})
        d = json.loads(urllib.request.urlopen(f"https://api.stlouisfed.org/fred/release/dates?{q}", timeout=30).read())
        rows += [{"kind": name, "us_date": r["date"].replace("-", "")} for r in d["release_dates"]]
    D = pd.DataFrame(rows).drop_duplicates()
    D.to_csv(DATA / "fred_release_dates.csv", index=False)
    F = pd.read_csv(DATA / "fomc_dates.csv", dtype={"us_date": str})
    D = pd.concat([D, F.assign(kind="FOMC")[["kind", "us_date"]]], ignore_index=True)
    return D


def next_kr(us_dates, kr_days):
    kr = np.array(sorted(kr_days))
    return [kr[np.searchsorted(kr, u, side="right")] if np.searchsorted(kr, u, side="right") < len(kr) else None for u in us_dates]


def hit(g):
    g = g[g.y != 0]
    return (np.sign(g.F2) == np.sign(g.y)).mean()


def boot(a, b, n=2000):
    a, b = a[a.y != 0], b[b.y != 0]
    ha, hb = (np.sign(a.F2) == np.sign(a.y)).values, (np.sign(b.F2) == np.sign(b.y)).values
    v = [rng.choice(ha, len(ha)).mean() - rng.choice(hb, len(hb)).mean() for _ in range(n)]
    return np.percentile(v, [2.5, 97.5])


if __name__ == "__main__":
    D = fetch_dates()
    kr_days = pd.read_csv(DATA / "ks200_long.csv", dtype={"Date": str}).iloc[:, 0].astype(str).tolist()
    D["T"] = next_kr(D.us_date, kr_days)
    md = ["# 더 파 보기 21(E31): 미국 지표·FOMC 다음 아침 — 공식 발표일(FRED·연준)로 11년치\n",
          "규칙은 파일 머리말(2026-10-29 돌리기 전). 발표일: CPI·고용은 FRED release/dates(실제 발표가 있었던 날만), FOMC는 연준 공식 일정(data/fomc_dates.csv).\n",
          "발표일 수(2014-01~2026-10): " + ", ".join(f"{k} {int((D.kind == k).sum())}" for k in KINDS) + "\n"]

    # ① 손으로 적은 목록과 대조(2025-10-01~2026-10-28)
    md += ["## ① 코드에 적어 둔 날짜와 공식 발표일 대조(2025-10~2026-10)\n", "| 종류 | 코드 목록 | 공식 | 코드에만 | 공식에만 |", "|---|---|---|---|---|"]
    win = D[(D.us_date >= "20251001") & (D.us_date <= "20261028")]
    for k, hand, col in (("CPI", CPI_HAND, "us_date"), ("NFP", NFP_HAND, "us_date"), ("FOMC", FOMC_HAND, "T")):
        f = set(win[win.kind == k][col].dropna())
        h = set(hand)
        md.append(f"| {k}{'(한국 아침)' if col == 'T' else '(미국 날짜)'} | {len(h)} | {len(f)} | {', '.join(sorted(h - f)) or '-'} | {', '.join(sorted(f - h)) or '-'} |")

    # ② 11년치
    P = pd.read_csv(RESULTS / "explore16_predictions.csv", dtype={"T": str})
    mark = {k: set(D.loc[D.kind == k, "T"].dropna()) for k in KINDS}   # D.T는 표 뒤집기라 D["T"]로 읽음
    P["macro"] = P["T"].isin(mark["CPI"] | mark["NFP"] | mark["FOMC"])
    P["mon"] = pd.to_datetime(P["T"]).dt.weekday == 0
    normal = P[(P.cls != "특수일") & ~P.macro]
    md += ["\n## ② 11년치(대리 지표, 코스피200 지수)\n",
           "| 아침 | 비교 | 아침 수 | 방향 일치 아침 · 비교 | 차이(95% 범위) | 80% 범위 안 아침 · 비교 | |오차| 아침 · 비교 | 앞 2015~2020 방향·범위 차이 | 뒤 2021~2026 방향·범위 차이 | 판정 |",
           "|---|---|---|---|---|---|---|---|---|---|"]
    for k in KINDS:
        a = P[P["T"].isin(mark[k])]
        if k == "NFP":
            b = P[P.mon & ~P["T"].isin(mark["NFP"])]; blab = "고용보고서 아닌 월요일"
        else:
            b = normal; blab = "보통 아침"
        lo, hi = boot(a, b)
        dh, dc = hit(a) - hit(b), a.in80.mean() - b.in80.mean()
        hv = []
        for s, e in (("20150101", "20201231"), ("20210101", "20261026")):
            aa, bb = a[(a["T"] >= s) & (a["T"] <= e)], b[(b["T"] >= s) & (b["T"] <= e)]
            hv.append((hit(aa) - hit(bb), aa.in80.mean() - bb.in80.mean()))
        ok = dh <= -0.05 and dc <= -0.05 and hi < 0 and all(x <= -0.05 and y <= -0.05 for x, y in hv)
        md.append(f"| {k} | {blab} | {len(a)} | {hit(a):.0%} · {hit(b):.0%} | {dh * 100:+.1f}%p ({lo * 100:+.1f} ~ {hi * 100:+.1f}) | "
                  f"{a.in80.mean():.0%} · {b.in80.mean():.0%} | {(a.y - a.F2).abs().mean() * 100:.2f} · {(b.y - b.F2).abs().mean() * 100:.2f}%p | "
                  f"{hv[0][0] * 100:+.1f} · {hv[0][1] * 100:+.1f} | {hv[1][0] * 100:+.1f} · {hv[1][1] * 100:+.1f} | {'특수일 근거 있음' if ok else '근거 부족'} |")
    md.append(f"\n보통 아침 {len(normal)}개, 고용보고서 아닌 월요일 {int((P.mon & ~P['T'].isin(mark['NFP'])).sum())}개. "
              f"월요일 전체: 방향 {hit(P[P.mon]):.0%} · 범위 안 {P[P.mon].in80.mean():.0%} (보통 아침 {hit(normal):.0%} · {normal.in80.mean():.0%}).")

    # ③ 야간선물 기간(참고)
    E = pd.read_csv(RESULTS / "explore_predictions.csv", dtype={"T": str, "target": str})
    E["lo"], E["hi"] = E.F2 - 1.2816 * E.sd_ewma, E.F2 + 1.2816 * E.sd_ewma
    E["in80"] = (E.y >= E.lo) & (E.y <= E.hi)
    md += ["\n## ③ 야간선물 기간(2025-10~2026-10, 참고)\n", "| 아침 | 대상 | 아침 수 | 방향 일치 아침 · 그 밖 | 80% 범위 안 아침 · 그 밖 |", "|---|---|---|---|---|"]
    for k in KINDS:
        for tgt, g in (("종목 15개", E),):                       # explore_predictions에는 지수 행이 없다
            a, b = g[g["T"].isin(mark[k])], g[~g["T"].isin(mark["CPI"] | mark["NFP"] | mark["FOMC"])]
            md.append(f"| {k} | {tgt} | {a['T'].nunique()} | {hit(a):.0%} · {hit(b):.0%} | {a.in80.mean():.0%} · {b.in80.mean():.0%} |")
    md.append("\n주의: ②는 EWY 대리 지표라 야간선물보다 약하다(E26 A단계 미달). 아침끼리 상대 비교로만 읽는다. FOMC에는 임시 회의 4번(2019-10-11, 2020-03-03·15·23)이 들어 있다.")
    (RESULTS / "explore21.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
