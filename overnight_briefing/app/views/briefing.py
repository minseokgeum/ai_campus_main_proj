"""고객 화면: 아침 브리핑(증권사 앱 안 모듈을 휴대폰 폭으로 재현)."""
from __future__ import annotations

import html

import streamlit as st

from core import data, ui

# 카드 주의 문구를 사용자 말투로 바꾼 것. 숫자는 카드 detail(E64·E67)과 같은 출처다.
DAY_CAUTION = {
    "mon": ("월요일 아침이에요", "주말 동안 쌓인 소식이 한꺼번에 반영돼서, 과거 월요일엔 시가가 예상 범위를 벗어난 날이 "
            "더 많았어요. 다른 요일은 10번 중 2번, 월요일은 10번 중 2.6번꼴이에요."),
}
NXT_OUT = ("08:10 장전 거래가 이미 예상 범위 {side}에 있어요. 지난 1년 이런 종목은 범위 안에서 열린 경우가 10번 중 3번 남짓이었어요"
           "(시가도 장전 거래 쪽으로 벗어난 경우가 10번 중 6~7번). 확인 중인 경고예요.")
STOCK_CAUTION = {
    "e_earn": "어제 실적 공시가 나온 종목이에요. 공시 다음 날 아침엔 시가가 예상 범위를 벗어난 경우가 절반 정도였어요(평소엔 10번 중 2번).",
}


def _state() -> tuple[str, str, str, bool]:
    s = st.session_state
    slot = s.get("slot") or "0811"
    return s["T"], slot, s["account"], slot == "0900"


def _qty_key(T: str, acct: str, code: str) -> str:
    return f"qty::{T}::{acct}::{code}"


def _today_result(rows, after, as1, changed, acct_name, T, slot) -> None:
    """09:00 개장 뒤: 예상과 실제를 한 카드에서 비교한다."""
    got = [r for r in rows if r["y"] is not None]
    if not got:
        st.markdown('<div class="card"><h4>오늘 결과</h4><div class="sub">이 날은 개장 뒤 실제 시가가 아직 없어요.</div></div>', unsafe_allow_html=True)
        return
    exp = sum(r["H_amt"] for r in got)
    act = sum(r["y_amt"] for r in got)
    inside = sum(bool(after[r["s"]["code"]]["in_band80"]) for r in got)
    dir_rows = [after[r["s"]["code"]] for r in got if after[r["s"]["code"]].get("nxt_dir_match") is not None]
    dir_ok = sum(bool(a["nxt_dir_match"]) for a in dir_rows)
    acct_line = ""
    if as1 and not changed and as1.get("y_P") is not None:
        ok = as1["L80"] <= as1["y_P"] <= as1["U80"]
        acct_line = (f'<div class="tiny">계좌 범위(연구 중) {ui.won(as1["L80"]*as1["stock_value"])} ~ {ui.won(as1["U80"]*as1["stock_value"])} → '
                     f'<b style="color:{"#1f8a4c" if ok else "#d63b3b"}">{"안" if ok else "밖"}</b></div>')
    st.markdown(
        f'<div class="card" style="border-color:#cfdcfb"><h4>오늘 결과 · 09:00 개장</h4>'
        f'<div class="row"><span class="sub">예상(07:30)</span><span class="mid {ui.tone(exp)}">{ui.won(exp)}</span></div>'
        f'<div class="row"><span class="sub">실제 시가 기준</span><span class="big {ui.tone(act)}">{ui.won(act)}</span></div>'
        f'<div class="row"><span class="tiny">차이</span><span class="tiny">{ui.won(act - exp)}</span></div>'
        f'<div style="margin-top:8px;line-height:2"><span class="chip">범위 안 {inside}/{len(got)}종목</span>'
        + (f'<span class="chip">장전 거래 방향 일치 {dir_ok}/{len(dir_rows)}</span>' if dir_rows else "")
        + f'</div>{acct_line}'
        '<div class="tiny" style="margin-top:4px">실제 금액은 보유 수량 × 전일 종가 × 실제 시가 등락률이에요.</div></div>',
        unsafe_allow_html=True)


