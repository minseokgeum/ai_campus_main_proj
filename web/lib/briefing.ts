// 브리핑 날짜와 밤사이 기사 범위.
// 새 브리핑은 매일 한국 시간 06:30에 바뀐다(서머타임과 상관없이 고정, 2026-11-23: 피그마 '규칙·전달'의 06:00에서 바꿈). 야간선물은 18:00~06:00.
// D일 브리핑의 기사 = D-1일 23:00 ~ D일 06:15(한국)에 발행된 기사 중 06:15까지 수집된 것(발행 시각 기준, 2026-11-23 변경. 그전엔 수집 시각).
// 서버 요약(news_search/run_news.py)과 같은 범위. 06:20 확정 요약, 06:30 공개. 06:30 전에 열면 전날 브리핑.

export const BRIEF_AT = "06:30";      // 공개 시각
export const NIGHT_START_HOUR = 23;   // 범위 시작: 전날 23:00(발행 시각)
export const CUTOFF = "06:15";        // 범위 끝: 그날 06:15 발행분까지(그 시각까지 수집된 것). 월요일도 같다

export type Briefing = { date: string; start: Date; end: Date; asOf: string };

function kstYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function kstHm(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(/^24/, "00");
}

function at(ymd: string, hour: number, minute = 0): Date {
  return new Date(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
}

/** 날짜(YYYY-MM-DD)를 주면 그날 브리핑, 안 주면 지금 볼 브리핑 */
export function briefing(ymd?: string, now: Date = new Date()): Briefing {
  let date = ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : kstYmd(now);
  if (!ymd && kstHm(now) < BRIEF_AT) date = kstYmd(new Date(at(date, 12).getTime() - 86400000));
  const [ch, cm] = CUTOFF.split(":").map(Number);
  const end = at(date, ch, cm);
  const prev = kstYmd(new Date(at(date, 12).getTime() - 86400000));
  return { date, start: at(prev, NIGHT_START_HOUR), end, asOf: BRIEF_AT };
}
