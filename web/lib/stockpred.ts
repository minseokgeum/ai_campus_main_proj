// 종목 상세의 '오늘 예측 요약 줄'과 '오늘 아침 예상' 창 자료(피그마 시간대별 상태 1033:2012 · 창 1042:7536, 변경 기록 27·28·44, 2026-11-25).
// 같은 자리 · 같은 모양에서 문구만 바뀐다. 민트 = 모델 추정(누르면 창), 회색 = 안내(누르지 않음).
// 시각은 이 서비스의 실제 공개 시각을 따른다: 06:30 예상(피그마 시안의 06:00 대신) → 08:11 2차 예측(장전 거래 반영) → 개장 직후 채점.
// 값은 밤사이 탭과 같다(lib/night.ts buildRows): 08:11 카드에 장전 가격이 있으면 2차 예상 = 08:10 장전 가격(2026-11-25 팀원 기준), 채점 뒤면 실제 시가 등락(y).
import "server-only";
import { dayModel, tierOf } from "@/lib/model";
import { bandHistory } from "@/lib/prices";
import { appNow } from "@/lib/clock";
import { isWeekend, kstNow, weekday } from "@/lib/calendar";
import { closedName, nextOpenDay } from "@/lib/marketdays";

export type PredDay = { t: string; h: number; l80: number; u80: number; y: number | null; in80: boolean | null };

export type Pred =
  | { kind: "info"; title: string; text: string }   // 회색 안내 줄
  | {
      kind: "pre" | "nxt" | "post";
      est: number;                 // 예상 시가 변화(어제 종가 대비): 08:11 뒤 장전 가격이 있으면 그 값(2차 예상), 아니면 06:30 예상
      h: number;                   // 06:30 예상(띠 위 검은 점)
      l80: number; u80: number;    // 예상 범위(06:30 카드 띠)
      pc: number;                  // 어제 종가
      nxt: number | null;          // 08:10 장전 거래 가격 변화
      y: number | null; open: number | null; in80: boolean | null;   // 채점(실제 시가)
      asOf: string;                // 창 오른쪽 위 '06:30 기준' 등
      hit: [number, number] | null;   // 이 종목 적중 [범위 안, 채점한 날]
      days: PredDay[];             // 지난 20거래일(오래된 순)
    };

const WD = "일월화수목금토";

export async function stockPred(code: string): Promise<Pred> {
  const now = kstNow(await appNow());
  const today = now.ymd;
  const hm = now.hour * 100 + now.minute;
  if (tierOf(code) === 3) return { kind: "info", title: "오늘 예측", text: "이 종목은 예측하지 않아요" };
  const hol = closedName(today);
  if (isWeekend(today) || hol) {
    const next = nextOpenDay(today);
    return { kind: "info", title: "다음 예측", text: `${WD[weekday(next)]}요일 06:30에 나와요` };
  }
  const m = await dayModel().catch(() => null);
  if (!m || m.t !== today) {
    return hm < 630 ? { kind: "info", title: "오늘 예측", text: "06:30에 나와요" } : { kind: "info", title: "오늘 예측", text: "예측이 늦어지고 있어요" };
  }
  const card = m.card;
  if (!card || card.status !== "ok") return { kind: "info", title: "오늘 예측", text: card?.reasonText ?? "오늘은 예측을 내지 않았어요" };
  const s = m.stocks.get(code);
  if (!s) return { kind: "info", title: "오늘 예측", text: "이 종목은 예측하지 않아요" };
  const graded = card.slot === "0811";
  const c = m.checks.get(code) ?? null;
  const hist = await bandHistory(code, 20);
  const scored = hist.filter((x) => x.in80 != null);
  const hit: [number, number] | null = scored.length ? [scored.filter((x) => x.in80).length, scored.length] : null;
  const days: PredDay[] = [...hist].reverse().map((x) => ({ t: x.t, h: x.h, l80: x.l80, u80: x.u80, y: x.y, in80: x.in80 }));
  const est = graded && s.nxtG != null ? s.nxtG : s.h;
  return {
    kind: c ? "post" : graded ? "nxt" : "pre",
    est, h: s.h, l80: s.l80, u80: s.u80, pc: s.pc, nxt: graded ? s.nxtG : null,
    y: c?.y ?? null, open: c?.open ?? null, in80: c?.in80 ?? null,
    asOf: c ? `${m.check?.checkedAt ?? "개장 직후"} 채점` : graded ? "08:11 기준" : "06:30 기준",
    hit, days,
  };
}
