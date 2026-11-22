// 종목 추가(피그마 541:8111): 검색 → 새로 담기 → 수량 −/+ (0이면 관심) → 'N종목 추가하기'. 이미 가진 종목은 그대로 두고 담은 종목만 더한다(수량은 내 종목 상세의 '수량·평단 수정').
import { redirect } from "next/navigation";
import AddForm from "./AddForm";
import { requireUser } from "@/lib/auth";
import { portfolio, savePortfolio, UNIVERSE } from "@/lib/portfolio";

async function save(form: FormData) {
  "use server";
  const user = await requireUser();
  const items = JSON.parse(String(form.get("items") ?? "[]")) as { code: string; qty: number; avg?: number | null }[];
  const pf = await portfolio(user.id);
  const merged = new Map<string, { qty: number; avg?: number | null }>([...pf.holdings.map((h) => [h.code, { qty: h.qty }] as [string, { qty: number }]), ...pf.watch.map((c) => [c, { qty: 0 }] as [string, { qty: number }])]);
  for (const x of Array.isArray(items) ? items.slice(0, 50) : []) merged.set(x.code, { qty: x.qty, avg: x.avg ?? null });
  await savePortfolio(user.id, [...merged.entries()].map(([code, v]) => ({ code, ...v })));
  redirect("/mine");
}

export default async function AddPage() {
  const user = await requireUser();
  const pf = await portfolio(user.id);
  const owned = [...pf.holdings.map((h) => h.code), ...pf.watch];
  return <AddForm universe={UNIVERSE.map(({ code, name, sector }) => ({ code, name, sector }))} initial={[]} owned={owned} save={save} />;
}
