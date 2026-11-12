"""미국 뉴스 → 관계표 → 국내 종목 연결(설명 가능한 규칙만). 단독 검증판 기사 원장(~/4Digit-solo/data/night.db, 알파카)을 읽기만 한다.

왜 이렇게 하나
- 엔진의 제목 문자열 태깅·묶기는 정답 카드가 있는 두 밤에 맞춰져 있어, 새 밤(10/27)에서 엉뚱한 연결이 나왔다(머스크 트윗+항공사 전망을
  '데이터센터 투자 실적 발표'로 묶음 등). 그래서 추측을 줄인 세 규칙만 쓴다.
규칙
  T(티커 태그): 기사에 출판사(Benzinga)가 붙인 티커 ∋ 관계표 미국 기업 줄의 src_id, 그리고 단독 검증판 설계대로 기업 줄은
     (그 회사 이름 + 실적·가이던스·설비투자 단어)가 제목에 함께 있거나, 회사 이름이 아닌 그 줄의 검색어(Blackwell·CoWoS 등)가 제목에 있을 때만 켠다.
     회사 이름만으로 된 검색어(예: 'Nvidia')는 티커가 이미 회사를 가리키므로 게이트에서 뺀다. 태그 3개 이하면 '주인공'.
  N(국내 대형주 영문명): src_id 000660·005930 줄은 제목에 영문 회사명 + (실적·가이던스 또는 증설·설비투자 단어)일 때.
  C(개념 검색어): 관계표 search_terms_en 구절이 제목에 단어 단위로 있을 때. 대문자 약어(ISC·SOX·VEU)는 대소문자까지 같아야 한다.
     '미국 AI 데이터센터 투자' 줄은 관계표 켜짐 조건(빅테크 설비투자·데이터센터 발표)에 맞춰 제목에 빅테크 이름도 같이 있어야 한다.
  모든 연결에 '왜 켜졌나'(걸린 단어)를 남긴다.
두 층
  확인 연결(tier=확인): 위 규칙을 통과한 것.
  간접 후보(tier=후보): 버리지 않고 남기는 것. (가) 관계표 미국 기업 티커가 '주인공'(태그 3개 이하)인데 켜짐 조건을 못 넘은 기사,
     (나) 개념 줄의 유의어(CANDIDATE_TERMS)가 제목에 있지만 검색어·빅테크 조건을 못 넘은 기사. 경로는 관계표 줄로 적고 판정 전으로 둔다.
  공통: 관계표 줄은 known_since < 그날(그날 전에 알려진 줄만), 기사는 직전 거래일 15:30 ~ 그날 07:30 KST.
시장 전체 층: 물가·연준·금리·선거·관세·고용 단어가 제목에 있는 기사(종목 연결 아님, 그날 시장이 통째로 다르게 열린 몫 복기용).

실행: ~/4Digit/.venv/bin/python workbench/us_news_link.py
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pandas as pd

W = Path(__file__).parent
SOLO = Path.home() / "4Digit-solo"
OUT = W / "runs/claude_uslink_r1"
OUT.mkdir(parents=True, exist_ok=True)
from news_days import news_days, prev_trading_day  # noqa: E402
DAYS = news_days()   # 앱에 있는 날짜 전부 + 11/10 + NEWS_DAYS(아침 봉인 때 그날)
KR_NAMES = {"000660": r"\bSK ?Hynix\b", "005930": r"\bSamsung Electronics\b|\bSamsung\b(?=.*\b(?:chip|memory|HBM|foundry|semiconductor)s?\b)"}
US_NAME = {"NVDA": r"\bNvidia\b|\bNVIDIA\b", "AMD": r"\bAMD\b", "MU": r"\bMicron\b", "TSM": r"\bTSMC\b|\bTaiwan Semiconductor\b",
           "LRCX": r"\bLam Research\b", "AMZN": r"\bAmazon\b|\bAWS\b", "GOOGL": r"\bAlphabet\b|\bGoogle\b", "INTC": r"\bIntel\b",
           "AAPL": r"\bApple\b|\biPhone\b", "QCOM": r"\bQualcomm\b"}
BIGTECH = re.compile(r"\b(Microsoft|Meta|Alphabet|Google|Amazon|AWS|Oracle|OpenAI|Broadcom|Nvidia|NVIDIA|CoreWeave|xAI|Anthropic|Stargate)\b")
NAME_ONLY = re.compile(r"^(nvidia|amd|micron|tsmc|intel|apple|amazon|google|alphabet|broadcom|qualcomm|lam research|sk hynix|samsung|samsung electronics)$", re.I)
EARN = re.compile(r"\b(earnings|results|revenue|sales|guidance|outlook|forecasts?|EPS|quarter(ly)?|Q[1-4]|beats?|misses|capex|capital expenditures?|spending)\b", re.I)
EXPAND = re.compile(r"\b(expan(d|ds|sion)|capacity|fab|plant|capex|investment|invest)\b", re.I)


def term_pattern(terms: list[str]) -> re.Pattern | None:
    parts = []
    for x in sorted(terms, key=len, reverse=True):
        body = re.escape(x)
        parts.append(f"(?-i:\\b{body}\\b)" if x.isupper() and len(x) <= 5 else f"\\b{body}\\b")
    return re.compile("|".join(parts), re.I) if parts else None


def why(pat: re.Pattern | None, s: str) -> str | None:
    m = pat.search(s) if pat is not None else None
    return m.group(0) if m else None


# 개념 줄 후보를 넓히는 유의어(관계표 검색어를 기사 말투로 넓힌 것). 후보일 뿐 확인 연결이 아니다.
CANDIDATE_TERMS = {
    "HYPERSCALER_CAPEX": r"\b(neoclouds?|AI cloud|GPU cloud|compute capacity|AI compute|data ?cent(er|re)s?|power demand|power grid|electricity demand|hyperscalers?|AI buildout|gigawatts?)\b",
    "SOX": r"\b(chip stocks|chipmakers?|semiconductors?|memory prices|DRAM|NAND|HBM)\b",
    "US_TARIFF": r"\b(tariffs?|Section 232|trade war|duties)\b",
    "US_EXPORT_CTRL": r"\b(export controls?|entity list|chip curbs?|chip restrictions?)\b",
}
MACRO = re.compile(r"\b(?:CPI|inflation|consumer prices|Fed\b|FOMC|Powell|rate hike|rate cut|interest rates?|Treasury yields?|jobs report|payrolls|"
                   r"unemployment|midterms?|election|tariffs?|recession|S&P 500|Nasdaq|Dow)\b", re.I)


def main() -> None:
    con = sqlite3.connect(f"file:{SOLO / 'data/night.db'}?mode=ro", uri=True)
    A = pd.read_sql("select item_id, headline, symbols, created_at_utc, url from news_items where source='alpaca'", con)
    A["t"] = pd.to_datetime(A.created_at_utc, utc=True).dt.tz_convert("Asia/Seoul")
    A["syms"] = A.symbols.fillna("[]").map(lambda s: set(json.loads(s)) if s.startswith("[") else set())
    A["nsym"] = A.syms.map(len)
    E = pd.read_csv(SOLO / "ref/relation_edges_v0.csv", dtype=str).fillna("")
    prev = prev_trading_day(DAYS)
    links, macro, cover, cand_rows = [], [], {}, []
    for T in DAYS:
        lo = pd.Timestamp(f"{prev[T]} 15:30", tz="Asia/Seoul")
        hi = pd.Timestamp(f"{T} 07:30", tz="Asia/Seoul")
        w = A[(A.t >= lo) & (A.t < hi)]
        cover[T] = dict(articles=len(w), first=str(w.t.min())[:16] if len(w) else None, last=str(w.t.max())[:16] if len(w) else None)
        if w.empty:
            continue
        day = f"{T[:4]}-{T[4:6]}-{T[6:]}"
        edges = E[E.known_since < day]
        for src, g in edges.groupby("src_id"):
            terms = sorted({x.strip() for v in g.search_terms_en for x in v.split(";") if len(x.strip()) >= 3 and not NAME_ONLY.match(x.strip())})
            tp = term_pattern(terms)
            if src in KR_NAMES:
                rule, cand = "N", w[w.headline.str.contains(KR_NAMES[src], regex=True)]
                reason = [why(tp, h) or (("실적·가이던스: " + why(EARN, h)) if why(EARN, h) else (("증설·설비투자: " + why(EXPAND, h)) if why(EXPAND, h) else None)) for h in cand.headline]
            elif src.isupper() and src.isalpha() and src not in ("HYPERSCALER_CAPEX", "US_EXPORT_CTRL", "US_TARIFF", "SOX"):
                rule, cand = "T", w.loc[w.syms.map(lambda s, src=src: src in s).astype(bool)]
                nm = re.compile(US_NAME.get(src, r"(?!x)x"))
                reason = [(("검색어: " + why(tp, h)) if why(tp, h) else
                           (("회사명+실적: " + why(nm, h) + "·" + why(EARN, h)) if (why(nm, h) and why(EARN, h)) else None)) for h in cand.headline]
            else:
                if tp is None:
                    continue
                rule, cand = "C", w
                need = BIGTECH if src == "HYPERSCALER_CAPEX" else None
                reason = [("검색어: " + why(tp, h) + (f" + {why(need, h)}" if need is not None else "")) if why(tp, h) and (need is None or why(need, h)) else None
                          for h in cand.headline]
            hit = cand.assign(reason=reason)
            miss = hit[hit.reason.isna()]
            hit = hit[hit.reason.notna()]
            # 간접 후보: (가) 주인공 티커 기사인데 조건 밖, (나) 개념 유의어
            if rule == "T":
                cands = miss[miss.nsym <= 3].assign(reason="회사 소식(켜짐 조건 밖)")
            elif rule == "C" and src in CANDIDATE_TERMS:
                cp = re.compile(CANDIDATE_TERMS[src], re.I)
                cands = miss.assign(reason=[("유의어: " + why(cp, h)) if why(cp, h) else None for h in miss.headline])
                cands = cands[cands.reason.notna()]
            else:
                cands = miss.iloc[0:0]
            if not cands.empty:
                for r in cands.itertuples():
                    cand_rows.append(dict(T=T, item_id=r.item_id, time=f"{r.t:%m/%d %H:%M}", headline=r.headline, tickers=",".join(sorted(r.syms))[:80],
                                          src_id=src, edge_ids=";".join(g.edge_id), reason=r.reason))
                ch = cands.sort_values("t", ascending=False).head(3)
                for _, e in g.iterrows():
                    links.append(dict(T=T, tier="후보", kr_code=e.kr_code, kr_name=e.kr_name, src_id=src, src_name=e.src_name, relation_type=e.relation_type,
                                      direction=e.direction, confidence=e.confidence, status="검수 완료" if e.status.startswith("검수 완료") else "검수 전",
                                      rule=rule, n_articles=len(cands), n_primary=None, reasons=" | ".join(sorted(set(cands.reason))[:4]),
                                      headlines=" | ".join(f"{r.t:%m/%d %H:%M} {r.headline[:120]}" for r in ch.itertuples())))
            if hit.empty:
                continue
            hit = hit.assign(primary=(hit.nsym <= 3) if rule == "T" else True)
            heads = hit.sort_values(["primary", "t"], ascending=[False, False]).head(3)
            for _, e in g.iterrows():
                links.append(dict(T=T, tier="확인", kr_code=e.kr_code, kr_name=e.kr_name, src_id=src, src_name=e.src_name, relation_type=e.relation_type,
                                  direction=e.direction, confidence=e.confidence, status="검수 완료" if e.status.startswith("검수 완료") else "검수 전",
                                  rule=rule, n_articles=len(hit), n_primary=int(hit.primary.sum()),
                                  reasons=" | ".join(sorted(set(hit.reason))[:4]),
                                  headlines=" | ".join(f"{r.t:%m/%d %H:%M} {r.headline[:120]}" for r in heads.itertuples())))
        m = w[w.headline.str.contains(MACRO)].sort_values("t")
        for r in m.itertuples():
            macro.append(dict(T=T, time=f"{r.t:%m/%d %H:%M}", headline=r.headline, symbols=",".join(sorted(r.syms))[:60]))
    L = pd.DataFrame(links)
    M = pd.DataFrame(macro)
    L.to_csv(OUT / "links.csv", index=False)
    C = pd.DataFrame(cand_rows)
    if not C.empty:
        C = C.groupby(["T", "item_id", "time", "headline", "tickers"], as_index=False).agg(
            src_ids=("src_id", lambda s: ";".join(sorted(set(s)))), edge_ids=("edge_ids", lambda s: ";".join(sorted({x for v in s for x in v.split(";")}))),
            reasons=("reason", lambda s: " | ".join(sorted(set(s)))))
    C.to_csv(OUT / "candidates.csv", index=False)
    M.to_csv(OUT / "macro.csv", index=False)
    summ = dict(rule_doc=__doc__, coverage=cover,
                links_by_day=L.groupby(["T", "tier"]).size().unstack(fill_value=0).to_dict("index") if not L.empty else {},
                by_rule=L.rule.value_counts().to_dict() if not L.empty else {},
                macro_by_day=M.groupby("T").size().to_dict() if not M.empty else {})
    (OUT / "summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: v for k, v in summ.items() if k != "rule_doc"}, ensure_ascii=False, indent=1, default=str))


if __name__ == "__main__":
    main()
