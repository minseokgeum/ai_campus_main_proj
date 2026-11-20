// 시작 · 소개 1·2·3(피그마 530:6176 · 530:6208 · 530:6240)과 시작 방법(530:6272).
// 사용자 결정(2026-11-20): 휴대폰·소셜 인증 없이 아이디·비밀번호로 가입. '먼저 둘러볼게요'는 체험 계정으로 들어간다.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, guestLogin } from "@/lib/auth";
import { STOCKS } from "@/lib/data";
import { Intro } from "./Intro";

async function browse() {
  "use server";
  await guestLogin(Object.keys(STOCKS));
  redirect("/");
}

export default async function Start() {
  if (await currentUser()) redirect("/");
  return (
    <main className="start">
      <div className="starttop"><b>투자 브리핑</b><Link href="/signup">건너뛰기</Link></div>
      <Intro />
      <div className="startbtns">
        <Link href="/signup" className="cta">시작하기</Link>
        <form action={browse}><button type="submit" className="ghost">먼저 둘러볼게요</button></form>
        <Link href="/login" className="tlinkc">이미 계정이 있어요 · 로그인</Link>
      </div>
    </main>
  );
}
