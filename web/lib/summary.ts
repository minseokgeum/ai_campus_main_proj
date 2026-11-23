// LLM 처리 결과(서버 DB news 영역, news_search/news_to_db.ipynb가 올림): 기사 한국어 한 줄, 시장·업종·종목 핫이슈, 종목 요약.
// 표가 아직 없거나 그날 결과가 없으면 빈 값을 돌려주고, 화면은 'AI 요약 준비 중'으로 둔다.
import "server-only";
import { db } from "@/lib/db";
import { LINK } from "@/lib/newsql";

export type Impact = "positive" | "negative" | "neutral" | "mixed" | string;
export type ArticleAI = { ko: string | null; impacts: { name: string | null; impact: Impact }[]; stock: Record<string, string> };   // stock: 종목코드 → 그 종목 기준 판정(news.stock_impacts)
export type Evidence = { key: string; ko: string | null; title: string; link: string };
export type Brief = {
  macro: string[];
  title: string | null;                                                    // 3분 브리핑 제목(news_headline)
  headings: string[];                                                      // 핵심 3줄의 소제목
  keywords: string[];
  evidence: Evidence[][];                                                  // 핵심 줄마다 근거 기사
  sectors: Map<string, string>;                                           // 업종 → 한 줄
  companies: Map<string, { line: string | null; impact: Impact | null; summary: string | null }>; // 종목코드 → 한 줄·영향·요약
  sectorEv: Map<string, Evidence>;                                         // 업종 → 그 한 줄의 근거 기사(3분 브리핑 산업 카드)
  companyEv: Map<string, Evidence>;                                        // 종목코드 → 그 한 줄의 근거 기사(3분 브리핑 내 종목 카드)
  createdAt: string | null;
};

const EMPTY: Brief = { macro: [], title: null, headings: [], keywords: [], evidence: [], sectors: new Map(), companies: new Map(), sectorEv: new Map(), companyEv: new Map(), createdAt: null };

/** 기사 키 → 한국어 한 줄 요약·회사별 영향.
 *  기사 첫 번째 종류가 주가 움직임(market_movement)이면 긍정·부정을 쓰지 않는다: 판정은 주가가 아니라 사업 내용 기준이라,
 *  "주가 21% 하락" 기사에 사업 내용으로 '긍정'이 붙으면 헷갈려서(2026-11-22). 목록·개수·밤사이 종목 줄·상세가 모두 이 값을 쓴다 */
export const PRICE_KIND = "market_movement";
export async function articleAI(keys: string[]): Promise<Map<string, ArticleAI>> {
  const out = new Map<string, ArticleAI>();
  if (!keys.length) return out;
  try {
    const [r, s] = await Promise.all([
      db().query("select key, short_summary, impacts, article_types->>0 as kind from news.llm_articles where key = any($1)", [keys]),
      db().query("select key, stock_code, impact from news.stock_impacts where key = any($1)", [keys]).catch(() => ({ rows: [] as Record<string, string>[] })),
    ]);
    const price = new Set<string>();
    for (const x of r.rows) {
      if (x.kind === PRICE_KIND) price.add(x.key);
      out.set(x.key, { ko: x.short_summary ?? null, impacts: x.kind === PRICE_KIND ? [] : x.impacts ?? [], stock: {} });
    }
    for (const x of s.rows) { const a = out.get(x.key); if (a && !price.has(x.key)) a.stock[x.stock_code] = x.impact; }
  } catch {
    /* 표가 아직 없으면 원문 제목 그대로 */
  }
  return out;
}

