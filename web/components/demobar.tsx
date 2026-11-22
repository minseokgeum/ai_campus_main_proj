// 시연 시각을 쓰는 중이면 화면 맨 위에 작은 띠(시연 계정만). "바꾸기"로 어느 화면에서나 날짜·시각을 바꾸고(2026-11-22), "지금으로"로 돌아간다.
import { demoAt, demoDays } from "@/lib/clock";
import { kstNow } from "@/lib/calendar";
import { DemoPicker } from "@/components/demopicker";

export async function DemoBar() {
  const at = await demoAt().catch(() => null);
  if (!at) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(at).map((x) => [x.type, x.value]));
  const days = await demoDays();
  const real = kstNow();
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at).replace(/\D/g, "");
  return (
    <div className="demobar">
      <span>시연 시각 · {p.month}월 {p.day}일 ({p.weekday}) {p.hour}:{p.minute} 기준</span>
      <DemoPicker days={days} current={stamp} today={real.ymd} nowHm={`${String(real.hour).padStart(2, "0")}${String(real.minute).padStart(2, "0")}`}
        className="dbchange" trigger={<>바꾸기</>} />
      <a href="/demo-time?at=off&back=/my">지금으로 ›</a>   {/* 미리 불러오기(prefetch)가 쿠키를 바꾸지 않게 보통 링크로 */}
    </div>
  );
}
