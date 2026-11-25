// 마이 · 설정(피그마 531:6309), 로그아웃 확인(539:6276), 회원 탈퇴(539:6286 → 539:6336), 약관 · 문서 보기(539:6355).
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { logout, requireUser, switchDemoUser } from "@/lib/auth";
import { portfolio } from "@/lib/portfolio";
import { demoAt, demoDays, demoPresets, isDemoUser } from "@/lib/clock";
import { kstNow } from "@/lib/calendar";
import { DemoPicker } from "@/components/demopicker";
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
  // 시연 계정만: 피그마의 시간대별 상태를 지난 시각으로 돌려 보기(06:30 전·장 전·장 후·저녁·월요일·주말)
  const [demo, presets, at] = await Promise.all([isDemoUser(), demoPresets(), demoAt()]);
  const days = demo ? await demoDays() : [];
  const real = kstNow();
  const atStamp = at ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at).replace(/\D/g, "") : null;
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
            <h3>시연 시각 <small>시연 계정만 · 지난 시각으로 화면 보기</small></h3>
            {presets.map((p) => (
              <a key={p.key} href={`/demo-time?at=${p.at}&back=/`} className={atStamp === p.at ? "on" : ""}>
                <b>{p.label}</b><small>{Number(p.at.slice(4, 6))}/{Number(p.at.slice(6, 8))} {p.at.slice(8, 10)}:{p.at.slice(10)} · {p.sub}</small>
              </a>
            ))}
            <a href="/demo-time?at=off&back=/" className={!at ? "on" : ""}><b>지금</b><small>실제 현재 시각</small></a>
            <DemoPicker days={days} current={atStamp} today={real.ymd} nowHm={`${String(real.hour).padStart(2, "0")}${String(real.minute).padStart(2, "0")}`}
              className="dpk-open" trigger={<><b>날짜·시각 직접 고르기 ›</b><small>지난 거래일의 아침을 그대로 다시 보기</small></>} />   {/* 보통 링크: 미리 불러오기가 시각을 바꾸지 않게 */}
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
