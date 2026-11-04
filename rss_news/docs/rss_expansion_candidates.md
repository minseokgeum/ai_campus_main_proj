# RSS 수집 매체 확대 후보 조사

## 2026-11-03 운영 판정 추가

- The New York Times: Business·Technology RSS 목록 수집은 유지한다. 원문 일반 HTTP 요청에서 DataDome 403이 반복 확인되어 `feed_registry.csv`의 두 피드 모두 `body_collection_enabled=false`, `body_quality_status=access_blocked_datadome`으로 변경했다. 자동 본문 수집 대상에서 제외하며, summary만 있는 기사는 관계표 분석 대상에서 제외한다. 기존 실행 결과와 DB 이력은 수정하지 않는다. 공식 본문 제공 경로 확보 시 재검토한다.
- 다음 수동 표본 확인 대상: NPR. 주요 분야는 일반 뉴스·정치·국제·경제·과학·문화다. 기존 표본은 본문 추출에 성공했으나 캡션·안내·주제 태그 혼입이 있어 일반 기사 추가 표본에서 확인한다.

조사·시험일: **2026-10-29 (KST)**

## 범위

검색어 없이 일반·경제·산업·기술 뉴스를 넓게 받는 영문 RSS·Atom 후보를 조사했다. 기존 6개 매체와 겹치지 않는 10개 매체, 17개 피드를 별도 설정으로 시험했다. 기업명, 반도체, 종목 검색어는 사용하지 않았다.

공식 안내를 우선했다. 공식 RSS 안내가 검색에서 확인되지 않은 경우에는 발행사 소유 도메인의 공개 피드만 `안내 재확인` 후보로 표시했다. 모든 후보는 기본 `config/feeds.csv`에 합치지 않았다.

시험 결과 17개 모두 HTTP 200, RSS 2.0 분석에 성공했다. 168시간 내 피드 항목은 중복 제거 전 417건, URL 중복 제거 후 383건이며 발행일 미확인 기사는 0건이다.

## 매체별 요약

| 매체 | 피드 | 기간 내 고유 기사 | RSS 텍스트 방식 | 조사 판정 |
| --- | ---: | ---: | --- | --- |
| BBC News | 3 | 57 | 요약만, 본문 없음 | 작동. 공식 Feed 지원 문서 확인 |
| The Guardian | 3 | 102 | 긴 요약 중심. `content`는 1건 66자뿐 | 작동. 공식 도움말의 `/rss` 규칙 확인 |
| Ars Technica | 1 | 20 | `content` 582~1,549자 | 작동. 공식 안내상 전문 RSS는 구독자 기능이므로 공개 피드는 부분 본문 후보 |
| TechCrunch | 1 | 20 | 요약 53~336자, 본문 없음 | 작동. 공식 구독 안내 확인 |
| WIRED | 2 | 63 | 요약만, 본문 없음 | 작동. 공식 RSS 안내 확인 |
| The New York Times | 2 | 70 | 요약과 일부 짧은 `content` 33~270자 | 작동. 발행사 RSS 도메인이지만 현행 공식 안내 페이지 재확인 필요 |
| NPR | 2 | 19 | 요약과 짧은 `content` 129~281자 | 작동. 발행사 feeds 도메인이지만 공식 목록 검색 접근 제한 |
| ProPublica | 1 | 12 | `content` 6,222~47,067자 | 작동. 전문형 후보이나 공식 RSS 안내 페이지 재확인 필요 |
| IEEE Spectrum | 1 | 10 | `content` 없음. `summary`가 323~24,075자로 편차 큼 | 작동. 요약 필드가 본문 역할을 하는지 별도 감사 필요 |
| MIT Technology Review | 1 | 10 | 9건에 `content` 2,409~10,121자 | 작동. 전문형 후보이나 공식 RSS 안내 페이지 재확인 필요 |

매체별 고유 기사 수 합계는 383건이다. NPR의 두 피드 사이처럼 같은 URL이 겹칠 수 있어 피드별 기간 내 항목 합계와 다르다.

## 피드별 접속·분석 결과

