"""밤사이 흐름: 야간선물 가격·거래량 위에 보도량과 주제별 최초 보도 시각을 겹쳐 본다."""
from __future__ import annotations

import html

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from core import data, ui

T = st.session_state["T"]
d = data.day(T)
card = d["card_0811"]
bars = data.night(T)
news = data.news(T)
us = None if (news and news.get("topics")) else data.news_us(T)   # 6/25식 사건 묶음이 없는 날은 미국 뉴스 연결(11/10 추가)

st.markdown(ui.brand(f"{data.day_label(T)} 아침 · 전날 밤 {data.short_label(card['D'])} 18:00 ~ 06:00"), unsafe_allow_html=True)
st.subheader("밤사이 흐름")

if bars is None:
    st.info("이 날의 야간선물 1분봉이 없어요. 과거 1분봉은 2025-10-16 밤부터 보관돼 있어요.")
    st.stop()

topics = news["topics"] if news else []
pick = None
if topics:
    labels = [f'{t["first_kst"][11:]} · {(t["text"] or {}).get("headline") or t["title"] or t["headline"]}' for t in topics[:8]]
    pick_label = st.pills("주제별 최초 보도 시각 (누르면 차트에 표시)", labels, selection_mode="single", key="night_topic")
    pick = topics[labels.index(pick_label)] if pick_label else None

three = bool(topics) or bool(us and us["counts"])
fig = make_subplots(rows=3 if three else 2, cols=1, shared_xaxes=True, vertical_spacing=0.04,
                    row_heights=[0.58, 0.2, 0.22] if three else [0.72, 0.28])
fig.add_trace(go.Scatter(x=bars.kst, y=bars.ret * 100, mode="lines", line=dict(color=ui.INK, width=1.6), name="야간선물",
                         hovertemplate="%{x|%H:%M}<br>전일 주간 종가 대비 %{y:+.2f}%<extra></extra>"), row=1, col=1)
fig.add_hline(y=0, line=dict(color="#9aa3b2", width=1, dash="dot"), row=1, col=1)
fig.add_trace(go.Bar(x=bars.kst, y=bars.volume, marker_color="#b9c2d0", name="거래량(계약)",
                     hovertemplate="%{x|%H:%M} 거래량 %{y:,}계약<extra></extra>"), row=2, col=1)

if topics:
    items = pd.DataFrame([dict(kst=pd.Timestamp(i["kst"]), headline=i["headline"], domain=i["domain"], topic=t["title"] or t["primary"])
                          for t in topics for i in t["items"]])
    items = items[(items.kst >= bars.kst.min()) & (items.kst <= bars.kst.max() + pd.Timedelta(hours=2))]
    if not items.empty:
        cnt = items.set_index("kst").resample("15min").headline.count()
        fig.add_trace(go.Bar(x=cnt.index, y=cnt.values, marker_color="#8fb0ea", name="보도량(15분)",
                             hovertemplate="%{x|%H:%M}부터 15분 기사 %{y}건<extra></extra>"), row=3, col=1)
    for t in topics[:8]:
        ts = pd.Timestamp(t["first_kst"])
        if not (bars.kst.min() <= ts <= bars.kst.max()):
            continue
        near = bars.iloc[(bars.kst - ts).abs().argmin()]
        sel = pick is not None and pick["event_id"] == t["event_id"]
        title = (t["text"] or {}).get("headline") or t["title"] or t["headline"]
        fig.add_trace(go.Scatter(
            x=[ts], y=[near.ret * 100], mode="markers+text" if sel else "markers",
            marker=dict(size=14 if sel else 10, color=ui.BAND if t["novelty"] == "새 소식" else "#c9d0db",
                        line=dict(color=ui.INK, width=1.5 if sel else 1), symbol="diamond"),
            text=[title[:24]] if sel else None, textposition="top center", showlegend=False,
            hovertemplate=f"<b>{html.escape(title)}</b><br>{t['novelty']} · 처음 보도 %{{x|%H:%M}}<br>기사 {t['cluster_size']}건<extra></extra>"),
            row=1, col=1)
        if sel:
            fig.add_vline(x=ts, line=dict(color=ui.BAND_EDGE, width=2), row="all", col=1)

if us:
    lo, hi = bars.kst.min(), bars.kst.max()
    cnt = pd.DataFrame(us["counts"])
    if len(cnt):
        cnt["kst"] = pd.to_datetime(cnt.kst)
        cnt = cnt[(cnt.kst >= lo - pd.Timedelta(minutes=15)) & (cnt.kst <= hi)]
        fig.add_trace(go.Bar(x=cnt.kst + pd.Timedelta(minutes=7.5), y=cnt.n, width=15 * 60 * 1000 * 0.9, marker_color="#8fb0ea",
                             name="미국 기사 수(15분)", hovertemplate="%{x|%H:%M} 앞뒤 15분 기사 %{y}건<extra></extra>"), row=3, col=1)
    for tier, color, name in (("규칙 확인", ui.BAND, "관계표 규칙으로 이어진 기사"), ("AI 판정(간접)", "#c9d0db", "AI 판정으로 이어진 기사")):
        L = [r for r in us["links"] if r["tier"] == tier and lo <= pd.Timestamp(r["kst"]) <= hi]
        if not L:
            continue
        xs = [pd.Timestamp(r["kst"]) for r in L]
        ys = [bars.iloc[(bars.kst - x).abs().argmin()].ret * 100 for x in xs]
        tips = [f"<b>{html.escape(r['headline'][:90])}</b><br>{html.escape(r['us'])} → {html.escape('·'.join(r['stocks'][:5]))}"
                f"{' 외' if len(r['stocks']) > 5 else ''}<br>{tier}" for r in L]
        fig.add_trace(go.Scatter(x=xs, y=ys, mode="markers", name=name, customdata=tips,
                                 marker=dict(size=10, color=color, symbol="diamond", line=dict(color=ui.INK, width=1)),
                                 hovertemplate="%{x|%H:%M} · %{customdata}<extra></extra>"), row=1, col=1)

