"""모델 한눈에: 어떤 회귀를 쓰고 어떻게 검증했는지 결론만."""
from __future__ import annotations

import streamlit as st

from core import data, ui

man = data.manifest()
split = man.get("split_T", "20260731")
st.markdown(ui.brand("모델 한눈에"), unsafe_allow_html=True)
st.subheader("밤사이 숫자가 아침 화면이 되기까지")

steps = st.columns(4)
for col, (t, head, body) in zip(steps, [
        ("06:00", "예상 시가", "종목마다 ‘야간선물이 1% 움직인 밤, 이 종목 시가는 몇 % 움직였나’를 지난 1년으로 회귀해 오늘 밤에 적용"),
        ("07:30", "예상 범위(노란띠)", "같은 방식으로 과거에 얼마나 빗나갔는지를 밤의 크기별로 재서, 10번 중 8번 들어오는 폭을 그림"),
        ("08:11", "방향 믿을 정도", "08:10 장전 거래(NXT) 방향이 시가 방향과 같을 가능성을 높음·보통·낮음으로"),
        ("09:00", "개장 뒤 대조", "실제 시가와 따로 비교해 누적 기록으로 남김")]):
    col.markdown(f'<div class="card"><div class="tiny">{t}</div><div class="mid">{head}</div><div class="sub" style="margin-top:6px">{body}</div></div>',
                 unsafe_allow_html=True)

st.markdown("#### 1. 예상 시가: 종목별 단순 회귀 두 가지 중 하나")
st.latex(r"x=\frac{\text{야간선물 06:00}}{\text{전일 주간 종가(15:45)}}-1,\qquad y=\frac{\text{오늘 시가}}{\text{어제 종가}}-1")
st.latex(r"\text{관계가 약하면}(R^2<0.3)\;\; \hat y=\hat a+\hat b\,x \qquad\text{관계가 뚜렷하면}\;\; \hat y=\tfrac{\hat\beta_0+1}{2}\,x")
st.markdown("- 종목마다 최근 유효한 250거래일(최소 120일)로 다시 맞춰요. 왼쪽은 보통 회귀(절편 포함), 오른쪽은 절편 없는 기울기 β₀를 1 쪽으로 반만 당긴 식이에요.\n"
            "- 반만 당기는 이유: 과거 기울기를 그대로 쓰는 것보다 ‘시장과 같이 움직인다(1)’와 ‘이 종목의 과거’를 반반 섞은 쪽이 과거 시험에서 덜 빗나갔어요.\n"
            "- 종목마다 추정하는 값은 기울기(와 절편)뿐이고, 둘 중 고르는 기준 R² 0.3은 모든 종목 공통이에요. 큰 모델보다 설명할 수 있는 쪽을 택했어요.")

st.markdown("#### 2. 예상 범위: 밤이 클수록 넓게")
st.latex(r"\text{범위}=\hat y \pm q_{0.8}\cdot \hat s(|x|),\qquad \log\frac{|y-\hat y|}{s_{\text{평소}}}\sim |x| \;(\text{튀는 값에 덜 끌리는 Huber 회귀})")
st.markdown("- 폭은 ‘평소 빗나간 정도 × 밤 크기에 따른 배수’예요. 최근 20거래일로 실제 들어온 비율을 맞춰 80%·90% 폭을 정해요.\n"
            "- 확률이 아니라 **과거 비슷한 아침 10번 중 8번이 들어온 폭**이에요.")

st.markdown("#### 3. 방향 믿을 정도: 장전 거래를 본 로지스틱")
st.latex(r"P(\text{장전 거래 방향}=\text{시가 방향})=\sigma(b_0+b_1|g|+b_2\log s+b_3R^2)")
st.markdown("- g는 08:10 NXT 가격의 전일 종가 대비 변화, s는 평소 변동, R²는 1번 회귀의 설명력이에요. 0.90 이상 높음, 0.75~0.90 보통, 그 아래 낮음.")

