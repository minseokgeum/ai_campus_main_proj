// 시연·체험 계정의 시점 이동(2026-11-26 사용자 결정): 예전 맨 위 시연 띠('시연 시각 · … 바꾸기 · 지금으로') 대신 오른쪽 아래 시계 단추(components/timefab.tsx).
// 날짜는 시연 날짜(lib/clock DEMO_DAY) 고정, 시각은 그날 화면이 바뀌는 순간 다섯 개(06:00 · 06:30 · 08:11 · 실제 시가 반영 시각 · 18:00).
import { DEMO_DAY, demoAt, demoDays, isDemoUser } from "@/lib/clock";
import { TimeFab, type Slot } from "@/components/timefab";

export async function DemoBar() {
  if (!(await isDemoUser().catch(() => false))) return null;
  const at = await demoAt().catch(() => null);
  const stamp = at ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at).replace(/\D/g, "") : null;
  const d = (await demoDays().catch(() => [])).find((x) => x.t === DEMO_DAY);
  const [chkLab, chkVal] = d?.chk ?? ["09:01", "0901"];
  const slots: Slot[] = [
    { hm: "0600", label: "06:00", sub: "예상 준비" },
    { hm: "0630", label: "06:30", sub: "예상 공개" },
    { hm: "0811", label: "08:11", sub: "장전 반영" },
    { hm: chkVal, label: chkLab, sub: "실제 시가" },
    { hm: "1800", label: "18:00", sub: "야간선물" },
  ];
  const dayLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" })
    .format(new Date(`${DEMO_DAY.slice(0, 4)}-${DEMO_DAY.slice(4, 6)}-${DEMO_DAY.slice(6)}T12:00:00+09:00`));
  return <TimeFab day={DEMO_DAY} dayLabel={dayLabel} slots={slots} current={stamp} />;
}
