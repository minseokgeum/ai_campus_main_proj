// 둘러볼 계좌 고르기(2026-11-23, 피그마에 없는 화면 — 시작 화면 모양에 맞춤).
// 시연 계좌 A·B·C(user1~3) 중 하나를 고르면 그 복사본으로 나만의 체험 계정을 만든다(lib/auth.ts guestLogin). 각자 바꾼 종목·수량은 서로 섞이지 않는다.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, guestLogin } from "@/lib/auth";
import { DEMO_SETS, demoSet, leadNames } from "@/lib/demo";

async function browse(form: FormData) {
  "use server";
  const s = demoSet(String(form.get("set") ?? ""));
  if (!s) redirect("/start/demo");
  await guestLogin(s.key, s.holdings, s.watch);
  redirect("/");
}

export default async function DemoPick() {
  if (await currentUser()) redirect("/");
  return (
    <main className="start">
      <div className="starttop"><Link href="/start" aria-label="뒤로">‹ 뒤로</Link><b>둘러보기</b><span /></div>
      <div className="dpick">
        <h1>어떤 계좌로 둘러볼까요?</h1>
        <p className="lead">고른 계좌를 복사해서 나만의 체험 계정을 만들어요.<br />종목이나 수량을 바꿔도 다른 사람에게는 보이지 않아요.</p>
        {DEMO_SETS.map((s) => {
          const names = leadNames(s);
          return (
            <form key={s.key} action={browse}>
              <input type="hidden" name="set" value={s.key} />
              <button type="submit" className="dcard">
                <span className="dkey" aria-hidden>{s.key}</span>
                <span className="dbody">
                  <b>{s.title}</b>
                  <small>{s.sub}</small>
                  <em>보유 {s.holdings.length}종목 · {names.join(", ")}{s.holdings.length > names.length ? " 외" : ""}</em>
                </span>
                <span className="dgo" aria-hidden>›</span>
              </button>
            </form>
          );
        })}
        <p className="fine">뉴스는 이 계좌들에 담긴 종목을 중심으로 모아요. 다른 종목을 추가하면 예상 시가와 시세는 보이지만 밤사이 뉴스는 없을 수 있어요.</p>
      </div>
    </main>
  );
}
