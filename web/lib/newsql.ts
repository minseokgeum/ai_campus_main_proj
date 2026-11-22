// 기사 목록 SQL에 함께 쓰는 조각. 기사 표(items) 별칭은 i, LLM 처리 결과 표(news.llm_articles) 별칭은 l.

/** 목록·건수에서 뺄 글: 서버가 뉴스가 아니라고 판정한 글(매체 제외 구역·시세 페이지·기사 아님·영상·사진 페이지·보도자료, 2026-11-22)
 *  + 매체가 막아 원문을 받지 못한 글(HTTP_ERROR: USA Today 계열 402·삭제된 기사 404 등. 요약·판정이 없어서. 다시 받기에 성공하면 상태가 바뀌어 다시 나온다, 2026-11-22)
 *  + LLM 추출이 투자와 관련 없다고 본 글(독자 편지·스포츠·생활 사연 등, extraction.graph.relevant = false, 2026-11-22) */
export const NEWS_OK = `coalesce(l.status, '') not in ('EXCLUDED_SECTION', 'QUOTE_PAGE', 'NOT_ARTICLE', 'VIDEO_PAGE', 'PRESS_RELEASE', 'HTTP_ERROR')
  and coalesce(l.extraction->'graph'->>'relevant', '') <> 'false'`;

/** '원문 보기' 주소: 언론사 원문 주소(서버가 구글 뉴스 링크를 풀어 둔 것)가 있으면 그것, 없으면 구글 뉴스 링크 */
export const LINK = `coalesce(nullif(l.original_url, ''), i.link)`;
