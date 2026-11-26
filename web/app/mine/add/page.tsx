// 종목 추가(피그마 541:8111): 검색 → 새로 담기 → 수량 −/+ (0이면 관심) → 'N종목 추가하기'. 이미 가진 종목은 그대로 두고 담은 종목만 더한다(수량은 내 종목 상세의 '수량·평단 수정').
import { redirect } from "next/navigation";
import AddForm from "./AddForm";
import { demoLocked, guestNoAdd, requireUser } from "@/lib/auth";
import { DemoLock, GuestAddLock } from "@/components/demolock";
import { portfolio, savePortfolio, UNIVERSE, viewingPast } from "@/lib/portfolio";
import { PastLock } from "@/components/ui";

async function save(form: FormData) {
  "use server";
  const user = await requireUser();
  if (await viewingPast()) redirect("/mine/add");   // 지난 시각에서는 저장하지 않는다
  const items = JSON.parse(String(form.get("items") ?? "[]")) as { code: string; qty: number; avg?: number | null }[];
  const pf = await portfolio(user.id);
  const merged = new Map<string, { qty: number; avg?: number | null }>([...pf.holdings.map((h) => [h.code, { qty: h.qty }] as [string, { qty: number }]), ...pf.watch.map((c) => [c, { qty: 0 }] as [string, { qty: number }])]);
  for (const x of Array.isArray(items) ? items.slice(0, 50) : []) merged.set(x.code, { qty: x.qty, avg: x.avg ?? null });
  await savePortfolio(user.id, [...merged.entries()].map(([code, v]) => ({ code, ...v })));
  redirect("/mine");
}

export default async function AddPage() {
  const user = await requireUser();
  if (await demoLocked()) return <DemoLock back="/mine" title="종목 추가" />;   // 시연 계정은 보기 전용(2026-11-26)
  if (await guestNoAdd()) return <GuestAddLock back="/mine" />;                // 체험 계정은 종목 추가 막기(2026-11-26)
  if (await viewingPast()) return <PastLock back="/mine" />;
  const pf = await portfolio(user.id);
  const owned = [...pf.holdings.map((h) => h.code), ...pf.watch];
  return <AddForm universe={UNIVERSE.map(({ code, name, sector }) => ({ code, name, sector }))} initial={[]} owned={owned} save={save} />;
}
