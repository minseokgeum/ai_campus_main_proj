"""관계표: 종목이 무엇과 이어져 있는지(사업·지주 자회사·가격 동조·미국 관계·업종 사이 관계)와 그 근거, 최근 밤 이어진 미국 뉴스."""
from __future__ import annotations

import html
import math

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from core import data, ui

T, acct_name = st.session_state["T"], st.session_state["account"]
st.markdown(ui.brand(f"{data.day_label(T)} 기준 · {acct_name}"), unsafe_allow_html=True)
st.subheader("관계표 · 이 종목은 무엇과 이어져 있나")

g, e105, seg = data.graph(), data.e105(), data.segment_table()
if g is None or seg is None:
    st.info("관계표 파일이 아직 없어요(workbench/graph_v0.py를 먼저 실행).")
    st.stop()
nodes, edges = g
summ, NE, DE = e105 if e105 else ({}, pd.DataFrame(), pd.DataFrame())

st.caption("근거가 있는 연결만 담았어요. 사업 = 사업보고서(DART) 사업 내용, 지주 자회사 = 지주사의 주요 자회사 업종, "
           "가격 동조 = 2024-12부터 2025-10까지 코스피200 몫을 뺀 뒤 함께 움직인 업종, 미국 관계 = 사람이 근거와 함께 적은 관계표 v0, "
           "업종 사이 관계 = 설계 기간(2024-12부터 2025-10)에서 찾고 처음 보는 기간(2025-11부터 2026-10)에서 다시 확인한 것이에요. "
           "관계가 있다는 것이 주가가 따라 움직인다는 예측은 아니에요.")

kc = edges.kind.value_counts()
ne = summ.get("node_edges", {})
c = st.columns(5)
c[0].metric("종목", f"{(nodes.kind == '종목').sum()}")
c[1].metric("세부 업종", f"{(nodes.kind == '세부 업종').sum()}")
c[2].metric("미국 쪽", f"{(nodes.kind == '미국 실체').sum()}")
c[3].metric("연결(간선)", f"{len(edges)}")
c[4].metric("업종 사이 관계 다시 확인", f"{ne.get('valid_pass', 0)}개", help=f"같이 움직임 {ne.get('valid_pass', 0) - ne.get('negative_confirmed', 0)} · 반대 {ne.get('negative_confirmed', 0)}")

# ---- 종목 고르기(기본: 지금 계좌 첫 종목) ----
acct = next(a for a in data.day(T)["card_0811"]["accounts"] if a["name"] == acct_name)
held = [h["code"] for h in acct["holdings"]]
names = seg.set_index("code").name.to_dict()
order = held + sorted((c for c in names if c not in held), key=lambda c: names[c])
code = st.selectbox("종목", order, index=0, format_func=lambda c: f"{names.get(c, c)} ({c})" + (" · 내 계좌" if c in held else ""))
me = seg.set_index("code").loc[code]
kr = f"KR:{code}"
mine = edges[(edges.src == kr) | (edges.dst == kr)]


def clean(x: str) -> str:
    return str(x).removesuffix(".0")


# ---- 그림: 이 종목 주변 한 바퀴(오른쪽 = 업종, 왼쪽 = 미국 쪽, 위아래 = 업종 사이 관계) ----
COL = {"사업": "#1d2b4f", "지주 자회사": "#8a6bd1", "가격 동조": "#12a594", "미국 관계(+)": "#d9822b", "미국 관계(−)": "#d9822b",
       "같은 업종": "#c3c9d4", "업종 사이(같이)": "#9aa3b2", "업종 사이(반대)": "#5b6472"}
DASH = {"미국 관계(−)", "업종 사이(반대)"}
pos, lab, hov, kind_of = {kr: (0.0, 0.0)}, {kr: names.get(code, code)}, {kr: f"{names.get(code, code)} ({code})<br>세부 업종 {me.final} · 상위 {me.final_parent}"}, {kr: "me"}
lines: list[tuple[str, str, str, str]] = []   # (a, b, 종류, 설명)


def spread(n: int, center: float, width: float) -> list[float]:
    """n개를 center(도) 둘레 width(도) 안에 고르게. 라디안으로 돌려준다."""
    if n == 1:
        return [math.radians(center)]
    return [math.radians(center - width / 2 + width * i / (n - 1)) for i in range(n)]


segs = mine[mine.kind.isin(["사업", "지주 자회사", "가격 동조"])]
us = mine[mine.kind == "미국 관계"]
nm_all = nodes.set_index("id").name.to_dict()
seg_ids, us_ids = list(dict.fromkeys(segs.dst)), list(dict.fromkeys(us.src))
for i, (n, ang) in enumerate(zip(seg_ids, spread(len(seg_ids), 0, min(100, 30 * len(seg_ids))))):
    pos[n], lab[n], kind_of[n] = (1.3 * math.cos(ang), 1.3 * math.sin(ang)), n.split(":", 1)[1], "seg"
