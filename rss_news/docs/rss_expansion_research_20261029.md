# RSS 확대 후보 조사 결과 (2026-10-29)

## 결론

기존 `config/feed_registry.csv`의 19개 매체·41개 설정 행과 매체명 및 정규화 URL을 비교한 뒤, 중복되지 않는 편집 매체 15개·22개 피드를 시험했다. 2026-10-29 18:18~18:20 KST 기준 결과는 다음과 같다.

| 구분 | 수 | 판정 기준 |
|---|---:|---|
| 조사한 신규 편집 매체 | 15 | 현재 레지스트리에 없는 매체 |
| 현재 사용 가능한 매체 | 14 | 최신 14일 안의 항목이 있고 RSS·Atom 분석 가능 |
| 오래된 피드만 확인된 매체 | 1 | Fast Company |
| 시험한 신규 피드 | 22 | 검색어·종목코드 없이 일반/섹션 뉴스를 제공하는 주소 |
| 현재 사용 가능한 피드 | 21 | HTTP 200, RSS·Atom 분석 성공, 최신 14일 안의 항목 확인 |
| 오래된 피드 | 1 | Fast Company `main`; 최신 항목 2026-06-18 |
| 접속·분석 실패 피드 | 0 | 이번 소량 시험 기준 |

작동 여부와 공식 지원 여부는 별도 판정이다. 현재 공식 RSS 목록에서 주소까지 확인된 매체는 ABC News와 CBS News 2개다. NBC News는 공식 페이지가 RSS의 존재는 언급하지만 시험 주소 자체를 나열하지 않는다. Engadget과 Fast Company는 과거 공식 안내가 있으나 현행 지원 여부를 추가 확인해야 한다. 나머지 주소는 publisher 도메인에서 작동하더라도 현행 공식 RSS 안내를 찾지 못했으므로 `주소/공식 지원 미확인` 상태를 유지한다.

이번 후보는 기본 수집 설정에 편입하지 않았다. `config/feed_registry.csv`의 SHA-256은 조사 전후 모두 `11e29a17cc51433dd7f5957a673a54131df3e874719db8f09626e9fd009ddee2`다.

## 2026-10-30 재확인

같은 후보 설정으로 2026-10-30 09:53~09:54 KST에 소량 시험을 한 번 더 실행했다. 새 실행 폴더는 `outputs/feed_candidate_research_20261029/20261030T005326_764888Z/`이며, 이전 실행 폴더는 수정하지 않았다.

- 매체 15개 중 사용 가능 14개, 시험 피드 22개 중 사용 가능 21개, 오래된 피드 1개로 전회 판정이 재현됐다.
- 모든 피드 항목에서 제목·URL·발행일 제공이 다시 확인됐다. NBC News의 RSS 본문 필드가 있는 항목 수만 25건에서 24건으로 바뀌었으며 피드 운영 판정에는 영향이 없다.
- Fast Company는 다시 HTTP 200·RSS 2.0으로 분석됐지만 최신 항목이 2026-06-18이어서 `오래됨` 판정을 유지했다.
- 기사형 표본 재확인에서 ABC News, NBC News, Al Jazeera English는 공개 본문 후보를 추출했다. MarketWatch는 HTTP 200이지만 시험 선택자로 본문 컨테이너를 찾지 못했다.
- CBS News, Engadget은 다시 공개 본문 후보를 추출했다. Supply Chain Dive와 Construction Dive는 전회 HTTP 403에서 이번 HTTP 200·본문 후보로 바뀌었다. 이 변화는 원문 접근 가능성이 시점별로 달라질 수 있음을 보여주며, 안정적인 전문 수집 성공 판정으로 사용하지 않는다.
- Bloomberg 403, The Wall Street Journal 401, Financial Times 403, The Atlantic 403, Manufacturing Dive 403은 우회하거나 반복 재시도하지 않았다. Fast Company와 The Verge는 본문 후보가 있어도 페이지의 CAPTCHA 문자열 때문에 주의 상태를 유지했다.
- `aicam` 환경에서 오프라인 산출물 검증과 프로젝트 단위 테스트 6개가 모두 통과했다. 기본 레지스트리 SHA-256은 재실행 후에도 동일하다.

