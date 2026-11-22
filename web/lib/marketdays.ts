// 시장 특별한 날 달력(web/data/special_days.csv). 원본은 overnight_briefing/model/market_calendar/special_days.csv(팀원이 만든 표,
// 기준은 overnight_briefing/model/README.md 5장)이고, 웹 사본에는 휴장일 이름 두 칸(closed_type 공휴일·휴장, name)을 덧붙였다.
// 평일 하루 한 줄(2024-12 ~ 2027-12). 원본을 다시 만들면 이 사본도 이름 칸을 붙여 다시 복사한다.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { addDays, isWeekend, nextWeekday } from "@/lib/calendar";

export type MarketDay = {
  date: string;
  open: boolean;              // 한국 증시가 열리는 날
  openAt: string;             // 'HH:MM' 정규장 시작(쉬는 날은 '')
  closeAt: string;
  premarket: boolean;         // NXT 개장 전 거래가 있는 날(없으면 08:11 업데이트 없음)
  prevDay: string;            // 전 거래일
  kinds: string[];            // krx_closed · first_day · exam_day · us_closed · us_early_close · us_multi · night_roll_gap
  note: string;               // 화면에 그대로 쓸 수 있는 문장
  closedType: "공휴일" | "휴장" | "";
  name: string;               // 휴장일 이름(예: 추석), 수능일은 '대학수학능력시험'
};

/** 따옴표 칸(쉼표가 든 문장)을 읽는 작은 CSV 읽기 */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

let table: Map<string, MarketDay> | null = null;

function load(): Map<string, MarketDay> {
  if (table) return table;
  const m = new Map<string, MarketDay>();
  try {
    const [head, ...rows] = parseCsv(fs.readFileSync(path.join(process.cwd(), "data", "special_days.csv"), "utf8"));
    const at = (r: string[], k: string) => r[head.indexOf(k)] ?? "";
    for (const r of rows) {
      if (!at(r, "date")) continue;
      m.set(at(r, "date"), {
        date: at(r, "date"), open: at(r, "krx_open") === "1", openAt: at(r, "open"), closeAt: at(r, "close"),
        premarket: at(r, "premarket") === "1", prevDay: at(r, "prev_day"), kinds: at(r, "kinds").split(" ").filter(Boolean),
        note: at(r, "note"), closedType: at(r, "closed_type") as MarketDay["closedType"], name: at(r, "name"),
      });
    }
  } catch { /* 표가 없으면 빈 달력(주말만 쉬는 날로 본다) */ }
  table = m;
  return m;
}

/** 그날 한 줄(주말이거나 표 범위 밖이면 null) */
export function marketDay(t: string): MarketDay | null {
  return load().get(t) ?? null;
}

/** 장이 열리지 않는 날(주말 또는 표의 휴장일) */
export function isClosedDay(t: string): boolean {
  return isWeekend(t) || marketDay(t)?.open === false;
}

/** 평일 휴장일의 [종류, 이름] */
export function closedName(t: string): [string, string] | null {
  const d = marketDay(t);
  return d && !d.open ? [d.closedType || "휴장", d.name || "증시 휴장"] : null;
}

/** 휴장일 이름 + '이라/라'(받침에 따라): 신정이라 · 지방선거라 */
export function closedReason(t: string): string | null {
  const n = closedName(t);
  if (!n) return null;
  const last = n[1].charCodeAt(n[1].length - 1);
  const jong = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${n[1]}${jong ? "이라" : "라"}`;
}

/** 기간 안 평일 휴장일 전부(보관 달력 창에 넘김) */
export function closedDays(): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const d of load().values()) if (!d.open) out[d.date] = [d.closedType || "휴장", d.name || "증시 휴장"];
  return out;
}

/** t 다음 개장일(표 범위 밖이면 다음 평일) */
export function nextOpenDay(t: string): string {
  let d = nextWeekday(t);
  for (let k = 0; k < 30 && marketDay(d)?.open === false; k++) d = nextWeekday(d);
  return d;
}

/** 채점 시각을 모를 때 쓰는 기준: 개장 5분 뒤(보통 09:05, 수능일·새해 첫날 10:05). 서버는 시가가 들어오는 즉시 채점하고 그 시각(checked_at)을 남기므로,
 *  이 값은 checked_at이 없는 지난 기록에만 쓴다. [화면 글자, 비교용 HHMM 숫자] */
export function checkTime(t: string): [string, number] {
  const o = marketDay(t)?.openAt || "09:00";
  const hm = Number(o.replace(":", "")) + 5;
  return [`${String(Math.floor(hm / 100)).padStart(2, "0")}:${String(hm % 100).padStart(2, "0")}`, hm];
}

/** 전 거래일과 t 사이에 주말이 아닌 쉬는 날이 끼어 있나(연휴 다음 날) */
export function afterHoliday(t: string): boolean {
  const d = marketDay(t);
  if (!d?.prevDay) return false;
  for (let x = addDays(d.prevDay, 1); x < t; x = addDays(x, 1)) if (!isWeekend(x)) return true;
  return false;
}
