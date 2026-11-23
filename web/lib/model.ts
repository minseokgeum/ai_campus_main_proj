// 아침 모델 결과(서버 DB model 영역)를 읽는다. 서버가 06:20 · 08:11 · 개장 직후(그날 시가가 들어오는 즉시, 보통 09:00대 · 10시 개장일 10:00대) · 20:30에 채운다(overnight_briefing/model/model_live.ipynb).
// 숫자는 모델 원본(비율: 0.012 = 1.2%)으로 두고, 화면 글자는 format.ts에서 만든다.
import "server-only";
import { db } from "@/lib/db";
import tiers from "@/data/tiers.json";
import { kstNow } from "@/lib/calendar";
import { appNow } from "@/lib/clock";
import { checkTime } from "@/lib/marketdays";
import { timeGate } from "@/lib/timegate";
import { adjustOf, trustOf } from "@/lib/trust";

const TIER = tiers as Record<string, number>;
/** 1: 모델 설계 200종목 · 2: 서비스 대상(설계 밖, 같은 규칙으로 계산) · 3: 서비스 대상 아님 */
export const tierOf = (code: string): 1 | 2 | 3 => (TIER[code] === 1 ? 1 : TIER[code] === 2 ? 2 : 3);

export type Slot = "0730" | "0811";
export type Card = {
  t: string; slot: Slot; status: string; reasonText: string | null; d: string | null; x: number | null;
  issuedAt: string | null; nStocks: number; nGraded: number; cautions: { kind: string; text: string }[];
};
export type CardStock = {
  code: string; name: string; pc: number; h: number; l80: number; u80: number; l90: number; u90: number;
  grade: "높음" | "보통" | "낮음" | null;   // 믿을 정도 = 8시 장전 흐름(오름·내림)이 9시 시가까지 이어질 가능성(카드 grade_0811, 설계서 D08)
  gap: "높음" | "보통" | "낮음" | null;     // 07:30 예상과 08:11 2차 예측이 가까운 정도(lib/trust.ts, E107). 낮음 = '07:30 예상과 크게 달라짐' 표시
  p: number | null; nxtG: number | null; earn: boolean;
  hb: number | null; lb: number | null; ub: number | null;   // 08:11 보정 예상 시가·보정 범위(장전 거래가 없으면 null)
};
export type CheckRow = { code: string; open: number; y: number; in80: boolean; in90: boolean };
export type Check = { scored: number; inBand80: number; inBand90: number; maeH: number; checkedAt: string | null };   // checkedAt: 채점을 마친 시각 HH:MM(지난 기록은 null)
export type NightPoint = { m: number; r: number }; // m: 18:00부터 분, r: 전일 주간 종가 대비 비율
export type Night = { d: string; contract: string; dayClose: number; last: number | null; points: NightPoint[] };

