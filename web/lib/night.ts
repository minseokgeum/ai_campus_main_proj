// 밤사이 계산: 카드 값 × 내 수량 → 종목 줄·계좌 합계. 장전은 예상 시가(H), 장후는 실제 시가 채점.
import "server-only";
import type { CardStock, CheckRow, DayModel } from "@/lib/model";
import { tierOf } from "@/lib/model";
import { uStock } from "@/lib/portfolio";

export type Phase = "pre" | "post";
export type RowKind = "ok" | "out" | "low" | "nocalc" | "notservice";

export type Row = {
  code: string; name: string; sector: string; qty: number; tier: 1 | 2 | 3;
  s: CardStock | null; c: CheckRow | null;
  kind: RowKind;
  pct: number | null;      // 장전: 예상 시가 변화(H) · 장후: 실제 시가 변화
  value: number | null;    // 어제 종가 × 수량
  amount: number | null;   // 예상(장후는 실제) 금액 변화
  side: "up" | "down" | null; // 범위 밖이면 어느 쪽
};

export function buildRows(m: DayModel | null, items: { code: string; qty: number }[], phase: Phase): Row[] {
  const graded = m?.card?.slot === "0811";
  return items.map(({ code, qty }) => {
    const u = uStock(code);
    const tier = tierOf(code);
    const s = m?.stocks.get(code) ?? null;
    const c = m?.checks.get(code) ?? null;
    const base: Row = { code, qty, tier, s, c, name: s?.name ?? u?.name ?? code, sector: u?.sector || "기타", kind: "ok", pct: null, value: null, amount: null, side: null };
    if (tier === 3) return { ...base, kind: "notservice" };
    if (!s) return { ...base, kind: "nocalc" };
    const value = qty * s.pc;
    if (phase === "post") {
      if (!c) return { ...base, kind: "nocalc", value };
      const side = c.y > s.u80 ? "up" : c.y < s.l80 ? "down" : null;
      return { ...base, value, pct: c.y, amount: qty * (c.open - s.pc), kind: side ? "out" : "ok", side };
    }
    const nxtOut = graded && s.nxtG != null && (s.nxtG > s.u80 || s.nxtG < s.l80);
    const side = nxtOut ? (s.nxtG! > s.u80 ? "up" : "down") : null;
    const kind: RowKind = nxtOut ? "out" : graded && s.grade === "낮음" ? "low" : "ok";
    return { ...base, value, pct: s.h, amount: value * s.h, kind, side };
  });
}

export function account(rows: Row[]) {
  const calc = rows.filter((r) => r.amount != null && r.value != null);
  const value = calc.reduce((a, r) => a + r.value!, 0);
  const amount = calc.reduce((a, r) => a + r.amount!, 0);
  return { value, amount, after: value + amount, pct: value ? amount / value : 0, n: calc.length };
}

/** 비율 0.0123 → 퍼센트 숫자 1.23 */
export const P = (v: number) => v * 100;

/** 화면 순서: 확인이 필요한 종목(범위 밖·믿을 정도 낮음) 먼저, 그다음 나머지. 각 묶음 안은 정렬 기준(금액 변화 큰 순·비중 큰 순) */
export function ordered(rows: Row[], sort?: string): Row[] {
  const by = sort === "name" ? (a: Row, b: Row) => a.name.localeCompare(b.name, "ko")
    : sort === "pct" ? (a: Row, b: Row) => Math.abs(b.pct ?? -1) - Math.abs(a.pct ?? -1)
      : sort === "w" ? (a: Row, b: Row) => (b.value ?? -1) - (a.value ?? -1)
        : (a: Row, b: Row) => Math.abs(b.amount ?? -1) - Math.abs(a.amount ?? -1);
  const att = rows.filter((r) => r.kind === "out" || r.kind === "low").sort(by);
  return [...att, ...rows.filter((r) => r.kind !== "out" && r.kind !== "low").sort(by)];
}
/** 정렬(피그마 시트 · 정렬 선택 444:6560): 금액 변화 큰 순 · 비중 큰 순 · 등락률 큰 순 · 이름 순 */
export const SORTS = [["", "금액 변화 큰 순", "예상 금액이 크게 바뀌는 종목 먼저"], ["w", "비중 큰 순", "내 계좌에서 금액이 큰 종목 먼저"],
  ["pct", "등락률 큰 순", "예상 시가 변화율이 큰 종목 먼저"], ["name", "이름 순", "가나다 순"]] as const;
export const SORT_LABEL = (sort?: string) => (SORTS.find((s) => s[0] === (sort ?? ""))?.[1] ?? SORTS[0][1]);

/** 업종별 묶음(업종별로 보면 창, 같은 업종에 묶인 내 종목 칩): 금액 변화 큰 순, 6번째부터 '그 외' */
export function bySector(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r.sector, [...(m.get(r.sector) ?? []), r]);
  const all = [...m.entries()].map(([sector, list]) => ({ sector, list, amount: list.reduce((a, r) => a + (r.amount ?? 0), 0) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  if (all.length <= 6) return all;
  const rest = all.slice(5);
  return [...all.slice(0, 5), { sector: `그 외 ${rest.length}개 업종`, list: rest.flatMap((x) => x.list), amount: rest.reduce((a, x) => a + x.amount, 0) }];
}

export type NQ = { d?: string; p?: string; v?: string; f?: string; o?: string };
/** 밤사이 주소(날짜·장전후·보유관심·필터·정렬을 이어 붙임) */
export function nightHref(base: NQ, patch: Partial<NQ>, path = "/night") {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
