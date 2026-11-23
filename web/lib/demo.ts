// 시연 계좌 A·B·C(user1~3, data/demo_accounts.json). 체험 계정은 이 중 하나를 골라 복사본으로 시작한다(2026-11-23).
import demo from "@/data/demo_accounts.json";
import { stockName } from "@/lib/data";

export type DemoKey = "A" | "B" | "C";
export type DemoSet = {
  key: DemoKey; user: string; title: string; sub: string;
  holdings: { code: string; qty: number; avg: number | null }[]; watch: string[];
};

export const DEMO_SETS: DemoSet[] = (["user1", "user2", "user3"] as const).map((u) => ({ user: u, ...demo[u], key: demo[u].key as DemoKey }));

export const demoSet = (key: string): DemoSet | undefined => DEMO_SETS.find((s) => s.key === key);

/** 카드에 보일 대표 종목 이름(비중 큰 순, 앞에서 n개) */
export function leadNames(s: DemoSet, n = 3): string[] {
  return s.holdings.slice(0, n).map((h) => stockName(h.code));
}

/** 체험 계정 이름(guest_YYMMDD_A_무작위)에서 고른 계좌. 예전 이름(guest_YYMMDD무작위)이면 null */
export function guestSet(username: string): DemoSet | undefined {
  const m = /^guest_\d{6}_([ABC])_/.exec(username);
  return m ? demoSet(m[1]) : undefined;
}
