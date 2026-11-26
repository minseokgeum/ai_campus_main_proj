// 화면 시각(시연 시각 또는 지금)까지 나온 것만 보이게 하는 기준. dayModel(lib/model.ts)과 같은 규칙을 기록·내역 화면에도 쓴다(2026-11-22).
//  · 카드: 그날 06:30 카드는 06:30부터, 08:11 카드는 08:11부터
//  · 확인: 서버가 남긴 확인 시각(checked_at)이 지났을 때. 확인 시각이 없는 지난 기록은 그날 개장 5분 뒤(special_days.csv)
import "server-only";
import { kstNow } from "@/lib/calendar";
import { appNow } from "@/lib/clock";
import { checkTime } from "@/lib/marketdays";

export type TimeGate = {
  now: Date;
  today: string;      // 화면 시각의 날짜(YYYYMMDD)
  slotMax: string;    // 오늘 보여 줄 수 있는 가장 늦은 카드('0811' · '0730' · 아직 없음이면 '0000'). SQL에서 slot <= slotMax로 쓴다
  checkShown: (t: string, checkedAt: Date | string | null) => boolean;
};

export async function timeGate(): Promise<TimeGate> {
  const now = await appNow();
  const k = kstNow(now), hm = k.hour * 100 + k.minute;
  const fixed = hm >= checkTime(k.ymd)[1];
  return {
    now, today: k.ymd,
    slotMax: hm >= 811 ? "0811" : hm >= 630 ? "0730" : "0000",   // 첫 카드(칸 이름 0730)는 06:30 공개(2026-11-25)
    checkShown: (t, at) => t < k.ymd || (t === k.ymd && (at ? Math.floor(new Date(at).getTime() / 60000) * 60000 <= now.getTime() : fixed)),
  };
}
