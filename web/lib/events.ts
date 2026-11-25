// 다가오는 일정(홈 '한 화면에 보기', 2026-11-23): 원래 버전(overnight_briefing/service/core/bundle.py events)과 같은 묶음.
// ① 서버 news.company_events(news_search/company_events.ipynb, 매일 06:00): DART 공시 일정(IR·실적 예고·주주총회·배당 기준일)·이어진 미국 기업 실적·미국 경제 지표
// ② 시장 달력(lib/marketdays): 한국 휴장·밤사이 미국 휴장·조기 마감·10시 개장 ③ 국내 선물·옵션 만기일(매월 둘째 목요일)
// 내 종목과 이어진 일정과 모두에게 해당하는 일정만, 브리핑 날짜 기준 0~7일.
import "server-only";
import { db } from "@/lib/db";
import { marketDay } from "@/lib/marketdays";

export type Ev = { dday: number; label: string; title: string; note: string; kind: "earnings" | "special" | "macro" | "company"; codes: string[] };

const WEEK = "일월화수목금토";
const TITLES: Record<string, string> = {
  first_day: "새해 첫 거래일: 정규장 10:00 개장", exam_day: "수능일: 정규장 10:00 개장", krx_closed: "한국 증시 휴장",
  us_closed: "밤사이 미국 증시 휴장", us_early_close: "밤사이 미국 증시 조기 마감", us_multi: "연휴 뒤 첫 거래일",
};

const toDate = (ymd: string) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
const ymdOf = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
const label = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

function secondThursday(y: number, m: number): Date {
  const d = new Date(Date.UTC(y, m - 1, 1));
  const first = (4 - d.getUTCDay() + 7) % 7;   // 첫 목요일까지
  return new Date(Date.UTC(y, m - 1, 1 + first + 7));
}

/** t: 브리핑 날짜(YYYYMMDD), codes: 내 종목(보유·관심) */
export async function upcomingEvents(t: string, codes: string[], within = 7): Promise<Ev[]> {
  const start = toDate(t), out: Ev[] = [];
  // ① 서버 표
  try {
    const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    const { rows } = await db().query(
      `select to_char(date, 'YYYYMMDD') as d, kind, codes, title, note from news.company_events
       where date >= $1::date and date <= $1::date + $2::int and (cardinality(codes) = 0 or codes && $3::text[]) order by date, kind`, [iso, within, codes]);
    for (const r of rows) {
      const d = toDate(r.d), dd = days(start, d);
      const late = r.kind === "미국 실적(06:00 마감 뒤)";   // 오늘 아침 06:00 뒤 발표라 06:30 예상에 안 들어간 것: 그날만
      const us = r.kind === "미국 실적" || r.kind === "미국 경제 지표";   // 미국 일정은 반영되는 한국 아침 날짜라 내일부터
      if (late ? dd !== 0 : us ? dd < 1 : dd < 0) continue;
      const kind: Ev["kind"] = r.kind.startsWith("미국 실적") ? "earnings" : r.kind === "미국 경제 지표" ? "macro" : "company";
      out.push({ dday: dd, label: label(d), title: r.title, note: r.note ?? "", kind, codes: r.codes ?? [] });
    }
  } catch { /* 표가 아직 없으면 달력 일정만 */ }
  // ② 시장 달력(오늘 다음 날부터)
  for (let i = 1; i <= within; i++) {
    const d = new Date(start.getTime() + i * 86400000), md = marketDay(ymdOf(d));
    const kinds = (md?.kinds ?? []).filter((k) => TITLES[k]);
    if (kinds.length) out.push({ dday: i, label: label(d), title: kinds.map((k) => TITLES[k]).join(" · "), note: md?.note ?? "", kind: "special", codes: [] });
  }
  // ③ 선물·옵션 만기일
  const end = new Date(start.getTime() + within * 86400000);
  const months = [[start.getUTCFullYear(), start.getUTCMonth() + 1], [end.getUTCFullYear(), end.getUTCMonth() + 1]].filter((x, i, a) => a.findIndex((y) => y[0] === x[0] && y[1] === x[1]) === i);
  for (const [y, m] of months) {
    const x = secondThursday(y, m), dd = days(start, x);
    if (dd > 0 && dd <= within) out.push({ dday: dd, label: label(x), title: [3, 6, 9, 12].includes(m) ? "국내 선물·옵션 동시 만기일" : "국내 옵션 만기일", note: "국내 파생상품 만기일이에요(휴장이면 날짜가 앞당겨져요)", kind: "macro", codes: [] });
  }
  return out.sort((a, b) => a.dday - b.dday);
}
