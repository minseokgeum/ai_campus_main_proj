"""간접 후보 판정(P8_v1): us_news_link.py가 남긴 '간접 후보' 기사만 AI가 연결/무관을 판정하고 경로 문장을 쓴다. 코드가 다시 검사한다.

- AI가 하는 일: 판정(연결/무관), 관계표 줄 고르기, 제목에서 근거 구절 그대로 옮기기, 한국어 경로 한 줄.
- 코드가 하는 일: 기사 id·관계표 줄 id가 입력에 있는지, 근거 구절이 제목에 글자 그대로 있는지, 금지어(매수·매도·추천·오를·내릴 등)가 없는지.
  하나라도 걸리면 그 판정은 버리고 '검사 실패'로 남긴다.
- 모델: claude-sonnet-5-5(단독 검증판 대량 판정과 같은 작은 모델), 구조화 출력. 같은 입력은 캐시(~/4Digit-solo/data/llm_cache).
실행: ~/4Digit-solo/.venv/bin/python workbench/us_news_judge.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

SOLO = Path.home() / "4Digit-solo"
sys.path.insert(0, str(SOLO))
from nightbrief.common import load_env  # noqa: E402
from nightbrief.llm import SMALL_MODEL, complete_json  # noqa: E402

W = Path(__file__).parent
RUN = W / "runs/claude_uslink_r1"
VERSION = "P8_v1"
FORBID = re.compile(r"매수|매도|추천|오를|내릴|급등할|급락할|수익률|사야|팔아|목표가")
SYSTEM = """너는 미국 밤사이 뉴스 제목이 '관계표'에 적힌 경로로 한국 종목과 이어지는지 판정한다.
규칙:
1) 입력으로 받은 관계표 줄(edge_id)만 쓴다. 새 관계를 만들지 않는다.
2) '연결'은 제목 내용이 그 줄의 메커니즘·켜짐 조건(수요·설비투자·주문·가격·공급·정책)에 실제로 닿을 때만 고른다.
   예: 빅테크·클라우드의 데이터센터 투자·계약·전력 수요 → 전력기기·반도체 공급 줄. 메모리 가격·HBM 수요 → 메모리·장비 줄.
3) '무관': 과거 수익률 계산 기사('$1000 invested'), 내부자 매매, 목표주가 조정만 있는 기사, 소비자 제품·소프트웨어 업데이트, 인사·소송처럼 공급망 수요와 닿지 않는 기사, 일반 시황 해설.
4) quote는 제목에서 근거가 되는 구절을 글자 그대로(대소문자·기호 포함) 옮긴다.
5) path_ko는 한국어 한 줄, '미국 사건 → 매개(수요·투자 등) → 한국 종목(관계)' 꼴. 주가 방향 예측·매매 권유 표현을 쓰지 않는다.
6) strength: 제목이 그 회사의 설비투자·주문·가격을 직접 말하면 '직접 근거', 업황·수요 흐름을 말하면 '간접 추정'.
모든 기사에 하나씩 답한다."""
SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["judgments"],
    "properties": {"judgments": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["article_id", "verdict", "edge_ids", "quote", "path_ko", "strength"],
        "properties": {"article_id": {"type": "string"}, "verdict": {"type": "string", "enum": ["연결", "무관"]},
                       "edge_ids": {"type": "array", "items": {"type": "string"}}, "quote": {"type": "string"},
                       "path_ko": {"type": "string"}, "strength": {"type": "string", "enum": ["직접 근거", "간접 추정", "해당 없음"]}}}}},
}


def main() -> None:
    load_env()
    C = pd.read_csv(RUN / "candidates.csv", dtype=str)
    E = pd.read_csv(SOLO / "ref/relation_edges_v0.csv", dtype=str).fillna("").set_index("edge_id")
    out, log = [], []
    for T, g in C.groupby("T"):
        eids = sorted({x for v in g.edge_ids for x in v.split(";") if x})
        rows = [dict(edge_id=e, src=E.loc[e, "src_name"], kr=E.loc[e, "kr_name"], relation=E.loc[e, "relation_type"],
                     mechanism=E.loc[e, "mechanism"][:160], triggers=E.loc[e, "triggers"][:120]) for e in eids]
        arts = [dict(article_id=r.item_id, time=r.time, headline=r.headline, tickers=r.tickers, candidate_edges=r.edge_ids.split(";"))
                for r in g.itertuples()]
        for i in range(0, len(arts), 40):
            chunk = arts[i:i + 40]
            res = complete_json("us_link_judge", VERSION, SYSTEM, {"night": T, "relation_rows": rows, "articles": chunk}, SCHEMA,
                                model=SMALL_MODEL, max_tokens=12000)
            log.append(dict(T=T, n=len(chunk), source=res.get("source"), error=res.get("error"), usage=res.get("usage")))
            if res.get("result") is None:
                for a in chunk:
                    out.append(dict(T=T, item_id=a["article_id"], time=a["time"], headline=a["headline"], verdict="판정 실패", check=res.get("error")))
                continue
            by = {j["article_id"]: j for j in res["result"]["judgments"]}
            for a in chunk:
                j = by.get(a["article_id"])
                if j is None:
                    out.append(dict(T=T, item_id=a["article_id"], time=a["time"], headline=a["headline"], verdict="판정 없음", check="답 누락")); continue
                bad = []
                if j["verdict"] == "연결":
                    if not j["edge_ids"] or not set(j["edge_ids"]) <= set(a["candidate_edges"]):
                        bad.append("관계표 줄이 후보 밖")
                    if len(j["quote"]) < 3 or j["quote"] not in a["headline"]:
                        bad.append("근거 구절이 제목에 없음")
                    if FORBID.search(j["path_ko"]):
                        bad.append("금지어")
                krs = sorted({f'{E.loc[e, "kr_name"]}({E.loc[e, "relation_type"]})' for e in j["edge_ids"] if e in E.index})
                out.append(dict(T=T, item_id=a["article_id"], time=a["time"], headline=a["headline"], tickers=a["tickers"],
                                verdict=j["verdict"] if not bad else "검사 실패", ai_verdict=j["verdict"], edge_ids=";".join(j["edge_ids"]),
                                kr=", ".join(krs), quote=j["quote"], path_ko=j["path_ko"], strength=j["strength"], check="; ".join(bad) or "통과"))
        print(T, "후보", len(arts), flush=True)
    J = pd.DataFrame(out)
    J.to_csv(RUN / "judged.csv", index=False)
    (RUN / "judge_log.json").write_text(json.dumps(dict(version=VERSION, model=SMALL_MODEL, system=SYSTEM, calls=log), ensure_ascii=False, indent=1, default=str))
    print(J.verdict.value_counts().to_dict())


if __name__ == "__main__":
    main()