def _track_card(T, codes, acct_name) -> None:
    """그날까지 최근 20거래일의 누적 결과(과거 재생)."""
    import plotly.graph_objects as go
    w = data.track_window(T, codes, acct_name)
    if not w["days"]:
        return
    f = lambda v, d=1: "–" if v is None else f"{v:.{d}f}"
    if w["n_fwd"]:
        basis = (f"이 중 {w['n_fwd']}일은 10/27 이후 확정 코드 기록(확정 뒤 {w['n_after']}일), "
                 f"나머지 {w['days'] - w['n_fwd']}일은 과거 재생(규칙을 정할 때 이미 본 기간)이에요.")
    else:
        basis = "과거 재생 기준(규칙을 정할 때 이미 본 기간). 규칙 확정 뒤 기록은 ‘예측 vs 실제’ 맨 위에 있어요."
    st.markdown(
        f'<div class="card"><h4>지금까지 쌓인 결과 · 최근 {w["days"]}거래일</h4><div class="tiny">{basis}</div>'
        f'<div class="row"><span class="sub">내 종목 범위 안</span><span class="mid">{f(w["cov_mine"])}%</span></div>'
        f'<div class="tiny">목표 80% · 같은 기간 200종목 전체 {f(w["cov_all"])}%</div>'
        f'<div class="row" style="margin-top:6px"><span class="sub">예상 시가 평균 오차</span><span class="mid">{f(w["err_H"],2)}%p</span></div>'
        f'<div class="tiny">야간선물 등락률을 그대로 썼다면 {f(w["err_x"],2)}%p</div>'
        f'<div class="row" style="margin-top:6px"><span class="sub">08:11 \'높음\' 방향 일치</span><span class="mid">{f(w["hi_match"])}%</span></div>'
        f'<div class="tiny">{w["hi_n"]}건 기준</div>'
        + (f'<div class="row" style="margin-top:6px"><span class="sub">계좌 범위(연구 중) 안</span><span class="mid">{w["acct_in"]}/{w["acct_n"]}일</span></div>' if w["acct_n"] else "")
        + '</div>', unsafe_allow_html=True)
    dd = [r for r in w["daily"] if r["cov"] == r["cov"]]
    if dd:
        fig = go.Figure(go.Bar(
            x=[data.short_label(r["T"]) for r in dd], y=[r["cov"] for r in dd],
            marker_color=["#1d2b4f" if r["T"] == T else "#b9c2d0" for r in dd],
            hovertemplate="%{x} 내 종목 범위 안 %{y:.0f}%<extra></extra>"))
        fig.add_hline(y=80, line=dict(color=ui.BAND_EDGE, width=2, dash="dash"))
        fig.update_layout(height=170, margin=dict(l=4, r=4, t=4, b=4), plot_bgcolor="#fff", paper_bgcolor="#fff",
                          yaxis=dict(range=[0, 100], ticksuffix="%", gridcolor="#eef0f4"), xaxis=dict(showticklabels=False))
        st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})
        st.caption("막대: 날마다 내 종목 중 범위 안에 든 비율(진한 막대가 오늘). 점선은 목표 80%.")
    st.page_link("views/track.py", label="전체 기록 보기 (예측 vs 실제)", icon="🎯")


def _us_line(T: str, code: str) -> str:
    """종목 카드 아래 '밤사이 미국 뉴스' 한 줄(있을 때만)."""
    un = data.us_news()
    if un is None:
        return ""
    q = un[(un["T"] == T) & (un.kr_code == code)]
    if q.empty:
        return ""
    rel, seg = q[q.tier != data.SEG_TIER], q[q.tier == data.SEG_TIER]
    if len(rel):
        up, dn = int((rel.effect == "수요 증가 쪽").sum()), int((rel.effect == "수요 감소 쪽").sum())
        top = rel.sort_values("time").iloc[-1]
        return (f'<div class="tiny" style="margin-top:4px">밤사이 미국 뉴스(관계표) {len(rel)}건'
                + (f" (수요 증가 쪽 {up} · 감소 쪽 {dn})" if up or dn else "")
                + f' · {html.escape(top.us)} → {html.escape(top.relation)} · {html.escape(str(top.headline)[:80])}</div>')
    top = seg.sort_values("time").iloc[-1]
    return (f'<div class="tiny" style="margin-top:4px;opacity:.8">업종 관련 미국 기사 {len(seg)}건(핵심어, 판정 전) · '
            f'{html.escape(top.relation)} · {html.escape(str(top.headline)[:80])}</div>')


