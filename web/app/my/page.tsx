// 마이 · 설정(피그마 531:6309), 로그아웃 확인(539:6276), 회원 탈퇴(539:6286 → 539:6336), 약관 · 문서 보기(539:6355).
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { logout, requireUser, switchDemoUser } from "@/lib/auth";
import { portfolio } from "@/lib/portfolio";
import { isDemoUser } from "@/lib/clock";
import { DEMO_SETS, guestSet } from "@/lib/demo";

async function doSwitch(form: FormData) {   // 시연 계정 바로 바꾸기(user1~3). 바꾼 뒤 홈으로
  "use server";
  await switchDemoUser(String(form.get("u") ?? ""));
  redirect("/");
}

async function doLogout() {
  "use server";
  await logout();
  redirect("/start");
}

export default async function My() {
  const user = await requireUser();
  const pf = await portfolio(user.id);
  // 시연·체험 계정: 시연 날짜(11/26) 화면. 시각은 오른쪽 아래 시계 단추로(2026-11-26, components/timefab.tsx)
  const demo = await isDemoUser();
  return (
    <>
      <main className="sheet">
        <div className="shead"><Link href="/" aria-label="뒤로">‹</Link><span className="ttl">마이</span></div>
        <section className="prof"><span className="pic">{user.username.slice(0, 1).toUpperCase()}</span><div><b>{user.username.startsWith("guest") ? "둘러보기" : user.username} 님</b><small>{user.username.startsWith("guest") ? `둘러보기 계정${guestSet(user.username) ? ` · 계좌 ${guestSet(user.username)!.key} 복사본` : ""} · 바꾼 종목은 나에게만 보여요` : "아이디 로그인"}</small></div></section>
        {demo ? (
          <section className="demotime demoacct">
            <h3>시연 계정 <small>시연 계정만 · 비밀번호 없이 바로 바꾸기</small></h3>
            {DEMO_SETS.map((d) => (
              <form key={d.user} action={doSwitch}>
                <input type="hidden" name="u" value={d.user} />
                <button type="submit" className={user.username === d.user ? "on" : ""} disabled={user.username === d.user}>
                  <b>{d.user} · 계좌 {d.key}{user.username === d.user ? " (지금)" : ""}</b><small>{d.title} · 보유 {d.holdings.length} · 관심 {d.watch.length}</small>
                </button>
              </form>
            ))}
          </section>
        ) : null}
        {demo ? (
          <section className="demotime">
            <h3>시연 시각 <small>11월 26일(목) 아침 화면</small></h3>
            <p className="dt-note">오른쪽 아래 시계 단추를 누르면 그날 06:00 · 06:30 · 08:11 · 실제 시가 · 18:00 화면으로 바로 바꿀 수 있어요.</p>
          </section>
        ) : null}
        <nav className="menu">
          <h3>내 투자</h3>
          <Link href="/mine">보유·관심 종목 관리<span>보유 {pf.holdings.length} · 관심 {pf.watch.length} ›</span></Link>
          <Link href="/mine/add">종목 추가<span>›</span></Link>
          <Link href="/record">모델 기록<span>지금까지 얼마나 맞았나 ›</span></Link>
          <h3>알림</h3>
          <Link href="/settings/alerts">알림 설정<span>06:30 · 08:11 · 09:05 ›</span></Link>
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
      <BottomNav active={null} />
    </>
  );
}