for i, (n, ang) in enumerate(zip(us_ids, spread(len(us_ids), 180, min(150, 26 * len(us_ids))))):
    r = 1.35 if i % 2 == 0 else 1.95   # 이름표가 겹치지 않게 두 줄로 엇갈림
    pos[n], lab[n], kind_of[n] = (r * math.cos(ang), r * math.sin(ang)), nm_all.get(n, n), "us"
for (a, b), grp in mine[mine.kind.isin(["사업", "지주 자회사", "가격 동조", "미국 관계"])].groupby(["src", "dst"]):
    ks = list(dict.fromkeys(grp.kind))
    k = next(x for x in ["사업", "지주 자회사", "가격 동조", "미국 관계"] if x in ks)
    if k == "미국 관계":
        k = "미국 관계(−)" if (grp.sign == "−").any() else "미국 관계(+)"
    tip = "<br>".join(f"{r.kind}{(' ' + r.sign) if r.kind == '미국 관계' else ''}: {html.escape(str(r.evidence)[:70])}" for r in grp.head(3).itertuples())
    lines.append((a, b, k, tip))
    o = a if b == kr else b
    hov[o] = f"{lab[o]}<br>{' · '.join(ks)}"

main_seg = f"SEG:{me.final}"
if main_seg in pos:   # 같은 세부 업종 다른 종목(최대 8): 맨 오른쪽 세로 줄
    peers = seg[(seg.final == me.final) & (seg.code != code)].head(8)
    for j, r in enumerate(peers.itertuples()):
        n = f"KR:{r.code}"
        y = 0.0 if len(peers) == 1 else 1.9 - 3.8 * j / (len(peers) - 1)
        pos[n], lab[n], kind_of[n] = (3.0, y), r.name, "peer"
        hov[n] = f"{r.name} ({r.code})<br>같은 세부 업종 {me.final}"
        lines.append((main_seg, n, "같은 업종", f"같은 세부 업종: {me.final}"))

rel = pd.DataFrame()
if len(NE):
    rel = NE[NE.design_pass & ((NE.node_a == me.node) | (NE.node_b == me.node))].copy()
    rel["other"] = rel.node_b.where(rel.node_a == me.node, rel.node_a)
    rel = rel.reindex(rel.pcor_design.abs().sort_values(ascending=False).index)
    anchor = main_seg if me.node == me.final and main_seg in pos else kr
    if me.node != me.final:
        n = f"GRP:{me.node}"
        pos[n], lab[n], kind_of[n], hov[n] = (-0.2, -1.25), me.node, "seg", f"{me.node}(세부 업종이 1종목뿐이라 업종 사이 관계는 상위 묶음으로 봄)"
        lines.append((kr, n, "사업", "세부 업종이 1종목뿐이라 상위 묶음으로 봄"))
        anchor = n
    shown = rel[rel.valid_pass].head(6)
    top, bot = shown.iloc[::2], shown.iloc[1::2]
    for part, cy in ((top, 2.25), (bot, -2.25)):
        for j, r in enumerate(part.itertuples()):
            n = f"REL:{r.other}"
            x = 0.6 if len(part) == 1 else -0.4 + 2.0 * j / (len(part) - 1)
            pos[n], lab[n], kind_of[n] = (x, cy), r.other, "rel"
            neg = r.pcor_design < 0
            hov[n] = f"{r.other}<br>{'반대로' if neg else '같이'} 움직임 · 설계 {r.pcor_design:+.2f} · 처음 보는 기간 {r.pcor_valid:+.2f}"
            lines.append((anchor, n, "업종 사이(반대)" if neg else "업종 사이(같이)", hov[n]))

fig = go.Figure()
for k in COL:
    seg_lines = [l for l in lines if l[2] == k]
    if not seg_lines:
        continue
    xs, ys = [], []
    for a, b, *_ in seg_lines:
        xs += [pos[a][0], pos[b][0], None]
        ys += [pos[a][1], pos[b][1], None]
    fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines", name=k, hoverinfo="skip",
                             line=dict(color=COL[k], width=1.2 if k == "같은 업종" else 2, dash="dash" if k in DASH else "solid")))
    fig.add_trace(go.Scatter(x=[(pos[a][0] + pos[b][0]) / 2 for a, b, *_ in seg_lines], y=[(pos[a][1] + pos[b][1]) / 2 for a, b, *_ in seg_lines],
                             mode="markers", marker=dict(size=14, color="rgba(0,0,0,0)"), showlegend=False,
                             hovertext=[f"<b>{k}</b><br>{t}" for *_, t in seg_lines], hoverinfo="text"))
