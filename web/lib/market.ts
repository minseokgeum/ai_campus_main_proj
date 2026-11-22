// 미국 지수(서버 model.us_daily · model.us_intraday, 모델 노트북 us_market 단계가 채움): 홈 미국 시장 칸과 미국시장 지표 상세.
import "server-only";
import { db } from "@/lib/db";
import { appNow } from "@/lib/clock";
import { addDays, kstNow } from "@/lib/calendar";

export const US = [
  { sym: "^GSPC", short: "S&P 500", name: "S&P 500" },
  { sym: "^IXIC", short: "나스닥", name: "나스닥" },
  { sym: "^DJI", short: "다우", name: "다우존스" },
  { sym: "KRW=X", short: "환율", name: "원/달러 환율" },
] as const;

export type UsDay = { sym: string; usDate: string; open: number; high: number; low: number; close: number; prev: number; chg: number };
export type UsPoint = { t: string; p: number };

/** 기호마다 가장 최근 미국 날짜의 하루 값 */
export async function usLatest(): Promise<Map<string, UsDay>> {
  const out = new Map<string, UsDay>();
  try {
    // 화면 시각까지 마감한 미국 날짜만(미국 16:00 마감 ≈ 한국 06:00). 시연 시각이 아니면 사실상 전부
    const k = kstNow(await appNow());
    const maxUs = addDays(k.ymd, k.hour >= 6 ? -1 : -2);
    const r = await db().query(`select distinct on (symbol) symbol, us_date, open, high, low, close, prev_close from model.us_daily where us_date <= $1 order by symbol, us_date desc`, [maxUs]);
    for (const x of r.rows) {
      const close = Number(x.close), prev = Number(x.prev_close);
      out.set(x.symbol, { sym: x.symbol, usDate: x.us_date, open: Number(x.open), high: Number(x.high), low: Number(x.low), close, prev, chg: prev ? close / prev - 1 : 0 });
    }
  } catch { /* 표가 아직 없으면 빈 값 */ }
  return out;
}

/** 그날 5분봉 */
export async function usIntraday(sym: string, usDate: string): Promise<UsPoint[]> {
  try {
    const r = await db().query("select ts, price from model.us_intraday where symbol = $1 and us_date = $2 order by ts", [sym, usDate]);
    return r.rows.map((x) => ({ t: new Date(x.ts).toISOString(), p: Number(x.price) }));
  } catch {
    return [];
  }
}

/** "20261119" → "11/19" */
export const md = (d: string) => `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
