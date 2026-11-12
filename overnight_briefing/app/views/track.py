"""예측 vs 실제: 아침에 보여 준 범위·등급이 개장 뒤 얼마나 맞았는지 누적으로 본다."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from core import data, ui

man = data.manifest()
split = man.get("split_T", "20260731")
st.markdown(ui.brand("예측과 실제 시가의 누적 비교"), unsafe_allow_html=True)
st.subheader("예측 vs 실제")
st.caption("매일 아침의 범위·등급은 그날 이전 자료로만 계산하고, 개장 뒤 실제 시가와 따로 대조해요.")

# ---- 1) 진짜 검증: 규칙 확정 뒤 온 날 ----
fw = data.forward_record()
if fw:
    res, fs = fw
    af, bf, it = res.get("after_freeze", {}), res.get("before_freeze", {}), data.intime_check()
    st.markdown("### 1. 규칙 확정 뒤 처음 보는 날 (전방 기록)")
    st.markdown('<div class="notice warn"><b>이게 진짜 검증이에요.</b> 노란띠·등급 규칙은 11/2 15:17에 확정됐고(코드 해시 고정), '
                '11/3부터 온 날은 규칙을 정할 때 한 번도 보지 않았어요. 날짜가 아직 적어서 판정이 아니라 누적 기록이에요.</div>', unsafe_allow_html=True)
    prov = res.get("prov_days", [])
    if prov:
        pv = ", ".join(f"{data.short_label(t)}(카드 {res['prov_issued'][t][11:16]} 발행" + (", 장 전 봉인 아님)" if res["prov_issued"][t][11:16] >= "09:00" else ")")
                       for t in prov)
        st.markdown(f'<div class="notice info">{pv}은 개장 직후 받은 그날 시가로 먼저 채운 <b>임시 줄</b>이에요. 같은 확정 코드·같은 계산이고, '
                    '장 마감 뒤(16:05) 전방 기록을 다시 돌리면 정식 줄로 바뀌며 계좌 범위도 그때 붙어요.</div>', unsafe_allow_html=True)
    k = st.columns(4)
    ui.kpi(k[0], "노란띠 안 (확정 후)", f"{af.get('in80', 0):.1f}%", f"목표 80% · {af.get('days', 0)}거래일 × 200종목" + (" · 오늘 임시 포함" if prov else ""))
    ui.kpi(k[1], "예상 시가 평균 오차", f"{af.get('mae_H', 0):.2f}%p", f"야간선물 그대로면 {af.get('mae_x', 0):.2f}%p")
    hi = (af.get("dir_높음") or {})
    ui.kpi(k[2], "08:11 ‘높음’ 방향 일치", f"{hi.get('rate', 0):.1f}%", f"{hi.get('n', 0)}건")
    ui.kpi(k[3], "확정 전 5일(10/27~11/2)", f"{bf.get('in80', 0):.1f}%", "설계 자료 밖이지만 확정 전에 시가가 나온 날")
    pdays = pd.DataFrame(res["per_day"])
    pdays["날짜"] = pdays["T"].map(data.short_label)
    st.dataframe(pdays.rename(columns={"group": "구분", "x": "야간선물(%)", "in80": "띠 안(%)", "above": "위로 벗어남(%)", "below": "아래로 벗어남(%)",
                                       "mae_H": "예상 오차(%p)", "mae_x": "야간선물 그대로 오차(%p)", "hi_dir": "‘높음’ 방향 일치(%)",
                                       "mean_H": "예상 평균(%)", "mean_y": "실제 평균(%)"})
                 [["날짜", "구분", "야간선물(%)", "띠 안(%)", "위로 벗어남(%)", "아래로 벗어남(%)", "예상 오차(%p)", "야간선물 그대로 오차(%p)", "‘높음’ 방향 일치(%)", "예상 평균(%)", "실제 평균(%)"]],
                 hide_index=True, width="stretch")
    n_af = af.get("days", 0)
    st.caption("규칙 확정 뒤 첫 주(11/3~11/6)는 11/6 코스피200 야간선물 −7.9%·장 초반 서킷브레이커처럼 변동이 매우 컸던 주예요. "
               "점 예상과 ‘높음’ 등급은 버텼지만, 노란띠는 최근 20거래일로 폭을 맞추는 구조라 갑자기 커진 변동을 따라가지 못했어요(위·아래로 크게 벗어남). "
               f"같은 날 종목들이 함께 빗나가서 확정 뒤 {n_af}일은 사실상 {n_af}번의 관측이에요.")
    if it:
        a = it["all"]
        st.caption(f"보강 확인(E101): 규칙 고르기를 매달 그 시점 이전 자료로만 다시 했어도 1년 재생 성적은 거의 같았어요 "
                   f"(띠 안 {a['cov']['intime']:.1f}% vs 지금 {a['cov']['fixed']:.1f}%, 시가 오차 {a['mae']['intime']:.2f} vs {a['mae']['fixed']:.2f}%p). "
                   "즉 아래 재생 숫자의 낙관 편향은 작고, 확정 뒤 주간의 하락은 선택 편향이 아니라 그 주의 시장 변동에서 왔어요.")
    st.divider()

st.markdown("### 2. 누적 비교 (과거 재생 + 확정 코드 매일 기록)")
st.markdown('<div class="notice info">10/26까지는 규칙을 정할 때 이미 본 기간(2025-10~)을 그날 이전 자료로 다시 계산한 <b>과거 재생</b>이고, '
            '10/27부터는 11/2에 고정한 코드로 매일 덧붙인 기록이에요(11/3부터가 처음 보는 날). 어느 기간 버튼이든 오늘까지 이어서 쌓여요. '
            '‘8월 이후’·‘전체’에는 규칙 선택에 쓰인 재생 기간이 섞여 있어서, 처음 보는 날만 보려면 ‘규칙 확정 뒤’를 눌러요. 차트의 노란 칸이 규칙 확정 뒤예요.</div>', unsafe_allow_html=True)

st_all, days, acc = data.track_all()
_fw = data.forward_record()
prov_days = set(_fw[0].get("prov_days", [])) if _fw else set()
st_all = st_all.merge(days[["T", "x", "monday"]], on="T", how="left")
c1, c2 = st.columns([2, 1])
period = c1.segmented_control("기간", ["전체", "최근 60거래일", "8월 이후", "규칙 확정 뒤"], default="전체")
mine = c2.toggle("내 계좌 종목만", value=False)
all_days = sorted(st_all["T"].unique())
if period == "8월 이후":
    st_all = st_all[st_all["T"] > split]
elif period == "최근 60거래일":
    st_all = st_all[st_all["T"].isin(all_days[-60:])]
elif period == "규칙 확정 뒤":
    st_all = st_all[st_all["T"] >= data.FREEZE_T]
if mine:
    held = {h["code"] for h in next(a for a in data.day(st.session_state["T"])["card_0811"]["accounts"]
                                     if a["name"] == st.session_state["account"])["holdings"]}
    st_all = st_all[st_all.code.isin(held)]
s = st_all[st_all.y.notna()].copy()
s["in80"] = s.in80.astype(bool)
s["err_H"] = (s.y - s.H).abs()
s["err_x"] = (s.y - s.x).abs()
s["ax"] = s.x.abs()

k = st.columns(4)
ui.kpi(k[0], "범위 안에 든 비율", f"{s.in80.mean()*100:.1f}%", "목표 80%")
ui.kpi(k[1], "예상 시가 평균 오차", f"{s.err_H.mean()*100:.2f}%p", f"야간선물 등락률을 그대로 쓰면 {s.err_x.mean()*100:.2f}%p")
g = s[s.grade.notna() & s.nxt_dir_match.notna()]
hi = g[g.grade == "높음"]
ui.kpi(k[2], "08:11 ‘높음’ 방향 일치", f"{hi.nxt_dir_match.astype(bool).mean()*100:.1f}%" if len(hi) else "–", f"{len(hi):,}건")
n_new = s.loc[s["T"] >= data.FREEZE_T, "T"].nunique()
ui.kpi(k[3], "대조한 종목·날", f"{len(s):,}건", f"{s['T'].nunique()}거래일 · 처음 보는 날 {n_new}일" + (" · 오늘 임시 포함" if prov_days & set(s["T"]) else ""))

daily = s.groupby("T").agg(cov=("in80", "mean"), ax=("ax", "first"), n=("in80", "size")).reset_index()
daily["d"] = pd.to_datetime(daily["T"])
daily["roll"] = daily["cov"].rolling(20, min_periods=5).mean()
daily["kind"] = np.where(daily["T"].isin(prov_days), "개장 직후 임시(16:05 다시 계산)", np.where(daily["T"] >= data.FREEZE_T, "규칙 확정 뒤(처음 보는 날)",
                         np.where(daily["T"] >= data.FWD_FIRST, "확정 코드 기록(확정 전 주)", "과거 재생")))
fig = go.Figure()
fwd = daily[daily["T"] >= data.FREEZE_T]
if len(fwd):
    fig.add_vrect(x0=fwd.d.min() - pd.Timedelta(hours=14), x1=fwd.d.max() + pd.Timedelta(hours=14), fillcolor="#fff1bf", opacity=0.7, layer="below",
                  line_width=0, annotation_text="규칙 확정 뒤", annotation_position="top left", annotation_font_size=11)
fig.add_trace(go.Bar(x=daily.d, y=daily["cov"] * 100, name="그날 범위 안 비율",
                     marker_color=np.where(daily.ax >= 0.015, "#f0a24b", np.where(daily.ax < 0.005, "#b7bec9", "#8fb0ea")),
                     marker_pattern_shape=np.where(daily["T"].isin(prov_days), "/", ""),
                     customdata=np.c_[daily.ax * 100, daily.n, daily.kind],
                     hovertemplate="%{x|%Y-%m-%d} · %{customdata[2]}<br>범위 안 %{y:.0f}%<br>야간선물 |%{customdata[0]:.2f}|% · %{customdata[1]}종목<extra></extra>"))
fig.add_trace(go.Scatter(x=daily.d, y=daily.roll * 100, name="최근 20거래일 평균", line=dict(color=ui.INK, width=2)))
fig.add_hline(y=80, line=dict(color=ui.BAND_EDGE, width=2, dash="dash"), annotation_text="목표 80%")
fig.update_layout(height=330, margin=dict(l=10, r=10, t=20, b=10), plot_bgcolor="#fff", legend=dict(orientation="h", y=1.12),
                  yaxis=dict(range=[0, 100], ticksuffix="%", gridcolor="#eef0f4"), xaxis=dict(tickformat="%m/%d"), bargap=0.15)
st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})
st.caption("막대 색: 회색 = 조용한 밤(야간선물 |x| 0.5% 미만), 파랑 = 보통, 주황 = 큰 밤(1.5% 이상). 빗금 막대 = 개장 직후 임시(장 마감 뒤 다시 계산). "
           "같은 날에는 종목들이 함께 빗나가서 하루하루 들쭉날쭉해요.")


def table(groups: dict[str, pd.Series]) -> pd.DataFrame:
    rows = []
    for name, m in groups.items():
        sub = s[m]
        if len(sub):
            rows.append({"구분": name, "범위 안": f"{sub.in80.mean()*100:.1f}%", "평균 폭": f"{(sub.U80-sub.L80).mean()*100:.2f}%p",
                         "예상 오차": f"{sub.err_H.mean()*100:.2f}%p", "종목·날": f"{len(sub):,}", "거래일": sub["T"].nunique()})
    return pd.DataFrame(rows)


a, b = st.columns(2)
with a:
    st.markdown("**밤의 크기·요일·공시별**")
    st.dataframe(table({
        "조용한 밤 (|x|<0.5%)": s.ax < 0.005, "보통 밤 (0.5~1.5%)": (s.ax >= 0.005) & (s.ax < 0.015), "큰 밤 (≥1.5%)": s.ax >= 0.015,
        "월요일": s.monday.astype(bool), "다른 요일": ~s.monday.astype(bool),
        "전날 실적 공시 종목": s.cautions.fillna("").str.contains("e_earn"), "공시 없는 종목": ~s.cautions.fillna("").str.contains("e_earn")}),
        hide_index=True, width="stretch")
with b:
    st.markdown("**08:11 방향 믿을 정도: 말한 것 vs 실제**")
    cal = g.assign(m=g.nxt_dir_match.astype(bool)).groupby("grade").agg(건수=("m", "size"), 예상=("p", "mean"), 실제=("m", "mean"))
    cal = cal.reindex([x for x in ("높음", "보통", "낮음") if x in cal.index]).rename_axis("등급")
    st.dataframe(cal.assign(예상=lambda d: (d.예상 * 100).round(1).astype(str) + "%", 실제=lambda d: (d.실제 * 100).round(1).astype(str) + "%"),
                 width="stretch")
    st.caption("‘방향’은 08:10 장전 거래(NXT)의 방향이 시가 방향과 같은지예요. 예상 시가 숫자의 정확도와는 다른 지표예요.")

st.markdown("**계좌 전체 범위(연구 중 후보) — 예시 계좌 5개**")
ac = acc[acc.y_P.notna() & acc["T"].isin(s["T"].unique())].merge(days[["T", "x"]], on="T")
ac["in80"] = (ac.y_P >= ac.L80) & (ac.y_P <= ac.U80)
quiet = ac.x.abs() < 0.005
st.dataframe(pd.DataFrame([{"계좌": n, "범위 안(전체)": f"{g_.in80.mean()*100:.1f}%", "범위 안(조용한 밤)": f"{g_[quiet[g_.index]].in80.mean()*100:.1f}%" if quiet[g_.index].any() else "–",
                            "평균 폭": f"{(g_.U80-g_.L80).mean()*100:.2f}%p", "거래일": len(g_)} for n, g_ in ac.groupby("account")]),
             hide_index=True, width="stretch")
st.caption("예시 계좌 5개에서는 위와 같지만, 처음 보는 종목으로 만든 무작위 계좌 수백 개로 검증했을 때 조용한 밤 포함률이 72.2%로 "
           "기준(75% 이상)에 못 미쳤어요. 그래서 고객 화면에서는 ‘연구 중’으로만 보여 줘요."
           + (" 오늘 계좌 범위는 장 마감 뒤(16:05)에 붙어요." if prov_days else ""))

TYPE_COLOR = {"방향 반대": "#d63b3b", "방향 맞고 더 크게": "#f0a24b", "방향 맞고 덜": "#7b8794", "보합": "#b7bec9"}


def _us_cell(T: str, code: str) -> str:
    un = data.us_news()
    if un is None:
        return "–"
    q = un[(un["T"] == T) & (un.kr_code == code)]
    if q.empty:
        return "–"
    rel, seg = q[q.tier != data.SEG_TIER], q[q.tier == data.SEG_TIER]
    s = f"관계 {len(rel)}건 ({int((rel.effect == '수요 증가 쪽').sum())}/{int((rel.effect == '수요 감소 쪽').sum())})" if len(rel) else ""
    return (s + (" · " if s and len(seg) else "") + (f"업종 {len(seg)}건" if len(seg) else "")) or "–"


def day_detail() -> None:
    """하루 골라서 종목별로: 그날 이전 자료로만 낸 예상 시가·노란띠와 실제 시가. 10/27 이후는 확정 코드 기록."""
    sa, da, _ = data.track_all()
    sa = sa[sa.y.notna()]
    days_all = sorted(sa["T"].unique(), reverse=True)
    fw = data.forward_record()
    prov = set(fw[0].get("prov_days", [])) if fw else set()
    lab = lambda d: data.day_label(d) + (" · 개장 직후(임시)" if d in prov else " · 확정 뒤" if d >= data.FREEZE_T else " · 확정 전" if d >= data.FWD_FIRST else " · 과거 재생")
    pick = st.selectbox("날짜", days_all, format_func=lab, key="detail_day")
    one = sa[sa["T"] == pick].merge(da[["T", "x"]], on="T", how="left").sort_values("H")
    one["in80"] = one.in80.astype(bool)
    an = data.miss_anatomy()
    info = next((d for d in an[0]["days"] if d["T"] == pick), None) if an else None
    k = st.columns(4)
    ui.kpi(k[0], "노란띠 안", f"{one.in80.mean()*100:.1f}%", f"{len(one)}종목 · 목표 80%")
    ui.kpi(k[1], "예상 평균 → 실제 평균", f"{one.H.mean()*100:+.2f}% → {one.y.mean()*100:+.2f}%", f"야간선물 {ui.pct(one.x.iloc[0])}")
    ui.kpi(k[2], "시장 전체가 다르게 열린 몫", f"{(one.y - one.H).mean()*100:+.2f}%p", "200종목 평균 (실제 − 예상)")
    if info:
        ui.kpi(k[3], "업종이 설명하는 몫", f"{info['sector_R2']*100:.0f}%", f"1년 재생 날 중 상위 {100 - info['sector_R2_pct_in_replay']:.0f}%")
    f2 = go.Figure()
    f2.add_trace(go.Scatter(x=list(range(len(one))), y=one.H * 100, mode="markers", marker=dict(symbol="diamond", color=ui.INK, size=6), name="예상 시가",
                            error_y=dict(type="data", symmetric=False, array=(one.U80 - one.H) * 100, arrayminus=(one.H - one.L80) * 100, color=ui.BAND_EDGE, thickness=3, width=0),
                            text=one.name, hovertemplate="%{text}<br>예상 %{y:+.2f}%<extra></extra>"))
    f2.add_trace(go.Scatter(x=list(range(len(one))), y=one.y * 100, mode="markers", name="실제 시가",
                            marker=dict(color=np.where(one.in80, "#1f8a4c", ui.UP), size=6), text=one.name, hovertemplate="%{text}<br>실제 %{y:+.2f}%<extra></extra>"))
    f2.update_layout(height=340, margin=dict(l=10, r=10, t=10, b=10), plot_bgcolor="#fff", xaxis=dict(visible=False),
                     yaxis=dict(ticksuffix="%", gridcolor="#eef0f4"), legend=dict(orientation="h", y=1.1))
    st.plotly_chart(f2, width="stretch", config={"displayModeBar": False})
    st.caption("종목을 예상 시가 순으로 늘어놓았어요. 막대 = 노란띠(80%), 마름모 = 예상, 점 = 실제(초록 = 띠 안, 빨강 = 띠 밖).")
    with st.expander(f"{data.day_label(pick)} 전체 {len(one)}종목 표"):
        full = one.copy()
        full["결과"] = np.where(full.in80, "띠 안", np.where(full.y > full.U80, "띠 위", "띠 아래"))
        seg = data.segments()
        if seg is not None:
            full = full.merge(seg, on="code", how="left")
        cols = {"name": "종목", "업종": "업종", "H": "예상", "L80": "띠 아래", "U80": "띠 위", "y": "실제", "결과": "결과", "nxt_g": "08:10 장전", "grade": "08:11 등급"}
        show = full[[c for c in cols if c in full.columns]].rename(columns=cols)
        for c in ("예상", "띠 아래", "띠 위", "실제", "08:10 장전"):
            if c in show:
                show[c] = (show[c].astype(float) * 100).round(2)
        st.dataframe(show.sort_values("실제", ascending=False), hide_index=True, width="stretch", height=420)
        st.caption("숫자는 전일 종가 대비 %. 실제 시가가 높은 순. 업종은 사업보고서 기준 세부 업종.")
    if not info:
        st.caption("빗나간 종목 해부(유형·업종·크게 빗나간 종목)는 장 마감 뒤(16:05) 계산해서 붙어요." if pick in prov
                   else "빗나간 종목 해부는 10/27 이후 날짜에 있어요.")
        return
    ms = an[1][an[1]["T"] == pick]
    st.markdown("**빗나간 종목은 어떻게 빗나갔나**")
    c1, c2 = st.columns([1, 1.3])
    with c1:
        tc = ms[ms.out].type.value_counts()
        st.dataframe(pd.DataFrame({"종목 수": tc, "비율": (tc / tc.sum() * 100).round(0).astype(int).astype(str) + "%"}).rename_axis("유형"), width="stretch")
        st.caption("방향 반대 = 예상과 반대쪽으로 열림 · 방향 맞고 더 크게 = 같은 쪽인데 예상보다 크게 · 덜 = 같은 쪽인데 범위에 못 미침")
    with c2:
        sec = pd.DataFrame(info["sectors"]).sort_values("r_mean")
        st.dataframe(sec.rename(columns={"group": "업종", "n": "종목", "r_mean": "시장 대비 더 움직인 정도(%p)", "out": "띠 밖 %", "up": "띠 위 %", "down": "띠 아래 %"}),
                     hide_index=True, width="stretch", height=300)
        st.caption("시장 대비 = 그날 200종목 공통 차이를 뺀 뒤 업종 평균. 음수면 시장보다 더 내렸거나 덜 올랐어요.")
    st.markdown("**가장 크게 빗나간 종목 (밤사이 국내 기사·공시는 복기용)**")
    nk, dart = data.news_kr(), data.dart_filings()
    lo, hi = data.overnight_window(pick)
    top = ms[ms.out].sort_values("dist", ascending=False).head(15)
    rows = []
    for _, r in top.iterrows():
        heads, nn = "", 0
        if nk is not None:
            a = nk[(nk.kind == "종목") & (nk.code == r.code) & (nk.pub_kst >= lo) & (nk.pub_kst <= hi)].sort_values("pub_kst")
            nn = len(a)
            heads = " | ".join(f"{p[11:]} {t_}" for p, t_ in zip(a.pub_kst.tail(2), a.title.tail(2)))
        dd = ""
        if dart is not None:
            q = dart[(dart.code == r.code) & (dart.rcept_dt >= lo[:10].replace("-", "")) & (dart.rcept_dt < pick)]
            dd = " | ".join(q.report_nm.str.strip().head(2))
        g = r.get("nxt_g")
        rows.append({"종목": r["name"], "업종": r.group, "예상": ui.pct(r.H), "노란띠": f"{ui.pct(r.L80)} ~ {ui.pct(r.U80)}", "실제": ui.pct(r.y),
                     "유형": r.type, "08:10 장전": "–" if pd.isna(g) else ui.pct(g) + (" (이미 띠 밖)" if not (r.L80 <= g <= r.U80) else ""),
                     "밤사이 기사": nn if nk is not None else "수집 중", "최근 제목": heads, "전날 공시": dd,
                     "미국 뉴스(증가/감소)": _us_cell(pick, r.code)})
    st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
    st.caption(f"밤사이 = {lo} ~ {hi}. 기사는 제목에 종목명이 나온 국내 기사 수예요(관련성 판정 아님). 공시는 접수 날짜만 있어 직전 거래일·주말 접수분을 보여요.")
    un, mac = data.us_news(), data.us_macro()
    with st.expander("그 밤 미국 뉴스 (관계표로 이어진 것 · 시장 전체)"):
        st.caption(data.US_NOTE)
        st.caption(data.news_record_line(pick))
        if un is not None and (un["T"] == pick).any():
            q = un[(un["T"] == pick) & (un.tier != data.SEG_TIER)].drop_duplicates("headline").sort_values("time")
            st.dataframe(q[["time", "tier", "effect", "us", "headline", "path"]].rename(columns={
                "time": "시각(KST)", "tier": "연결", "effect": "방향", "us": "미국 쪽", "headline": "제목", "path": "경로"}), hide_index=True, width="stretch")
        else:
            st.caption("이 날짜는 미국 뉴스 연결 전이에요(수집·판정 진행 중이거나 범위 밖).")
        if mac is not None and (mac["T"] == pick).any():
            st.markdown("**시장 전체(물가·연준·금리·선거·관세 등) 기사**")
            st.dataframe(mac[mac["T"] == pick][["time", "headline"]].rename(columns={"time": "시각(KST)", "headline": "제목"}), hide_index=True, width="stretch")


st.markdown("### 3. 하루 골라서 종목별로 보기")
_last = data.track_all()[0].dropna(subset=["y"])["T"].max()
st.caption(f"과거 재생 날짜부터 {data.short_label(_last)}까지 고를 수 있어요(매일 개장 직후 덧붙음). "
           "10/27 이후는 11/2에 고정한 코드로 그날 이전 자료만 써서 계산한 예상 시가·노란띠예요.")
day_detail()

fl = data.forward_log()
if fl is not None:
    st.markdown("**옛 규칙(10/27 고정) 매일 기록 — 지금 모델과 다른 규칙·다른 종목**")
    done = fl[fl.y.notna()]
    st.caption(f"10/28부터 매일 06:00에 자동 저장한 옛 규칙(F2 점 + 최근 오차 EWMA 폭) 기록이에요. 대상 16개 = 예시 계좌 15종목(ETF 1개 포함) + 코스피200 지수. "
               "지금 모델(H + 노란띠 S1 + 08:11 등급)과 규칙도 종목도 달라서 위 숫자와 섞지 않아요. "
               f"대조 끝난 {done['T'].nunique()}거래일 {len(done)}건 중 범위 안 {done.in80.mean()*100:.1f}%, 방향 일치 {done.dir_ok.mean()*100:.1f}%.")
    g = done.assign(T=done["T"].map(data.short_label)).groupby("T", sort=False).agg(n=("in80", "size"), k=("in80", "sum"), d=("dir_ok", "sum"), x=("x", "first"))
    st.dataframe(pd.DataFrame({
        "대상(매일 같은 16개)": g.n.astype(int).astype(str) + "개",
        "범위 안": [f"{int(k)}/{int(n)}개 ({k / n * 100:.0f}%)" for k, n in zip(g.k, g.n)],
        "방향 일치": [f"{int(d)}/{int(n)}개 ({d / n * 100:.0f}%)" for d, n in zip(g.d, g.n)],
        "야간선물": g.x.map(ui.pct)}, index=g.index).rename_axis("날짜"), width="stretch")
    st.caption("16은 결과와 상관없이 매일 채점한 대상 수예요(10/27에 미리 정한 예시 계좌 종목 + 지수). 범위 안에 든 것만 고른 숫자가 아니에요.")
