// 로그인(피그마 '로그인 (다시 들어올 때)' 530:6394의 모양을 따르고, 소셜 로그인 대신 시연용 아이디·비밀번호).
import { redirect } from "next/navigation";
import { currentUser, login } from "@/lib/auth";

async function doLogin(form: FormData) {
  "use server";
  const ok = await login(String(form.get("id") ?? ""), String(form.get("pw") ?? ""));
  redirect(ok ? "/" : "/login?e=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="login">
      <h1>다시 만나서 반가워요</h1>
      <p className="lead">아이디와 비밀번호로 들어오세요.</p>
      <form action={doLogin} className="lform">
        <label>아이디<input name="id" autoComplete="username" placeholder="user1" required /></label>
        <label>비밀번호<input name="pw" type="password" autoComplete="current-password" placeholder="1111" required /></label>
        {sp.e ? <p className="err" role="alert">아이디나 비밀번호가 맞지 않아요.</p> : null}
        <button type="submit" className="primary">로그인</button>
      </form>
      <p className="hint">시연용 계정: user1 ~ user10 · 비밀번호 1111</p>
      <p className="hint"><a href="/signup">처음이에요 · 가입하기</a> · <a href="/start">둘러보기</a></p>
    </main>
  );
}
