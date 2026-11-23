"""08:11 해석 규칙(E107, 2026-11-23 확정) — 봉인한 07:30·08:11 카드 값만으로 계산한다. 모델 파일(morning_card.py·e62_band.py)은 고치지 않는다.

입력(카드에 이미 있음): H(07:30 예상 시가 갭), [L80, U80](07:30 노란띠), g(NXT 08:00~08:10 마지막 체결가의 전일 종가 대비 갭, grade_0811.nxt_g).

1) 믿을 정도(= 07:30 예상 믿을 정도): 08:10 개장 전 가격이 07:30 노란띠의 어디에 있나.
   z = (g − H) ÷ 반폭, 반폭 = (U80 − L80) ÷ 2
   |z| ≤ 0.5 → 높음(띠 가운데) · 0.5 < |z| ≤ 1 → 보통(띠 가장자리) · |z| > 1 → 낮음(띠 밖 = '범위 밖') · g 없음 → None(개장 전 거래 없음)
   시가가 07:30 노란띠 안에서 열린 비율(설계 = 과거 재생 215거래일 / 확인 = 규칙 고정 뒤 14거래일):
   높음 93.7% / 91.3% · 보통 78.3% / 80.6% · 낮음 34.3% / 28.3% · 거래 없음 79.6% / 76.8%
2) 08:11 보정 예상 시가: Hb = H + W × (g − H). W = 0.9(설계 자료에서 평균 절대오차가 가장 작은 값, 0~1.2를 0.05 간격으로)
   시가 오차(평균 절대, %p): 설계 1.511 → 0.894 · 확인 1.534 → 0.884
3) 08:11 보정 범위: Hb ± K × 반폭. K = 0.632(설계 자료에서 |시가 − Hb| ÷ 반폭의 80% 분위)
   확인 기간 포함률 81.0%(07:30 띠 79.1%), 평균 폭 3.12%p(07:30 띠 4.94%p). 띠 밖 종목은 28.3% → 72.6%
   한계: 08:10 뒤 크게 되돌린 날(11/23)은 좁은 보정 범위가 더 놓쳤다(포함률 69.2% → 60.9%).
4) 방향 유지(예전 화면 이름 '믿을 정도', 설계서 D08): grade_0811.level 그대로. 08:10 가격의 방향(오름·내림)대로 시가가 열릴 가능성.

등급 경계 0.5·1.0은 결과를 보기 전에 정한 값이고, W·K는 과거 재생 자료로만 정했다. 11/24부터 매일 채점은
research/overnight_backtest/workbench/e_trust0811.py(로컬)로 같은 규칙을 다시 계산한다. 화면(TS) 쪽 같은 계산: web/lib/trust.ts, service/core/bundle.py.
"""
from __future__ import annotations

import math

CUTS = (0.5, 1.0)   # |z| 경계: 높음 ≤ 0.5 < 보통 ≤ 1.0 < 낮음
W = 0.9             # 보정 예상 시가: H + W(g − H)
K = 0.632           # 보정 범위 반폭 = K × 07:30 반폭


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def trust(H, L80, U80, g):
    """07:30 예상 믿을 정도: '높음' | '보통' | '낮음' | None(개장 전 거래 없음·계산 불가)."""
    H, L80, U80, g = map(_num, (H, L80, U80, g))
    if None in (H, L80, U80, g) or U80 <= L80:
        return None
    z = abs(g - H) / ((U80 - L80) / 2)
    return "높음" if z <= CUTS[0] else "보통" if z <= CUTS[1] else "낮음"


def adjust(H, L80, U80, g):
    """08:11 보정 예상 시가와 보정 범위(Hb, Lb, Ub). g가 없으면 07:30 값 그대로."""
    H, L80, U80, g = map(_num, (H, L80, U80, g))
    if None in (H, L80, U80):
        return None
    if g is None or U80 <= L80:
        return H, L80, U80
    hb = H + W * (g - H)
    hw = K * (U80 - L80) / 2
    return hb, hb - hw, hb + hw


def annotate(stock: dict) -> dict:
    """카드 종목 한 줄(morning_card 형식)에 t08 칸을 붙인 사본을 돌려준다. 원본 카드는 바꾸지 않는다."""
    g = (stock.get("grade_0811") or {}).get("nxt_g")
    L80, U80 = stock["band80"]
    adj = adjust(stock["H"], L80, U80, g)
    out = dict(stock)
    out["t08"] = dict(trust=trust(stock["H"], L80, U80, g), dir=(stock.get("grade_0811") or {}).get("level"),
                      Hb=None if adj is None else adj[0], band_adj=None if adj is None else [adj[1], adj[2]],
                      rule="E107 trust_0811 v1(2026-11-23)")
    return out


if __name__ == "__main__":
    # 간단 확인: 띠 [-2%, 2%], H 0
    assert trust(0, -.02, .02, .005) == "높음" and trust(0, -.02, .02, .015) == "보통" and trust(0, -.02, .02, .03) == "낮음"
    assert trust(0, -.02, .02, None) is None
    hb, lb, ub = adjust(0, -.02, .02, .03)
    assert abs(hb - .027) < 1e-12 and abs((ub - lb) / 2 - .632 * .02) < 1e-12
    print("ok")