st.markdown("#### 4. 결과")
fw = data.forward_record()
if fw:
    af = fw[0].get("after_freeze", {})
    hi = af.get("dir_높음") or {}
    cc = st.columns(4)
    ui.kpi(cc[0], "규칙 확정 뒤 노란띠 안", f"{af.get('in80', 0):.1f}%", f"목표 80% · {af.get('days', 0)}거래일(11/3~)")
    ui.kpi(cc[1], "확정 뒤 예상 시가 오차", f"{af.get('mae_H', 0):.2f}%p", f"야간선물 그대로면 {af.get('mae_x', 0):.2f}%p")
    ui.kpi(cc[2], "확정 뒤 ‘높음’ 방향 일치", f"{hi.get('rate', 0):.1f}%", f"{hi.get('n', 0)}건")
    ui.kpi(cc[3], "전방 기록", f"{af.get('days', 0)}거래일", "매일 덧붙임" + (" · 오늘은 개장 직후 임시" if fw[0].get("prov_days") else ""))
    st.caption("규칙 확정(11/2 15:17) 뒤 처음 보는 날의 기록이 진짜 검증이에요. 아래는 규칙을 정할 때 이미 본 기간의 재생이라 참고용이에요.")
sg = data.signals_record()
if sg:
    so, w = sg["replay"]["stock"]["nxt_out"], sg["replay"]["warned"]
    st.markdown("##### 빗나감을 미리 알 수 있었나 (장 전 경고)")
    c = st.columns(3)
    ui.kpi(c[0], "08:10 장전 거래가 이미 띠 밖", f"{so['cov_on']:.0f}% 띠 안", f"나머지 종목 {so['cov_off']:.0f}% · 1년 재생")
    ui.kpi(c[1], "빗나간 종목 중 미리 경고", f"{w['warned_any']:.0f}%", f"경고는 전체 종목·날의 {w['base_any']:.0f}%에만 켜짐")
    fw_ = sg["forward"]["warned"]
    ui.kpi(c[2], "10/27 이후 10일", f"{fw_['warned_any']:.0f}%", f"경고 켜짐 {fw_['cov_warned']:.0f}% vs 꺼짐 {fw_['cov_unwarned']:.0f}% 띠 안")
    st.caption("경고 = 월요일·휴장 뒤, 전날 실적 공시, 08:10 장전 거래가 이미 띠 밖. 큰 밤·최근 변동·어제 빗나감·VIX·환율·미국 지표 발표 아침·만기일은 "
               "띠가 이미 밤 크기만큼 넓어져 있어 빗나감을 가려내지 못했어요. 06~08시 미국 선물 급변은 약한 후보예요.")
st.markdown("##### 참고: 과거 재생(8월 이후, 규칙 선택에 이미 본 기간)")
s = data.track_stocks()
s = s[(s["T"] > split) & s.y.notna()].merge(data.track_days()[["T", "x"]], on="T")
g = s[s.grade.notna() & s.nxt_dir_match.notna()]
c = st.columns(4)
ui.kpi(c[0], "범위 안에 든 비율", f"{s.in80.astype(bool).mean()*100:.1f}%", "목표 80%")
ui.kpi(c[1], "예상 시가 평균 오차", f"{(s.y-s.H).abs().mean()*100:.2f}%p", f"야간선물 등락률을 그대로 쓰면 {(s.y-s.x).abs().mean()*100:.2f}%p")
ui.kpi(c[2], "‘높음’ 방향 일치", f"{g[g.grade=='높음'].nxt_dir_match.astype(bool).mean()*100:.1f}%", f"{(g.grade=='높음').sum():,}건")
ui.kpi(c[3], "재생 기간", f"{s['T'].nunique()}거래일", f"{s.code.nunique()}종목")
st.caption(f"{split[:4]}-{split[4:6]}-{split[6:]} 이후를 그날 이전 자료만으로 다시 계산한 결과예요. 이 기간도 규칙을 정할 때 이미 봤기 때문에 처음 보는 검증이 아니에요. "
           "자세한 누적 기록은 ‘예측 vs 실제’에 있어요.")

st.markdown("#### 5. 아직 하지 않은 것")
st.markdown("- **계좌 전체 범위**: 후보들이 조용한 밤 기준(75%)을 넘지 못해 화면에선 ‘연구 중’으로만 보여요.\n"
            "- **뉴스의 숫자 효과**: 뉴스는 지금 ‘무슨 일·누구와 연결·같은 시간 시장 반응’까지만 보여 주고, 예상 시가에 더하지 않아요.\n"
            "- **실시간 수신**: 10/27 이후 날짜는 끝난 장 자료로 사후 계산한 기록이에요. 장 전 실제 수신·발행은 아직 한 번도 하지 않았어요.\n"
            "- **대상**: 지금 200종목(코스피 150 + 코스닥 50, 시가총액 기준). 거래 적은 종목 경고 규칙을 먼저 정한 뒤 넓혀요.")
