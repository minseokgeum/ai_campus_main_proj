# 뉴스 매체·수집 방식 시험

미국 뉴스를 **어떤 매체에서, 어떤 방식으로** 모을지 정할 때 한 시험들이다. 번호는 실제로 한 순서다. 결정은 `graph_db/graphDB.md` 4장(수집)과 6.5(검색어)와 `news_search/news_search.md`(구글 뉴스 검색)에 반영돼 있고, 이 폴더는 그 근거다.

| 노트북 | 확인한 것 | 정한 것 | 반영된 곳 |
|---|---|---|---|
| `1_google_rss_source_test.ipynb` | 구글 뉴스 RSS로 찾은 기사의 원문을 받아 본문을 추출할 수 있는 언론사(1회차 28곳, 2회차 10곳, 2026년 9~10월 날짜) | 본문 확보 가능 매체 11곳(CNBC, Yahoo Finance, CBS News, NY Post, Motley Fool, Fortune, Guardian, USA Today, Business Insider, CNN, Fox Business). Reuters·Bloomberg·WSJ 등은 차단·유료 | `news_search_tests/search_tests.ipynb`가 `google_rss_sources/round*/source_summary.csv`를 읽어 검색 매체를 골랐고, 수집·처리 노트북은 그 11곳을 고정해 쓴다 |
| `2_rss_history_test.ipynb` (+ `2_rss_history_test_report.md`) | 언론사 RSS만으로 과거 기간의 기사를 모을 수 있는지(날짜 아카이브, 페이지 넘김, archive.org) | 대부분 불가 → 과거 기사는 받지 않고 지금부터 상시 수집 | `graph_db/news_collector.ipynb`의 "과거 기사는 받지 않는다" |
| `3_rss_live_feed_test.ipynb` | 상시 수집에 쓸 피드: 신뢰도·금융 관련성 등급, 갱신 속도로 계산한 수집 간격, RSS·원문 본문 대조 | 피드 60개 판정(수집 14, 팀원 수집기에 있음 13, 목록만 18, 제외 14) | 상시 수집기의 일반 경제 매체(CNBC 섹션, LA Times 등). 이후 약관·robots.txt 기준으로 더 좁힘(graphDB.md 4.3) |
| `4_team_collector_check.ipynb` | 팀원 통합 RSS 수집기를 수정 없이 실행하고, 같은 기사를 독립적으로 다시 받아 대조(본문 누락·잡문구·기사 아닌 글, 수집 간격, 추출 방식 비교, NPR 대본 부풀림 재현) | 문제 목록과 개선 권장 | 통합 상시 수집기 설계(RSS 본문 우선, 본문 상태 점검) |

## 폴더

| 폴더 | 내용 |
|---|---|
| `google_rss_sources/` | 1번: RSS 검색·URL 복원 캐시, 회차별 판정 결과(`round1`, `round2`: `source_summary.csv`, `page_results.parquet`, `review_samples.csv`, HTML 캐시) |
| `rss_history/` | 2번: 피드 점검·과거 접근·본문 대조 결과와 캐시 |
| `rss_live/` | 3·4번: 지속 수집 피드 판정, 팀원 수집기 검증 결과와 캐시(`cache/team_check/`에 팀원 수집기 실행 DB) |
| `team_rss_news/` | 팀원이 만든 `rss_news/` 폴더 중 4번을 다시 돌리고 2번 보고서가 인용한 근거를 남기는 데 필요한 것만 옮긴 사본(수집기, 본문 규칙, 설정, 테스트, 매체 선정 문서) |

- 노트북은 이 폴더에서 실행한다(경로가 이 폴더 기준).
- 캐시(HTML·피드 원본)가 있으면 다시 실행해도 요청을 보내지 않는다. 캐시를 지우면 처음부터 다시 받는다.
- 이전 이름: 폴더 `news_collection/`, 노트북 `news_collection.ipynb`, `newsrss_test.ipynb`, `newsrss_live_test.ipynb`, `team_rss_check.ipynb`, 데이터 폴더 `source_test/`, `newsrss_test/`, `newsrss_live/` (2026-11-15에 바꿈).
