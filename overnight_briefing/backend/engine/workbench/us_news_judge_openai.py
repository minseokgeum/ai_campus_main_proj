"""간접 후보 판정(P8_v1)을 OpenAI 모델로 돌리고 Claude 판정(judged.csv)과 비교하는 시범.

같은 지시문(SYSTEM)·출력 형식(SCHEMA)·코드 검사(관계표 줄·근거 구절·금지어)를 그대로 쓴다(us_news_judge.py에서 가져옴).
같은 입력은 runs/claude_uslink_r1/openai_cache/에 저장해 다시 부르지 않는다. 키는 ~/4Digit-solo/.env OPENAI_API_KEY(출력 안 함).
실행: ~/4Digit-solo/.venv/bin/python workbench/us_news_judge_openai.py gpt-5.4-mini gpt-6.1-sol
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from us_news_judge import FORBID, RUN, SCHEMA, SOLO, SYSTEM, VERSION  # noqa: E402

sys.path.insert(0, str(SOLO))
from nightbrief.common import read_env  # noqa: E402
from openai import OpenAI  # noqa: E402

CACHE = RUN / "openai_cache"
CACHE.mkdir(exist_ok=True)
OUT = RUN / "pilot_openai"
OUT.mkdir(exist_ok=True)
client = OpenAI(api_key=read_env()["OPENAI_API_KEY"])


def call(model: str, payload: dict) -> dict:
    key = hashlib.sha256(json.dumps({"m": model, "v": VERSION, "p": payload}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
    path = CACHE / f"{model}_{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    t0 = time.time()
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        response_format={"type": "json_schema", "json_schema": {"name": "judgments", "schema": SCHEMA, "strict": True}},
    )
    out = dict(result=json.loads(resp.choices[0].message.content), model=resp.model, seconds=round(time.time() - t0, 1),
               usage=dict(input_tokens=resp.usage.prompt_tokens, output_tokens=resp.usage.completion_tokens,
                          reasoning_tokens=getattr(getattr(resp.usage, "completion_tokens_details", None), "reasoning_tokens", None)))
    path.write_text(json.dumps(out, ensure_ascii=False))
    return out


def judge(model: str) -> pd.DataFrame:
    C = pd.read_csv(RUN / "candidates.csv", dtype=str)
    E = pd.read_csv(SOLO / "ref/relation_edges_v0.csv", dtype=str).fillna("").set_index("edge_id")
    rows, usage = [], dict(input_tokens=0, output_tokens=0, reasoning_tokens=0, calls=0, seconds=0.0)
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
                rows += [dict(T=T, item_id=a["article_id"], headline=a["headline"], verdict="판정 실패", check=f"{type(ex).__name__}: {str(ex)[:120]}") for a in chunk]
                continue
            for k in ("input_tokens", "output_tokens"):
                usage[k] += res["usage"][k] or 0
            usage["reasoning_tokens"] += res["usage"].get("reasoning_tokens") or 0
            usage["calls"] += 1
            usage["seconds"] += res.get("seconds", 0)
            by = {j["article_id"]: j for j in res["result"]["judgments"]}
            for a in chunk:
                j = by.get(a["article_id"])
                if j is None:
                    rows.append(dict(T=T, item_id=a["article_id"], headline=a["headline"], verdict="판정 없음", check="답 누락")); continue
                bad = []
                if j["verdict"] == "연결":
                    if not j["edge_ids"] or not set(j["edge_ids"]) <= set(a["candidate_edges"]):
                        bad.append("관계표 줄이 후보 밖")
                    if len(j["quote"]) < 3 or j["quote"] not in a["headline"]:
                        bad.append("근거 구절이 제목에 없음")
                    if FORBID.search(j["path_ko"]):
                        bad.append("금지어")
                rows.append(dict(T=T, item_id=a["article_id"], headline=a["headline"], verdict=j["verdict"] if not bad else "검사 실패",
                                 ai_verdict=j["verdict"], edge_ids=";".join(j["edge_ids"]), quote=j["quote"], path_ko=j["path_ko"],
                                 strength=j["strength"], check="; ".join(bad) or "통과"))
    J = pd.DataFrame(rows)
    J.to_csv(OUT / f"{model}_judged.csv", index=False)
    return J, usage


def main() -> None:
    claude = pd.read_csv(RUN / "judged.csv", dtype=str).set_index("item_id")
    summ = {}
    for model in sys.argv[1:]:
        J, usage = judge(model)
        m = J.set_index("item_id").join(claude[["verdict"]].rename(columns={"verdict": "claude"}), how="inner")
        both = m[m.ai_verdict.isin(["연결", "무관"]) & m.claude.isin(["연결", "무관"])] if "ai_verdict" in m else m.iloc[0:0]
        agree = float((both.ai_verdict == both.claude).mean()) if len(both) else None
        summ[model] = dict(n=len(J), verdicts=J.verdict.value_counts().to_dict(), agree_with_claude=None if agree is None else round(agree * 100, 1),
                           claude_link_openai_none=int(((both.claude == "연결") & (both.ai_verdict == "무관")).sum()),
                           claude_none_openai_link=int(((both.claude == "무관") & (both.ai_verdict == "연결")).sum()),
                           check_fail=int((J.verdict == "검사 실패").sum()), usage=usage)
        print(model, json.dumps(summ[model], ensure_ascii=False), flush=True)
    (OUT / "pilot_summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
