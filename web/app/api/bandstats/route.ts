// 노란 띠 설명 창(components/yband.tsx BandHelp)의 근거 숫자: 규칙 고정 뒤(2026-11-03~) 화면 시각 전날까지 확인 기록에서
// 장전 거래(08:11 2차 예상)가 06:30 노란 띠 밖이었던 종목 중 실제 9시 시작도 띠 밖이었던 비율. 10분 동안 같은 값을 쓴다.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timeGate } from "@/lib/timegate";

export const dynamic = "force-dynamic";
const FROM = "20261103";
const cache = new Map<string, { at: number; v: unknown }>();

export async function GET() {
  const g = await timeGate();
  const hit = cache.get(g.today);
  if (hit && Date.now() - hit.at < 600_000) return NextResponse.json(hit.v);
  try {
    const { rows } = await db().query(
      `select min(k.t) as f, max(k.t) as t,
         count(*) filter (where g.nxt_g < c.l80 or g.nxt_g > c.u80) as n,
         count(*) filter (where (g.nxt_g < c.l80 or g.nxt_g > c.u80) and (k.y < c.l80 or k.y > c.u80)) as out
       from model.check_stocks k
       join model.card_stocks c on c.t = k.t and c.slot = '0730' and c.code = k.code
       join model.card_stocks g on g.t = k.t and g.slot = '0811' and g.code = k.code
       where k.slot = '0730' and k.t >= $1 and k.t < $2 and g.nxt_g is not null and k.y is not null`, [FROM, g.today]);
    const r = rows[0] ?? {};
    const v = { from: r.f ? String(r.f) : null, to: r.t ? String(r.t) : null, n: Number(r.n ?? 0), out: Number(r.out ?? 0) };
    cache.set(g.today, { at: Date.now(), v });
    return NextResponse.json(v);
  } catch {
    return NextResponse.json({ from: null, to: null, n: 0, out: 0 });
  }
}
