// 화면의 "지금" 시각. 시연 계정(user1~10, guest, 사람마다 만드는 체험 계정 guest_…)은 피그마의 시간대별 상태(06:30 전·장 전·장 후·주말·야간 진행 중·월요일)를
// 지난 시각으로 돌려 볼 수 있다(쿠키 demo_at, /demo-time에서 고름). 지금보다 뒤 시각은 받지 않는다(공개 전 예상이 보이지 않게).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstNow } from "@/lib/calendar";
import { checkTime } from "@/lib/marketdays";

import { DEMO_USERS } from "@/lib/demousers";
export { DEMO_USERS };
/** 시연 계정인지. 둘러보기는 2026-11-22부터 사람마다 체험 계정(guest_날짜+무작위, lib/auth.ts guestLogin)을 만들어서 그 이름도 시연 계정으로 본다 */
export const isDemoName = (name: string) => DEMO_USERS.has(name) || name.startsWith("guest_");
export const DEMO_COOKIE = "demo_at";
/** 시연 날짜 고정(2026-11-26 사용자 결정): 시연·체험 계정은 이 날 아침 화면을 본다. 처음 시각은 06:30(예상 공개), 오른쪽 아래 시계 단추로 그날 시각만 바꾼다(components/timefab.tsx).
 *  쿠키 값 "now"는 실제 지금(숨은 길: /demo-time?at=off) */
export const DEMO_DAY = "20261126";
export const DEMO_START = `${DEMO_DAY}0630`;

/** 'YYYYMMDDHHmm'(한국 시각) → Date */
export function fromStamp(s: string): Date | null {
  if (!/^\d{12}$/.test(s)) return null;
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 이 요청의 화면 시각. 시연 계정이 고른 지난 시각이 있으면 그 시각, 아니면 실제 지금 */
export const appNow = cache(async (): Promise<Date> => {
  const real = new Date();
  const stamp = (await cookies()).get(DEMO_COOKIE)?.value;
  if (stamp === "now") return real;
  const user = await currentUser().catch(() => null);
  if (!user || !isDemoName(user.username)) return real;
  const at = fromStamp(stamp ?? DEMO_START);   // 고른 시각이 없으면 시연 날짜 06:30
  if (!at || at.getTime() > real.getTime()) return real;
  return at;
});

/** 시연 시각을 쓰는 중이면 그 시각, 아니면 null. 그 시각 기준 시세·보유 구성을 고를 때 쓴다(lib/prices · lib/portfolio · 종목 상세) */
export const demoAt = cache(async (): Promise<Date | null> => {
  const now = await appNow();
  return Math.abs(now.getTime() - Date.now()) > 60_000 ? now : null;
});

export const isDemoUser = cache(async (): Promise<boolean> => {
  const user = await currentUser().catch(() => null);
  return !!user && isDemoName(user.username);
});

/** 날짜별 확인 시각(2026-11-24): [화면 글자 HH:MM, 시연 시각 값 HHMM]. 확인 결과는 확인이 끝난 분부터 보인다(lib/model CHECK_GATE·lib/timegate).
 *  checked_at이 없는 날은 개장 5분 뒤(lib/marketdays checkTime) */
async function checkMinutes(): Promise<Map<string, [string, string]>> {
  try {
    const r = await db().query(`select t, to_char(min(checked_at) at time zone 'Asia/Seoul', 'HH24:MI') as lab,
      to_char(min(checked_at) at time zone 'Asia/Seoul', 'HH24MI') as val from model.checks where checked_at is not null group by t`);
    return new Map(r.rows.map((x) => [String(x.t), [String(x.lab), String(x.val)] as [string, string]]));
  } catch { return new Map(); }
}
export const checkAt = (t: string, m: Map<string, [string, string]>): [string, string] => m.get(t) ?? [checkTime(t)[0], String(checkTime(t)[1]).padStart(4, "0")];

export type DemoDay = { t: string; label: string; news: boolean; ai: boolean; chk: [string, string] };   // chk: 그날 확인 시각 [글자, 값]
/** 시연 시각 고르기의 날짜 목록(2026-11-22): 아침 카드가 있는 거래일(최근 limit일, 지금보다 앞) + 그날 뉴스·AI 요약이 있는지.
 *  뉴스는 수집을 시작한 다음 날 아침부터(밤사이 기사), AI 요약은 news.hot_macro에 그날 줄이 있을 때 */
export async function demoDays(limit = 60): Promise<DemoDay[]> {
  const real = kstNow();
  try {
    const pool = db();
    const [c, n, a, chk] = await Promise.all([
      pool.query("select t from model.cards where status = 'ok' and t <= $2 group by t order by t desc limit $1", [limit, real.ymd]),
      pool.query("select to_char(min((first_seen_utc at time zone 'Asia/Seoul')::date), 'YYYYMMDD') as d from items").catch(() => ({ rows: [] as { d: string }[] })),
      pool.query("select replace(date, '-', '') as d from news.hot_macro").catch(() => ({ rows: [] as { d: string }[] })),
      checkMinutes(),
    ]);
    const newsFrom = n.rows[0]?.d as string | undefined;
    const ai = new Set(a.rows.map((r) => String(r.d)));
    const fmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
    return c.rows.map((r) => {
      const t = String(r.t);
      const parts = Object.fromEntries(fmt.formatToParts(new Date(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}T12:00:00+09:00`)).map((x) => [x.type, x.value]));
      return { t, label: `${parts.month} ${parts.day}일 (${parts.weekday})`, news: !!newsFrom && t > newsFrom, ai: ai.has(t), chk: checkAt(t, chk) };
    });
  } catch {
    return [];
  }
}
