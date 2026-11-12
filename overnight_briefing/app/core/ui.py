"""화면 공통 부품: 색, 숫자 표기, 노란띠 막대, 등급 칩, 휴대폰 틀."""
from __future__ import annotations

import html

import streamlit as st

UP, DOWN, FLAT = "#d63b3b", "#2f6fdb", "#5b6472"   # 국내 증권앱 관례: 상승 빨강, 하락 파랑
BAND, BAND_EDGE = "#f6d36b", "#e2b53c"
INK, SUB, LINE, PAPER = "#1b2333", "#5f6b7d", "#e3e7ee", "#ffffff"

MOON = ('<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">'
        '<circle cx="16" cy="16" r="15" fill="#1d2b4f"/>'
        '<path d="M20.5 7.5a9.5 9.5 0 1 0 4 15.8 8 8 0 1 1-4-15.8z" fill="#f6d36b"/>'
        '<circle cx="9" cy="10" r="1" fill="#f6d36b" opacity=".7"/><circle cx="12" cy="6.5" r=".7" fill="#f6d36b" opacity=".6"/></svg>')

CSS = f"""
<style>
.stApp {{ background:#f4f6f9; }}
.block-container {{ padding-top: 3.2rem; padding-bottom: 3rem; }}
#MainMenu, footer {{ visibility:hidden; }}
.brand {{ display:flex; align-items:center; gap:9px; color:{INK}; }}
.brand b {{ font-size:18px; letter-spacing:-.4px; }}
.brand span {{ font-size:12.5px; color:{SUB}; margin-left:auto; }}
.st-key-phone {{ max-width: 430px; margin: 0 auto; background:{PAPER}; border:1px solid {LINE};
  border-radius: 26px; padding: 18px 16px 26px; box-shadow: 0 10px 30px rgba(20,30,60,.08); }}
.card {{ background:{PAPER}; border:1px solid {LINE}; border-radius:14px; padding:14px 14px 12px; margin:10px 0; color:{INK}; }}
.card h4 {{ margin:0 0 6px; font-size:14.5px; color:{SUB}; font-weight:600; letter-spacing:-.2px; }}
.big {{ font-size:26px; font-weight:700; letter-spacing:-.6px; line-height:1.25; }}
.mid {{ font-size:17px; font-weight:650; letter-spacing:-.3px; }}
.sub {{ font-size:12.5px; color:{SUB}; line-height:1.55; }}
.tiny {{ font-size:11.5px; color:{SUB}; line-height:1.5; }}
.up {{ color:{UP}; }} .down {{ color:{DOWN}; }} .flat {{ color:{FLAT}; }}
.chip {{ display:inline-block; font-size:11.5px; padding:2px 8px; border-radius:999px; border:1px solid {LINE};
  color:{INK}; background:#f7f8fa; margin-right:4px; white-space:nowrap; }}
.chip.hi {{ background:#e8f4ec; border-color:#bfe0c9; color:#1f6b3a; }}
.chip.mid {{ background:#f3f4f6; border-color:#dde1e7; color:#4a5363; }}
.chip.lo {{ background:#fdf0e3; border-color:#f3d2ae; color:#9a5310; }}
.chip.new {{ background:#eef3ff; border-color:#cfdcfb; color:#244aa5; }}
.chip.follow {{ background:#f3f4f6; color:#4a5363; }}
.notice {{ border-radius:12px; padding:10px 12px; margin:10px 0; font-size:13px; line-height:1.55; }}
.notice.warn {{ background:#fff7e6; border:1px solid #f3dca6; color:#6b4a06; }}
.notice.info {{ background:#f1f5fb; border:1px solid #d9e3f2; color:#29405f; }}
.caution {{ font-size:12px; color:#8a5a00; background:#fff8e8; border-radius:8px; padding:6px 8px; margin-top:6px; line-height:1.5; }}
.stock {{ border-top:1px solid {LINE}; padding:12px 2px 10px; }}
.stock:first-of-type {{ border-top:0; }}
.row {{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; }}
.name {{ font-weight:650; font-size:15px; color:{INK}; }}
.topic {{ border-top:1px solid {LINE}; padding:10px 0; }}
.topic:first-of-type {{ border-top:0; }}
.time {{ font-variant-numeric: tabular-nums; color:{SUB}; font-size:12px; }}
.legend {{ display:flex; gap:12px; flex-wrap:wrap; font-size:11.5px; color:{SUB}; margin-top:4px; }}
.legend i {{ display:inline-block; width:12px; height:8px; border-radius:2px; margin-right:4px; vertical-align:middle; }}
.stack {{ display:flex; height:10px; border-radius:6px; overflow:hidden; background:#eef0f4; margin:6px 0 4px; }}
.flow {{ display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; font-size:12.5px; color:{INK}; margin-top:6px; }}
.flow span:nth-child(even) {{ color:#9aa3b2; }}
.wide-note {{ font-size:13px; color:{SUB}; }}
</style>
"""