재확인에서도 기사 HTML과 추출 본문 자체는 저장하지 않았다. 길이·문단 수·추출 선택자는 공개 본문 가능성의 진단값이며, 기사 전문 확보를 뜻하지 않는다. 전체 피드 수집, 기본 설정 편입, 자동 스케줄러 등록도 실행하지 않았다.

## 매체별 요약

`RSS 본문 필드 있음`은 `<content>` 또는 `content:encoded` 계열 필드가 있었다는 뜻일 뿐, 기사 전문과 같다는 판정이 아니다. 원문 시험의 `본문 후보` 역시 공개 HTML에서 구조화된 텍스트 후보를 추출했다는 뜻이며 전문성·누락·광고 혼입은 아직 검증하지 않았다.

| 매체 | 운영 판정 | 공식 지원 판정 | 피드 | RSS 요약 | RSS 본문 필드 | 공개 원문 가능성(대표 1건) |
|---|---|---|---:|---|---|---|
| ABC News | 사용 가능 | 공식 RSS 페이지 확인 | 3/3 | 있음 | 없음 | 기사형 재시험 HTTP 200, 본문 후보 1,927자·9문단; 전문 미확인 |
| CBS News | 사용 가능 | 공식 RSS 페이지 확인 | 3/3 | 있음 | 없음 | HTTP 200, 본문 후보 3,607자·18문단; 전문 미확인 |
| NBC News | 사용 가능 | 공식 페이지는 RSS 존재만 확인 | 1/1 | 있음 | 있음 | 기사형 재시험 HTTP 200, 본문 후보 5,132자·23문단; 전문 미확인 |
| Al Jazeera English | 사용 가능 | 주소/공식 지원 미확인 | 1/1 | 있음 | 없음 | HTTP 200, 본문 후보 4,008자·21문단; 전문 미확인 |
| Bloomberg | 사용 가능 | 공개 RSS 공식 안내 미확인 | 3/3 | 대부분 있음 | 없음 | 대표 원문 HTTP 403; 우회·재시도 안 함 |
| MarketWatch | 사용 가능 | 주소/공식 지원 미확인 | 1/1 | 있음 | 없음 | HTTP 200이나 시험 선택자로 본문 컨테이너 미확인 |
| The Wall Street Journal | 사용 가능 | 주소/공식 지원 미확인 | 2/2 | 대부분 있음 | 없음 | 대표 원문 HTTP 401; 로그인 우회 안 함 |
| Financial Times | 사용 가능 | 공개 RSS 공식 안내 미확인 | 1/1 | 있음 | 없음 | 대표 원문 HTTP 403; 우회 안 함 |
| Fast Company | 오래됨 | 과거 공식 안내만 확인 | 0/1 | 있음 | 없음 | 본문 후보는 있으나 페이지에 CAPTCHA 문자열; 피드 최신 항목은 2026-06-18 |
| The Verge | 사용 가능 | 주소/공식 지원 미확인 | 1/1 | 있음 | 있음 | HTTP 200, 본문 후보 있으나 CAPTCHA 문자열 포함; 전문 미확인 |
| Engadget | 사용 가능 | 과거 공식 안내만 확인 | 1/1 | 있음 | 있음 | HTTP 200, 본문 후보 2,849자·7문단; 전문 미확인 |
| The Atlantic | 사용 가능 | 주소/공식 지원 미확인 | 1/1 | 있음 | 있음 | 대표 원문 HTTP 403; 우회 안 함 |
| Manufacturing Dive | 사용 가능 | 편집 매체 공식 근거 확인, RSS 안내 미확인 | 1/1 | 있음 | 없음 | 대표 원문 HTTP 403; 우회 안 함 |
| Supply Chain Dive | 사용 가능 | 주소/공식 지원 미확인 | 1/1 | 있음 | 없음 | 대표 원문 HTTP 403; 우회 안 함 |
| Construction Dive | 사용 가능 | 편집 매체 공식 근거 확인, RSS 안내 미확인 | 1/1 | 있음 | 없음 | 대표 원문 HTTP 403; 우회 안 함 |

