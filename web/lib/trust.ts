// 08:11 해석 규칙(E107, 2026-11-23 확정). 정본은 overnight_briefing/model/workbench/trust_0811.py — 숫자를 바꾸면 두 곳을 같이 바꾼다.
// 봉인한 07:30 카드 값(h, l80, u80)과 08:10 장전 거래 갭(nxtG)만으로 계산한다. 모델 파일은 바꾸지 않는다.
//  · 07:30 예상과의 거리(gap, 11/24부터 화면은 '07:30 예상과 크게 달라짐' 표시에만 씀): z = (g − h) ÷ 반폭
//    |z| ≤ 0.5 높음(가까움) · ≤ 1 보통 · > 1 낮음(크게 달라짐). 시가가 07:30 범위 안에서 열린 비율(규칙 고정 뒤 15거래일): 90.4% · 78.0% · 28.2%, 거래 없음 75.1%
//  · 화면의 '믿을 정도'는 카드의 방향 등급(D08: 8시 흐름이 9시 시가까지 이어질 가능성)이다. 11/24 나은 결정
//  · 08:11 보정 예상 시가: h + 0.9(g − h) · 보정 범위: 보정 예상 ± 0.632 × 07:30 반폭(확인 기간 포함률 81.0%, 폭 4.94 → 3.12%p)
export type Trust = "높음" | "보통" | "낮음";
export const T08 = { cuts: [0.5, 1.0] as const, w: 0.9, k: 0.632 };

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export function trustOf(h: number, l80: number, u80: number, g: number | null): Trust | null {
  if (!ok(h) || !ok(l80) || !ok(u80) || !ok(g) || u80 <= l80) return null;
  const z = Math.abs(g - h) / ((u80 - l80) / 2);
  return z <= T08.cuts[0] ? "높음" : z <= T08.cuts[1] ? "보통" : "낮음";
}

/** 08:11 보정 예상 시가와 보정 범위. 장전 거래가 없으면 null(07:30 값을 그대로 쓴다) */
export function adjustOf(h: number, l80: number, u80: number, g: number | null): { hb: number; lb: number; ub: number } | null {
  if (!ok(h) || !ok(l80) || !ok(u80) || !ok(g) || u80 <= l80) return null;
  const hb = h + T08.w * (g - h), hw = (T08.k * (u80 - l80)) / 2;
  return { hb, lb: hb - hw, ub: hb + hw };
}
