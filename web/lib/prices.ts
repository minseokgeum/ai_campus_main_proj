// 종목 일봉(서버 model.stock_daily, 모델이 매일 받는 KIS 일봉)과 그 종목의 지난 예상 범위 기록.
import "server-only";
import { db } from "@/lib/db";

export async function closes(code: string, since: string): Promise<{ d: string; c: number }[]> {
  try {
    const r = await db().query("select date, close from model.stock_daily where code = $1 and date >= $2 order by date", [code, since]);
    return r.rows.map((x) => ({ d: x.date, c: Number(x.close) }));
  } catch {
    return [];
  }
}

/** 최근 n번의 카드(08:11 우선)와 채점: 범위 안·밖, 예상 H와 야간선물 x(반응도 계산용) */
export async function bandHistory(code: string, n = 20) {
  try {
    const r = await db().query(
      `select distinct on (s.t) s.t, s.h, s.l80, s.u80, c.x, k.y, k.in80
       from model.card_stocks s join model.cards c on c.t = s.t and c.slot = s.slot
       left join model.check_stocks k on k.t = s.t and k.slot = s.slot and k.code = s.code
       where s.code = $1 order by s.t desc, s.slot desc limit $2`, [code, n]);
    return r.rows.map((x) => ({ t: x.t as string, h: Number(x.h), x: x.x == null ? null : Number(x.x), y: x.y == null ? null : Number(x.y), in80: x.in80 as boolean | null }));
  } catch {
    return [];
  }
}

/** 종목마다 가장 최근 종가와 그 전 종가(평가금액·어제 손익) */
export async function lastCloses(codes: string[]): Promise<Map<string, { close: number; prev: number; date: string }>> {
  const out = new Map<string, { close: number; prev: number; date: string }>();
  if (!codes.length) return out;
  try {
    const r = await db().query(
      `select code, date, close, lag(close) over (partition by code order by date) as prev
       from model.stock_daily where code = any($1) and date >= to_char(now() - interval '20 days', 'YYYYMMDD')`, [codes]);
    for (const x of r.rows) out.set(x.code, { close: Number(x.close), prev: x.prev == null ? Number(x.close) : Number(x.prev), date: x.date });
  } catch { /* 표가 없으면 빈 값 */ }
  return out;
}

/** 한 종목의 최근 DART 공시(model.filings) */
export async function filings(code: string, days = 14): Promise<{ d: string; title: string; no: string }[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const { rows } = await db().query("select rcept_no, rcept_dt, report_nm from model.filings where code = $1 and rcept_dt >= $2 order by rcept_dt desc, rcept_no desc limit 20", [code, since]);
    return rows.map((r) => ({ d: String(r.rcept_dt), title: String(r.report_nm).trim(), no: String(r.rcept_no) }));
  } catch {
    return [];
  }
}
