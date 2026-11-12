"""데이터 연결: 화면의 각 숫자가 어디서 오는지, 운영으로 갈 때 무엇이 바뀌는지."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from core import data, ui

st.markdown(ui.brand("데이터 연결 상태"), unsafe_allow_html=True)
st.subheader("화면 숫자의 출처와 운영 연결")
st.caption("앱은 아래 파일만 읽어요. 모델 계산·수집은 따로 돌고, 같은 형식의 파일을 남기면 화면이 그대로 바뀌어요.")

rows = [
    ("예상 시가·노란띠·주의 문구", "morning_card.build_card → data/model/days/<날짜>.json", "과거 재생", "live_refresh.py(KIS) → morning_card.py --root … --slot 0730/0811 → 같은 JSON", "실제 수신 0회(L1 새 날짜 미정)"),
    ("08:11 방향 믿을 정도", "같은 카드의 grade_0811(D08)", "과거 재생", "08:10 NXT 수신 뒤 --slot 0811", "실시간 봉 의미 확인 필요(CON-05)"),
    ("계좌 예상 금액", "수량 × 전일 종가 × 예상 시가", "예시 계좌 5개", "마이데이터 잔고 연동(가정)", "평단가 기준 손익은 아직 없음"),
    ("계좌 전체 범위", "AS1 후보, build_model_data.py", "연구 중 표시", "검증 기준 통과 뒤 교체", "조용한 밤 기준 미달"),
    ("밤사이 차트", "KIS 과거 1분봉 → data/night/<날짜>.csv", "실제 과거 자료", "야간장 중 1분 단위 수집", "2025-10-16 밤부터 보관"),
    ("새 소식·연결 근거·AI 요약", "단독 검증판 재생 실행 → data/news/<날짜>.json", "6/25 하루만", "팀 RSS 수집(20개 매체·38개 피드) → 사건 묶음 → 관계 DB → 카드 문장", "관계 DB·사건 묶음 자동화 미구현"),
    ("예측 vs 실제", "track_*.csv (과거 재생) + results/forward_log.csv", "재생 + 실제 기록", "매일 개장 뒤 check_open.py로 대조해 누적", "실제 기록은 이전 규칙"),
]
st.dataframe(pd.DataFrame(rows, columns=["화면 요소", "지금 읽는 곳", "지금 상태", "운영 때 경로", "남은 일"]), hide_index=True, width="stretch")

st.markdown("#### 운영으로 가는 순서")
st.markdown(
    "1. **장 전 수집**: 06:00 야간선물 마감 뒤 `live_refresh.py`가 끝난 장 자료만 받아 실제 날짜 폴더를 만든다.\n"
    "2. **카드 발행**: `morning_card.py --root <폴더> --slot 0730`(07:30), 08:10 NXT 뒤 `--slot 0811`. 덮어쓰지 않고 시각별로 저장.\n"
    "3. **뉴스**: RSS 저장소(`combined_rss.sqlite3`)의 새 기사 → 주제 묶음(최초·후속 시각) → 관계 DB로 내 종목 연결 → 숫자 검사를 통과한 문장만.\n"
    "4. **앱**: 이 화면은 2·3의 파일만 읽는다. 날짜 목록에 새 파일이 보이면 끝.\n"
    "5. **대조**: 09:00 개장 뒤 실제 시가를 따로 붙여 ‘예측 vs 실제’에 누적.")

m = data.manifest()
with st.expander("이번 자료를 만든 기록"):
    st.json(m)
st.caption("다시 만들기: research/overnight_backtest에서 `.venv/bin/python ~/4Digit/src/app/pipeline/build_model_data.py`, "
           "이어서 `~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_night_news.py`.")
