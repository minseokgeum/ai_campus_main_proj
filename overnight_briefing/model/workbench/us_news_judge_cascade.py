"""간접 후보 두 단계 판정(OpenAI만): 1단계 gpt-5.4-mini가 전부 보고, '연결'이거나 검사 실패인 기사만 2단계 gpt-6.1-sol이 최종 판정.

근거(11/10 시범, 10/27·10/28 138건): mini는 Claude가 '연결'로 본 것을 2건만 놓쳤지만 과잉 연결 36건·검사 실패 13건,
sol은 일치 87.7%·검사 실패 0건. 그래서 mini는 거르는 데(놓침 적음), sol은 최종 판정에(정밀) 쓴다.
지시문·출력 형식·코드 검사(관계표 줄·근거 구절 원문·금지어)는 P8_v1 그대로. 같은 입력은 캐시.
실행: ~/4Digit-solo/.venv/bin/python workbench/us_news_judge_cascade.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from us_news_judge import FORBID, RUN, SOLO  # noqa: E402
from us_news_judge_openai import call  # noqa: E402

STAGE1, STAGE2 = "gpt-5.4-mini", "gpt-6.1-sol"


def run(model: str, C: pd.DataFrame, E: pd.DataFrame, usage: dict) -> dict:
    out = {}
    for T, g in C.groupby("T"):
        eids = sorted({x for v in g.edge_ids for x in v.split(";") if x})
        rel = [dict(edge_id=e, src=E.loc[e, "src_name"], kr=E.loc[e, "kr_name"], relation=E.loc[e, "relation_type"],
                    mechanism=E.loc[e, "mechanism"][:160], triggers=E.loc[e, "triggers"][:120]) for e in eids]
        arts = [dict(article_id=r.item_id, time=r.time, headline=r.headline, tickers=r.tickers, candidate_edges=r.edge_ids.split(";")) for r in g.itertuples()]
        for i in range(0, len(arts), 40):
            chunk = arts[i:i + 40]
            try:
                res = call(model, {"night": T, "relation_rows": rel, "articles": chunk})
            except Exception as ex:  # noqa: BLE001
                for a in chunk:
                    out[a["article_id"]] = dict(verdict="판정 실패", check=f"{type(ex).__name__}: {str(ex)[:120]}")
                continue
            u = usage.setdefault(model, dict(input_tokens=0, output_tokens=0, calls=0))
            u["input_tokens"] += res["usage"]["input_tokens"] or 0
            u["output_tokens"] += res["usage"]["output_tokens"] or 0
            u["calls"] += 1
            by = {j["article_id"]: j for j in res["result"]["judgments"]}
            for a in chunk:
                j = by.get(a["article_id"])
                if j is None:
                    out[a["article_id"]] = dict(verdict="판정 없음", check="답 누락"); continue
                bad = []
                if j["verdict"] == "연결":
                    if not j["edge_ids"] or not set(j["edge_ids"]) <= set(a["candidate_edges"]):
                        bad.append("관계표 줄이 후보 밖")
                    if len(j["quote"]) < 3 or j["quote"] not in a["headline"]:
                        bad.append("근거 구절이 제목에 없음")
                    if FORBID.search(j["path_ko"]):
                        bad.append("금지어")
                krs = sorted({f'{E.loc[e, "kr_name"]}({E.loc[e, "relation_type"]})' for e in j["edge_ids"] if e in E.index})
                out[a["article_id"]] = dict(verdict=j["verdict"] if not bad else "검사 실패", ai_verdict=j["verdict"], edge_ids=";".join(j["edge_ids"]),
                                            kr=", ".join(krs), quote=j["quote"], path_ko=j["path_ko"], strength=j["strength"], check="; ".join(bad) or "통과")
        print(model, T, len(arts), flush=True)
    return out


def main() -> None:
    C = pd.read_csv(RUN / "candidates.csv", dtype=str)
    E = pd.read_csv(SOLO / "ref/relation_edges_v0.csv", dtype=str).fillna("").set_index("edge_id")
    usage: dict = {}
    s1 = run(STAGE1, C, E, usage)
    pick = [k for k, v in s1.items() if v.get("ai_verdict") == "연결" or v["verdict"] in ("검사 실패", "판정 없음", "판정 실패")]
    s2 = run(STAGE2, C[C.item_id.isin(pick)], E, usage)
    rows = []
    for r in C.itertuples():
        a, b = s1.get(r.item_id, {}), s2.get(r.item_id)
        final = b if b is not None else dict(verdict="무관", check="1단계 무관")
        rows.append(dict(T=r.T, item_id=r.item_id, time=r.time, headline=r.headline, tickers=r.tickers, src_ids=r.src_ids,
                         stage1=a.get("ai_verdict", a.get("verdict")), stage2_model=STAGE2 if b is not None else "",
                         **{k: final.get(k, "") for k in ("verdict", "edge_ids", "kr", "quote", "path_ko", "strength", "check")}))
    J = pd.DataFrame(rows)
    J.to_csv(RUN / "judged_openai.csv", index=False)
    summ = dict(stage1=STAGE1, stage2=STAGE2, n=len(J), to_stage2=len(pick), final=J.verdict.value_counts().to_dict(),
                by_night=J[J.verdict == "연결"].groupby("T").size().to_dict(), usage=usage)
    (RUN / "judged_openai_summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1))
    print(json.dumps(summ, ensure_ascii=False))


if __name__ == "__main__":
    main()
