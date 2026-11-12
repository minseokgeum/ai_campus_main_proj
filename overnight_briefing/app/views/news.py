"""새 소식: 주제별 묶음, 최초·후속 보도 시각, 내 종목과의 연결 근거, 시장 반응, AI 요약."""
from __future__ import annotations

import html

import pandas as pd
import streamlit as st

from core import data, ui

T, acct_name = st.session_state["T"], st.session_state["account"]
news = data.news(T)
st.markdown(ui.brand(f"{data.day_label(T)} 아침 · {acct_name}"), unsafe_allow_html=True)
st.subheader("밤사이 새 소식")

if not news:
    un, mac = data.us_news(), data.us_macro()
    have = un is not None and (un["T"] == T).any()
    if not have:
        st.info("이 날짜는 미국 뉴스 연결 전이에요. 6월 25일(마이크론 실적 밤)과 10/27 이후 날짜에서 볼 수 있어요.")
        st.stop()
    acct = next(a for a in data.day(T)["card_0811"]["accounts"] if a["name"] == acct_name)
    codes = {h["code"] for h in acct["holdings"]}
    allq = un[un["T"] == T]
    q = allq[allq.tier != data.SEG_TIER]
    seg_mine = allq[(allq.tier == data.SEG_TIER) & allq.kr_code.isin(codes)]
    mine = q[q.kr_code.isin(codes)]
    st.caption(data.US_NOTE)
    st.markdown(f'<div class="notice info">{html.escape(data.news_record_line(T))}</div>', unsafe_allow_html=True)
    st.markdown(f"#### 내 계좌와 이어진 미국 뉴스 · {len(mine.drop_duplicates('headline'))}건")
    if mine.empty:
        st.caption("이 계좌 종목과 관계표로 이어진 미국 뉴스는 없었어요(관계표에 이 종목 줄이 없을 수도 있어요).")
    for h, g in mine.sort_values("time", ascending=False).groupby("headline", sort=False):
        r = g.iloc[0]
        tag = f'<span class="chip">{html.escape(r.tier)}</span>' + (f'<span class="chip">{html.escape(r.effect)}</span>' if r.effect else "")
        st.markdown(f'<div class="card">{tag}<span class="time">{html.escape(r.time)}</span>'
                    f'<div style="font-weight:650;margin:4px 0">{html.escape(h)}</div>'
                    f'<div class="tiny">경로: {html.escape(r.path)}</div>'
                    f'<div class="tiny">내 종목: {html.escape(", ".join(sorted(set(g.kr_name))))}</div></div>', unsafe_allow_html=True)
    if len(seg_mine):
        st.markdown(f"#### 내 종목 업종 관련 미국 기사 · 핵심어(판정 전)")
        for (seg_name, h), g in seg_mine.sort_values("time", ascending=False).groupby(["relation", "headline"], sort=False):
            st.markdown(f'<div class="card" style="opacity:.92"><span class="chip">{html.escape(seg_name)}</span><span class="time">{html.escape(g.iloc[0].time)}</span>'
                        f'<div style="font-weight:600;margin:4px 0">{html.escape(h)}</div>'
                        f'<div class="tiny">걸린 단어: {html.escape(g.iloc[0].why)} · 내 종목: {html.escape(", ".join(sorted(set(g.kr_name))))}</div></div>', unsafe_allow_html=True)
    with st.expander(f"이 밤 관계표로 이어진 미국 뉴스 전체 · {q.headline.nunique()}건"):
        st.dataframe(q.drop_duplicates("headline").sort_values("time")[["time", "tier", "effect", "us", "headline", "path"]].rename(columns={
            "time": "시각(KST)", "tier": "연결", "effect": "방향", "us": "미국 쪽", "headline": "제목", "path": "경로"}), hide_index=True, width="stretch")
    if mac is not None and (mac["T"] == T).any():
        with st.expander("시장 전체(물가·연준·금리·선거·관세 등) 기사"):
            st.dataframe(mac[mac["T"] == T][["time", "headline"]].rename(columns={"time": "시각(KST)", "headline": "제목"}), hide_index=True, width="stretch")
    st.stop()

acct_id = "demo_" + acct_name[0]
linked = {}
for l in news["links"]:
    if l["account_id"] == acct_id:
        linked.setdefault(l["event_id"], []).append(l)
only_mine = st.toggle("내 계좌와 연결된 소식만", value=True)
topics = [t for t in news["topics"] if not only_mine or t["event_id"] in linked]
st.caption(f"기사 {sum(t['cluster_size'] for t in news['topics'])}건을 주제 {len(news['topics'])}개로 묶었어요. "
           "주제는 기사 수와 내 계좌 연결 정도로 정렬해요. ‘처음 보도’는 우리가 수집하는 매체 안에서 처음 잡힌 시각이에요.")

names = {}
card = data.day(T)["card_0811"]
for s in card["stocks"]:
    names[s["code"]] = s["name"]

