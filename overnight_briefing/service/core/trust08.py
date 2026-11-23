"""08:11 해석 규칙(E107) — 정본은 overnight_briefing/model/workbench/trust_0811.py. 서비스는 따로 배포되어 같은 식을 여기 둔다.
숫자를 바꾸면 정본과 web/lib/trust.ts를 함께 바꾼다(tests/smoke_front.py가 정본과 같은지 확인)."""
import math

CUTS, W, K = (0.5, 1.0), 0.9, 0.632


def t08(H, L80, U80, g):
    """07:30 예상 믿을 정도(trust)·08:11 보정 예상(Hb)·보정 범위(adj). 장전 거래(g)가 없으면 None."""
    try:
        H, L80, U80, g = float(H), float(L80), float(U80), float(g)
    except (TypeError, ValueError):
        return None
    if not all(map(math.isfinite, (H, L80, U80, g))) or U80 <= L80:
        return None
    hw = (U80 - L80) / 2
    z = abs(g - H) / hw
    hb = H + W * (g - H)
    return dict(trust="높음" if z <= CUTS[0] else "보통" if z <= CUTS[1] else "낮음", Hb=round(hb, 6), adj=[round(hb - K * hw, 6), round(hb + K * hw, 6)])
