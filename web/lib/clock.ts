// 화면의 "지금" 시각. 시연 계정(user1~10, guest, 사람마다 만드는 체험 계정 guest_…)은 피그마의 시간대별 상태(07:30 전·장 전·장 후·주말·야간 진행 중·월요일)를
// 지난 시각으로 돌려 볼 수 있다(쿠키 demo_at, /demo-time에서 고름). 지금보다 뒤 시각은 받지 않는다(공개 전 예상이 보이지 않게).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isWeekend, kstNow } from "@/lib/calendar";
import { checkTime } from "@/lib/marketdays";

export const DEMO_USERS = new Set(["user1", "user2", "user3", "user4", "user5", "user6", "user7", "user8", "user9", "user10", "guest"]);
/** 시연 계정인지. 둘러보기는 2026-11-22부터 사람마다 체험 계정(guest_날짜+무작위, lib/auth.ts guestLogin)을 만들어서 그 이름도 시연 계정으로 본다 */
export const isDemoName = (name: string) => DEMO_USERS.has(name) || name.startsWith("guest_");
export const DEMO_COOKIE = "demo_at";

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
  if (!stamp) return real;
  const at = fromStamp(stamp);
  if (!at || at.getTime() > real.getTime()) return real;
  const user = await currentUser().catch(() => null);
  return user && isDemoName(user.username) ? at : real;
});

/** 시연 시각을 쓰는 중이면 그 시각, 아니면 null(화면 위 안내 띠용) */
export const demoAt = cache(async (): Promise<Date | null> => {
  const now = await appNow();
  return Math.abs(now.getTime() - Date.now()) > 60_000 ? now : null;
});

export const isDemoUser = cache(async (): Promise<boolean> => {
  const user = await currentUser().catch(() => null);
  return !!user && isDemoName(user.username);
});

/** 날짜별 채점 시각(2026-11-24): [화면 글자 HH:MM, 시연 시각 값 HHMM]. 채점 결과는 채점이 끝난 분부터 보인다(lib/model CHECK_GATE·lib/timegate).
 *  checked_at이 없는 날은 개장 5분 뒤(lib/marketdays checkTime) */
async function checkMinutes(): Promise<Map<string, [string, string]>> {
  try {
    const r = await db().query(`select t, to_char(min(checked_at) at time zone 'Asia/Seoul', 'HH24:MI') as lab,
      to_char(min(checked_at) at time zone 'Asia/Seoul', 'HH24MI') as val from model.checks where checked_at is not null group by t`);
    return new Map(r.rows.map((x) => [String(x.t), [String(x.lab), String(x.val)] as [string, string]]));
  } catch { return new Map(); }
}
export const checkAt = (t: string, m: Map<string, [string, string]>): [string, string] => m.get(t) ?? [checkTime(t)[0], String(checkTime(t)[1]).padStart(4, "0")];

/** 피그마 상태별 시연 시각(모두 지금보다 앞). 카드가 있는 거래일을 기준으로 고른다. 2026-11-24: 상태가 바뀌는 경계 시각으로(06:00·08:11·채점 시각·18:00) */
export async function demoPresets(): Promise<{ key: string; label: string; sub: string; at: string }[]> {
  const real = kstNow();
  let days: string[] = [];
  try {
    days = (await db().query("select t from model.cards where status = 'ok' group by t order by t desc limit 30")).rows.map((r) => String(r.t));
  } catch { /* 표가 없으면 빈 목록 */ }
  const hm = real.hour * 100 + real.minute;
  const past = (d: string, h: number) => d < real.ymd || (d === real.ymd && hm >= h);
  const out: { key: string; label: string; sub: string; at: string }[] = [];
  const pick = (key: string, label: string, sub: string, h: number, test: (d: string) => boolean = () => true) => {
    const d = days.find((x) => test(x) && past(x, h));
    if (d) out.push({ key, label, sub, at: `${d}${String(h).padStart(4, "0")}` });
  };
  pick("early", "07:30 전 · 준비 중", "야간장이 끝나고 예상 공개 전(06:00)", 600);
  pick("pre", "장 전 · 08:11 믿을 정도 반영", "장전 거래가 반영된 때(08:11)", 811);
  const chk = await checkMinutes();
  const dPost = days.find((x) => past(x, Number(checkAt(x, chk)[1])));
  if (dPost) { const [lab, val] = checkAt(dPost, chk); out.push({ key: "post", label: "장 후 · 채점", sub: `채점이 끝난 때(${lab})`, at: `${dPost}${val}` }); }
  pick("night", "저녁 · 야간선물 진행 중", "야간 거래가 시작된 때(18:00)", 1800);
  pick("mon", "월요일 아침", "월요일 주의 안내(08:11)", 811, (d) => new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`).getUTCDay() === 1);
  // 주말: 지금보다 앞인 가장 가까운 토요일 10:00
  let s = real.ymd;
  for (let k = 0; k < 14 && !(isWeekend(s) && new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}T12:00:00Z`).getUTCDay() === 6 && past(s, 1000)); k++) s = addDays(s, -1);
  if (isWeekend(s)) out.push({ key: "wkd", label: "주말", sub: "장이 열리지 않는 날(토 10:00)", at: `${s}1000` });
  return out;
}

export type DemoDay = { t: string; label: string; news: boolean; ai: boolean; chk: [string, string] };   // chk: 그날 채점 시각 [글자, 값]
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
