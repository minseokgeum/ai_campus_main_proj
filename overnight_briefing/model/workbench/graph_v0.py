"""그래프 v0(노드·간선 CSV). 간선마다 종류·근거·출처·알려진 날을 남긴다.

노드: 종목(200), 세부 업종(43), 상위 묶음(14+지주), 미국 쪽 실체(관계표 src).
간선 종류
  사업        종목 → 세부 업종      근거: 사업보고서 인용(P9_v1), 알려진 날 = 보고서 접수일
  지주 자회사  종목 → 세부 업종      근거: 사업보고서(지주의 주요 자회사 업종)
  가격 동조    종목 → 세부 업종      근거: 설계 기간 2024-12~2025-10 잔차 상관(segment_price_check), 알려진 날 = 2025-10-31
  소속        세부 업종 → 상위 묶음
  미국 관계    미국 실체 → 종목      근거: 관계표 v0(사람·연구소), 별칭(alias)과 켜짐 조건(trigger)을 다른 칸으로 나눔
실행: ~/4Digit/.venv/bin/python workbench/graph_v0.py
"""
import json
import re
from pathlib import Path

import pandas as pd

W = Path(__file__).parent
OUT = W / "runs/claude_graph_v0"
OUT.mkdir(parents=True, exist_ok=True)
seg = json.load(open(W / "runs/claude_segments_r1/meta.json"))["segments"]
S = pd.read_csv(W / "runs/claude_segments_r1/segments.csv", dtype={"code": str})
F = pd.read_csv(W / "runs/claude_segments_r1/segments_final.csv", dtype={"code": str})
E = pd.read_csv(Path.home() / "4Digit-solo/ref/relation_edges_v0.csv", dtype=str).fillna("")
NAME_ONLY = re.compile(r"^(nvidia|amd|micron|tsmc|intel|apple|amazon|google|alphabet|broadcom|qualcomm|lam research|sk hynix|samsung|samsung electronics)$", re.I)

nodes = [dict(id=f"KR:{r.code}", kind="종목", name=r.name) for r in S.itertuples()]
nodes += [dict(id=f"SEG:{s}", kind="세부 업종", name=s) for s in seg]
nodes += [dict(id=f"GRP:{g}", kind="상위 묶음", name=g) for g in sorted(set(seg.values()))]
nodes += [dict(id=f"US:{s}", kind="미국 실체", name=n) for s, n in E[["src_id", "src_name"]].drop_duplicates("src_id").values]

edges = []
fin = F.set_index("code")
for r in S.itertuples():
    if r.status != "통과":
        continue
    rep = dict(evidence=str(r.quote)[:200], source=f"DART 사업보고서 {r.rcept_no}", known_since=str(r.report_date))
    final = fin.final.get(r.code, r.segment)
    edges.append(dict(src=f"KR:{r.code}", dst=f"SEG:{final}", kind="사업", sign="+", strength=r.confidence, **rep,
                      note=fin.agree.get(r.code, "")))
    if str(r.holding) == "True":
        for h in str(r.holding_main).split(";"):
            if h and h != "nan":
                edges.append(dict(src=f"KR:{r.code}", dst=f"SEG:{h}", kind="지주 자회사", sign="+", strength="", **rep, note=""))
for r in F.itertuples():
    if isinstance(r.price_label, str):
        edges.append(dict(src=f"KR:{r.code}", dst=f"SEG:{r.price_label}", kind="가격 동조", sign="+", strength=r.price_corr,
                          evidence=f"잔차 상관 {r.price_corr} (다음 {r.second})", source="universe_daily 2024-12~2025-10, 코스피200 민감도 제거",
                          known_since="2025-10-31", note=r.agree))
for s, g in seg.items():
    edges.append(dict(src=f"SEG:{s}", dst=f"GRP:{g}", kind="소속", sign="+", strength="", evidence="", source="E105 세부 업종표(11/10 고정)", known_since="", note=""))
for r in E.itertuples():
    terms = [t.strip() for t in r.search_terms_en.split(";") if t.strip()]
    edges.append(dict(src=f"US:{r.src_id}", dst=f"KR:{r.kr_code}", kind="미국 관계", sign="−" if "반대" in r.direction else "+",
                      strength=r.confidence, evidence=r.mechanism[:200], source=f"관계표 v0 {r.edge_id} · {r.evidence_title[:80]}",
                      known_since=r.known_since, note=r.relation_type,
                      alias="; ".join(t for t in terms if NAME_ONLY.match(t)), trigger="; ".join(t for t in terms if not NAME_ONLY.match(t)),
                      trigger_ko=r.triggers))
N, G = pd.DataFrame(nodes), pd.DataFrame(edges)
N.to_csv(OUT / "nodes.csv", index=False)
G.to_csv(OUT / "edges.csv", index=False)
print("노드", len(N), N.kind.value_counts().to_dict())
print("간선", len(G), G.kind.value_counts().to_dict())
print("반대(−) 간선", int((G.sign == "−").sum()))
