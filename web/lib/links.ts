// 내 종목 연결 그림(2026-11-22, 피그마 미국 연결 기업 그림을 검색어 연결표 기준으로 바꿈): 종목과 이어진 회사·제품·원자재·업종·테마.
// 원본은 서버 DB news.term_links(graph_db/term_links.ipynb: 검색어마다 그래프 관계·한글 이름). 소식 수는 브리핑 범위에 그 연결의 검색어로 들어온 기사 수.
// 글자 규칙은 디자인 예시 '④ 글자 규칙'과 같다: 선 위 이름(관계·방향 → 고객사·공급사·생산 제품…), 칸 아래 종류, 직접 관계는 실선 · 업종·테마로 넓게 이어진 것은 점선.
import "server-only";
import { db } from "@/lib/db";
import { NEWS_OK } from "@/lib/newsql";

export type LinkNode = {
  key: string;          // 칸 하나(해외 상대는 상대 회사 노드, 나머지는 한글 이름)
  name: string;         // 칸 이름(한글)
  kind: string;         // 칸 아래 종류: 회사 · 제품 · 원자재 · 브랜드 · 업종 · 테마 · 정책 · 사업
  rel: string;          // 선 위 이름
  direct: boolean;      // 직접 관계(실선)인지, 업종·테마로 넓게 이어진 것(점선)인지
  n: number;            // 밤사이 그 연결의 검색어로 들어온 기사 수
  terms: string[];      // 이 칸에 묶인 미국 뉴스 검색어 원문(따옴표 뗀 것). 칸을 누르면 보여 준다(번역 확인용, 2026-11-22)
};

type Rel = { label?: string; dir?: string };

const KIND_TAG: Record<string, string> = {
  "해외 상대": "회사", "브랜드": "브랜드", "구체 제품": "제품", "넓은 제품": "제품", "원자재·지표": "원자재",
  "업종 기본": "업종", "테마 기본": "테마", "테마 대표": "테마", "정책": "정책", "회사 기본": "사업",
};

/** 그래프 관계·방향 → 선 위 이름. 해외 상대의 '기타'만 있는 연결은 null(보여 주지 않음) */
function relName(kind: string, link: string, rels: Rel[]): string | null {
  const r = rels.find((x) => x.label && x.label !== "기타");
  if (kind === "해외 상대") {
    if (!r) return null;
    const fwd = r.dir !== "상대→종목";
    return ({ "공급": fwd ? "고객사" : "공급사", "구매": fwd ? "공급사" : "고객사", "경쟁": "경쟁사", "협력": "협력사", "수주": "발주처",
      "기술 계약": "기술 제휴", "투자": "투자처", "소유": "자회사", "분쟁": "분쟁 상대" } as Record<string, string>)[r.label!] ?? null;
  }
  // 제품만이 아니라 서비스(예: GKL 환전)도 있어서 "생산 제품" 대신 "주요 사업"(2026-11-22)
  if (r?.label === "생산") return kind === "원자재·지표" ? "생산 품목" : "주요 사업";
  if (r?.label === "구매") return kind === "원자재·지표" ? "구매 원료" : "구매 품목";
  if (kind === "브랜드") return "자사 브랜드";
  if (kind === "업종 기본") return "소속 업종";
  if (kind.startsWith("테마")) return "관련 테마";
  if (kind === "정책") return "관련 정책";
  if (kind === "회사 기본") return "회사 사업";
  return link === "none" ? "관련 사업" : "관련";
}

/** 여러 종목의 연결(종목코드 → 칸 목록, 오늘 소식 많은 순 → 직접 관계 먼저). start·end: 기사 수를 셀 수집 시각 범위 */
export async function stockLinks(codes: string[], start: Date, end: Date): Promise<Map<string, LinkNode[]>> {
  const out = new Map<string, LinkNode[]>(codes.map((c) => [c, []]));
  if (!codes.length) return out;
  try {
    const pool = db();
    const t = await pool.query(
      `select stock_code, kind, query, node, coalesce(nullif(name_ko, ''), node_name, query) as name, link, relations
       from news.term_links where stock_code = any($1) and kind <> '자기 회사'`, [codes]);
    const queries = [...new Set(t.rows.map((r) => r.query as string))];
    const h = queries.length ? await pool.query(
      `select h.term, i.key from items i join hits h on h.key = i.key left join news.llm_articles l on l.key = i.key
       where coalesce(i."drop", '') = '' and i.published_utc >= $1 and i.published_utc < $2 and i.first_seen_utc < $2 and h.term = any($3) and ${NEWS_OK}`, [start, end, queries]) : { rows: [] };   // 브리핑과 같은 범위(발행 시각, 끝 시각까지 수집된 것)
    const keysOf = new Map<string, Set<string>>();
    for (const r of h.rows) { const s = keysOf.get(r.term) ?? new Set<string>(); s.add(r.key); keysOf.set(r.term, s); }
    const groups = new Map<string, { node: LinkNode; keys: Set<string>; rank: number }>();
    for (const r of t.rows) {
      const rels = (typeof r.relations === "string" ? JSON.parse(r.relations) : r.relations ?? []) as Rel[];
      const rel = relName(r.kind, r.link, rels);
      if (!rel) continue;
      const direct = r.link === "direct";
      const gk = `${r.stock_code}|${r.kind === "해외 상대" ? r.node : String(r.name).trim()}`;
      const rank = direct ? 0 : r.link === "sector" ? 1 : 2;   // 같은 이름이 여러 줄이면 직접 관계 > 업종 > 테마의 이름표를 쓴다
      const g = groups.get(gk) ?? { node: { key: gk, name: String(r.name).trim(), kind: KIND_TAG[r.kind] ?? "", rel, direct, n: 0, terms: [] as string[] }, keys: new Set<string>(), rank };
      const term = String(r.query).replace(/"/g, "").trim();
      if (term && !g.node.terms.includes(term)) g.node.terms.push(term);
      if (rank < g.rank) { g.node = { ...g.node, kind: KIND_TAG[r.kind] ?? g.node.kind, rel, direct }; g.rank = rank; }
      if (r.kind === "해외 상대" && !r.query.includes('" "')) g.node.name = String(r.name).trim();   // 상대 회사 칸 이름은 회사 이름만 쓴 검색어의 이름
      for (const k of keysOf.get(r.query) ?? []) g.keys.add(k);
      groups.set(gk, g);
    }
    for (const g of groups.values()) {
      g.node.n = g.keys.size;
      out.get(g.node.key.split("|")[0])?.push(g.node);
    }
    for (const list of out.values()) list.sort((a, b) => b.n - a.n || Number(b.direct) - Number(a.direct) || a.name.localeCompare(b.name, "ko"));
  } catch { /* 표가 없으면 빈 그림 */ }
  return out;
}