def inject() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def brand(right: str = "") -> str:
    return f'<div class="brand">{MOON}<b>당신이 잠든 사이에</b><span>{html.escape(right)}</span></div>'


def tone(v: float | None) -> str:
    if v is None or v != v:
        return "flat"
    return "up" if v > 0 else "down" if v < 0 else "flat"


def pct(v: float | None, digits: int = 1, sign: bool = True) -> str:
    if v is None or v != v:
        return "–"
    return f"{v*100:+.{digits}f}%" if sign else f"{v*100:.{digits}f}%"


def won(v: float | None, sign: bool = True) -> str:
    if v is None or v != v:
        return "–"
    s = f"{abs(v):,.0f}원"
    if not sign:
        return s
    return ("+" if v > 0 else "−" if v < 0 else "") + s


def man(v: float | None, sign: bool = True) -> str:
    """금액을 만원 단위로 짧게(화면 요약용)."""
    if v is None or v != v:
        return "–"
    a = abs(v) / 10_000
    s = f"{a:,.0f}만원" if a >= 100 else f"{a:,.1f}만원"
    if not sign:
        return s
    return ("+" if v > 0 else "−" if v < 0 else "") + s


def band_bar(lo: float, hi: float, point: float, actual: float | None = None, span: float | None = None,
             lo90: float | None = None, hi90: float | None = None, height: int = 34) -> str:
    """0을 가운데 두고 노란띠(80%)와 점 추정(◆), 개장 뒤 실제 시가(●)를 그린다. 값은 수익률(소수)."""
    vals = [abs(v) for v in (lo, hi, point, actual, lo90, hi90) if v is not None and v == v]
    m = span or max(vals + [0.01]) * 1.15
    W, H, pad = 300, height, 8

    def X(v: float) -> float:
        return pad + (v + m) / (2 * m) * (W - 2 * pad)
    parts = [f'<svg viewBox="0 0 {W} {H}" width="100%" height="{H}" role="img" aria-label="예상 범위 그림">',
             f'<line x1="{pad}" y1="{H/2}" x2="{W-pad}" y2="{H/2}" stroke="{LINE}" stroke-width="2"/>']
    if lo90 is not None and hi90 is not None:
        parts.append(f'<rect x="{X(lo90):.1f}" y="{H/2-5}" width="{X(hi90)-X(lo90):.1f}" height="10" rx="5" fill="{BAND}" opacity=".35"/>')
    parts.append(f'<rect x="{X(lo):.1f}" y="{H/2-7}" width="{max(X(hi)-X(lo), 2):.1f}" height="14" rx="7" fill="{BAND}" stroke="{BAND_EDGE}"/>')
    parts.append(f'<line x1="{X(0):.1f}" y1="3" x2="{X(0):.1f}" y2="{H-3}" stroke="#9aa3b2" stroke-width="1" stroke-dasharray="2 2"/>')
    px = X(point)
    parts.append(f'<path d="M{px:.1f} {H/2-6} L{px+5:.1f} {H/2} L{px:.1f} {H/2+6} L{px-5:.1f} {H/2} Z" fill="{INK}"/>')
    if actual is not None and actual == actual:
        inside = lo <= actual <= hi
        parts.append(f'<circle cx="{X(actual):.1f}" cy="{H/2}" r="5" fill="{"#1f8a4c" if inside else UP}" stroke="#fff" stroke-width="1.5"/>')
    parts.append("</svg>")
    return "".join(parts)


GRADE_CLASS = {"높음": "hi", "보통": "mid", "낮음": "lo"}


def grade_chip(level: str | None, p: float | None) -> str:
    if not level:
        return '<span class="chip">08:11에 확인</span>'
    pp = "" if p is None else (" · 99% 이상" if p >= 0.995 else f" · {p*100:.0f}%")
    return f'<span class="chip {GRADE_CLASS.get(level, "")}">방향 믿을 정도 {level}{pp}</span>'


def kpi(col, label: str, value: str, note: str = "", value_class: str = "") -> None:
    """화살표 없는 지표 칸(st.metric의 증감 화살표가 뜻 없이 붙는 것을 피한다)."""
    col.markdown(f'<div class="card" style="margin:4px 0"><div class="sub">{html.escape(label)}</div>'
                 f'<div class="big {value_class}">{html.escape(value)}</div><div class="tiny">{html.escape(note)}</div></div>',
                 unsafe_allow_html=True)


def legend() -> str:
    return (f'<div class="legend"><span><i style="background:{BAND};border:1px solid {BAND_EDGE}"></i>예상 범위(과거 10번 중 8번이 이 안)</span>'
            f'<span>◆ 예상 시가</span><span><i style="background:#1f8a4c;border-radius:50%;width:9px;height:9px"></i>실제 시가(개장 뒤)</span></div>')