/** 브리핑 날짜(YYYY-MM-DD)의 핫이슈·요약 */
export async function aiBrief(date: string): Promise<Brief> {
  try {
    const pool = db();
    const [m, s, c, cs] = await Promise.all([
      pool.query("select lines, keys, title, headings, keywords, payload, created_kst from news.hot_macro where date = $1", [date]),
      pool.query("select sector, line, key from news.hot_sector where date = $1", [date]),
      pool.query("select company_code, line, impact, key from news.hot_company where date = $1", [date]),
      pool.query("select company_code, summary from news.company_summary where date = $1", [date]),
    ]);
    const companies: Brief["companies"] = new Map();
    for (const x of c.rows) companies.set(x.company_code, { line: x.line, impact: x.impact, summary: null });
    for (const x of cs.rows) companies.set(x.company_code, { ...(companies.get(x.company_code) ?? { line: null, impact: null }), summary: x.summary });
    const mr = m.rows[0];
    const groups: string[][] = ((mr?.payload?.keys_by_issue ?? (mr?.keys as string[] | undefined)?.map((k: string) => [k])) ?? []) as string[][];
    const flat = [...new Set([...groups.flat(), ...s.rows.map((x) => x.key), ...c.rows.map((x) => x.key)].filter(Boolean) as string[])];
    const ev = flat.length ? (await pool.query(
      `select i.key, i.title, ${LINK} as link, l.short_summary from items i left join news.llm_articles l on l.key = i.key where i.key = any($1)`, [flat])).rows : [];
    const byKey = new Map(ev.map((x) => [x.key as string, { key: x.key, ko: x.short_summary ?? null, title: x.title, link: x.link } as Evidence]));
    return {
      title: mr?.title ?? null,
      headings: (mr?.headings as string[]) ?? [],
      keywords: (mr?.keywords as string[]) ?? [],
      evidence: groups.map((g) => g.map((k) => byKey.get(k)).filter(Boolean) as Evidence[]),
      macro: (mr?.lines as string[]) ?? [],
      sectors: new Map(s.rows.map((x) => [x.sector as string, x.line as string])),
      companies,
      sectorEv: new Map(s.rows.filter((x) => byKey.has(x.key)).map((x) => [x.sector as string, byKey.get(x.key)!])),
      companyEv: new Map(c.rows.filter((x) => byKey.has(x.key)).map((x) => [x.company_code as string, byKey.get(x.key)!])),
      createdAt: m.rows[0]?.created_kst ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export { IMPACT_LABEL } from "@/lib/format";

/** 종목 이유(news.company_reason, news_company_reason.ipynb가 평일 06:25~ 아침 카드 직후 만듦): 종목코드 → 문장·관계사 문장·근거 기사·방향·매체 수.
 *  홈 '한 화면에 보기'의 "예상과 밤사이 소식, 같이 읽기" 자리. 표가 없거나 그날 줄이 없으면 빈 값 */
export type Reason = {
  line: string; relation: string | null; key: string | null;
  dir: "위쪽" | "아래쪽" | "엇갈림" | null;   // 기사 내용으로 본 이 종목 쪽 방향(자기 기사는 impact, 관계사 기사는 규칙으로 바꾼 stock_impact). 주가 방향이 아니다
  outlets: number | null;                     // 고른 소식의 매체 수(시간대 안)
};
const DIR: Record<string, Reason["dir"]> = { positive: "위쪽", negative: "아래쪽", mixed: "엇갈림" };
export async function companyReasons(date: string): Promise<Map<string, Reason>> {
  const out = new Map<string, Reason>();
  try {
    const { rows } = await db().query(
      `select company_code, line, relation_line, key, route, impact, stock_impact, payload->>'news_outlets' as outlets
       from news.company_reason where date = $1 and coalesce(line, '') <> ''`, [date]);
    for (const r of rows) {
      const imp = r.route === "관계사" ? r.stock_impact : r.impact;
      out.set(r.company_code, { line: r.line, relation: r.relation_line || null, key: r.key ?? null, dir: DIR[imp] ?? null, outlets: r.outlets == null ? null : Number(r.outlets) });
    }
  } catch { /* 표가 아직 없으면 빈 값 */ }
  return out;
}
