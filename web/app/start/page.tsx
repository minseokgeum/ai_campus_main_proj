// 첫 화면(2026-11-26 사용자 결정): 가입·로그인은 숨기고 '둘러보기 시작' 하나만. 소개 4장은 app/start/Intro.tsx.
// 로그인은 왼쪽 위 달을 누르면 간다(숨김). 가입은 로그인 화면의 '가입하기'로만. 예전: 시작하기(가입) · 먼저 둘러볼게요 · 이미 계정이 있어요 · 건너뛰기.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { night } from "@/lib/model";
import { Intro } from "./Intro";

/** 1장 야간선물 흐름선: 시연 날짜(11/26 아침)의 지난밤(11/25 18:00~06:00) 1분 가격을 40점으로 줄여 80×24 칸에 */
async function sparkline(): Promise<string> {
  try {
    const n = await night("20261125");
    const pts = n?.points ?? [];
    if (pts.length < 2) throw new Error("no points");
    const step = Math.max(1, Math.floor(pts.length / 40));
    const sel = pts.filter((_, k) => k % step === 0).concat(pts[pts.length - 1]);
    const lo = Math.min(...sel.map((p) => p.r)), hi = Math.max(...sel.map((p) => p.r)), span = hi - lo || 1;
    return sel.map((p, k) => `${((k / (sel.length - 1)) * 80).toFixed(1)},${(2 + (1 - (p.r - lo) / span) * 20).toFixed(1)}`).join(" ");
  } catch {
    return "0,8 10,10 20,9 30,14 40,18 48,20 56,12 64,6 72,7 80,5";
  }
}

export default async function Start() {
  if (await currentUser()) redirect("/");
  return (
    <main className="start">
      <div className="starttop sv-top">
        <Link href="/login" className="sv-moon" aria-label="로그인"><svg width="20" height="20" viewBox="0 0 22 22" aria-hidden><path d="M14.6 2.2a9.4 9.4 0 1 0 5.2 15.9A7.6 7.6 0 0 1 14.6 2.2Z" fill="#e9a92a" /></svg></Link>
        <b>당신이 잠든 사이에</b>
      </div>
      <Intro spark={await sparkline()} />
      <div className="startbtns">
        <Link href="/start/demo" className="cta">둘러보기 시작</Link>
        <p className="sv-fine">가입 없이 시연 계좌로 바로 둘러봐요</p>
      </div>
    </main>
  );
}
