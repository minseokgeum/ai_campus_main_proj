// 미리 만든 시연 계정(user1~10, guest)으로 종목을 바꾸려 할 때 보여 주는 화면(2026-11-26 사용자 결정, lib/demousers.ts).
// 여러 사람이 같은 아이디를 함께 써서, 한 사람이 바꾸면 모두에게 바뀌어 보이기 때문. '로그아웃하고 둘러보기 시작'을 누르면 둘러보기(계좌 고르기)로.
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/lib/auth";

export const DEMO_LOCK_TITLE = "시연 계정은 바꿀 수 없어요";
export const DEMO_LOCK_SUB = "먼저 둘러볼게요로 시작해 주세요. 고른 계좌를 복사해 나만의 체험 계정을 만들어 드려요. 종목·수량을 바꿔도 다른 사람에게는 보이지 않아요.";

export async function browseInstead() {
  "use server";
  await logout();
  redirect("/start/demo");
}

export function DemoLock({ back, title }: { back: string; title: string }) {
  return (
    <main className="addpage">
      <div className="addtop"><Link href={back} aria-label="뒤로">‹</Link><b>{title}</b></div>
      <h1>{DEMO_LOCK_TITLE}</h1>
      <p className="lead">{DEMO_LOCK_SUB}</p>
      <form action={browseInstead}><button type="submit" className="cta">로그아웃하고 둘러보기 시작</button></form>
    </main>
  );
}

/** 둘러보기 체험 계정의 종목 추가 막기(2026-11-26 사용자 결정 문구) */
export function GuestAddLock({ back }: { back: string }) {
  return (
    <main className="addpage">
      <div className="addtop"><Link href={back} aria-label="뒤로">‹</Link><b>종목 추가</b></div>
      <h1>체험 계정에서는 종목을 추가할 수 없어요</h1>
      <p className="lead">밤사이 뉴스는 시연 계좌에 담긴 종목을 중심으로 모아서, 다른 종목은 뉴스가 비어 보일 수 있어요. 지금 계좌의 종목으로 둘러봐 주세요.</p>
      <Link href={back} className="cta" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>돌아가기</Link>
    </main>
  );
}