STY = {"me": ("#f6d36b", 26, "#1b2333"), "seg": ("#ffffff", 16, "#1d2b4f"), "us": ("#ffffff", 16, "#d9822b"), "peer": ("#eef0f4", 11, "#9aa3b2"),
       "rel": ("#ffffff", 13, "#5b6472")}
for kk, (fill, size, edge) in STY.items():
    ids = [n for n in pos if kind_of[n] == kk]
    if not ids:
        continue
    fig.add_trace(go.Scatter(x=[pos[n][0] for n in ids], y=[pos[n][1] for n in ids], mode="markers+text", showlegend=False,
                             text=[lab[n] for n in ids], textposition="top center",
                             textfont=dict(size=12 if kk in ("me", "seg", "us") else 10, color="#1b2333"),
                             marker=dict(size=size, color=fill, line=dict(color=edge, width=2)),
                             hovertext=[hov.get(n, lab[n]) for n in ids], hoverinfo="text"))
fig.update_layout(height=560, margin=dict(l=8, r=8, t=8, b=8), plot_bgcolor="#ffffff", paper_bgcolor="#ffffff",
                  xaxis=dict(visible=False, range=[-2.9, 3.7]), yaxis=dict(visible=False, range=[-2.7, 2.7]),
                  legend=dict(orientation="h", y=-0.02, x=0, font=dict(size=11)), hoverlabel=dict(bgcolor="#ffffff"))
st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})
st.caption("가운데가 고른 종목이에요. 오른쪽은 업종(사업·지주 자회사·가격 동조)과 같은 세부 업종의 다른 종목(최대 8개), 왼쪽은 미국 쪽 관계, "
           "위아래는 처음 보는 기간에서 다시 확인된 업종 사이 관계(최대 6개)예요. 점선은 반대 쪽 관계예요. 선 가운데에 마우스를 올리면 근거가 보여요.")

# ---- 근거 표 ----
left, right = st.columns(2)
with left:
    st.markdown("#### 사업 · 지주 자회사 · 가격 동조")
    for r in segs.itertuples():
        st.markdown(f'<div class="card"><span class="chip">{html.escape(r.kind)}</span><b>{html.escape(r.dst.split(":", 1)[1])}</b>'
                    f'<div class="tiny" style="margin-top:4px">{html.escape(str(r.evidence)[:220])}</div>'
                    f'<div class="tiny" style="opacity:.75">출처: {html.escape(clean(r.source))} · 알려진 날 {html.escape(clean(r.known_since))}'
                    + (f" · {html.escape(r.note)}" if r.note else "") + '</div></div>', unsafe_allow_html=True)
    if str(me.agree) not in ("True", "1", "1.0") and pd.notna(me.price_label) and str(me.price_label) != me.final:
        st.caption(f"사업보고서 업종({me.final})과 가격이 가장 비슷하게 움직인 업종({me.price_label})이 달라요. 화면은 사업보고서 기준을 써요.")
with right:
    st.markdown("#### 미국 관계")
    if us.empty:
        st.caption("관계표 v0에 이 종목과 바로 이어진 미국 기업·정책 줄이 없어요. 밤사이 미국 기사는 업종 핵심어로만 이어져요.")
    for r in us.itertuples():
        st.markdown(f'<div class="card"><span class="chip">{"같은 쪽(+)" if r.sign == "+" else "반대 쪽(−)"}</span>'
                    f'<b>{html.escape(nodes.set_index("id").name.get(r.src, r.src))}</b> <span class="tiny">{html.escape(r.note)}</span>'
                    f'<div class="tiny" style="margin-top:4px">{html.escape(str(r.evidence)[:200])}</div>'
                    f'<div class="tiny" style="opacity:.8">켜지는 때: {html.escape(r.trigger_ko or "-")} · 기사에서 찾는 말: {html.escape(r.trigger or "-")}</div>'
                    f'<div class="tiny" style="opacity:.7">출처: {html.escape(r.source)} · 알려진 날 {html.escape(r.known_since)}</div></div>', unsafe_allow_html=True)

st.markdown(f"#### 업종 사이 관계 · {html.escape(me.node)}")
if rel.empty:
    st.caption("설계 기간에서 기준을 넘은 업종 사이 관계가 없어요.")
else:
    t = rel[["other", "pcor_design", "pcor_valid", "valid_pass"]].copy()
    t["방향"] = t.pcor_design.map(lambda v: "반대로" if v < 0 else "같이")
    t["처음 보는 기간"] = t.valid_pass.map({True: "다시 확인됨", False: "확인 안 됨"})
    st.dataframe(t.rename(columns={"other": "상대 업종", "pcor_design": "설계 기간 세기", "pcor_valid": "처음 보는 기간 세기"})[
        ["상대 업종", "방향", "설계 기간 세기", "처음 보는 기간 세기", "처음 보는 기간"]].round(3), hide_index=True, width="stretch")
    st.caption("세기 = 코스피200 몫과 다른 업종 영향을 함께 뺀 뒤 남는 관계(부분 상관). 0.1 아래는 약한 관계예요.")

