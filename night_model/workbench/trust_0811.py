"""봉인 카드 표시 규칙. 08:11 예상은 NXT 마지막 체결가의 전일 종가 대비 등락률이다.

07:30 예상과 노란띠는 별도로 보존한다. 방향 등급과 확률은 D08 카드 값을 사용한다.
"""
from __future__ import annotations

import math


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def trust(H, L80, U80, g):
    """NXT 관측치와 07:30 예상의 거리 구분. 고객의 방향 등급은 grade_0811.level이다."""
    H, L80, U80, g = map(_num, (H, L80, U80, g))
    if None in (H, L80, U80, g) or U80 <= L80:
        return None
    distance = abs(g - H) / ((U80 - L80) / 2)
    return "높음" if distance <= 0.5 else "보통" if distance <= 1 else "낮음"


def annotate(stock: dict) -> dict:
    """관측치가 없는 종목은 새 예상이 없다. 원본 카드에 기록한 07:30 값은 보존한다."""
    grade = stock.get("grade_0811") or {}
    g = _num(stock.get("nxt_g", grade.get("nxt_g")))
    low, high = stock["band80"]
    return dict(stock, t08=dict(trust=trust(stock["H"], low, high, g), dir=grade.get("level"),
                                Hb=g, band_adj=None, rule="NXT 08:10 마지막 체결가"))
