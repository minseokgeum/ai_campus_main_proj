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
  // 2026-11-26 사용자 결정(시안 demo.html): 머리 줄 ‹ + 가운데 '둘러보기' 크게, 입체 카드, 업종은 칩, 종목은 '대표 2 외 n' 한 줄, 아래 안내는 정보 칸
  return (
    <main className="start dp2">
      <div className="dp2-top"><Link href="/start" aria-label="뒤로">‹</Link><b>둘러보기</b><span /></div>
      <h1>어떤 계좌로<br />둘러볼까요?</h1>
      <p className="lead">고른 계좌를 복사해 나만의 체험 계정을 만들어요.<br />수량을 바꿔도 다른 사람에게는 보이지 않아요.</p>
      <div className="dp2-list">
        {DEMO_SETS.map((s) => {
          const two = leadNames(s, 2), names = two.join(", ").length > 14 ? two.slice(0, 1) : two, rest = s.holdings.length - names.length;   // 두 이름이 길면 하나만(한 줄에 끝나게)
          return (
            <form key={s.key} action={browse}>
              <input type="hidden" name="set" value={s.key} />
              <button type="submit" className="dp2-card">
                <span className="dp2-key" aria-hidden>{s.key}</span>
                <span className="dp2-body">
                  <b>{s.title}</b>
                  <span className="dp2-chips">{s.sub.split("·").map((x) => <span key={x}>{x.trim()}</span>)}</span>
                  <small><em>보유 {s.holdings.length}종목</em><span>&nbsp;·&nbsp;{names.join(", ")}{rest > 0 ? ` 외 ${rest}` : ""}</span></small>
                </span>
                <span className="dp2-go" aria-hidden>›</span>
              </button>
            </form>
          );
        })}
      </div>
      <p className="dp2-info"><i aria-hidden>i</i><span>뉴스는 이 계좌들에 담긴 종목을 중심으로 모아요. 체험 계정에서는 종목을 추가할 수 없어요.</span></p>
    </main>
  );
}
