"""미국 뉴스 연결을 (아침 T, 국내 종목) 단위로 모은다 → 앱이 읽는 파일. 규칙 확인 연결(links.csv, 방향 없음)과 AI 판정 연결(judged_openai + 방향)을 함께.
실행: ~/4Digit/.venv/bin/python workbench/us_news_by_stock.py
"""
from pathlib import Path
import pandas as pd

W = Path(__file__).parent
RUN = W / "runs/claude_uslink_r1"
E = pd.read_csv(Path.home() / "4Digit-solo/ref/relation_edges_v0.csv", dtype=str).fillna("").set_index("edge_id")
J = pd.read_csv(RUN / "judged_openai.csv", dtype=str)
S = pd.read_csv(RUN / "us_news_sign.csv", dtype=str)
J = J[J.verdict == "연결"].merge(S, on="item_id", how="left")
rows = []
for r in J.itertuples():
    for e in str(r.edge_ids).split(";"):
        if e in E.index:
            rows.append(dict(T=r.T, kr_code=E.loc[e, "kr_code"], kr_name=E.loc[e, "kr_name"], us=E.loc[e, "src_name"], relation=E.loc[e, "relation_type"],
                             tier="AI 판정(간접)", time=r.time, headline=r.headline, path=r.path_ko, effect=r.effect if isinstance(r.effect, str) else "",
                             strength=r.strength, why=r.quote))
L = pd.read_csv(RUN / "links.csv", dtype=str)
for r in L[L.tier == "확인"].itertuples():
    first = str(r.headlines).split(" | ")[0]
    rows.append(dict(T=r.T, kr_code=r.kr_code, kr_name=r.kr_name, us=r.src_name, relation=r.relation_type, tier="규칙 확인",
                     time=first[:11], headline=first[12:], path=f"{r.src_name} → {r.kr_name}({r.relation_type})", effect="",
                     strength=f"기사 {r.n_articles}건", why=r.reasons))
A = pd.DataFrame(rows).drop_duplicates(["T", "kr_code", "headline"])
A.to_csv(RUN / "us_news_by_stock.csv", index=False)
print(len(A), A.tier.value_counts().to_dict())
