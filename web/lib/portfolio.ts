// 계정별 보유·관심 종목(app.holdings, app.watch = 지금 구성).
// 2026-11-23: 바뀔 때마다 구성 전체를 app.portfolio_log에 '언제부터'와 함께 남기고, 시연 시각이 과거면 그 시각의 구성을 읽는다(사용자 결정).
import "server-only";
import type { PoolClient } from "pg";
import { appdb } from "@/lib/appdb";
import { demoAt } from "@/lib/clock";
import universe from "@/data/universe.json";

export type Holding = { code: string; qty: number; avg: number | null };
export type Portfolio = { holdings: Holding[]; watch: string[] };
export type UStock = { code: string; name: string; sector: string; market: string };

export const UNIVERSE = universe as UStock[];
const BY_CODE = new Map(UNIVERSE.map((s) => [s.code, s]));
export const uStock = (code: string): UStock | undefined => BY_CODE.get(code);

/** 시연 시각으로 지난 시각을 보는 중인가(이때는 종목을 바꿀 수 없다) */
export async function viewingPast(): Promise<boolean> {
  return (await demoAt()) != null;
}

/** 지금 구성(app.holdings·app.watch)을 기록에 한 줄 남긴다. 바꾸는 트랜잭션 안에서 부른다. from: 이 구성이 유효해지는 때(기본 지금) */
export async function logPortfolio(client: PoolClient, userId: number, from: "now" | "-infinity" = "now"): Promise<void> {
  await client.query(
    `insert into app.portfolio_log (user_id, valid_from, holdings, watch)
     select $1, ${from === "now" ? "now()" : "'-infinity'::timestamptz"},
       coalesce((select jsonb_agg(jsonb_build_object('code', code, 'qty', qty, 'avg', avg_price) order by updated_at, code) from app.holdings where user_id = $1), '[]'),
       coalesce((select jsonb_agg(code order by added_at, code) from app.watch where user_id = $1), '[]')`, [userId]);
}

export async function portfolio(userId: number): Promise<Portfolio> {
  const db = appdb();
  const at = await demoAt();
  if (at) {   // 지난 시각: 그 시각에 유효했던 구성. 기록이 있는데 그 전 것이 없으면(그때는 종목이 없었음) 빈 구성
    try {
      const { rows } = await db.query(
        `select holdings, watch from app.portfolio_log where user_id = $1 and valid_from <= $2 order by valid_from desc, id desc limit 1`, [userId, at]);
      if (rows[0]) return {
        holdings: (rows[0].holdings as { code: string; qty: number; avg: number | null }[]).map((h) => ({ code: h.code, qty: Number(h.qty), avg: h.avg == null ? null : Number(h.avg) })),
        watch: rows[0].watch as string[],
      };
      const any = await db.query("select 1 from app.portfolio_log where user_id = $1 limit 1", [userId]);
      if (any.rows.length) return { holdings: [], watch: [] };
    } catch { /* 기록 표가 없으면 지금 구성 */ }
  }
  const [h, w] = await Promise.all([
    db.query("select code, qty, avg_price from app.holdings where user_id = $1 order by updated_at, code", [userId]),
    db.query("select code from app.watch where user_id = $1 order by added_at, code", [userId]),
  ]);
  return {
    holdings: h.rows.map((r) => ({ code: r.code, qty: Number(r.qty), avg: r.avg_price == null ? null : Number(r.avg_price) })),
    watch: w.rows.map((r) => r.code),
  };
}

/** 종목 추가·수정 화면에서 저장: 수량 > 0이면 보유, 0이면 관심. 목록에 없는 종목은 지운다 */
/** 보유·관심 목록 저장. avg(평단, 선택)를 넣은 종목만 평단을 바꾸고, 안 넣으면 있던 평단을 그대로 둔다 */
export async function savePortfolio(userId: number, items: { code: string; qty: number; avg?: number | null }[]): Promise<void> {
  const clean = items.filter((x) => BY_CODE.has(x.code)).map((x) => ({ code: x.code, qty: Math.max(0, Math.min(10_000_000, Math.floor(x.qty) || 0)),
    avg: x.avg != null && Number(x.avg) > 0 && Number(x.avg) < 100_000_000 ? Number(x.avg) : null }));
  const client = await appdb().connect();
  try {
    await client.query("begin");
    const hold = clean.filter((x) => x.qty > 0), watch = clean.filter((x) => x.qty === 0);
    await client.query("delete from app.holdings where user_id = $1 and not (code = any($2))", [userId, hold.map((x) => x.code)]);
    await client.query("delete from app.watch where user_id = $1 and not (code = any($2))", [userId, watch.map((x) => x.code)]);
    for (const x of hold)
      await client.query(`insert into app.holdings (user_id, code, qty, avg_price) values ($1, $2, $3, $4)
                          on conflict (user_id, code) do update set qty = excluded.qty, avg_price = coalesce(excluded.avg_price, app.holdings.avg_price), updated_at = now()`,
                         [userId, x.code, x.qty, x.avg]);
    for (const x of watch) await client.query("insert into app.watch (user_id, code) values ($1, $2) on conflict do nothing", [userId, x.code]);
    await logPortfolio(client, userId);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** 한 종목의 수량·평단 고치기(수량 0이면 관심으로 옮김) */
export async function setHolding(userId: number, code: string, qty: number, avg: number | null): Promise<void> {
  if (!BY_CODE.has(code)) return;
  const q = Math.max(0, Math.min(10_000_000, Math.floor(qty) || 0));
  const a = avg != null && avg > 0 && avg < 100_000_000 ? avg : null;
  const client = await appdb().connect();
  try {
    await client.query("begin");
    if (q > 0) {
      await client.query(`insert into app.holdings (user_id, code, qty, avg_price) values ($1, $2, $3, $4)
                          on conflict (user_id, code) do update set qty = excluded.qty, avg_price = excluded.avg_price, updated_at = now()`, [userId, code, q, a]);
      await client.query("delete from app.watch where user_id = $1 and code = $2", [userId, code]);
    } else {
      await client.query("delete from app.holdings where user_id = $1 and code = $2", [userId, code]);
      await client.query("insert into app.watch (user_id, code) values ($1, $2) on conflict do nothing", [userId, code]);
    }
    await logPortfolio(client, userId);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
