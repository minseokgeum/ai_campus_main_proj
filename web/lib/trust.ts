// 08:11 '방향 유지 등급'(장전 거래 방향이 시가까지 이어질 가능성) 글자를 만든다. 등급·확률은 서버 08:11 카드 값을 그대로 쓴다.
export type DirectionGrade = "높음" | "보통" | "낮음";

/** 등급은 카드가 보관한 D08 등급, 괄호는 해당 종목·날짜의 모델 추정 확률. */
export function gradeText(grade: DirectionGrade | null, probability: number | null, nxt: number | null, after0811: boolean): string {
  if (!after0811) return "방향 유지 등급 · 08:11 공개";
  if (nxt == null) return "장전 가격 미확인 · 방향 등급 없음";
  if (nxt === 0) return "장전 보합 · 방향 등급 없음";
  if (!grade) return "방향 유지 등급 미산출";
  const label = `장전 방향 유지 · ${grade}`;
  if (probability == null || !Number.isFinite(probability) || probability < 0 || probability > 1) return label;
  // 등급을 매긴 뒤 확률을 소수 세 자리로 저장하므로 문턱 바로 아래의 값도 0.750 또는 0.900으로 남을 수 있다.
  const percent = (probability * 100).toFixed(1);
  if (grade === "낮음" && percent === "75.0") return `${label} (75% 미만)`;
  if (grade === "보통" && percent === "90.0") return `${label} (90% 미만)`;
  if (percent === "100.0") return `${label} (99.9% 이상)`;
  return `${label} (${percent}%)`;
}
