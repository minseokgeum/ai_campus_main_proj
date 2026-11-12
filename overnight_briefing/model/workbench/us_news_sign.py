"""연결된 미국 뉴스(judged_openai.csv의 '연결')에 방향을 붙인다: 국내 연결 종목 쪽 수요·투자가 늘어나는 소식인지 줄어드는 소식인지.

주가 방향 예측이 아니라 기사 내용의 방향(수요 증가 쪽 / 수요 감소 쪽 / 불확실)이다. OpenAI gpt-6.1-sol, 구조화 출력,
근거 구절은 제목에 글자 그대로 있어야 하고(코드 검사), 금지어 검사도 한다. 같은 입력은 캐시.
실행: ~/4Digit-solo/.venv/bin/python workbench/us_news_sign.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from us_news_judge import FORBID, RUN  # noqa: E402
import us_news_judge_openai as oj  # noqa: E402

MODEL = "gpt-6.1-sol"
SYSTEM = """너는 미국 밤사이 뉴스 제목이, 이미 연결된 한국 종목 쪽(공급망·전방 수요)에 대해 '수요·투자가 늘어나는 쪽' 소식인지 '줄어드는 쪽' 소식인지만 판정한다.
- effect: '수요 증가 쪽'(투자 확대·주문·계약·실적/가이던스 상향 등), '수요 감소 쪽'(투자 축소·지연·취소·규제로 출하 제약·실적 하향 등), '불확실'(둘 다 아니거나 섞임).
- 주가가 오를지 내릴지 말하지 않는다. 매매 권유 표현 금지.
- quote: 판정 근거가 되는 제목 구절을 글자 그대로(대소문자·기호 포함), 3~120자.
- reason_ko: 한국어 한 줄(40자 안팎)."""
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["items"],
          "properties": {"items": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                                               "required": ["article_id", "effect", "quote", "reason_ko"],
                                                               "properties": {"article_id": {"type": "string"},
                                                                              "effect": {"type": "string", "enum": ["수요 증가 쪽", "수요 감소 쪽", "불확실"]},
                                                                              "quote": {"type": "string"}, "reason_ko": {"type": "string"}}}}}}


def main() -> None:
    J = pd.read_csv(RUN / "judged_openai.csv", dtype=str)
    L = J[J.verdict == "연결"]
    oj.SYSTEM_ORIG = oj.SYSTEM
    rows, usage = [], dict(input_tokens=0, output_tokens=0, calls=0)
    for T, g in L.groupby("T"):
        items = [dict(article_id=r.item_id, headline=r.headline, path=r.path_ko) for r in g.itertuples()]
        for i in range(0, len(items), 40):
            chunk = items[i:i + 40]
            # us_news_judge_openai.call은 P8 지시문을 쓰므로, 같은 캐시·클라이언트로 지시문만 바꿔 직접 부른다
            import hashlib
            payload = {"night": T, "items": chunk}
            key = hashlib.sha256(json.dumps({"m": MODEL, "v": "SIGN_v1", "p": payload}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:24]
            path = oj.CACHE / f"sign_{MODEL}_{key}.json"
            if path.exists():
                res = json.loads(path.read_text())
            else:
                resp = oj.client.chat.completions.create(model=MODEL, messages=[{"role": "system", "content": SYSTEM},
                                                                                 {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                                                         response_format={"type": "json_schema", "json_schema": {"name": "signs", "schema": SCHEMA, "strict": True}})
                res = dict(result=json.loads(resp.choices[0].message.content),
                           usage=dict(input_tokens=resp.usage.prompt_tokens, output_tokens=resp.usage.completion_tokens))
                path.write_text(json.dumps(res, ensure_ascii=False))
                usage["input_tokens"] += res["usage"]["input_tokens"]; usage["output_tokens"] += res["usage"]["output_tokens"]; usage["calls"] += 1
            by = {x["article_id"]: x for x in res["result"]["items"]}
            for it in chunk:
                x = by.get(it["article_id"])
                if x is None:
                    rows.append(dict(item_id=it["article_id"], effect="", sign_check="답 누락")); continue
                bad = []
                if len(x["quote"]) < 3 or x["quote"] not in it["headline"]:
                    bad.append("근거 구절이 제목에 없음")
                if FORBID.search(x["reason_ko"]):
                    bad.append("금지어")
                rows.append(dict(item_id=it["article_id"], effect=x["effect"] if not bad else "불확실", sign_quote=x["quote"],
                                 sign_reason=x["reason_ko"], sign_check="; ".join(bad) or "통과"))
        print(T, len(items), flush=True)
    S = pd.DataFrame(rows)
    S.to_csv(RUN / "us_news_sign.csv", index=False)
    print(S.effect.value_counts().to_dict(), S.sign_check.value_counts().to_dict(), usage)


if __name__ == "__main__":
    main()