for f in (news or {}).get("filings", []):
    ts = pd.Timestamp(f["kst"])
    if bars.kst.min() <= ts <= bars.kst.max():
        fig.add_vline(x=ts, line=dict(color=ui.UP, width=1.5), row="all", col=1)
        fig.add_annotation(x=ts, y=0.02, yref="y domain", text=f"{ts:%H:%M} {f['title']}", showarrow=False, xanchor="right",
                           font=dict(size=11, color=ui.UP), bgcolor="rgba(255,255,255,.85)", row=1, col=1)

w = news["window"] if news else None
if w:
    for key, label in (("us_open", "미국 정규장 개장"), ("us_close", "미국 정규장 마감")):
        ts = pd.Timestamp(w[key]).tz_convert("Asia/Seoul").tz_localize(None)
        if bars.kst.min() <= ts <= bars.kst.max():
            fig.add_vline(x=ts, line=dict(color="#9aa3b2", width=1, dash="dash"), row=1, col=1)
            fig.add_annotation(x=ts, y=1, yref="y domain", text=label, showarrow=False, font=dict(size=11, color=ui.SUB), yanchor="bottom", row=1, col=1)

fig.update_layout(height=620, margin=dict(l=10, r=10, t=30, b=10), plot_bgcolor="#fff", paper_bgcolor="#fff",
                  legend=dict(orientation="h", y=1.08, x=0), hovermode="x unified" if pick is None else "closest", bargap=0)
fig.update_yaxes(title_text="야간선물(%)", row=1, col=1, gridcolor="#eef0f4", ticksuffix="%")
fig.update_yaxes(title_text="거래량", row=2, col=1, gridcolor="#eef0f4")
if three:
    fig.update_yaxes(title_text="보도량", row=3, col=1, gridcolor="#eef0f4")
fig.update_xaxes(tickformat="%H:%M", gridcolor="#f3f4f7")
st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})

last = bars.iloc[-1]
c1, c2, c3 = st.columns(3)
ui.kpi(c1, "06:00 야간선물", f"{last.ret*100:+.2f}%", f"{last.price:,.2f} · 전일 주간 종가 {last.day_close:,.2f} 대비", ui.tone(last.ret))
ui.kpi(c2, "밤사이 거래량", f"{bars.volume.sum():,}계약", f"계약 코드 {last.contract}")
big = bars.loc[bars.volume.idxmax()]
ui.kpi(c3, "거래가 가장 몰린 1분", big.kst.strftime("%H:%M"), f"{int(big.volume):,}계약")

if pick:
    st.markdown(f"#### {(pick['text'] or {}).get('headline') or pick['title']}")
    pre = f" · 그중 발표 전 예고 기사 {pick['preview_count']}건" if pick.get("preview_count") else ""
    st.caption(f"처음 보도 {pick['first_kst'][11:]} · 기사 {pick['cluster_size']}건{pre} · 매체 {pick['publishers'] or '–'}곳. "
               "‘처음’은 우리가 수집하는 매체 안에서 처음 잡힌 시각이에요.")
    st.dataframe(pd.DataFrame([dict(시각=i["kst"][11:], 매체=i["domain"], 제목=i["headline"]) for i in pick["items"]]),
                 hide_index=True, width="stretch")
elif us:
    st.markdown("#### 이 밤 내 종목과 이어진 미국 기사")
    st.caption(f"뉴스 창(전날 15:30 ~ 당일 07:30) 미국 기사 {us['articles']:,}건 가운데, 관계표 규칙이나 AI 판정으로 국내 종목에 이어진 기사 "
               f"{len(us['links'])}건이에요. 차트 위 ◆는 18:00~06:00 사이에 나온 것만 찍혀요. 이어졌다는 건 사업 관계가 있다는 뜻이지, "
               "이 기사가 야간선물이나 시가를 움직였다는 뜻은 아니에요. " + data.news_record_line(T))
    if us["links"]:
        st.dataframe(pd.DataFrame([dict(시각=r["kst"][5:].replace("-", "/"),
                                        이어진종목="·".join(r["stocks"][:4]) + (f" 외 {len(r['stocks']) - 4}" if len(r["stocks"]) > 4 else ""),
                                        미국쪽=r["us"], 연결=r["tier"], 제목=r["headline"])
                                   for r in us["links"]]), hide_index=True, width="stretch")
elif not topics:
    st.caption("이 날짜는 미국 뉴스 연결 기록이 없어 보도 표식이 없어요.")
st.caption("야간선물: 한국투자증권 1분봉(봉 시작 시각 기준, 매일 아침 봉인 뒤 이어 받음), 그날 밤 거래가 가장 많은 계약. "
           "보도: 우리가 수집하는 매체의 기사 등록 시각" + (" (미국 기사는 알파카·벤징가)." if us else "."))
