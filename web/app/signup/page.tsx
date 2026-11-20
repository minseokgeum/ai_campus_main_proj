// 가입(피그마 '시작 방법 선택' 530:6272 → 약관 동의 창 534:6290 → 첫 사용 · 보유 종목 등록 531:6228 → 첫 사용 · 알림 받기 531:6274 → 홈).
// 사용자 결정(2026-11-20): 휴대폰·소셜 인증 없이 아이디·비밀번호만.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, signup } from "@/lib/auth";
import { SignupForm } from "./SignupForm";

async function doSignup(form: FormData) {
  "use server";
  if (form.get("agree") !== "on") redirect("/signup?e=agree");
  if (String(form.get("pw")) !== String(form.get("pw2"))) redirect("/signup?e=pw");
  const r = await signup(String(form.get("id") ?? ""), String(form.get("pw") ?? ""));
  redirect(r === "ok" ? "/onboard/stocks" : `/signup?e=${r}`);
}

const ERR: Record<string, string> = { agree: "약관에 동의해 주세요.", pw: "비밀번호 두 개가 달라요.", taken: "이미 쓰는 아이디예요.", bad: "아이디는 영문·숫자·_ 4~20자, 비밀번호는 4자 이상이에요." };

export default async function Signup({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="login">
      <Link href="/start" className="back" aria-label="뒤로">‹</Link>
      <h1>3초 만에 시작해요</h1>
      <p className="lead">주문이나 송금이 없는 정보 앱이라 간단한 가입만 필요해요.</p>
      <SignupForm action={doSignup} err={sp.e ? ERR[sp.e] ?? "가입하지 못했어요." : undefined} />
      <p className="hint"><Link href="/login">이미 계정이 있어요 · 로그인</Link></p>
    </main>
  );
}