for t in topics[:12]:
    text = t["text"] or {}
    title = text.get("headline") or t["title"] or t["headline"]
    novelty = "new" if t["novelty"] == "새 소식" else "follow"
    with st.container(border=True):
        st.markdown(f'<span class="chip {novelty}">{t["novelty"]}</span><span class="chip">{t["sub_type"]}</span>'
                    f'<span class="time">처음 보도 {t["first_kst"][5:].replace("-", "/")} · 기사 {t["cluster_size"]}건'
                    f'{" (발표 전 예고 " + str(t["preview_count"]) + "건 포함)" if t.get("preview_count") else ""}'
                    f'{" · 매체 " + str(t["publishers"]) + "곳" if t["publishers"] else ""}</span>'
                    f'<div style="font-size:17px;font-weight:650;margin:6px 0 2px">{html.escape(title)}</div>'
                    f'<div class="tiny">{html.escape(t["headline"] or "")}</div>', unsafe_allow_html=True)
        if t["novelty"] != "새 소식" and t.get("novelty_reason"):
            st.caption(f"후속인 이유: {t['novelty_reason']}" + (f" (처음 알려진 때 {t['prior_first_kst']})" if t.get("prior_first_kst") else ""))

        if t["event_id"] in linked:
            mine = sorted({names.get(l["kr_code"], l["kr_code"]) + f" ({l['relation_type']}, {l['confidence']})" for l in linked[t["event_id"]]})
            st.markdown(f'<div class="notice info"><b>내 종목과 연결</b> · {" · ".join(html.escape(m) for m in mine)}</div>', unsafe_allow_html=True)

        if text:
            st.markdown(
                "".join(f'<p style="margin:4px 0;font-size:14px;line-height:1.65"><b>{k}</b> {html.escape(text[f])}</p>'
                        for k, f in (("무슨 일", "fact"), ("시장 반응", "reaction"), ("내 계좌와의 길", "path"), ("아직 모르는 것", "unknown"))
                        if text.get(f))
                + f'<div class="tiny">AI 작성({t["text_source"]}) · 입력 숫자만 사용·금지어 없음·출처 있음 검사 통과</div>', unsafe_allow_html=True)

        tabs = st.tabs(["보도 흐름", "연결 근거", "핵심 숫자", "시장 반응", "장 전 확인"])
        with tabs[0]:
            if t["items"]:
                first, rest = t["items"][0], t["items"][1:]
                st.markdown(f"**처음** {first['kst'][11:]} · {first['domain']} — {first['headline']}")
                if rest:
                    st.dataframe(pd.DataFrame([dict(시각=i["kst"][5:].replace("-", "/"), 매체=i["domain"], 제목=i["headline"]) for i in rest]),
                                 hide_index=True, width="stretch", height=min(36 * (len(rest) + 1), 260))
            else:
                st.caption("기사별 시각이 없어요.")
        with tabs[1]:
            if t["paths"]:
                for p in t["paths"]:
                    st.markdown(f"**{p['src_name']} → {p['kr_name']}** · {p['relation']} · {p['direction']} · 확인 정도 {p['confidence']}")
                    st.caption(p["mechanism"])
                    if p.get("evidence_url"):
                        st.markdown(f"근거: [{p.get('evidence_title') or p['evidence_url']}]({p['evidence_url']})")
            else:
                st.caption("관계표에 이 주제와 연결된 줄이 없어요.")
        with tabs[2]:
            if t["key_fields"]:
                st.dataframe(pd.DataFrame([dict(항목=f["name"], 값=f["value"], 단위=f["unit"], 기간=f["period"], 원문=f["quote"]) for f in t["key_fields"]]),
                             hide_index=True, width="stretch")
                for s in t["sources"][:3]:
                    st.markdown(f"- [{s['title']}]({s['url']})")
            else:
                st.caption("숫자를 뽑지 않은 주제예요.")
        with tabs[3]:
            if t["reactions"]:
                st.dataframe(pd.DataFrame([dict(자산=r["asset_id"], 구간=r["segment"], 변화=ui.pct(r["change"]) if r["unit"] == "%" else f'{r["change"]:+.2f}{r["unit"]}',
                                                시작=pd.Timestamp(r["from_utc"]).tz_convert("Asia/Seoul").strftime("%H:%M"),
                                                끝=pd.Timestamp(r["to_utc"]).tz_convert("Asia/Seoul").strftime("%H:%M")) for r in t["reactions"]]),
                             hide_index=True, width="stretch")
                st.caption("같은 시간대에 관측된 움직임이에요. 이 소식 때문에 움직였다고 단정하지 않아요.")
            else:
                st.caption("반응을 계산하지 않은 주제예요.")
        with tabs[4]:
            for c in t["to_check"]:
                st.markdown(f"- {c}")
            if not t["to_check"]:
                st.caption("따로 확인할 항목이 없어요.")

if news.get("filings"):
    st.caption("공시 접수: " + " · ".join(f"{f['kst'][5:].replace('-', '/')} {f['title']}" for f in news["filings"]))
st.caption(f"자료: {news['source']}. 기사 원문은 저장하지 않고 제목·링크·시각만 써요.")
