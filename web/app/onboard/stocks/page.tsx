// 첫 사용 · 보유 종목 등록(피그마 531:6228): 가입 직후. 검색 창으로 담고 수량을 넣는다 → 첫 사용 · 알림 받기.
import { redirect } from "next/navigation";
import AddForm from "@/app/mine/add/AddForm";
import { demoLocked, guestNoAdd, requireUser } from "@/lib/auth";
import { DemoLock, GuestAddLock } from "@/components/demolock";
import { portfolio, savePortfolio, UNIVERSE, uStock, viewingPast } from "@/lib/portfolio";
import { PastLock } from "@/components/ui";

async function save(form: FormData) {
  "use server";
  const user = await requireUser();
  if (await viewingPast()) redirect("/onboard/stocks");
  const items = JSON.parse(String(form.get("items") ?? "[]")) as { code: string; qty: number; avg?: number | null }[];
  await savePortfolio(user.id, Array.isArray(items) ? items.slice(0, 50) : []);
  redirect("/onboard/alerts");
}

export default async function FirstStocks() {
  const user = await requireUser();
  if (await demoLocked()) return <DemoLock back="/" title="종목 고르기" />;   // 시연 계정은 보기 전용(2026-11-26)
  if (await guestNoAdd()) return <GuestAddLock back="/" />;                    // 체험 계정은 종목 추가 막기(2026-11-26)
  if (await viewingPast()) return <PastLock back="/" />;
  const pf = await portfolio(user.id);
  const draft = pf.holdings.map((h) => ({ code: h.code, name: uStock(h.code)?.name ?? h.code, qty: h.qty, avg: h.avg }));
  return <AddForm first universe={UNIVERSE.map(({ code, name, sector }) => ({ code, name, sector }))} initial={draft} save={save} />;
}