def render() -> None:
    T, slot, acct_name, show_outcome = _state()
    d = data.day(T)
    card = d["card_0730"] if slot == "0730" else d["card_0811"]   # 09:00 탭은 08:11 카드(띠·등급) 위에 실제 시가를 얹는다
    by = {s["code"]: s for s in card["stocks"]}
    acct = next(a for a in card["accounts"] if a["name"] == acct_name)
    pending = show_outcome and not card.get("after_open")   # 아침 봉인 카드만 있고 실제 시가는 장 마감 뒤에 채워지는 날
    if pending:
        show_outcome = False
    after = {r["code"]: r for r in card.get("after_open", {}).get("rows", [])} if show_outcome else {}
    news = data.news(T)
    as1 = d.get("as1", {}).get(acct_name)

    # 수량 바꿔 보기(가정). 원래 수량과 다르면 계좌 범위 후보는 다시 계산해야 하므로 숨긴다.
    rows, changed = [], False
    for h in acct["holdings"]:
        s = by[h["code"]]
        q = st.session_state.get(_qty_key(T, acct_name, h["code"]), h["q"])
        changed |= q != h["q"]
        value = q * s["base_close"]["value"]
        y = after.get(h["code"], {}).get("y")
        rows.append(dict(s=s, q=q, value=value, H_amt=value * s["H"],
                         lo=value * s["band80"][0], hi=value * s["band80"][1],
                         y=y, y_amt=None if y is None else value * y))
    stock_value = sum(r["value"] for r in rows)
    H_sum = sum(r["H_amt"] for r in rows)
    total = stock_value + acct["cash"]

    with st.container(key="phone"):
        when = {"0730": "07:30 기준", "0811": "08:11 기준", "0900": "09:00 개장 후"}[slot]
        st.markdown(ui.brand(f"{data.short_label(T)} {when}"), unsafe_allow_html=True)

        steps = [("06:00", "밤사이 마감"), ("07:30", "예상 범위"), ("08:11", "장전 거래 반영"), ("09:00", "개장")]
        now = {"0730": 1, "0811": 2, "0900": 3}[slot]
        st.markdown('<div class="tiny" style="margin:8px 0 2px">' + " → ".join(
            (f"<b style='color:#1b2333'>{t} {n}</b>" if i == now else f"{t} {n}") for i, (t, n) in enumerate(steps)) + "</div>",
            unsafe_allow_html=True)

        src = d.get("source") or {}
        seal = (src.get("sealed") or {}).get("0730" if slot == "0730" else "0811") or {}
        if seal.get("before_open") and (src.get("kind") == "live" or src.get("same_as_sealed")):
            st.markdown(f'<div class="notice info"><b>장 전 봉인 기록</b><br>이 카드는 그날 {seal["issued_at"][11:16]}(개장 전)에 고정해 둔 예상이에요. '
                        f'고정 표시(해시) {seal["sha256"][:12]}…' + (" · 장 마감 뒤 같은 코드로 다시 계산해도 숫자가 같았어요." if src.get("same_as_sealed") else "")
                        + '</div>', unsafe_allow_html=True)
        elif seal.get("issued_at"):
            st.markdown(f'<div class="notice info"><b>개장 뒤 발행한 카드</b><br>고정 코드로 장 전 자료만 써서 만들었지만, 맥이 잠들어 {seal["issued_at"][11:16]}에 발행돼 장 전 기록은 아니에요.'
                        + (" 장 마감 뒤 같은 코드로 다시 계산해도 숫자가 같았어요." if src.get("same_as_sealed") else "") + '</div>', unsafe_allow_html=True)
        elif src.get("kind") == "forward":
            st.markdown('<div class="notice info"><b>' + ("규칙 확정 뒤 처음 보는 날" if src.get("after_freeze") else "규칙 확정 전 날(설계 자료 밖)")
                        + '</b><br>11/2 15:17에 고정한 코드로 그날 이전 자료만 써서 계산한 예상이에요. 장 전에 실제로 발행한 것이 아니라 끝난 장 자료로 사후에 다시 계산했어요.</div>',
                        unsafe_allow_html=True)
        if pending:
            st.markdown('<div class="notice info"><b>실제 시가는 아직이에요</b><br>개장 직후(09:05쯤) 그날 시가를 받아 이 카드 위에 채워요. 늦어도 장 마감 뒤(16:05)에는 채워요.</div>', unsafe_allow_html=True)
        elif show_outcome and src.get("kind") == "live":
            st.markdown(f'<div class="notice info"><b>개장 직후 시가로 채운 결과</b><br>{card["after_open"].get("opens_fetched_at", "")[11:16]}에 받은 그날 시가예요. '
                        '계좌 범위 비교와 누적 기록은 장 마감 뒤(16:05)에 같은 시가로 다시 계산해요.</div>', unsafe_allow_html=True)
        for c in card["market"]["cautions"]:
            title, body = DAY_CAUTION.get(c["kind"], ("오늘 확인할 점", c["text"]))
            st.markdown(f'<div class="notice warn"><b>⚠ {title}</b><br>{body}</div>', unsafe_allow_html=True)

        if show_outcome:
            _today_result(rows, after, as1, changed, acct_name, T, slot)

        # 1) 계좌 종합
        rng = ""
        if as1 and not changed:
            lo_amt, hi_amt = as1["L80"] * as1["stock_value"], as1["U80"] * as1["stock_value"]
            rng = (f'<div class="sub" style="margin-top:8px">계좌 예상 범위 <b>{ui.won(lo_amt)} ~ {ui.won(hi_amt)}</b> '
                   f'<span class="chip">연구 중</span></div>'
                   + ui.band_bar(as1["L80"], as1["U80"], as1["H_P"], as1["y_P"] if show_outcome else None,
                                 lo90=as1["L90"], hi90=as1["U90"], height=30)
                   + '<div class="tiny">계좌 전체를 한 묶음으로 본 범위예요. 아직 검증 기준을 다 넘지 못해 참고로만 보여 드려요'
                   ' (특히 밤사이 시장이 조용했던 날 덜 맞았어요).</div>')
        elif changed:
            rng = '<div class="tiny" style="margin-top:8px">수량을 바꾸면 계좌 전체 범위는 다시 계산해야 해서 잠시 숨겼어요. 종목별 범위는 아래에 있어요.</div>'
        trust = ""
        if slot in ("0811", "0900"):
            share = {"높음": 0., "보통": 0., "낮음": 0., "없음": 0.}
            for r in rows:
                g = r["s"].get("grade_0811") or {}
                share[g.get("level") or "없음"] += r["value"]
            seg = "".join(f'<div style="width:{v/stock_value*100:.1f}%;background:{c}"></div>'
                          for k, c in (("높음", "#4caf73"), ("보통", "#b7bec9"), ("낮음", "#f0a24b"), ("없음", "#e6e8ec"))
                          for v in [share[k]] if v > 0)
            label = " · ".join(f"{k} {v/stock_value*100:.0f}%" for k, v in share.items() if v > 0)
            outs = [r["s"]["name"] for r in rows if (r["s"].get("grade_0811") or {}).get("nxt_g") is not None
                    and not (r["s"]["band80"][0] <= r["s"]["grade_0811"]["nxt_g"] <= r["s"]["band80"][1])]
            trust = (f'<div class="sub" style="margin-top:10px">장전 거래로 본 방향 믿을 정도(보유 금액 기준)</div>'
                     f'<div class="stack">{seg}</div><div class="tiny">{label}</div>'
                     + (f'<div class="caution" style="margin-top:8px">⚠ 장전 거래가 이미 예상 범위 밖: {html.escape(" · ".join(outs))}</div>' if outs else ""))
        else:
            trust = '<div class="tiny" style="margin-top:10px">08:11에 장전 거래(NXT)를 보고 종목별 방향 믿을 정도를 알려 드려요.</div>'
        actual = ""
        got = [r for r in rows if r["y"] is not None]
        if show_outcome and got:   # '오늘 결과' 카드와 같은 계산(보유 수량 × 전일 종가 × 실제 등락률)
            y_amt = sum(r["y_amt"] for r in got)
            actual = f'<div class="sub" style="margin-top:6px">개장 뒤 실제 시가 기준 <b class="{ui.tone(y_amt)}">{ui.won(y_amt)}</b></div>'
        st.markdown(
            f'<div class="card"><h4>{html.escape(acct_name)} · 평가금액 {ui.man(total, sign=False)}</h4>'
            f'<div class="sub">오늘 시가에 예상되는 주식 평가금액 변화</div>'
            f'<div class="big {ui.tone(H_sum)}">{ui.won(H_sum)} <span class="mid">({ui.pct(H_sum/stock_value if stock_value else None)})</span></div>'
            f'{actual}{rng}{trust}</div>', unsafe_allow_html=True)

        # 2) 밤사이 한눈에
        x = card["market"]["x"]
        mk = [f'<span class="chip">코스피200 야간선물 <b class="{ui.tone(x)}">{ui.pct(x)}</b></span>']
        if news:
            names = {"NQ=F": "나스닥100 선물", "EWY": "한국 ETF(EWY)", "SOX": "미국 반도체지수"}
            for m in news["market_band"]:
                if m["asset_id"] in names and m["unit"] == "%":
                    mk.append(f'<span class="chip">{names[m["asset_id"]]} <b class="{ui.tone(m["change"])}">{ui.pct(m["change"])}</b></span>')
        st.markdown(f'<div class="card"><h4>밤사이 한눈에</h4><div style="line-height:2">{"".join(mk)}</div>'
                    f'<div class="tiny">야간선물은 어제 15:45 주간 종가 대비 06:00 값이에요.</div></div>', unsafe_allow_html=True)
        st.page_link("views/night.py", label="밤사이 흐름 보기 (야간선물·거래량·보도 시각)", icon="📈")

        # 3) 내 종목과 연결된 새 소식
        if news:
            key = data.news_account_key(acct_name)
            mine = news["accounts"].get(key, {})
            ev_ids = list(mine.get("cards", []))
            linked = {l["event_id"] for l in news["links"] if l["account_id"] == "demo_" + acct_name[0]}
            topics = {t["event_id"]: t for t in news["topics"]}
            for t in news["topics"]:
                if len(ev_ids) >= 3:
                    break
                if t["event_id"] in linked and t["event_id"] not in ev_ids:
                    ev_ids.append(t["event_id"])
            market = [t["event_id"] for t in news["topics"] if t["event_id"] not in ev_ids][: max(0, 3 - len(ev_ids))]
            items = []
            for eid in ev_ids[:3] + market:
                t = topics[eid]
                title = (t["text"] or {}).get("headline") or t["title"] or t["headline"]
                chip = "new" if t["novelty"] == "새 소식" else "follow"
                tag = '<span class="chip">시장 소식 · 내 종목 연결 없음</span>' if eid in market else ""
                items.append(f'<div class="topic"><span class="chip {chip}">{t["novelty"]}</span>{tag}'
                             f'<span class="time">처음 {t["first_kst"][11:]} · 기사 {t["cluster_size"]}건'
                             + (f' (발표 전 예고 {t["preview_count"]}건 포함)' if t.get("preview_count") else "") + '</span>'
                             f'<div style="margin-top:4px;font-weight:600">{html.escape(title)}</div></div>')
            summary = "".join(f"<li>{html.escape(line)}</li>" for line in mine.get("summary", {}).get("lines", []))
            st.markdown(f'<div class="card"><h4>내 종목과 연결된 새 소식</h4>{"".join(items) or "<div class=sub>연결된 소식이 없어요.</div>"}'
                        + (f'<div class="sub" style="margin-top:8px"><b>요약</b><ul style="margin:4px 0 0 18px;padding:0">{summary}</ul></div>' if summary else "")
                        + '<div class="tiny">요약은 AI가 수집된 숫자·출처 안에서만 쓰고, 숫자 검사를 통과한 문장만 보여 줘요.</div></div>',
                        unsafe_allow_html=True)
            st.page_link("views/news.py", label="소식 자세히 보기 (최초·후속 보도, 연결 근거)", icon="📰")
        else:
            # 11/11: 6/25식 사건 묶음이 없는 날은 미국 뉴스 연결(관계표 규칙 확인·AI 판정)에서 내 종목 몫을 보여 준다
            un = data.us_news()
            codes = {r["s"]["code"] for r in rows}
            q = un[(un["T"] == T) & (un.tier != data.SEG_TIER)] if un is not None else None
            if q is not None and len(q):
                mine = q[q.kr_code.isin(codes)]
                items = []
                for (tm, head), g in list(mine.groupby(["time", "headline"], sort=False))[:4]:
                    chip = "new" if (g.tier == "규칙 확인").any() else "follow"
                    items.append(f'<div class="topic"><span class="chip {chip}">{"관계표 규칙" if chip == "new" else "AI 판정"}</span>'
                                 f'<span class="time">{tm} · {html.escape(g.us.iloc[0])} → {html.escape("·".join(dict.fromkeys(g.kr_name)))}</span>'
                                 f'<div style="margin-top:4px;font-weight:600">{html.escape(head)}</div></div>')
                n_all = q.headline.nunique()
                st.markdown(f'<div class="card"><h4>내 종목과 연결된 미국 소식</h4>'
                            + ("".join(items) or f'<div class="sub">이 계좌 종목과 이어진 미국 기사는 없어요(이 밤 전체 연결 {n_all}건).</div>')
                            + f'<div class="tiny">{html.escape(data.news_record_line(T))} 이어졌다는 건 사업 관계가 있다는 뜻이지, 시가를 움직였다는 뜻은 아니에요.</div></div>',
                            unsafe_allow_html=True)
                st.page_link("views/news.py", label="소식 자세히 보기 (연결 근거·업종 핵심어)", icon="📰")
            else:
                st.markdown('<div class="card"><h4>내 종목과 연결된 새 소식</h4><div class="sub">이 날짜는 뉴스 연결 기록이 없어요.</div></div>',
                            unsafe_allow_html=True)

        # 3-1) 다가오는 일정
        events = data.upcoming_events(T)
        if events:
            ev_html = "".join(f'<div class="topic"><span class="chip">D-{e["dday"]}</span><span class="time">{e["label"]} 아침</span>'
                              f'<div style="margin-top:4px;font-weight:600">{html.escape(e["title"])}</div>'
                              f'<div class="tiny">{html.escape(e["note"])}</div></div>' for e in events[:5])
            st.markdown(f'<div class="card"><h4>다가오는 일정 (7일)</h4>{ev_html}'
                        '<div class="tiny" style="margin-top:6px">보유 종목의 실적 발표 예정일은 공시 일정과 연결 예정이에요.</div></div>',
                        unsafe_allow_html=True)

        # 4) 보유 종목
        parts = []
        span = max([abs(v) for r in rows for v in (r["s"]["band90"][0], r["s"]["band90"][1])] + [0.01]) * 1.1
        for r in sorted(rows, key=lambda r: -r["value"]):
            s, g, a = r["s"], r["s"].get("grade_0811") or {}, after.get(r["s"]["code"], {})
            nxt = (f'<span class="tiny">장전 거래 <b class="{ui.tone(g.get("nxt_g"))}">{ui.pct(g.get("nxt_g"))}</b></span>'
                   if slot in ("0811", "0900") and g.get("nxt_g") is not None else "")
            cautions = "".join(f'<div class="caution">⚠ {STOCK_CAUTION.get(c["kind"], c["text"])}</div>' for c in s.get("cautions", []))
            ng = g.get("nxt_g")
            if slot in ("0811", "0900") and ng is not None and not (s["band80"][0] <= ng <= s["band80"][1]):
                cautions += f'<div class="caution">⚠ {NXT_OUT.format(side="위" if ng > s["band80"][1] else "아래")}</div>'
            outcome = ""
            if a and slot == "0900":
                mark = "✓ 범위 안" if a["in_band80"] else "✗ 범위 밖"
                dirm = "" if a.get("nxt_dir_match") is None else (" · 장전 방향 일치" if a["nxt_dir_match"] else " · 장전 방향 불일치")
                outcome = (f'<div class="flow"><span>07:30 예상 <b>{ui.pct(s["H"])}</b></span><span>→</span>'
                           f'<span>08:11 장전 <b>{ui.pct(g.get("nxt_g"))}</b></span><span>→</span>'
                           f'<span>09:00 실제 <b class="{ui.tone(a["y"])}">{ui.pct(a["y"])}</b></span></div>'
                           f'<div class="tiny"><b style="color:{"#1f8a4c" if a["in_band80"] else "#d63b3b"}">{mark}</b>{dirm}'
                           f' · 실제 금액 {ui.won(r["y_amt"])}</div>')
            elif a:
                inside = "범위 안" if a["in_band80"] else "범위 밖"
                outcome = (f'<div class="tiny">실제 시가 <b class="{ui.tone(a["y"])}">{ui.pct(a["y"])}</b> · {inside}'
                           + ("" if a.get("nxt_dir_match") is None else f' · 장전 거래 방향 {"일치" if a["nxt_dir_match"] else "불일치"}') + "</div>")
            parts.append(
                f'<div class="stock"><div class="row"><span class="name">{html.escape(s["name"])}</span>'
                f'<span class="mid {ui.tone(s["H"])}">{ui.pct(s["H"])}</span></div>'
                f'<div class="row"><span class="tiny">{r["q"]:,}주 · {ui.man(r["value"], sign=False)}</span>'
                f'<span class="tiny {ui.tone(r["H_amt"])}">{ui.won(r["H_amt"])}</span></div>'
                + ui.band_bar(s["band80"][0], s["band80"][1], s["H"], a.get("y") if a else None, span=span)
                + f'<div class="row"><span class="tiny">범위 {ui.pct(s["band80"][0])} ~ {ui.pct(s["band80"][1])}'
                  f' ({ui.won(r["lo"])} ~ {ui.won(r["hi"])})</span></div>'
                + f'<div style="margin-top:4px">{ui.grade_chip(g.get("level"), g.get("p")) if slot in ("0811", "0900") else ""} {nxt}</div>'
                + cautions + _us_line(T, s["code"]) + outcome + "</div>")
        for x_ in acct["excluded"]:
            parts.append(f'<div class="stock"><span class="name">{x_["code"]}</span> <span class="tiny">{x_["q"]}주 · {x_["reason"]}</span></div>')
        st.markdown(f'<div class="card"><h4>보유 종목별 예상 시가</h4>{ui.legend()}{"".join(parts)}'
                    f'<div class="tiny" style="margin-top:8px">종목별 범위 금액을 더한 값은 계좌 범위가 아니에요(종목들이 함께 움직이는 정도가 날마다 달라요).</div></div>',
                    unsafe_allow_html=True)

        if show_outcome:
            _track_card(T, tuple(h["code"] for h in acct["holdings"]), acct_name)

        # 5) 만약에: 수량 바꿔 보기
        with st.expander("수량을 바꿔 보면? (가정 계산)"):
            st.caption("수량을 바꾸면 위 금액이 바로 다시 계산돼요. 실제 주문과 연결되지 않아요.")
            for h in acct["holdings"]:
                st.number_input(by[h["code"]]["name"], min_value=0, step=1, value=h["q"], key=_qty_key(T, acct_name, h["code"]))
            if st.button("원래 수량으로", width="stretch"):
                for h in acct["holdings"]:
                    st.session_state.pop(_qty_key(T, acct_name, h["code"]), None)
                st.rerun()

        st.markdown('<div class="tiny" style="margin-top:12px">예상 범위는 과거 비슷한 아침에 실제 시가가 들어온 정도로 만든 참고 범위예요. '
                    '확률이나 수익 보장이 아니며, 매수·매도 권유가 아니에요. '
                    + ("이 화면은 과거 자료를 다시 재생한 것이에요." if card["mode"] == "historical_replay" else "") + "</div>",
                    unsafe_allow_html=True)


render()