| 매체 | 피드명 | 실제 피드 URL | 기간 내 / 전체 | 요약 제공 | RSS 본문 제공 | 주의점 |
| --- | --- | --- | ---: | --- | --- | --- |
| BBC News | top | `https://feeds.bbci.co.uk/news/rss.xml` | 34 / 35 | 35/35 | 0/35 | 제목·요약 중심 |
| BBC News | business | `https://feeds.bbci.co.uk/news/business/rss.xml` | 25 / 39 | 39/39 | 0/39 | 14건은 기간 밖 |
| BBC News | technology | `https://feeds.bbci.co.uk/news/technology/rss.xml` | 13 / 20 | 20/20 | 0/20 | 7건은 기간 밖 |
| The Guardian | world | `https://www.theguardian.com/world/rss` | 44 / 45 | 45/45 | 1/45 | 본문 1건도 66자이므로 실질적으로 요약 중심 |
| The Guardian | business | `https://www.theguardian.com/uk/business/rss` | 46 / 46 | 46/46 | 0/46 | 요청 URL에서 UK URL로 이동 |
| The Guardian | technology | `https://www.theguardian.com/uk/technology/rss` | 22 / 35 | 35/35 | 0/35 | 13건은 기간 밖, 요청 URL에서 이동 |
| Ars Technica | all_news | `https://feeds.arstechnica.com/arstechnica/index` | 20 / 20 | 20/20 | 20/20 | 공개 본문 582~1,549자. 전문 RSS는 구독자 기능 |
| TechCrunch | all | `https://techcrunch.com/feed/` | 20 / 20 | 20/20 | 0/20 | 요약 중심 |
| WIRED | top | `https://www.wired.com/feed/rss` | 50 / 50 | 50/50 | 0/50 | 요약 중심, 기사 페이지는 구독 제한 가능 |
| WIRED | business | `https://www.wired.com/feed/category/business/latest/rss` | 17 / 20 | 20/20 | 0/20 | 3건은 기간 밖 |
| The New York Times | business | `https://rss.nytimes.com/services/xml/rss/nyt/Business.xml` | 50 / 50 | 48/50 | 37/50 | `content` 33~243자로 캡션·짧은 설명 수준 |
| The New York Times | technology | `https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml` | 24 / 24 | 24/24 | 12/24 | `content` 41~270자로 전문 아님 |
| NPR | news | `https://feeds.npr.org/1001/rss.xml` | 10 / 10 | 10/10 | 10/10 | `content` 152~251자로 짧은 설명 |
| NPR | business | `https://feeds.npr.org/1006/rss.xml` | 10 / 10 | 10/10 | 10/10 | `content` 129~281자로 짧은 설명 |
| ProPublica | main | `https://www.propublica.org/feeds/propublica/main` | 12 / 20 | 20/20 | 20/20 | 기간 내 본문 6,222~47,067자. 전문 여부 표본 감사 필요 |
| IEEE Spectrum | all | `https://spectrum.ieee.org/feeds/feed.rss` | 10 / 30 | 30/30 | 0/30 | `summary` 길이가 매우 길어 본문 역할 여부 확인 필요 |
| MIT Technology Review | all | `https://www.technologyreview.com/feed/` | 10 / 10 | 9/10 | 원시 항목 10/10, 저장 기사 9/10 | 정제 후 빈 값 또는 병합 차이를 확인할 후속 감사 필요 |

`RSS 본문`은 `<content>` 계열 요소 기준이며 길다고 전문으로 판정하지 않았다. IEEE Spectrum처럼 긴 텍스트가 `summary`에 들어가는 피드는 필드 이름만으로 품질을 비교할 수 없다.

## 공식 안내와 출처

- BBC: [BBC 공식 Feed 지원 문서](https://support.bbc.co.uk/platform/feeds/NewsFeeds.htm)는 News feeds와 전체 OPML을 안내한다.
- The Guardian: [공식 RSS 도움말](https://www.theguardian.com/help/feeds)은 인덱스 페이지 URL에 `/rss`를 붙이는 방법을 안내한다.
- Ars Technica: [공식 RSS 안내](https://arstechnica.com/rss-feeds/)에서 All News 피드를 제공한다. [구독 안내](https://arstechnica.com/subscribe/)는 full-text RSS를 구독자 기능으로 설명한다.
- TechCrunch: [공식 Subscribing 안내](https://techcrunch.com/subscribing/)가 공개 feed 링크를 제공한다.
- WIRED: [공식 RSS 안내](https://www.wired.com/about/rss-feeds/)가 Top Stories와 Business를 포함한 섹션 피드를 제공한다.
- New York Times와 NPR은 발행사 소유 RSS 도메인의 공개 주소가 실제 동작했지만, 이번 검색에서는 현행 공식 목록 페이지 내용을 직접 확인하지 못했다. 기본 편입 전 안내·이용 조건 재확인이 필요하다.
- ProPublica, IEEE Spectrum, MIT Technology Review는 발행사 도메인의 피드가 실제 동작했다. IEEE Spectrum은 [공식 기사](https://spectrum.ieee.org/ieee-spectrum-online-content-is-liberated)에서 RSS 제공을 언급하지만 현재 주소 목록은 별도 확인이 필요하다. ProPublica와 MIT Technology Review도 현행 공식 안내 페이지를 추가 확인해야 한다.

## 기본 편입 전 제안

1. **우선 본문 감사:** ProPublica, MIT Technology Review, IEEE Spectrum. 긴 텍스트가 실제 전문인지, 캡션·푸터·광고가 얼마나 섞이는지 표본 원문 비교가 필요하다.
2. **요약형 공급원으로 검토:** BBC, TechCrunch, WIRED, New York Times, NPR. 본문 확보가 목표라면 기사 원문 접근 정책과 추출 가능성을 별도로 시험해야 한다.
3. **중간 본문형 검토:** Ars Technica. 공개 피드는 부분 본문이며 공식적으로 전문 RSS는 구독자 기능이다.
4. **Guardian 형식 재평가:** 과거 공식 발표는 full-content RSS를 설명했지만 이번 실제 응답은 요약 중심이었다. 현재 동작을 우선해 원문 추출 시험 대상으로 본다.
5. 이용 조건과 자동 수집 허용 범위를 확인한 뒤, 매체별 본문 품질·접근 안정성·중복률을 함께 평가하고 기본 설정 편입 여부를 결정한다.

## 저장 위치

- 후보 설정: `config/feed_expansion_candidates_20261029.csv`
- 후보별 시험 상태: `config/feed_expansion_status_20261029.csv`
- 시험 결과: `outputs/feed_expansion_research_20261029/20261029T083706_031577Z/`
- 피드별 상태: 위 폴더의 `feed_status.csv`, `feed_status.json`
- 기사 후보 383건: 위 폴더의 `articles.csv`, `articles.json`
- 원본 피드: 위 폴더의 `raw_feeds/`

이 383건은 기존 기본 536건, Yahoo·CNN·Business Insider 추가 시험 85건과 합치지 않았다.
