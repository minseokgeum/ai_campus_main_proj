// LLM 처리 결과(서버 DB news 영역, news_search/news_to_db.ipynb가 올림): 기사 한국어 한 줄, 시장·업종·종목 핫이슈, 종목 요약.
// 표가 아직 없거나 그날 결과가 없으면 빈 값을 돌려주고, 화면은 'AI 요약 준비 중'으로 둔다.
import "server-only";
import { db } from "@/lib/db";

export type Impact = "positive" | "negative" | "neutral" | "mixed" | string;
export type ArticleAI = { ko: string | null; impacts: { name: string | null; impact: Impact }[] };
export type Evidence = { key: string; ko: string | null; title: string; link: string };
export type Brief = {
  macro: string[];
  title: string | null;                                                    // 3분 브리핑 제목(news_headline)
  headings: string[];                                                      // 핵심 3줄의 소제목
  keywords: string[];
  evidence: Evidence[][];                                                  // 핵심 줄마다 근거 기사
  sectors: Map<string, string>;                                           // 업종 → 한 줄
  companies: Map<string, { line: string | null; impact: Impact | null; summary: string | null }>; // 종목코드 → 한 줄·영향·요약
  createdAt: string | null;
};

const EMPTY: Brief = { macro: [], title: null, headings: [], keywords: [], evidence: [], sectors: new Map(), companies: new Map(), createdAt: null };

/** 기사 키 → 한국어 한 줄 요약·회사별 영향 */
export async function articleAI(keys: string[]): Promise<Map<string, ArticleAI>> {
  const out = new Map<string, ArticleAI>();
  if (!keys.length) return out;
  try {
    const r = await db().query("select key, short_summary, impacts from news.llm_articles where key = any($1)", [keys]);
    for (const x of r.rows) out.set(x.key, { ko: x.short_summary ?? null, impacts: x.impacts ?? [] });
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
      pool.query("select sector, line from news.hot_sector where date = $1", [date]),
      pool.query("select company_code, line, impact from news.hot_company where date = $1", [date]),
      pool.query("select company_code, summary from news.company_summary where date = $1", [date]),
    ]);
    const companies: Brief["companies"] = new Map();
    for (const x of c.rows) companies.set(x.company_code, { line: x.line, impact: x.impact, summary: null });
    for (const x of cs.rows) companies.set(x.company_code, { ...(companies.get(x.company_code) ?? { line: null, impact: null }), summary: x.summary });
    const mr = m.rows[0];
    const groups: string[][] = ((mr?.payload?.keys_by_issue ?? (mr?.keys as string[] | undefined)?.map((k: string) => [k])) ?? []) as string[][];
    const flat = [...new Set(groups.flat())];
    const ev = flat.length ? (await pool.query(
      `select i.key, i.title, i.link, l.short_summary from items i left join news.llm_articles l on l.key = i.key where i.key = any($1)`, [flat])).rows : [];
    const byKey = new Map(ev.map((x) => [x.key as string, { key: x.key, ko: x.short_summary ?? null, title: x.title, link: x.link } as Evidence]));
    return {
      title: mr?.title ?? null,
      headings: (mr?.headings as string[]) ?? [],
      keywords: (mr?.keywords as string[]) ?? [],
      evidence: groups.map((g) => g.map((k) => byKey.get(k)).filter(Boolean) as Evidence[]),
      macro: (mr?.lines as string[]) ?? [],
      sectors: new Map(s.rows.map((x) => [x.sector as string, x.line as string])),
      companies,
      createdAt: m.rows[0]?.created_kst ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export { IMPACT_LABEL } from "@/lib/format";