ABC의 원문 재시험 표본은 `wireStory` 경로였다. 따라서 ABC가 편집 매체라는 분류와 별개로, 개별 피드 항목에는 통신사·제휴 콘텐츠가 섞일 수 있다는 주의가 필요하다.

## 피드별 상세

모든 22개 피드는 제목·URL·발행일을 응답 항목 전부에서 제공했다. `요약/본문`은 각각 요약 필드가 있는 항목 수와 RSS 본문 필드가 있는 항목 수다. 최신 시각은 UTC다.

| 매체 | 피드 | 실제 시험 URL | 형식·HTTP | 항목/제목·URL·날짜 | 요약/본문 | 최신 발행일 | 결과 |
|---|---|---|---|---|---|---|---|
| ABC News | top | `https://feeds.abcnews.com/abcnews/topstories` | RSS 2.0·200 | 25/25·25·25 | 25/0 | 2026-10-29 03:54 | 사용 가능 |
| ABC News | business | `https://feeds.abcnews.com/abcnews/moneyheadlines` | RSS 2.0·200 | 25/25·25·25 | 25/0 | 2026-10-29 06:46 | 사용 가능 |
| ABC News | technology | `https://feeds.abcnews.com/abcnews/technologyheadlines` | RSS 2.0·200 | 25/25·25·25 | 25/0 | 2026-10-28 22:18 | 사용 가능 |
| CBS News | top | `https://www.cbsnews.com/latest/rss/main` | RSS 2.0·200 | 30/30·30·30 | 30/0 | 2026-10-29 09:09 | 사용 가능 |
| CBS News | moneywatch | `https://www.cbsnews.com/latest/rss/moneywatch` | RSS 2.0·200 | 30/30·30·30 | 30/0 | 2026-10-28 21:34 | 사용 가능 |
| CBS News | technology | `https://www.cbsnews.com/latest/rss/technology` | RSS 2.0·200 | 30/30·30·30 | 30/0 | 2026-10-29 09:00 | 사용 가능 |
| NBC News | news | `https://feeds.nbcnews.com/nbcnews/public/news` | RSS 2.0·200 | 25/25·25·25 | 25/25 | 2026-10-29 05:00 | 사용 가능 |
| Al Jazeera English | all | `https://www.aljazeera.com/xml/rss/all.xml` | RSS 2.0·200 | 25/25·25·25 | 25/0 | 2026-10-29 08:58 | 사용 가능 |
| Bloomberg | markets | `https://www.bloomberg.com/feeds/markets/news.rss` | RSS 2.0·200 | 20/20·20·20 | 19/0 | 2026-10-29 08:57 | 사용 가능 |
| Bloomberg | industries | `https://www.bloomberg.com/feeds/industries/news.rss` | RSS 2.0·200 | 20/20·20·20 | 20/0 | 2026-10-29 06:35 | 사용 가능 |
| Bloomberg | technology | `https://www.bloomberg.com/feeds/technology/news.rss` | RSS 2.0·200 | 20/20·20·20 | 20/0 | 2026-10-29 08:18 | 사용 가능 |
| MarketWatch | top_stories | `https://feeds.content.dowjones.io/public/rss/mw_topstories` | RSS 2.0·200 | 10/10·10·10 | 10/0 | 2026-10-29 09:15 | 사용 가능 |
| The Wall Street Journal | us_business | `https://feeds.content.dowjones.io/public/rss/WSJcomUSBusiness` | RSS 2.0·200 | 85/85·85·85 | 81/0 | 2026-10-29 09:06 | 사용 가능 |
| The Wall Street Journal | markets | `https://feeds.content.dowjones.io/public/rss/RSSMarketsMain` | RSS 2.0·200 | 61/61·61·61 | 61/0 | 2026-10-29 09:03 | 사용 가능 |
| Financial Times | home | `https://www.ft.com/?format=rss` → `https://www.ft.com/rss/home/international` | RSS 2.0·200 | 11/11·11·11 | 11/0 | 2026-10-29 08:37 | 사용 가능 |
| Fast Company | main | `https://www.fastcompany.com/user/fast-company/rss` | RSS 2.0·200 | 20/20·20·20 | 20/0 | 2026-06-18 11:00 | 오래됨 |
| The Verge | main | `https://www.theverge.com/rss/index.xml` | Atom 1.0·200 | 10/10·10·10 | 10/10 | 2026-10-29 02:22 | 사용 가능 |
| Engadget | main | `https://www.engadget.com/rss.xml` | RSS 2.0·200 | 20/20·20·20 | 20/20 | 2026-10-29 08:33 | 사용 가능 |
| The Atlantic | all | `https://www.theatlantic.com/feed/all/` | Atom 1.0·200 | 25/25·25·25 | 25/25 | 2026-10-29 00:54 | 사용 가능 |
| Manufacturing Dive | news | `https://www.manufacturingdive.com/feeds/news/` | RSS 2.0·200 | 10/10·10·10 | 10/0 | 2026-10-28 16:26 | 사용 가능 |
| Supply Chain Dive | news | `https://www.supplychaindive.com/feeds/news/` | RSS 2.0·200 | 10/10·10·10 | 10/0 | 2026-10-28 14:41 | 사용 가능 |
| Construction Dive | news | `https://www.constructiondive.com/feeds/news/` | RSS 2.0·200 | 10/10·10·10 | 10/0 | 2026-10-28 20:20 | 사용 가능 |

