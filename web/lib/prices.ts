// 종목 일봉(서버 model.stock_daily, 모델이 매일 받는 KIS 일봉)과 그 종목의 지난 예상 범위 기록.
import "server-only";
import { db } from "@/lib/db";
import { demoAt } from "@/lib/clock";
import { kstNow } from "@/lib/calendar";
import { timeGate } from "@/lib/timegate";
import { marketDay } from "@/lib/marketdays";

/** 시연 시각을 쓰는 중이면 그날 전 종가까지만(그날 종가는 아직 없을 때라서). 아니면 끝 없음 */
async function priceCut(): Promise<string> {
  const at = await demoAt();
  return at ? kstNow(at).ymd : "99999999";
}

export async function closes(code: string, since: string): Promise<{ d: string; c: number }[]> {
  try {
    const r = await db().query("select date, close from model.stock_daily where code = $1 and date >= $2 and date < $3 order by date", [code, since, await priceCut()]);
    return r.rows.map((x) => ({ d: x.date, c: Number(x.close) }));
  } catch {
    return [];
  }
}

/** 최근 n번의 카드(08:11 우선)와 채점: 범위 안·밖, 예상 H와 야간선물 x(반응도 계산용) */
export async function bandHistory(code: string, n = 20) {
  try {
    const g = await timeGate();   // 화면 시각까지 나온 카드·채점만(시연 시각이면 그 시각 기준)
    const r = await db().query(
      `select distinct on (s.t) s.t, s.h, s.l80, s.u80, c.x, k.y, k.in80, kc.checked_at
       from model.card_stocks s join model.cards c on c.t = s.t and c.slot = s.slot
       left join model.check_stocks k on k.t = s.t and k.slot = s.slot and k.code = s.code
       left join model.checks kc on kc.t = k.t and kc.slot = k.slot
       where s.code = $1 and (s.t < $3 or (s.t = $3 and s.slot <= $4)) order by s.t desc, s.slot desc limit $2`, [code, n, g.today, g.slotMax]);
    return r.rows.map((x) => {
      const ok = x.y != null && g.checkShown(x.t, x.checked_at);
      return { t: x.t as string, h: Number(x.h), x: x.x == null ? null : Number(x.x), y: ok ? Number(x.y) : null, in80: ok ? x.in80 as boolean | null : null };
    });
  } catch {
    return [];
  }
}

/** 종목마다 가장 최근 종가와 그 전 종가(평가금액·어제 손익) */
export async function lastCloses(codes: string[]): Promise<Map<string, { close: number; prev: number; date: string }>> {
  const out = new Map<string, { close: number; prev: number; date: string }>();
  if (!codes.length) return out;
  // 최근 40일 안의 종가(시연 시각이면 그날 기준 40일. 예전엔 실제 오늘 기준이라 오래된 시연 날짜에서 비었다)
  const cut = await priceCut();
  const base = cut === "99999999" ? new Date() : new Date(`${cut.slice(0, 4)}-${cut.slice(4, 6)}-${cut.slice(6)}T12:00:00Z`);
  const since = new Date(base.getTime() - 40 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const r = await db().query(
      `select code, date, close, lag(close) over (partition by code order by date) as prev
       from model.stock_daily where code = any($1) and date >= $3 and date < $2`, [codes, cut, since]);
    for (const x of r.rows) out.set(x.code, { close: Number(x.close), prev: x.prev == null ? Number(x.close) : Number(x.prev), date: x.date });
  } catch { /* 표가 없으면 빈 값 */ }
  return out;
}

/** 한 종목의 최근 DART 공시(model.filings). 화면 시각의 날짜까지(시연 시각이면 그날 기준 days일) */
export async function filings(code: string, days = 14): Promise<{ d: string; title: string; no: string }[]> {
  try {
    const { today } = await timeGate();
    const base = new Date(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}T12:00:00Z`);
    const since = new Date(base.getTime() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const { rows } = await db().query("select rcept_no, rcept_dt, report_nm from model.filings where code = $1 and rcept_dt >= $2 and rcept_dt <= $3 order by rcept_dt desc, rcept_no desc limit 20", [code, since, today]);
    return rows.map((r) => ({ d: String(r.rcept_dt), title: String(r.report_nm).trim(), no: String(r.rcept_no) }));
  } catch {
    return [];
  }
}

export type Intraday = { day: string; live: boolean; openAt: string; closeAt: string; prev: number | null; points: { m: number; hhmm: string; p: number }[] };

/** 종목 상세 '1일' 그래프(2026-11-22): 화면 시각의 오늘 장이 열렸으면 오늘 지금까지, 아니면 마지막 거래일 하루의 1분봉(서버 model.intraday, 1분마다 채움).
 *  m은 개장부터 지난 분. prev는 그 전 거래일 종가(점선·등락률 기준). live는 오늘 장이 아직 열려 있는지 */
export async function intraday(code: string): Promise<Intraday | null> {
  try {
    const g = await timeGate();
    const k = kstNow(g.now), nowHm = `${String(k.hour).padStart(2, "0")}${String(k.minute).padStart(2, "0")}`;
    const pool = db();
    const d = (await pool.query(
      "select max(day) as day from model.intraday where code = $1 and (day < $2 or (day = $2 and hhmm <= $3))", [code, g.today, nowHm])).rows[0]?.day as string | null;
    if (!d) return null;
    const md = marketDay(d);
    const openAt = md?.openAt || "09:00", closeAt = md?.closeAt || "15:30";
    const [pts, pc] = await Promise.all([
      pool.query("select hhmm, price from model.intraday where code = $1 and day = $2 and ($2 < $3 or hhmm <= $4) order by hhmm", [code, d, g.today, nowHm]),
      pool.query("select close from model.stock_daily where code = $1 and date < $2 order by date desc limit 1", [code, d]),
    ]);
    const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(2, 4));
    const o = mins(openAt.replace(":", ""));
    return {
      day: d, live: d === g.today && nowHm < closeAt.replace(":", ""), openAt, closeAt,
      prev: pc.rows[0] ? Number(pc.rows[0].close) : null,
      points: pts.rows.map((r) => ({ m: mins(r.hhmm) - o, hhmm: `${r.hhmm.slice(0, 2)}:${r.hhmm.slice(2, 4)}`, p: Number(r.price) })),
    };
  } catch {
    return null;
  }
}
