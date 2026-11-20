// 밤사이 머리(피그마 448:6559): 제목, 알림 설정(종), 마이, 위쪽 탭(밤사이 시가예측 · 기록)
import Link from "next/link";

export function NightHead({ tab }: { tab: "pred" | "rec" }) {
  return (
    <>
      <header className="head">
        <h1>밤사이</h1>
        <Link href="/settings/alerts" className="bell" aria-label="알림 설정"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17Zm4 3h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></Link>
        <Link href="/my" className="my" aria-label="마이"><img src="/icons/my.svg" alt="" width={23} height={23} /></Link>
      </header>
      <nav className="toptabs two" aria-label="밤사이 구분">
        <Link href="/night" className={tab === "pred" ? "on" : ""}>밤사이 시가예측</Link>
        <Link href="/night/record" className={tab === "rec" ? "on" : ""}>기록</Link>
      </nav>
    </>
  );
}
