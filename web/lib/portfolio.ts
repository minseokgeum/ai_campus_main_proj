// 계정별 보유·관심 종목(app.holdings, app.watch).
import "server-only";
import { appdb } from "@/lib/appdb";
import universe from "@/data/universe.json";

export type Holding = { code: string; qty: number; avg: number | null };
export type Portfolio = { holdings: Holding[]; watch: string[] };
export type UStock = { code: string; name: string; sector: string; market: string };

export const UNIVERSE = universe as UStock[];
const BY_CODE = new Map(UNIVERSE.map((s) => [s.code, s]));
export const uStock = (code: string): UStock | undefined => BY_CODE.get(code);

export async function portfolio(userId: number): Promise<Portfolio> {
  const db = appdb();
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
export async function savePortfolio(userId: number, items: { code: string; qty: number }[]): Promise<void> {
  const clean = items.filter((x) => BY_CODE.has(x.code)).map((x) => ({ code: x.code, qty: Math.max(0, Math.min(10_000_000, Math.floor(x.qty) || 0)) }));
  const client = await appdb().connect();
  try {
    await client.query("begin");
    const hold = clean.filter((x) => x.qty > 0), watch = clean.filter((x) => x.qty === 0);
    await client.query("delete from app.holdings where user_id = $1 and not (code = any($2))", [userId, hold.map((x) => x.code)]);
    await client.query("delete from app.watch where user_id = $1 and not (code = any($2))", [userId, watch.map((x) => x.code)]);
    for (const x of hold)
      await client.query(`insert into app.holdings (user_id, code, qty) values ($1, $2, $3)
                          on conflict (user_id, code) do update set qty = excluded.qty, updated_at = now()`, [userId, x.code, x.qty]);
    for (const x of watch) await client.query("insert into app.watch (user_id, code) values ($1, $2) on conflict do nothing", [userId, x.code]);
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
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