ABC 피드는 `feeds.abcnews.com`에서 `abcnews.com`으로 이동했지만 정상 RSS 2.0으로 분석됐다. FT도 국제 홈 피드로 이동했다. 리디렉션된 최종 URL은 원본 결과 CSV에 보존했다.

## 공식 근거와 주의점

- ABC News: 현행 [공식 RSS 페이지](https://abcnews.go.com/Site/page?id=3520115)가 Top Stories·Business·Technology 주소를 직접 제공한다.
- CBS News: 현행 [공식 RSS 페이지](https://www.cbsnews.com/rss/)가 Top Stories·MoneyWatch·Technology 주소를 직접 제공한다.
- NBC News: [공식 문의 페이지](https://www.nbcnews.com/information/nbc-news-info/contact-us-n1232521)는 RSS 피드의 존재만 언급한다. 시험 주소의 현행 공식 목록은 확인하지 못했다.
- Bloomberg: [공식 배포 제품 페이지](https://www.bloomberg.com/distribution/products/news/)는 상업용 뉴스 피드를 설명하지만 이번 공개 RSS URL을 나열하지 않는다. 따라서 작동 성공과 공식 공개 지원을 구분했다.
- Engadget: [과거 공식 FAQ](https://www.engadget.com/2004-03-02-engadget-faq.html)의 RSS 안내는 확인했지만 현행 공식 안내는 확인하지 못했다.
- Fast Company: [현재 프로필 페이지](https://www.fastcompany.com/user/fast-company)에 RSS 표시는 있으나 시험 피드가 4개월 이상 갱신되지 않았다.
- Manufacturing Dive와 Construction Dive의 공식 About 페이지는 각각 [Manufacturing Dive](https://www.manufacturingdive.com/about/), [Construction Dive](https://www.constructiondive.com/about/)가 자체 기자의 산업 저널리즘을 제공한다고 설명한다. 이는 편집 매체 근거이며 RSS 공식 지원 근거는 아니다.
- 주소 출처와 공식 근거 URL은 `config/new_feed_candidates_20261029.csv`에 행별로 보존했다. 공식 가이드를 찾지 못한 주소는 작동하더라도 `address_unconfirmed`를 유지했다.

## 검색어·종목코드형 및 비편집 서비스 분리

이번 22개 시험 피드는 모두 일반 또는 섹션 피드이며 검색어·종목코드를 요구하지 않는다. 아래 서비스는 별도 분류했고 사용 가능한 편집 매체 수에 포함하지 않았다.

| 서비스 | 유형 | 검색 조건 | 처리 |
|---|---|---|---|
| Google News RSS | 뉴스 집계 | 검색 RSS는 질의어 필요 | 편집 매체에서 제외 |
| Yahoo Finance 종목 피드 | 뉴스 집계/종목형 | 종목코드 필요 | 기존 레지스트리 연구용 후보와 중복; 신규 후보에서 제외 |
| PR Newswire | 보도자료 배포 | 카테고리·회사 선택 가능 | 보도자료 전용으로 분리 |
| Business Wire | 보도자료 배포 | 카테고리·회사 선택 가능 | 보도자료 전용으로 분리 |

Google News는 여러 발행사의 콘텐츠를 알고리즘으로 구성하는 집계 서비스이고, PR Newswire는 스스로 보도자료 배포 파트너라고 설명한다. 상세 분류는 `config/non_editorial_feed_services_20261029.csv`에 저장했다.

## 시험 범위와 한계

- 피드당 1회 공개 요청, 타임아웃 25초, 매체별 최소 간격 1초로 시험했다.
- 각 매체의 대표 원문은 최대 1건을 우선 시험했다. 최초 표본이 동영상이었던 ABC·NBC와 공통 선택자로 확인되지 않은 Al Jazeera·MarketWatch만 기사형 URL 1건씩 추가 재확인했다.
- 로그인·쿠키벽·CAPTCHA·유료벽을 우회하지 않았고, 401/403은 반복 재시도하지 않았다.
- 기사 HTML과 추출 본문은 저장하지 않았다. URL, 응답 코드, 길이·문단 수, 추출 방법, 해시만 저장했다.
- 본문 후보의 길이가 길어도 전문 확보로 판정하지 않았다. 모든 신규 후보의 `body_quality_status`는 `unverified`다.
- 전체 기사 본문 수집, 기본 설정 편입, SQLite 누적 저장, 자동 스케줄러 등록은 실행하지 않았다.

## 결과 파일

- 후보 설정: `config/new_feed_candidates_20261029.csv`
- 비편집/검색형 분류: `config/non_editorial_feed_services_20261029.csv`
- 시험 스크립트: `src/test_feed_candidates.py`
- 기사형 표본 재확인 스크립트: `src/recheck_body_samples.py`
- 실행 폴더: `outputs/feed_candidate_research_20261029/20261029T091805_018442Z/`
- 피드 상세: `feed_test_results.csv`, `feed_test_results.json`
- 매체 요약: `media_summary.csv`, `reviewed_media_summary.csv`
- 원문 표본 진단: `body_sample_results.csv`, `body_sample_recheck_20261029T092011_615300Z.csv`
- 필드 점검용 항목 메타데이터: `entry_field_sample.csv`
- 원본 피드 응답: `raw_feeds/`
- 조건·무결성: `run_conditions.json`, `registry_duplicate_check.csv`

`media_summary.csv`는 최초 자동 선택 결과이고, `reviewed_media_summary.csv`는 기사형 재확인 결과까지 반영한 최종 검토표다. 두 파일을 합치거나 원본 결과를 덮어쓰지 않았다.