export type DayModel = {
  t: string;
  card: Card | null;            // 보여 줄 카드(08:11이 있으면 08:11, 없으면 07:30)
  slots: Slot[];
  stocks: Map<string, CardStock>;
  check: Check | null;          // 같은 카드의 개장 뒤 채점
  checks: Map<string, CheckRow>;
  night: Night | null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

function toCard(r: Record<string, unknown>): Card {
  return {
    t: String(r.t), slot: r.slot as Slot, status: String(r.status), reasonText: (r.reason_text as string) ?? null, d: (r.d as string) ?? null,
    x: num(r.x), issuedAt: r.issued_at ? new Date(r.issued_at as string).toISOString() : null, nStocks: Number(r.n_stocks ?? 0),
    nGraded: Number(r.n_graded ?? 0), cautions: (r.cautions as Card["cautions"]) ?? [],
  };
}

/** 카드가 있는 날짜(최근 순). 모델 표가 아직 없으면 빈 목록 */
export async function modelDates(limit = 40): Promise<string[]> {
  try {
    // 오늘 카드는 06:20에 미리 만들어지지만 07:30 공개 전에는 어느 화면에도 내보내지 않는다
    const now = kstNow(await appNow());   // 시연 계정이 고른 지난 시각이면 그 시각 기준
    const r = await db().query("select t from model.cards where t <= $2 group by t order by t desc limit $1", [limit + 1, now.ymd]);
    const all = r.rows.map((x) => String(x.t));
    const visible = all.filter((t) => t < now.ymd || (t === now.ymd && (now.hour > 7 || (now.hour === 7 && now.minute >= 30))));
    return visible.slice(0, limit);
  } catch {
    return [];
  }
}

/** 한 날짜의 카드·종목 값·채점·야간선물 흐름. t가 없으면 가장 최근 카드 날짜 */
export async function dayModel(t?: string): Promise<DayModel | null> {
  const pool = db();
  let day = t;
  if (!day) {
    const dates = await modelDates(1);
    if (!dates.length) return null;
    day = dates[0];
  }
  // 그 날이 화면 시각의 '오늘'이면 그 시각까지 나온 카드·채점만(07:30 카드 → 08:11 카드 → 채점).
  // 채점은 서버가 그날 시가가 들어오는 즉시 하고 저장 시각(checked_at)을 남긴다 → 그 시각이 지났으면 보여 준다(시연 시각도 같은 기준).
  // checked_at이 없는 지난 기록은 개장 5분 뒤(보통 09:05, 10시 개장일 10:05)를 기준으로 둔다.
  const nowAt = await appNow();
  const k = kstNow(nowAt), hm = k.hour * 100 + k.minute;
  const shown = (slot: string) => day! < k.ymd || (day === k.ymd && hm >= (slot === "0811" ? 811 : 730));
  const past = day! < k.ymd, pastFixed = day === k.ymd && hm >= checkTime(day!)[1];
  // 분 단위로 비교(2026-11-24): 채점 줄은 채점이 끝나야 생기므로 실제 시각엔 차이가 없고, 시연 시각 09:01에서 09:01:30에 끝난 채점이 보인다
  const CHECK_GATE = "($3 or (checked_at is not null and date_trunc('minute', checked_at) <= $4) or (checked_at is null and $5))";
  const cards = (await pool.query("select * from model.cards where t = $1 order by slot", [day])).rows.map(toCard).filter((c) => shown(c.slot));
  const slots = cards.map((c) => c.slot);
  const card = cards.find((c) => c.slot === "0811" && c.status === "ok") ?? cards.find((c) => c.status === "ok") ?? cards[cards.length - 1] ?? null;
  const out: DayModel = { t: day, card, slots, stocks: new Map(), check: null, checks: new Map(), night: null };
  if (!card) return out;
  const gate = [day, card.slot, past, nowAt.toISOString(), pastFixed];
  const [st, ck, cks] = await Promise.all([
    pool.query("select * from model.card_stocks where t = $1 and slot = $2", [day, card.slot]),
    pool.query(`select *, to_char(checked_at at time zone 'Asia/Seoul', 'HH24:MI') as checked_hm from model.checks where t = $1 and slot = $2 and ${CHECK_GATE}`, gate),
    pool.query(`select s.code, s.open, s.y, s.in80, s.in90 from model.check_stocks s join model.checks c on c.t = s.t and c.slot = s.slot
                where s.t = $1 and s.slot = $2 and ${CHECK_GATE.replace(/checked_at/g, "c.checked_at")}`, gate),
  ]);
  for (const r of st.rows) {
    const caut = (r.cautions as { kind: string }[]) ?? [];
    const h = Number(r.h), l80 = Number(r.l80), u80 = Number(r.u80), g = num(r.nxt_g);
    const adj = adjustOf(h, l80, u80, g);
    out.stocks.set(r.code, {
      code: r.code, name: r.name, pc: Number(r.pc), h, l80, u80, l90: Number(r.l90), u90: Number(r.u90),
      grade: r.grade_level ?? null, gap: trustOf(h, l80, u80, g), p: num(r.grade_p), nxtG: g, earn: caut.some((c) => c.kind === "e_earn"),
      hb: adj?.hb ?? null, lb: adj?.lb ?? null, ub: adj?.ub ?? null,
    });
  }
  if (ck.rows[0]) {
    const c = ck.rows[0];
    out.check = { scored: Number(c.scored), inBand80: Number(c.in_band80), inBand90: Number(c.in_band90), maeH: Number(c.mae_h), checkedAt: c.checked_hm ?? null };
  }
  for (const r of cks.rows) out.checks.set(r.code, { code: r.code, open: Number(r.open), y: Number(r.y), in80: r.in80, in90: r.in90 });
  if (card.d) out.night = await night(card.d);
  return out;
}

/** 전날(D) 18:00 ~ 다음 날 06:00 야간선물 1분봉을 전일 주간 종가 대비로 */
export async function night(d: string): Promise<Night | null> {
  const pool = db();
  const [day, nm, nd] = await Promise.all([
    pool.query("select close, code from model.futures_daily where date = $1 and session = 'day'", [d]),
    pool.query("select hhmmss, price from model.night_minutes where date = $1 order by hhmmss", [d]),
    pool.query("select close, code from model.futures_daily where date = $1 and session = 'night'", [d]),
  ]);
  const dayClose = num(day.rows[0]?.close);
  if (!dayClose) return null;
  const points = nm.rows.map((r) => {
    const h = Number(String(r.hhmmss).slice(0, 2)), m = Number(String(r.hhmmss).slice(2, 4));
    return { m: h * 60 + m - 18 * 60, r: Number(r.price) / dayClose - 1 };
  }).filter((p) => p.m >= 0 && p.m <= 720);
  // 화면 시각이 그 밤 거래 중이면 그 시각까지만(시연 '야간 진행 중')
  const now = await appNow();
  const start = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T18:00:00+09:00`).getTime();
  const upto = (now.getTime() - start) / 60000;
  if (upto < 720) {
    const cut = points.filter((p) => p.m <= upto);
    return { d, contract: String(nd.rows[0]?.code ?? day.rows[0]?.code ?? ""), dayClose, last: cut.length ? cut[cut.length - 1].r : null, points: cut };
  }
  const lastClose = num(nd.rows[0]?.close);
  return { d, contract: String(nd.rows[0]?.code ?? day.rows[0]?.code ?? ""), dayClose, last: lastClose ? lastClose / dayClose - 1 : null, points };
}

/** 개장 뒤 채점 요약(보관 화면용): 날짜별 채점된 카드 */
export async function checkHistory(limit = 30): Promise<{ t: string; slot: Slot; inBand80: number; scored: number }[]> {
  try {
    const r = await db().query(
      `select distinct on (t) t, slot, in_band80, scored from model.checks order by t desc, slot desc limit $1`, [limit]);
    return r.rows.map((x) => ({ t: String(x.t), slot: x.slot, inBand80: Number(x.in_band80), scored: Number(x.scored) }));
  } catch {
    return [];
  }
}

/** 여러 날짜의 내 종목 채점 줄(보관 화면 날짜 칩 색) */
export async function myChecks(dates: string[], codes: string[]): Promise<Map<string, CheckRow[]>> {
  const out = new Map<string, CheckRow[]>();
  if (!dates.length || !codes.length) return out;
  const g = await timeGate();   // 화면 시각까지 나온 채점만
  const r = await db().query(
    `select distinct on (s.t, s.code) s.t, s.code, s.open, s.y, s.in80, s.in90, c.checked_at from model.check_stocks s
     join model.checks c on c.t = s.t and c.slot = s.slot
     where s.t = any($1) and s.code = any($2) and (s.t < $3 or (s.t = $3 and s.slot <= $4)) order by s.t, s.code, s.slot desc`, [dates, codes, g.today, g.slotMax]);
  for (const x of r.rows) {
    const t = String(x.t);
    if (!g.checkShown(t, x.checked_at)) continue;
    out.set(t, [...(out.get(t) ?? []), { code: x.code, open: Number(x.open), y: Number(x.y), in80: x.in80, in90: x.in90 }]);
  }
  return out;
}

/** "20261120" ↔ "2026-11-20" */
export const isoDay = (t: string) => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;

export type RecordCell = { h: number; l80: number; u80: number; y: number | null; in80: boolean | null };
/** 밤사이 기록(피그마 379:3029): 최근 n개 카드 날짜마다 내 종목의 예상 범위와 실제 시가(08:11 카드 우선) */
export async function recordData(codes: string[], n = 20): Promise<{ dates: string[]; cells: Map<string, Map<string, RecordCell>> }> {
  const dates = (await modelDates(n)).reverse();
  const cells = new Map<string, Map<string, RecordCell>>();
  if (!dates.length || !codes.length) return { dates, cells };
  const g = await timeGate();   // 화면 시각까지 나온 카드·채점만(그날 08:11 전이면 07:30 카드, 채점 전이면 동그라미 없음)
  const r = await db().query(
    `select distinct on (s.t, s.code) s.t, s.code, s.h, s.l80, s.u80, k.y, k.in80, kc.checked_at
     from model.card_stocks s left join model.check_stocks k on k.t = s.t and k.slot = s.slot and k.code = s.code
     left join model.checks kc on kc.t = k.t and kc.slot = k.slot
     where s.t = any($1) and s.code = any($2) and (s.t < $3 or (s.t = $3 and s.slot <= $4)) order by s.t, s.code, s.slot desc`, [dates, codes, g.today, g.slotMax]);
  for (const x of r.rows) {
    const m = cells.get(x.t) ?? new Map<string, RecordCell>();
    const ok = x.y != null && g.checkShown(x.t, x.checked_at);
    m.set(x.code, { h: Number(x.h), l80: Number(x.l80), u80: Number(x.u80), y: ok ? Number(x.y) : null, in80: ok ? x.in80 : null });
    cells.set(x.t, m);
  }
  return { dates, cells };
}

/** 종목별 최근 장전 거래 기록: t 이전 08:11 카드 최근 days장 중 장전 거래 값(nxt_g)이 있던 날 수. 코드 → [있던 날, 센 날].
 *  원래 버전 nxt_hist와 같은 쓰임: 3일 이상 셌는데 0이면 '평소 개장 전 거래가 없는 종목 → 새 숫자는 08:50 예상체결가부터'(2026-11-23) */
export async function nxtHistory(codes: string[], t: string, days = 10): Promise<Map<string, [number, number]>> {
  const out = new Map<string, [number, number]>();
  if (!codes.length) return out;
  try {
    const r = await db().query(
      `select code, count(nxt_g) as has, count(*) as n from model.card_stocks
       where slot = '0811' and code = any($1) and t in (select distinct t from model.card_stocks where slot = '0811' and t < $2 order by t desc limit $3)
       group by code`, [codes, t, days]);
    for (const x of r.rows) out.set(x.code, [Number(x.has), Number(x.n)]);
  } catch { /* 표가 없으면 빈 값 */ }
  return out;
}
