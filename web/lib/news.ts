// 밤사이 기사: 오라클 수집 DB의 items(기사)·hits(검색어–기사 연결)를 읽어 종목·업종·시장으로 나눈다.
import { db } from "@/lib/db";
import { briefing, type Briefing } from "@/lib/briefing";
import { appNow } from "@/lib/clock";
import { MARKET_KINDS, STOCKS, TERMS } from "@/lib/data";
import { articleAI } from "@/lib/summary";
import { LINK, NEWS_OK } from "@/lib/newsql";

export type Article = {
  key: string;
  title: string; // 영어 원제목
  ko: string | null; // 한국어 한 줄 요약(LLM 추출 결과가 있을 때, news.llm_articles)
  source: string; // 구글이 준 매체 이름(예: Reuters)
  outlet: string; // 우리 수집 매체 11곳 중 하나(예: finance.yahoo.com)
  published: string; // ISO(UTC)
  link: string; // 원문 주소(언론사 원문 주소가 있으면 그것, 없으면 구글 뉴스 링크)
  codes: string[]; // 걸린 검색어의 종목코드(업종·테마 검색어 포함)
  direct: string[]; // 그 종목 고유 검색어(자기 회사·브랜드·제품·해외 상대 등)로 걸린 종목코드 — 내 종목 뉴스는 이것만
  rank: Record<string, number>; // 종목마다 가장 가까운 검색어 종류의 순위(0 = 자기 회사). 종목 블록에서 가까운 기사 먼저
  themes: string[]; // 걸린 업종·테마 이름
  kinds: string[]; // 걸린 검색어 종류
  market: boolean; // 시장 전체 소식(업종·테마·원자재·정책 검색어로 걸림)
  impacts: { name: string | null; impact: string }[]; // AI가 판정한 회사별 영향(news.llm_articles.impacts)
  stock: Record<string, string>;                         // 종목코드 → 그 종목 기준 판정(서버 news.stock_impacts: 자기 기사 또는 방향 규칙표의 관계사 기사)
};

export type Night = { brief: Briefing; articles: Article[] };

const BY_TERM = new Map<string, { term: string; code: string; kind: string; theme: string }[]>();
for (const t of TERMS) BY_TERM.set(t.term, [...(BY_TERM.get(t.term) ?? []), t]);
const ALL_TERMS = [...BY_TERM.keys()];

// 종목과 가까운 순서(자기 회사 > 브랜드 > 구체 제품 > 해외 상대 > 넓은 제품). 정확한 관련 판단은 AI 처리 결과가 생기면 그걸로 바꾼다.
const RANK: Record<string, number> = { "자기 회사": 0, "브랜드": 1, "회사 기본": 1, "구체 제품": 2, "해외 상대": 3, "넓은 제품": 4 };

const SQL = `
  select i.key, i.title, i.source, i.outlet, i.published_utc, min(${LINK}) as link, array_agg(distinct h.term) as terms
  from items i join hits h on h.key = i.key left join news.llm_articles l on l.key = i.key
  where coalesce(i."drop", '') = '' and i.first_seen_utc >= $1 and i.first_seen_utc < $2 and h.term = any($3)   -- 수집 시각 기준(요약과 같은 범위)
    and ${NEWS_OK}   -- 뉴스가 아닌 글·투자와 관련 없는 글은 빼기(lib/newsql.ts)
  group by i.key
  order by i.published_utc desc
  limit 3000`;

const cache = new Map<string, { at: number; v: Article[] }>();
const TTL = 60_000; // 1분(수집은 15초마다 새 결과가 들어옴)

