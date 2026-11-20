// 기준 자료(작은 JSON): 시험 종목 17개, 검색어 → 종목 연결표. 계정별 보유·관심 종목은 DB(app 스키마, lib/portfolio.ts).
// stocks.json·terms.json은 news_search/source/terms/test_queries.csv(검색어는 query 칸: 수집 DB hits.term과 같은 큰따옴표 포함 모양)와 graph_db/source/targets.csv에서 만든 것(2026-11-20).
// 검색어 표가 DB로 옮겨지면 이 파일 대신 DB를 읽는다.
import stocksJson from "@/data/stocks.json";
import termsJson from "@/data/terms.json";

export type Stock = { name: string; sector: string; market: string };
export type Term = { term: string; code: string; kind: string; theme: string };

export const STOCKS = stocksJson as Record<string, Stock>;
export const TERMS = termsJson as Term[];

/** 시장 전체 소식으로 보는 검색어 종류(종목 고유가 아닌 업종·테마·원자재·정책) */
export const MARKET_KINDS = new Set(["업종 기본", "테마 기본", "테마 대표", "원자재·지표", "정책"]);

export function stockName(code: string): string {
  return STOCKS[code]?.name ?? code;
}
