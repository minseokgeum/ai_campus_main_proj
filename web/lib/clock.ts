// 화면의 "지금" 시각. 시연 계정(user1~10, guest, 사람마다 만드는 체험 계정 guest_…)은 피그마의 시간대별 상태(07:30 전·장 전·장 후·주말·야간 진행 중·월요일)를
// 지난 시각으로 돌려 볼 수 있다(쿠키 demo_at, /demo-time에서 고름). 지금보다 뒤 시각은 받지 않는다(공개 전 예상이 보이지 않게).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isWeekend, kstNow } from "@/lib/calendar";

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

/** 피그마 상태별 시연 시각(모두 지금보다 앞). 카드가 있는 거래일을 기준으로 고른다 */
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
  pick("early", "07:30 전 · 준비 중", "오늘 예상이 공개되기 전(06:40)", 640);
  pick("pre", "장 전 · 08:11 믿을 정도 반영", "장 시작 전 예상(08:20)", 820);
  pick("post", "장 후 · 채점", "09:05 채점이 끝난 뒤(10:00)", 1000);
  pick("night", "저녁 · 야간선물 진행 중", "18:00 뒤 야간 거래 중(21:00)", 2100);
  pick("mon", "월요일 아침", "월요일 주의 안내(08:20)", 820, (d) => new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`).getUTCDay() === 1);
  // 주말: 지금보다 앞인 가장 가까운 토요일 10:00
  let s = real.ymd;
  for (let k = 0; k < 14 && !(isWeekend(s) && new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}T12:00:00Z`).getUTCDay() === 6 && past(s, 1000)); k++) s = addDays(s, -1);
  if (isWeekend(s)) out.push({ key: "wkd", label: "주말", sub: "장이 열리지 않는 날(토 10:00)", at: `${s}1000` });
  return out;
}
