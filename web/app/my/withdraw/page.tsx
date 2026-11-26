// 회원 탈퇴(피그마 539:6286) → 탈퇴 완료(539:6336). 보유·관심·세션·계정을 바로 지운다.
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteAccount, demoLocked, requireUser } from "@/lib/auth";
import { DemoLock } from "@/components/demolock";

async function doWithdraw(form: FormData) {
  "use server";
  if (form.get("ok") !== "on") redirect("/my/withdraw?e=1");
  const user = await requireUser();
  await deleteAccount(user.id);
  redirect("/my/bye");
}

export default async function Withdraw({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await requireUser();
  if (await demoLocked()) return <DemoLock back="/my" title="회원 탈퇴" />;   // 시연 계정은 탈퇴할 수 없다(2026-11-26)
  const sp = await searchParams;
  return (
    <main className="sheet wdraw">
      <div className="shead"><Link href="/my" aria-label="뒤로">‹</Link><span className="ttl">회원 탈퇴</span></div>
      <h1>탈퇴하기 전에<br />확인해 주세요</h1>
      <ul className="wbox">
        <li>등록한 보유·관심 종목이 모두 지워져요.</li>
        <li>지난 예상과 확인 기록이 모두 지워져요.</li>
        <li>같은 계정({user.username})으로 다시 가입해도 되돌릴 수 없어요.</li>
      </ul>
      <form action={doWithdraw} className="wform">
        <p className="wq">떠나시는 이유를 알려주시면 서비스를 고치는 데 쓸게요 (선택)</p>
        <div className="rchips">
          {["예상이 잘 안 맞아요", "자주 안 쓰게 돼요", "알림이 너무 많아요", "다른 앱을 써요", "기타"].map((r) => <label key={r}><input type="radio" name="why" value={r} />{r}</label>)}
        </div>
        <label className="wchk"><input type="checkbox" name="ok" /><span>위 내용을 모두 확인했어요</span></label>
        {sp.e ? <p className="err" role="alert">확인에 체크해 주세요.</p> : null}
        <div className="wbtns">
          <button type="submit" className="wgo">탈퇴하기</button>
          <Link href="/my" className="wstay">계속 쓸게요</Link>
        </div>
      </form>
    </main>
  );
}
