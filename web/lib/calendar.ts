// 날짜 계산(한국 시각): 주말, 날짜 더하기, 07:30 공개 시각. 휴장일·개장 시각·미국 휴장 같은 특별한 날은 lib/marketdays.ts(special_days.csv)에서 읽는다.

const KST = "Asia/Seoul";

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

/** T의 07:30(한국)까지 남은 분. 지났으면 0 */
export function minutesTo0730(t: string, now: Date = new Date()) {
  const target = new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T07:30:00+09:00`).getTime();
  return Math.max(0, Math.ceil((target - now.getTime()) / 60000));
}
