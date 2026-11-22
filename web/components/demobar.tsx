// 시연 시각을 쓰는 중이면 화면 맨 위에 작은 띠(시연 계정만). 누르면 지금 시각으로 돌아간다.
import { demoAt } from "@/lib/clock";

export async function DemoBar() {
  const at = await demoAt().catch(() => null);
  if (!at) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return (
    <div className="demobar">
      <span>시연 시각 · {p.month}월 {p.day}일 ({p.weekday}) {p.hour}:{p.minute} 기준으로 보는 중</span>
      <a href="/demo-time?at=off&back=/my">지금으로 ›</a>   {/* 미리 불러오기(prefetch)가 쿠키를 바꾸지 않게 보통 링크로 */}
    </div>
  );
}
