// 수량·평단 수정 / 관심으로 옮기기(종목 상세 147:619의 링크). 수량 0이면 관심 종목으로 옮긴다.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { portfolio, setHolding, uStock, viewingPast } from "@/lib/portfolio";
import { PastLock } from "@/components/ui";

export default async function EditHolding({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ watch?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const u = uStock(code);
  if (!u) notFound();
  const user = await requireUser();
  if (await viewingPast()) return <PastLock back={`/mine/${code}`} />;
  const h = (await portfolio(user.id)).holdings.find((x) => x.code === code);

  async function save(form: FormData) {
    "use server";
    const me = await requireUser();
    if (await viewingPast()) redirect(`/mine/${code}/edit`);   // 지난 시각에서는 저장하지 않는다
    const qty = Number(String(form.get("qty") ?? "0").replace(/,/g, ""));
    const avgRaw = String(form.get("avg") ?? "").replace(/,/g, "").trim();
    await setHolding(me.id, code, qty, avgRaw ? Number(avgRaw) : null);
    redirect(qty > 0 ? `/mine/${code}` : "/mine?v=watch");
  }

  return (
    <main className="addpage">
      <div className="addtop"><Link href={`/mine/${code}`} aria-label="뒤로">‹</Link><b>{u.name}</b></div>
      <h1>{sp.watch ? "관심 종목으로 옮길까요?" : "수량과 평단을 고쳐요"}</h1>
      <p className="lead">{sp.watch ? "보유 수량을 0으로 두면 관심 종목으로 옮겨져요. 매일 아침 예상 범위는 계속 볼 수 있어요." : "평단을 넣으면 종목 상세에서 평가 손익을 계산해요. 실제 계좌와는 연결되지 않아요."}</p>
      <form action={save} className="lform editform">
        <label>보유 수량(주)<input name="qty" inputMode="numeric" defaultValue={sp.watch ? 0 : h?.qty ?? 1} /></label>
        <label>평단(원, 선택)<input name="avg" inputMode="decimal" defaultValue={h?.avg ?? ""} placeholder="예: 172000" /></label>
        <button className="cta" type="submit">{sp.watch ? "관심으로 옮기기" : "저장하기"}</button>
      </form>
    </main>
  );
}
