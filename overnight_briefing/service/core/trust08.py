"""장전 마지막 체결가를 08:11 예상으로 표시한다. 노란띠는 07:30 기준으로 유지한다."""
import math


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def t08(H, L80, U80, g):
    """장전 관측치와 07:30 예상의 거리. 등급·범위 결측과 무관하게 유효한 관측치를 표시한다."""
    g = _num(g)
    if g is None:
        return None
    H, L80, U80 = map(_num, (H, L80, U80))
    distance = None
    if None not in (H, L80, U80) and U80 > L80:
        z = abs(g - H) / ((U80 - L80) / 2)
        distance = "높음" if z <= 0.5 else "보통" if z <= 1 else "낮음"
    return dict(trust=distance, Hb=g, adj=None)
