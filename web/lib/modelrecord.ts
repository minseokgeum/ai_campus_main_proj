// 모델 기록(2026-11-25 사용자 요청, 팀원 원래 버전 '기록' 탭 참고): 지금까지 날마다 낸 아침 예상이 실제 시작가와 얼마나 맞았는지.
// 서버가 매일 9시에 쌓는 종목별 채점(model.check_stocks)과 그날 예상(model.card_stocks)을 그대로 모아 계산한다. 따로 저장하지 않는다.
//  · 기준은 06:30 첫 예상(칸 이름 0730): 예상 시작가와 노란 띠. 2차 예상(08:10 개장 전 거래 가격)과 믿을 정도는 08:11 카드에서.
//  · 묶음: 설계 200종목(팀원이 규칙을 만들고 검증한 종목) · 나머지 서비스 대상 755종목(같은 규칙을 적용한 종목). data/tiers.json
//  · 기간: 규칙을 만들 때 본 기간(~2026-11-02) · 규칙 고정 뒤(2026-11-03~). 서비스 시작(11/20) 전 날짜는 같은 규칙으로 나중에 채운 기록이다.
//  · 화면 시각(시연 시각)까지 채점이 나온 날만 센다(lib/timegate).
import "server-only";
import { db } from "@/lib/db";
import { timeGate } from "@/lib/timegate";
import tiers from "@/data/tiers.json";

export const FREEZE = "20261103";   // 규칙 고정(2026-11-02 15:17) 뒤 첫 거래일

const TIER = tiers as Record<string, number>;
const CODES = { 1: Object.keys(TIER).filter((c) => TIER[c] === 1), 2: Object.keys(TIER).filter((c) => TIER[c] === 2) } as const;

/** 하루치 합계(평균은 화면에서 합계 ÷ 개수로) */
export type RecDay = {
  t: string; x: number;                      // x: 그날 야간 선물 변화
  n: number; in80: number; in90: number;     // 채점한 종목 수, 노란 띠(80%)·90% 범위 안에서 시작한 종목 수
  eh: number; ex: number; e0: number;        // |실제 − 첫 예상|, |실제 − 야간 선물 변화|, |실제 − 0(어제 종가 그대로)| 합
  eg: number; ng: number;                    // |실제 − 2차 예상(개장 전 거래 가격)| 합과 개장 전 거래가 있던 종목 수
  hd: number; hn: number;                    // 믿을 정도 '높음' 중 개장 전 거래 방향과 시작 방향이 같았던 수 / 센 수(보합 빼고)
};
export type RecSum = Omit<RecDay, "t" | "x"> & { days: number; from: string | null; to: string | null };

export function sumDays(days: RecDay[]): RecSum {
  const s: RecSum = { days: days.length, from: days[0]?.t ?? null, to: days[days.length - 1]?.t ?? null, n: 0, in80: 0, in90: 0, eh: 0, ex: 0, e0: 0, eg: 0, ng: 0, hd: 0, hn: 0 };
  for (const d of days) { s.n += d.n; s.in80 += d.in80; s.in90 += d.in90; s.eh += d.eh; s.ex += d.ex; s.e0 += d.e0; s.eg += d.eg; s.ng += d.ng; s.hd += d.hd; s.hn += d.hn; }
  return s;
}

const SQL = `
  with k as (
    select s.t, s.y, s.in80, s.in90, c.h, cd.x, g.grade_level, g.nxt_g, kc.checked_at
    from model.check_stocks s
    join model.checks kc on kc.t = s.t and kc.slot = s.slot
    join model.card_stocks c on c.t = s.t and c.code = s.code and c.slot = '0730'
    join model.cards cd on cd.t = s.t and cd.slot = '0730'
    left join model.card_stocks g on g.t = s.t and g.code = s.code and g.slot = '0811'
    where s.slot = '0730' and s.code = any($1) and s.t <= $2 and s.y is not null)
  select t, max(x) as x, max(checked_at) as checked_at, count(*) as n,
    sum(in80::int) as in80, sum(in90::int) as in90, sum(abs(y - h)) as eh, sum(abs(y - x)) as ex, sum(abs(y)) as e0,
    coalesce(sum(abs(y - nxt_g)) filter (where nxt_g is not null), 0) as eg, count(nxt_g) as ng,
    count(*) filter (where grade_level = '높음' and nxt_g <> 0 and y <> 0 and sign(nxt_g) = sign(y)) as hd,
    count(*) filter (where grade_level = '높음' and nxt_g <> 0 and y <> 0) as hn
  from k group by t order by t`;

const cache = new Map<string, { at: number; v: RecDay[] }>();
const TTL = 5 * 60_000;

/** 묶음(1 = 설계 200종목, 2 = 나머지 755종목)의 날짜별 기록. 오래된 날부터 */
export async function modelRecord(group: 1 | 2): Promise<RecDay[]> {
  const g = await timeGate();
  const key = `${group}:${g.today}`;
  const hit = cache.get(key);
  let rows: (RecDay & { checked_at: Date | null })[];
  if (hit && Date.now() - hit.at < TTL) rows = hit.v as typeof rows;
  else {
    const r = await db().query(SQL, [CODES[group], g.today]);
    rows = r.rows.map((x) => ({
      t: String(x.t), x: Number(x.x), checked_at: x.checked_at, n: Number(x.n), in80: Number(x.in80), in90: Number(x.in90),
      eh: Number(x.eh), ex: Number(x.ex), e0: Number(x.e0), eg: Number(x.eg), ng: Number(x.ng), hd: Number(x.hd), hn: Number(x.hn),
    }));
    cache.set(key, { at: Date.now(), v: rows });
  }
  return rows.filter((d) => g.checkShown(d.t, d.checked_at));
}

export const groupSize = (group: 1 | 2) => CODES[group].length;
