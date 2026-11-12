"""당신이 잠든 사이에 — 아침 브리핑 시연 앱.

실행: cd ~/4Digit/src/app && ~/4Digit/.venv/bin/streamlit run app.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import data, ui  # noqa: E402

st.set_page_config(page_title="당신이 잠든 사이에", page_icon="🌙", layout="wide")
ui.inject()

days = data.available_days()
if not days:
    st.error("자료가 없어요. README의 '자료 만들기'를 먼저 실행해 주세요.")
    st.stop()

DEFAULT_DAY = days[0]   # 11/12: 가장 최근 날(오늘 기록)부터 연다. 6/25 뉴스 묶음 날은 날짜 목록에서 고른다
BASE_NOTE = {"20260625": "마이크론 실적 밤 · 뉴스 연결", "20260608": "가장 크게 내린 밤"}
DAY_NOTE = {}
for d in days:
    src, tags = data.day(d).get("source") or {}, []
    if d in BASE_NOTE:
        tags.append(BASE_NOTE[d])
    seal = (src.get("sealed") or {}).get("0811") or {}
    if seal.get("before_open") and (src.get("kind") == "live" or src.get("same_as_sealed")):
        tags.append("장 전 봉인")
    elif seal.get("issued_at"):
        tags.append("개장 뒤 발행")
    if src.get("kind") == "forward":
        tags.append("확정 뒤 기록" if src.get("after_freeze") else "확정 전 기록")
    elif src.get("kind") == "live":
        tags.append("오늘 · 장 마감 전")
    if data.day(d)["card_0811"]["market"]["cautions"]:
        tags.append("월요일")
    if tags:
        DAY_NOTE[d] = " · ".join(tags)

s = st.session_state
s.setdefault("T", DEFAULT_DAY)
s.setdefault("slot", "0811")

with st.sidebar:
    st.markdown(ui.brand(), unsafe_allow_html=True)
    st.caption("시연 설정 · 실제 서비스에선 날짜·계좌가 자동으로 정해져요")
    st.selectbox("날짜", days, key="T", format_func=lambda d: data.day_label(d) + (f" · {DAY_NOTE[d]}" if d in DAY_NOTE else ""))
    names = data.account_names(s["T"])
    if s.get("account") not in names:
        s["account"] = names[0]
    st.selectbox("계좌(예시)", names, key="account")
    st.segmented_control("시각", ["0730", "0811", "0900"], key="slot",
                         format_func=lambda v: "09:00 개장 후" if v == "0900" else f"{v[:2]}:{v[2:]}")
    st.caption("07:30 예상 범위 → 08:11 장전 거래 반영 → 09:00 실제 시가와 비교")
    st.divider()
    n_sealed = sum(1 for d in days if "장 전 봉인" in DAY_NOTE.get(d, ""))
    late = [data.short_label(d) for d in sorted(days) if "개장 뒤 발행" in DAY_NOTE.get(d, "")]
    st.caption("10/27 이후 날짜는 11/2에 고정한 코드로 그날 이전 자료만 써서 계산한 기록, 그 전 날짜는 과거 재생이에요. "
               + (f"장 전에 봉인한 날은 {n_sealed}일이에요(날짜 옆 '장 전 봉인'). " if n_sealed else "장 전에 실제로 발행한 기록은 아직 없어요. ")
               + (f"평일 08:15 자동 봉인을 걸어 뒀지만 {', '.join(late)}은 맥이 잠들어 개장 뒤에 발행됐어요. " if late else "")
               + "매매 권유가 아니에요.")

pages = [
    st.Page("views/briefing.py", title="아침 브리핑", icon="🌙", default=True),
    st.Page("views/night.py", title="밤사이 흐름", icon="📈"),
    st.Page("views/news.py", title="새 소식", icon="📰"),
    st.Page("views/relations.py", title="관계표", icon="🕸️"),
    st.Page("views/track.py", title="예측 vs 실제", icon="🎯"),
    st.Page("views/model.py", title="모델 한눈에", icon="🧮"),
    st.Page("views/status.py", title="데이터 연결", icon="🔌"),
]
st.navigation(pages, position="top").run()