const RE_CACHE = new Map<string, RegExp>();
/** 검색어(큰따옴표 포함 모양)가 제목에 단어로 들어 있는지(대소문자 무시) */
function inTitle(title: string, term: string): boolean {
  let re = RE_CACHE.get(term);
  if (!re) {
    re = new RegExp(`(^|[^A-Za-z0-9])${term.replace(/^"|"$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i");
    RE_CACHE.set(term, re);
  }
  return re.test(title);
}

function label(kind: string, theme: string): string {
  if (theme) return theme;
  return kind === "원자재·지표" ? "원자재·지표" : kind === "정책" ? "정책" : "";
}

export async function nightNews(ymd?: string): Promise<Night> {
  const brief = briefing(ymd, await appNow());   // 시연 시각이면 그 시각의 브리핑
  const hit = cache.get(brief.date);
  if (hit && Date.now() - hit.at < TTL) return { brief, articles: hit.v };
  const { rows } = await db().query(SQL, [brief.start, brief.end, ALL_TERMS]);
  const articles: Article[] = rows.map((r) => {
    const links = (r.terms as string[]).flatMap((t) => BY_TERM.get(t) ?? []);
    const themes = [...new Set(links.filter((l) => MARKET_KINDS.has(l.kind)).map((l) => label(l.kind, l.theme)).filter(Boolean))];
    // 종목 고유 검색어는 제목에 그 검색어가 단어로 들어 있을 때만 종목에 잇는다(구글은 본문·곁가지에만 있어도 결과에 넣어서). 2026-11-20 v0 규칙
    const own = links.filter((l) => !MARKET_KINDS.has(l.kind) && inTitle(r.title, l.term));
    return {
      key: r.key, title: r.title, ko: null, source: r.source || r.outlet, outlet: r.outlet,
      published: new Date(r.published_utc).toISOString(), link: r.link,
      codes: [...new Set(links.map((l) => l.code))].filter((c) => STOCKS[c]),
      direct: [...new Set(own.map((l) => l.code))].filter((c) => STOCKS[c]),
      rank: own.reduce<Record<string, number>>((m, l) => ({ ...m, [l.code]: Math.min(m[l.code] ?? 9, RANK[l.kind] ?? 5) }), {}),
      themes, kinds: [...new Set(links.map((l) => l.kind))],
      market: links.some((l) => MARKET_KINDS.has(l.kind)),
      impacts: [], stock: {},
    };
  });
  const ai = await articleAI(articles.map((a) => a.key));
  for (const a of articles) { a.ko = ai.get(a.key)?.ko ?? null; a.impacts = ai.get(a.key)?.impacts ?? []; a.stock = ai.get(a.key)?.stock ?? {}; }
  cache.set(brief.date, { at: Date.now(), v: articles });
  return { brief, articles };
}

/** 종목코드별 기사(종목과 가까운 검색어 먼저, 같으면 최신 먼저). 업종·테마 검색어로만 걸린 기사는 빼고, 그 종목 고유 검색어로 걸린 기사만 */
export function byStock(articles: Article[], codes: string[]): Map<string, Article[]> {
  const out = new Map<string, Article[]>(codes.map((c) => [c, []]));
  for (const a of articles) for (const c of a.direct) out.get(c)?.push(a);
  for (const [c, list] of out) list.sort((x, y) => (x.rank[c] ?? 9) - (y.rank[c] ?? 9) || y.published.localeCompare(x.published));
  return out;
}

/** 업종(WI26)별 기사: 그 업종 종목의 고유 검색어로 걸렸거나, 같은 이름의 업종·테마 검색어로 걸린 기사 */
export function bySector(articles: Article[], sectors: string[]): Map<string, Article[]> {
  const out = new Map<string, Article[]>(sectors.map((s) => [s, []]));
  for (const a of articles) {
    const ss = new Set([...a.direct.map((c) => STOCKS[c]?.sector), ...a.themes].filter(Boolean));
    for (const s of ss) out.get(s as string)?.push(a);
  }
  return out;
}

/** 많이 나온 업종·테마(홈 '오늘의 핵심' 자리) */
export function topThemes(articles: Article[], n = 3): string[] {
  const cnt = new Map<string, number>();
  for (const a of articles) for (const t of a.themes) cnt.set(t, (cnt.get(t) ?? 0) + 1);
  return [...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([t]) => t);
}

// 기사 영향 판정(회사 이름으로 나옴)을 종목에 잇기: 그 종목의 자기 회사·브랜드 검색어나 종목명과 이름이 겹치면 그 종목의 판정으로 본다.
// 판정이 종목코드로 오면 이 맞추기는 필요 없다(프롬프트 수정 목록 참고).
/** 이 기사가 그 종목에 긍정·부정·중립·엇갈림인지(서버가 계산한 news.stock_impacts). 판정이 없으면 null */
export function impactFor(a: Article, code: string): string | null {
  return a.stock[code] ?? null;
}

export type Verdicts = { total: number; neg: number; pos: number; neu: number };
/** 한 종목 기사 목록의 판정 개수(엇갈림은 중립으로 셈) */
export function verdictsOf(list: Article[], code: string): Verdicts {
  const v = { total: list.length, neg: 0, pos: 0, neu: 0 };
  for (const a of list) { const i = a.stock[code]; if (i === "negative") v.neg++; else if (i === "positive") v.pos++; else if (i) v.neu++; }
  return v;
}

export type PastArticle = { key: string; title: string; ko: string | null; published: string; link: string; outlet: string; group: string };

/** 한 종목의 지난 며칠 기사(내 종목 상세 '지난 소식', 피그마 147:619). 그 종목 고유 검색어가 제목에 있는 기사만.
 *  group: 같은 소식 묶음 열쇠(서버 news.stories의 사건·소식 번호. 없으면 원문 주소 → 같은 주소는 한 묶음) */
export async function stockNewsDays(code: string, days = 7): Promise<PastArticle[]> {
  const own = TERMS.filter((t) => t.code === code && !MARKET_KINDS.has(t.kind)).map((t) => t.term);
  if (!own.length) return [];
  try {
    const end = await appNow();   // 화면 시각까지 들어온 기사(시연 시각이면 그 시각 기준 days일)
    const { rows } = await db().query(
      `select i.key, i.title, min(${LINK}) as link, i.published_utc, coalesce(nullif(i.source, ''), i.outlet) as outlet,
              min(s.story_id) as story_id, min(s.news_id) as news_id, array_agg(distinct h.term) as terms
       from items i join hits h on h.key = i.key left join news.llm_articles l on l.key = i.key left join news.stories s on s.key = i.key
       where coalesce(i."drop", '') = '' and i.first_seen_utc >= $2 and i.first_seen_utc < $3 and h.term = any($1) and ${NEWS_OK}
       group by i.key order by i.published_utc desc limit 300`, [own, new Date(end.getTime() - days * 86400_000), end]);
    const hit = rows.filter((r) => (r.terms as string[]).some((term) => inTitle(r.title, term)));
    const ai = await articleAI(hit.map((r) => r.key));
    return hit.map((r) => ({ key: r.key, title: r.title, ko: ai.get(r.key)?.ko ?? null, published: new Date(r.published_utc).toISOString(), link: r.link,
      outlet: String(r.outlet ?? ""), group: r.story_id && r.news_id ? `${r.story_id}|${r.news_id}` : r.link }))
      .sort((a, b) => b.published.localeCompare(a.published));
  } catch {
    return [];
  }
}

/** 야간선물 시간(시작 18:00부터 12시간) 동안 15분마다 발행된 미국 기사 수 48칸(배포용 '야간선물 흐름 창'). 기사는 수집 DB의 거르기를 통과한 것 */
export async function newsBuckets(start: Date): Promise<number[]> {
  const out = Array.from({ length: 48 }, () => 0);
  try {
    const end = new Date(start.getTime() + 12 * 3600_000);
    const { rows } = await db().query(
      `select floor(extract(epoch from (i.published_utc - $1::timestamptz)) / 900)::int as b, count(*)::int as n
       from items i left join news.llm_articles l on l.key = i.key
       where coalesce(i."drop", '') = '' and i.published_utc >= $1 and i.published_utc < $2 and ${NEWS_OK} group by 1`, [start, end]);
    for (const r of rows) if (r.b >= 0 && r.b < 48) out[r.b] = r.n;
  } catch { /* 표가 없으면 0 */ }
  return out;
}
