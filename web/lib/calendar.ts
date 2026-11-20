// 날짜 규칙(한국 시각): 주말, 미국 휴장일, 07:30 공개 시각. KRX 휴장일은 서버 모델이 KIS 휴장일 조회로 카드에 'holiday'로 남긴다.

const KST = "Asia/Seoul";

/** NYSE 휴장일(미국 날짜). 2026·2027 공식 일정 */
const NYSE_HOLIDAYS = new Set([
  "20260101", "20260119", "20260216", "20260403", "20260525", "20260619", "20260703", "20260907", "20261126", "20261225",
  "20270101", "20270118", "20270215", "20270326", "20270531", "20270618", "20270705", "20270906", "20271125", "20271224",
]);

export function kstNow(now: Date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}${p.month}${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

const toDate = (t: string) => new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T12:00:00Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
export const addDays = (t: string, n: number) => toYmd(new Date(toDate(t).getTime() + n * 86400000));
export const weekday = (t: string) => toDate(t).getUTCDay(); // 0 일 ~ 6 토
export const isWeekend = (t: string) => weekday(t) === 0 || weekday(t) === 6;

/** 다음 평일 */
export function nextWeekday(t: string) {
  let d = addDays(t, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** 한국 아침 T 직전의 미국 정규장 날짜(그 전 평일)가 미국 휴장일이었나 */
export function usClosedBefore(t: string) {
  let d = addDays(t, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return NYSE_HOLIDAYS.has(d) ? d : null;
}

/** 전날 거래일 D와 오늘 T 사이에 주말이 아닌 쉬는 날이 끼어 있나(연휴 다음 날) */
export function holidayGap(d: string | null, t: string) {
  if (!d) return false;
  for (let x = addDays(d, 1); x < t; x = addDays(x, 1)) if (!isWeekend(x)) return true;
  return false;
}

/** T의 07:30(한국)까지 남은 분. 지났으면 0 */
export function minutesTo0730(t: string, now: Date = new Date()) {
  const target = new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T07:30:00+09:00`).getTime();
  return Math.max(0, Math.ceil((target - now.getTime()) / 60000));
}

/** 한국 증시가 쉬는 평일(2026). [종류, 이름]: 공휴일은 관공서 공휴일, 휴장은 공휴일이 아닌데 증시만 쉬는 날.
 *  기사(아시아경제 2025-12-18, 비즈워치 2026-05-20)와 Investing.com 휴장일 달력으로 확인. 추석 대체공휴일(9/28)은 확정되지 않아 넣지 않음. */
export const KRX_CLOSED: Record<string, ["공휴일" | "휴장", string]> = {
  "20260101": ["공휴일", "신정"], "20260216": ["공휴일", "설날"], "20260217": ["공휴일", "설날"], "20260218": ["공휴일", "설날"],
  "20260302": ["공휴일", "삼일절 대체공휴일"], "20260501": ["휴장", "근로자의 날"], "20260505": ["공휴일", "어린이날"],
  "20260525": ["공휴일", "부처님오신날 대체공휴일"], "20260603": ["공휴일", "지방선거"], "20260717": ["공휴일", "제헌절"],
  "20260817": ["공휴일", "광복절 대체공휴일"], "20260924": ["공휴일", "추석"], "20260925": ["공휴일", "추석"],
  "20261005": ["공휴일", "개천절 대체공휴일"], "20261009": ["공휴일", "한글날"], "20261225": ["공휴일", "성탄절"], "20261231": ["휴장", "연말 휴장일"],
};
