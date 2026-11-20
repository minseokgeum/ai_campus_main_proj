// 마이 · 설정(피그마 531:6309), 로그아웃 확인(539:6276), 회원 탈퇴(539:6286 → 539:6336), 약관 · 문서 보기(539:6355).
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { logout, requireUser } from "@/lib/auth";
import { portfolio } from "@/lib/portfolio";

async function doLogout() {
  "use server";
  await logout();
  redirect("/start");
}

export default async function My() {
  const user = await requireUser();
  const pf = await portfolio(user.id);
  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href="/" aria-label="뒤로">‹</Link><span className="ttl">마이</span></div>
        <section className="prof"><span className="pic">{user.username.slice(0, 1).toUpperCase()}</span><div><b>{user.username} 님</b><small>{user.username === "guest" ? "둘러보기 계정" : "아이디 로그인"}</small></div></section>
        <nav className="menu">
          <h3>내 투자</h3>
          <Link href="/mine">보유·관심 종목 관리<span>보유 {pf.holdings.length} · 관심 {pf.watch.length} ›</span></Link>
          <Link href="/mine/add">종목 추가<span>›</span></Link>
          <h3>알림</h3>
          <Link href="/settings/alerts">알림 설정<span>07:30 · 08:11 · 09:05 ›</span></Link>
          <h3>서비스 정보</h3>
          <Link href="/docs/terms">이용약관<span>›</span></Link>
          <Link href="/docs/privacy">개인정보 처리방침<span>›</span></Link>
          <Link href="/docs/contact">문의하기<span>›</span></Link>
          <p className="ver">앱 버전<span>1.0.0</span></p>
          <h3>계정</h3>
          <Sheet className="menubtn" center cancel="취소" title="로그아웃할까요?" sub="다음에 들어올 때 아이디와 비밀번호로 다시 로그인하면 돼요. 저장한 종목은 그대로 남아 있어요." trigger={<>로그아웃</>}>
            <form action={doLogout}><button type="submit" className="dok">로그아웃</button></form>
          </Sheet>
          <Link href="/my/withdraw" className="muted">회원 탈퇴</Link>
        </nav>
      </main>
      <BottomNav active="home" />
    </>
  );
}