# ---- 최근 밤 이 종목에 이어진 미국 뉴스 ----
un = data.us_news()
st.markdown("#### 최근 밤 이 종목에 이어진 미국 뉴스")
if un is None:
    st.caption("미국 뉴스 연결 파일이 없어요.")
else:
    q = un[(un.kr_code == code) & (un["T"] <= T)]
    nights = sorted(q["T"].unique(), reverse=True)[:5]
    q = q[q["T"].isin(nights)]
    if q.empty:
        st.caption("최근 날짜에 이 종목과 이어진 미국 뉴스가 없어요.")
    else:
        q = q.assign(아침=q["T"].map(data.short_label), 순서=(q.tier == data.SEG_TIER).astype(int)).sort_values(["T", "순서", "time"], ascending=[False, True, False])
        st.dataframe(q.drop_duplicates(["T", "headline"])[["아침", "tier", "effect", "time", "headline", "path"]].rename(columns={
            "tier": "연결", "effect": "방향", "time": "시각(KST)", "headline": "제목", "path": "경로"}), hide_index=True, width="stretch", height=300)
        st.caption(data.news_record_line(T))

# ---- 반대로 움직이는 관계 찾은 결과 ----
with st.expander("반대로 움직이는 관계는 어떻게 찾았고 무엇이 나왔나"):
    de = summ.get("driver_edges", {})
    st.markdown(
        f"- **방법**: 업종마다 날마다 평균 시가 수익률에서 코스피200 몫을 빼고, 업종끼리 부분 상관(다른 업종 영향을 함께 뺀 관계)을 그래픽 라쏘로 구했어요. "
        f"설계 기간 {summ.get('days_design', '?')}일에서 찾은 관계가 기간 절반씩 나눠도 같은 방향이고, 처음 보는 기간 {summ.get('days_valid', '?')}일에서도 같은 방향으로 남아야 '다시 확인됨'이에요. "
        f"유가·금리·달러 같은 미국 시장 변수 {len(summ.get('drivers_kept', []))}개와 업종 사이도 같은 절차로 봤어요(여러 번 검정 보정).\n"
        f"- **업종 사이**: 0이 아닌 관계 {ne.get('nonzero', 0)}개 → 설계 기간 통과 {ne.get('design_pass', 0)}개 → 처음 보는 기간 다시 확인 {ne.get('valid_pass', 0)}개. "
        f"그중 반대 방향은 {ne.get('negative_confirmed', 0)}개뿐이에요.\n"
        f"- **미국 시장 변수 → 업종**: {de.get('tested', 0)}쌍 검정 → 설계 기간 통과 {de.get('design_pass', 0)}개 → 처음 보는 기간 다시 확인 {de.get('valid_pass', 0)}개.\n"
        "- **뜻**: 정유와 건설처럼 흔히 말하는 반대 관계는 이 자료(시장 몫을 뺀 시가 기준)에서는 따로 남지 않았어요. 반대 관계는 대부분 유가 같은 공통 변수를 거쳐 생기고, "
        "그 변수의 영향도 처음 보는 기간에서는 다시 확인되지 않았어요. 그래서 관계표에는 확인된 것만 그리고, 나머지는 후보로도 넣지 않았어요.")
    if len(NE):
        neg = NE[NE.design_pass & (NE.pcor_design < 0)][["node_a", "node_b", "pcor_design", "pcor_valid", "valid_pass"]]
        st.dataframe(neg.rename(columns={"node_a": "업종 A", "node_b": "업종 B", "pcor_design": "설계 기간", "pcor_valid": "처음 보는 기간", "valid_pass": "다시 확인"}).round(3),
                     hide_index=True, width="stretch")

with st.expander(f"관계표 전체 연결 {len(edges)}개 보기"):
    k = st.multiselect("종류", list(kc.index), default=[x for x in kc.index if x != "소속"])
    show = edges[edges.kind.isin(k)].copy()
    nm = nodes.set_index("id").name.to_dict()
    show["출발"], show["도착"] = show.src.map(lambda x: nm.get(x, x)), show.dst.map(lambda x: nm.get(x, x))
    st.dataframe(show[["출발", "도착", "kind", "sign", "strength", "evidence", "source", "known_since"]].rename(columns={
        "kind": "종류", "sign": "부호", "strength": "세기", "evidence": "근거", "source": "출처", "known_since": "알려진 날"}), hide_index=True, width="stretch", height=380)
