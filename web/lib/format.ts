// 화면 글자 만들기(피그마 '규칙·전달': 백엔드는 숫자 원본, 표시 글자는 프론트에서 만든다).

const KST = "Asia/Seoul";
const MINUS = "−"; // 마이너스는 '−' 기호

/** 퍼센트 숫자(1.15 형식) → "+1.15%", "−6.18%", "0.00%" */
export function pct(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (r === 0) return "0.00%";
  return `${r > 0 ? "+" : MINUS}${Math.abs(r).toFixed(2)}%`;
}

/** 원 단위 정수 → "1,234,000원" (줄임 없음) */
export function won(v: number): string {
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}

/** 부호 붙은 원 → "+139,866원", "−7,120원" */
export function swon(v: number): string {
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(r).toLocaleString("ko-KR")}원`;
}

/** 오름 빨강 · 내림 파랑 · 0 회색 */
export function tone(v: number): "up" | "down" | "flat" {
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}

/** ISO 시각 → 한국 시각 "05:48" */
export function kstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** "2026-11-20" → "11월 20일 (금)" (요일은 화면에서 계산) */
export function dateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const md = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric" }).format(d);
  const wd = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, weekday: "short" }).format(d);
  return `${md} (${wd})`;
}

/** AI 영향 판정 표시(긍정·부정·중립) */
export const IMPACT_LABEL: Record<string, [string, "pos" | "neg" | "neu"]> = {
  positive: ["긍정", "pos"], negative: ["부정", "neg"], neutral: ["중립", "neu"], mixed: ["엇갈림", "neu"],
};
