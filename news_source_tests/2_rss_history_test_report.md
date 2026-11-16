# 미국 언론사 RSS 과거 뉴스 수집 테스트 결과

- 테스트일: 2026-11-04 (기사 목록), 2026-11-05 (본문 수집 추가, 전체 다시 실행)
- 테스트 기간: 2025-10-14 ~ 2025-10-15 (미국 동부시간, 이틀)
- 노트북: [2_rss_history_test.ipynb](2_rss_history_test.ipynb)
- 결과 파일: [rss_history/](rss_history/)
  - 기사 목록: `feed_summary.csv`, `access_check.csv`, `live_check.csv`, `feed_lists.json`, `articles_2025-10-14_2025-10-15.parquet`
  - 본문: `body_check.parquet`, `body_summary.csv`, `body_review.csv`, `body_lists.json`
- 이 문서의 수치는 2026-11-05 다시 실행한 결과 기준입니다. 11-04 결과와 달라진 것은 Quartz 피드 복구(실패 → 정상)와 Fast Company 기사 1건 증가뿐입니다.

## 1. 요약

- 검색어 없이 언론사 RSS만으로 **과거 원하는 날짜의 기사를 빠짐없이 모을 수 있는 피드는 81개 중 12개**입니다.
  테스트 기간 이틀 동안 12개 피드에서 1,295건을 받았고, 중복은 0건입니다.
- 12개 중 9개는 **WordPress 날짜 아카이브 피드**로 날짜를 직접 지정해서 받고, 2022-10-18까지 동작하는 것을 확인했습니다.
  나머지 3개는 **피드 페이지를 과거로 넘기는 방식**으로 받습니다.
- **CNBC, WSJ, MarketWatch, Bloomberg, NYT, Fox Business 등 핵심 금융 언론사는 RSS로 과거 기사를 가져올 방법이 없습니다.**
  지금부터 주기적으로 받아 쌓거나 다른 경로(Google News RSS 검색 등)와 같이 써야 합니다.
- archive.org(Wayback Machine)에 저장된 피드 사본을 이어붙이는 방식도 시도했지만, 요청 제한(HTTP 429) 때문에 제외했습니다.
- **본문까지 받을 수 있는 곳은 12개 중 8개**입니다 (9장).
  - RSS 본문이 원문 전문과 같아서 RSS만으로 끝나는 곳: Mother Jones, Semiconductor Engineering
  - 기사 URL로 원문 페이지를 받아 추출하는 곳: NY Post, National Review, TechCrunch, Ars Technica, WIRED, 9to5Mac (표본 추출 성공률 100%)
  - 본문 불가: IBD(유료), Fast Company·The Hill(HTTP 403 봇 차단), EE Times(기사 페이지 응답 없음). 이 4곳은 기사 목록만 쓸 수 있습니다.

## 2. 배경

### RSS만으로는 과거 기사를 받을 수 없음

RSS 피드는 보통 **최신 기사 10~100건**만 보여줍니다.
CNBC Top News 피드는 30건으로 약 29시간 분량이고, NY Post 전체 피드는 22건으로 1시간이 안 됩니다.
그대로 받으면 "지금"의 기사만 얻을 수 있어서, 이번 테스트의 질문은 다음 두 가지였습니다.

1. 피드 URL을 어떻게 바꾸면 과거로 거슬러 갈 수 있는가
2. 그렇게 받은 기사가 빠짐없는가

### WordPress

**WordPress**는 웹사이트를 만들고 글을 관리하는 프로그램(CMS)입니다. 기자가 관리 화면에서 기사를 발행하면 웹페이지, 목록 페이지, RSS 피드가 자동으로 만들어집니다.
전 세계 웹사이트의 약 40%가 쓰고, 큰 언론사는 보통 기업용 호스팅인 **WordPress VIP**를 씁니다
(사전 조사 때 NY Post, The Hill, TechCrunch, Fortune, The Verge, 9to5Mac 등의 서버 응답 헤더에서 `x-powered-by: WordPress VIP`를 확인함).

WordPress 사이트는 같은 프로그램을 설치해서 쓰기 때문에 **URL 규칙이 기본적으로 같습니다.** 이번 테스트에서 쓴 기능은 모두 WordPress의 기본 기능입니다.

| URL | 내용 |
|---|---|
| `사이트/feed/` | 전체 최신 기사 RSS |
| `사이트/2025/10/14/feed/` | 2025-10-14에 발행된 기사만 담은 RSS (**날짜 아카이브**) |
| `사이트/2025/10/14/feed/?paged=2` | 위 날짜 아카이브의 2페이지 |
| `사이트/feed/?paged=2` | 최신 기사 피드의 2페이지 (더 과거 기사) |

언론사가 이 기능을 끄지 않았으면 그대로 동작합니다. 다만 같은 WordPress라도 결과는 갈렸습니다.

- 날짜 아카이브까지 동작: NY Post, The Hill, TechCrunch 등
- 페이지 이동만 동작: EE Times
- 둘 다 막힘: Fortune, Washington Examiner, Daily Caller 등 (성능이나 크롤링 방지 때문에 끄거나 주소 체계를 바꾼 것으로 보임)

CNBC, WSJ, Bloomberg 같은 대형 금융 언론사는 WordPress가 아니라 자체 시스템을 써서 이런 규칙 자체가 없습니다.

## 3. 테스트 후보

미국 언론사 피드 **81개(56곳)**를 분야별로 골랐습니다 (노트북 `CANDIDATE_FEEDS`).

| 분야 | 주요 후보 |
|---|---|
| 증시/금융 전문 | CNBC 섹션 8개, WSJ 5개, MarketWatch 3개, Bloomberg 3개, Barron's, IBD, Seeking Alpha, Motley Fool, Nasdaq, Investing.com, MarketBeat, TheStreet, Kiplinger, Yahoo Finance, Zacks |
| 경제/비즈니스 종합 | Fortune, Business Insider, Fox Business 3개, CBS MoneyWatch, NY Post 2개, USA Today, CNN Business, Forbes 2개, Fast Company, Quartz, Axios, Semafor |
| 종합 일간지/방송 | NYT 4개, Washington Post, LA Times, Guardian US, NPR 2개, ABC, NBC, AP, Yahoo News, Politico, The Hill, TIME, Washington Examiner, National Review, Mother Jones |
| IT/반도체 | TechCrunch, The Verge, Ars Technica, WIRED, Engadget, CNET, 9to5Mac, Tom's Hardware, EE Times, Semiconductor Engineering, VentureBeat |
| 보도자료 | Business Wire, PR Newswire, GlobeNewswire |

테스트 전에 내용을 보고 뺀 피드는 `EXCLUDED_FEEDS`에 사유와 함께 남겼습니다.

- **Benzinga**: 기본 피드(`/feed`)가 뉴스가 아니라 재테크 가이드 글 목록이고, 기사 시각이 1초 간격으로 일괄 갱신돼 있어 작성 시각으로 쓸 수 없음

## 4. 테스트 과정

### 1단계: 라이브 피드 점검

모든 후보를 지금 요청해서 아래를 확인했습니다.

- HTTP 200으로 응답하는가
- 기사가 있는가, 기사의 80% 이상에 날짜가 있는가
- 최신 기사가 7일 이내인가 (갱신이 멈춘 피드 거르기)

### 2단계: 과거 접근 방식 판별

피드마다 아래 방식을 순서대로 시도하고, 처음 통과한 방식을 그 피드의 수집 방식으로 정했습니다.

**① 날짜 아카이브 (`DATE_ARCHIVE`)**

- 대상: 사이트 전체 피드(`/feed/`)인 후보
- 테스트 시작일의 날짜 아카이브를 요청해서, 받은 기사의 80% 이상이 그 날짜(±1일)에 속하면 통과.
  날짜를 무시하고 최신 기사를 그대로 주는 사이트를 거르기 위한 기준입니다.
- RSS 형식(`/feed/`)이 안 되면 Atom 형식(`/feed/atom/`)도 시도.
  The Hill은 RSS 1페이지만 비어 있고 Atom은 정상이었습니다.
- 깊이 테스트: 2025-06-10, 2024-10-15, 2023-10-17, 2022-10-18의 아카이브도 요청해서 기사가 나오는지 확인

**② 페이지 역순회 (`PAGED`)**

- 대상: 날짜 아카이브가 안 되는 라이브 정상 피드
- `?paged=2` → `?page=2` 순서로 시도해서, 2페이지가 1페이지와 다르고 더 과거 기사면 통과
- 통과하면 페이지 번호를 2배씩 늘린 뒤 이진탐색으로 **마지막 페이지와 가장 오래된 기사 날짜**를 찾음
- 앞 페이지보다 더 과거 기사가 없으면 끝으로 판단 (페이지 번호를 바꿔도 같은 내용을 주는 사이트 대응)
- 가장 오래된 기사가 테스트 시작일보다 과거여야 최종 통과

**③ (참고용) archive.org 스냅샷 유무**

- 대상: 모든 후보 (지금 막힌 피드도 과거 사본은 남아 있을 수 있음)
- CDX API로 테스트 기간 스냅샷 수와 최대 간격을 조회. 수집에는 쓰지 않음 (6장 참고)

### 3단계: 테스트 기간 실제 수집

2단계에서 정한 방식으로 2025-10-14~15 기사를 실제로 받았습니다.

- **날짜 아카이브**: 사이트 시간대가 동부시간과 다를 수 있어 앞뒤 하루(10/13~10/16) 아카이브까지 받고 동부시간으로 거름.
  날짜마다 빈 페이지(404)가 나올 때까지 받았으면 완전 수집(`complete=True`)
- **페이지 역순회**: 기간 끝이 들어 있는 페이지를 이진탐색으로 찾고, 페이지가 밀렸을 경우에 대비해 한 페이지 앞부터 기간 시작보다 과거 기사가 나올 때까지 진행
- 공통: 기간 밖 기사를 빼고 링크 기준으로 중복 제거

### 4단계: 판정

| 판정 | 기준 |
|---|---|
| `PASSED` | 기사가 있고 끝까지 순회함 |
| `PARTIAL` | 기사는 있지만 순회가 중간에 끊김 (페이지 상한, 요청 오류) |
| `LIVE_ONLY` | 지금 피드는 정상이지만 과거로 갈 방법이 없음 |
| `FAILED` | 라이브도 실패하고 과거 접근도 불가, 또는 수집 결과 0건 |

## 5. 결과

### 단계별 통과 수

| 단계 | 결과 |
|---|---|
| 1. 라이브 점검 | 정상 72 / 실패 9 |
| 2. 과거 접근 판별 | 날짜 아카이브 9, 페이지 역순회 3, 접근 불가 69 |
| 3~4. 실제 수집 | PASSED 12, PARTIAL 0 |

### 통과 피드 (`PASSED_FEEDS`)

| 언론사 | 분야 | 방식 | 10/14 | 10/15 | 합계 | 기사 없는 시간 (48시간 중) | 확인한 과거 깊이 |
|---|---|---|---:|---:|---:|---:|---|
| New York Post | 종합 | 날짜 아카이브 | 246 | 259 | 505 | 2 | 2022-10-18 |
| The Hill | 정치/종합 | 날짜 아카이브 (Atom) | 156 | 134 | 290 | 6 | 2022-10-18 |
| Investor's Business Daily | 증시 | 날짜 아카이브 | 63 | 68 | 131 | 25 | 2022-10-18 |
| Fast Company | 비즈니스 | 페이지 역순회 (`page`) | 68 | 40 | 108 | 16 | 1990년대 (옛 기사 날짜 일부 깨짐) |
| 9to5Mac | IT | 날짜 아카이브 | 27 | 32 | 59 | 19 | 2022-10-18 |
| TechCrunch | IT | 날짜 아카이브 | 28 | 27 | 55 | 21 | 2022-10-18 |
| National Review | 정치 | 날짜 아카이브 | 19 | 28 | 47 | 24 | 2022-10-18 |
| WIRED | IT | 페이지 역순회 (`page`) | 13 | 14 | 27 | 30 | **2024-06-06까지만** |
| Ars Technica | IT | 날짜 아카이브 | 11 | 15 | 26 | 29 | 2022-10-18 |
| Semiconductor Engineering | 반도체 | 날짜 아카이브 | 15 | 8 | 23 | 42 | 2022-10-18 |
| Mother Jones | 정치 | 날짜 아카이브 | 8 | 7 | 15 | 37 | 2022-10-18 |
| EE Times | 반도체 | 페이지 역순회 (`paged`) | 3 | 6 | 9 | 41 | 1995년 |

- 날짜 아카이브 피드의 "2022-10-18"은 확인한 가장 과거 날짜일 뿐이고, 그보다 과거도 될 가능성이 높습니다.
- 날짜 아카이브 기사 중 요청 날짜와 정확히 일치하는 비율이 TechCrunch 90%, 나머지 100%여서 사이트 시간대 문제는 없었습니다.
- "기사 없는 시간"은 매체의 발행량 차이입니다. NY Post는 거의 매시간 기사가 있고, EE Times처럼 하루 몇 건인 매체는 값이 큽니다.

### 페이지 이동은 되지만 탈락한 피드

| 피드 | 마지막 페이지 | 가장 오래된 기사 | 탈락 이유 |
|---|---:|---|---|
| CNBC 섹션 6개 (Business, Investing, Market Insider, Economy, Finance, Tech) | 7 | 2026-05 ~ 2026-10 | 7페이지(최대 몇 달)까지만 내려감 |
| NY Post Business | 10 | 2026-10-20 | 그 뒤 페이지는 같은 내용 반복 (NY Post는 전체 피드 날짜 아카이브로 수집 가능) |

### 실패 피드 (`FAILED_FEEDS`)

| 피드 | 사유 |
|---|---|
| AP, Barron's, GlobeNewswire | HTTP 403 (차단) |
| USA Today Money | HTTP 402 |
| Yahoo Finance, Zacks | HTTP 404 (피드 없어짐) |
| Washington Post Business | HTTP 502 |
| CNN Money | 2018-11에 갱신 멈춤 |
| MarketWatch MarketPulse | 2025-07에 갱신 멈춤 |

11-04 실행에서는 Quartz도 빈 피드로 실패였지만 11-05 다시 실행에서는 정상이어서 `LIVE_ONLY`로 옮겨졌습니다.

### 과거 접근 불가 (`LIVE_ONLY_FEEDS`, 60개)

지금 피드는 정상이지만 최근 기사만 주고 과거로 갈 방법이 없습니다.
CNBC(8개 섹션 전부), WSJ, MarketWatch, Bloomberg, Seeking Alpha, Motley Fool, Nasdaq, Investing.com, Fortune, Business Insider, Fox Business, Forbes, Quartz, Axios, NYT, NPR, ABC, NBC, Politico, TIME, The Verge, Engadget, CNET, Tom's Hardware, Business Wire, PR Newswire 등입니다.

## 6. 제외한 방식: archive.org 피드 스냅샷

archive.org(Wayback Machine)는 웹페이지 사본을 주기적으로 저장합니다. 페이지 이동이 안 되는 피드도 과거 시점 사본을 이어붙이면 그 기간 기사를 복원할 수 있어서 세 번째 방식으로 시도했습니다.

- **스냅샷 유무 조회(CDX API)는 잘 동작했습니다.** 테스트 기간에 스냅샷이 있는 피드는 30개입니다 (`WAYBACK_ONLY_FEEDS`).
  CNBC Top News, WSJ 5개, MarketWatch Top Stories, NYT 4개, Bloomberg Economics, Business Insider, NPR Business 등은
  이틀 동안 130~190개(15분 간격)가 있어서 이론상 빠짐없이 복원할 수 있었습니다.
- 다만 촘촘한 스냅샷은 **2025-10-02 무렵부터만** 있습니다. 2025-06, 2024-10, 2023-10 날짜는 하루 0~4개뿐이라 그 이전 시점에는 쓸 수 없습니다.
- **스냅샷 본문 요청이 막혔습니다.** 처음에는 1.5초 간격으로 요청하다가 HTTP 429(요청 제한)를 받았습니다.
  조사해 보니 두 가지 원인이 있었습니다.
  1. 요청 헤더에 `Accept: application/rss+xml`을 넣으면 archive.org가 바로 429를 돌려줌 → `*/*`로 바꿔서 해결
  2. 그 뒤에도 Python 요청은 4초 간격에 90초를 쉬고 보내도 8건 중 1건만 성공 (같은 시각 curl 요청은 정상)
- 피드 하나에 스냅샷을 10~30개씩 받아야 해서 이 속도로는 수집이 불가능하다고 보고 제외했습니다.
  스냅샷 유무 조회 코드는 노트북 2-3단계에 참고용으로 남겨 두었습니다.

## 7. 테스트 중 발견한 문제와 처리

| 문제 | 처리 |
|---|---|
| The Hill 날짜 아카이브 RSS 1페이지가 비어 있음 | Atom 형식(`/feed/atom/`)을 자동으로 시도하도록 함 |
| Fast Company 옛 기사 날짜가 1969-12-31로 깨져 있음 | 1995년 이전 날짜는 날짜 없음으로 처리 |
| NY Post Business는 페이지 번호를 바꿔도 같은 내용을 반복 | 앞 페이지보다 더 과거 기사가 없으면 마지막 페이지로 판단 |
| The Hill(Atom) 제목에 `&#8216;` 같은 HTML 엔티티가 남음 | 제목과 요약의 HTML 엔티티 해제 |
| Guardian, NBC 피드는 archive.org CDX 조회 실패 (Guardian은 HTTP 403, 아카이브 제외 도메인) | 조회 실패로 기록하고 넘어감 |

## 8. 한계와 다음 단계

- 통과한 12개 중 금융 전문 매체는 **IBD뿐**이고, 나머지는 종합지(NY Post, The Hill), 정치(National Review, Mother Jones), IT/반도체 매체입니다.
  미국 증시 뉴스 비중이 큰 CNBC, WSJ, MarketWatch, Bloomberg는 RSS로 과거 수집이 불가능합니다.
- 테스트 기간은 이틀(2025-10-14~15) 하나뿐입니다. 다른 기간은 날짜 아카이브 피드의 경우 깊이 테스트로만 확인했습니다.
- 본문 한계는 9장 끝을 참고하세요.

다음 단계 후보:

1. 통과한 12개 피드로 백테스트 기간 기사 수집 (본문까지는 `collect_news_with_body(start, end)`, 본문은 8곳만)
2. 과거 접근이 안 되는 금융 언론사(`LIVE_ONLY_FEEDS`)는 지금부터 주기적으로 받아 쌓는 수집기 구성
3. 금융 언론사 과거 기사는 기존 Google News RSS 검색 방식([1_google_rss_source_test.ipynb](1_google_rss_source_test.ipynb))과 병행

## 9. 본문 수집 테스트 (2026-11-05 추가)

목표는 기사 목록이 아니라 **본문**입니다. 그래서 통과 피드 12개에서 본문을 실제로 받을 수 있는지 시험했습니다 (노트북 7~9단계).

### 방법

피드별로 테스트 기간 기사 중 최대 40건(적으면 전부), 총 380건을 뽑았습니다. 각 기사는 두 경로로 본문을 구하고 서로 대조했습니다.

| 경로 | 방법 |
|---|---|
| RSS 본문 | 피드의 `content:encoded`(Atom은 `content`) HTML을 문단 텍스트로 바꾸고, 끝의 출처 문구("The post … appeared first on …" 등)를 제거 |
| 원문 페이지 본문 | 기사 URL의 HTML을 받아 본문 추출. 판정 기준은 `1_google_rss_source_test.ipynb` 4단계와 같음 (차단, HTTP 오류, 영상, 라이브, 기사 아님, 유료, 본문 짧음) |

원문 본문은 다음 순서로 고릅니다.

1. **사이트별 본문 영역**이 등록된 사이트(`SITE_BODY_CONTAINERS`, 7곳)는 그 영역의 문단을 사용합니다.
   영역 안의 광고·뉴스레터·관련 기사 요소와 링크 위주 문단(관련 기사·상품 목록)은 뺍니다.
2. 미등록 사이트는 trafilatura 추출 결과를 씁니다. 언론사가 페이지에 넣어둔 JSON-LD `articleBody`의 80% 미만만 들어 있으면 `articleBody`를 씁니다.
3. 둘 다 없으면 페이지 안 WordPress 글 데이터(JSON)의 본문을 씁니다 (National Review).

### 검증 방법

본문을 "받았다"와 "제대로 받았다"는 다르기 때문에 다음 항목으로 확인했습니다.
비교는 연속 5단어 묶음이 얼마나 겹치는지로 계산합니다.

| 확인할 것 | 방법 |
|---|---|
| 본문이 빠지지 않았나 | trafilatura 본문과 기준 본문(JSON-LD `articleBody` 또는 사이트별 본문 영역)을 서로 대조 |
| RSS 본문이 전문인가 | 원문 본문의 90% 이상이 RSS 본문에 있으면 전문으로 인정 |
| 같은 기사인가 | RSS 제목 단어가 페이지 제목에 있는 비율, RSS 시각과 페이지 작성 시각 차이 |
| 엉뚱한 글이 섞이지 않았나 | 뉴스레터·앱 홍보, 추천/관련 기사, 출처 푸터 문구 검사 |
| 눈으로 확인 | 피드마다 본문의 처음과 끝을 출력해서 확인 (`body_review.csv`에 피드 × 판정별 3건 저장) |

피드 판정은 다음과 같습니다.
- `RSS_BODY`: 원문과 비교 가능한 기사의 80% 이상이 RSS 전문
- `PAGE_BODY`: 기사 페이지의 80% 이상에서 원문 본문 추출 성공
- `UNSTABLE` 50~80%, `NOT_USABLE` 50% 미만

### 결과

| 언론사 | 판정 | 표본 | 본문 성공 / 기사 페이지 | 본문 단어 수 (중앙값) | 최종 본문 출처 | 검증 결과 |
|---|---|---:|---:|---:|---|---|
| Mother Jones | **RSS_BODY** | 15 | 15 / 15 | 1,674 | RSS 15 | RSS가 원문의 99.4%를 포함, 15건 모두 전문 |
| Semiconductor Engineering | **RSS_BODY** | 23 | 20 / 23 | 406 | RSS 19, 원문 1 | 비교 가능한 20건 중 19건이 전문. 실패 3건은 70단어 내외의 eBook 안내 글 |
| NY Post | **PAGE_BODY** | 40 | 39 / 39 | 498 | 본문 영역 39 | 도박 프로모션 1건은 URL로 제외. RSS는 1~2문장 요약뿐 |
| National Review | **PAGE_BODY** | 40 | 38 / 38 | 533 | 페이지 안 JSON 38 | 영상 페이지 2건 제외. RSS `content`는 사진 설명 한 줄 |
| TechCrunch | **PAGE_BODY** | 40 | 39 / 39 | 429 | 본문 영역 39 | trafilatura와 본문 영역 일치 (겹침 1.0) |
| Ars Technica | **PAGE_BODY** | 26 | 26 / 26 | 647 | 본문 영역 26 | trafilatura는 본문의 약 절반만 추출 → 본문 영역으로 보완. RSS 본문은 앞부분(원문의 26%)뿐 |
| WIRED | **PAGE_BODY** | 27 | 26 / 26 | 1,046 | trafilatura 20, 본문 영역 5, JSON-LD 1 | JSON-LD `articleBody`와 겹침 recall 1.0 / precision 0.945 |
| 9to5Mac | **PAGE_BODY** | 40 | 40 / 40 | 297 | 본문 영역 40 | trafilatura와 본문 영역 일치 |
| IBD | NOT_USABLE | 40 | 0 / 39 | - | - | 유료 기사. `isAccessibleForFree: false`, 페이지에는 첫 문단 요약과 암호화된 본문만 있음 |
| Fast Company | NOT_USABLE | 40 | 0 / 40 | - | - | HTTP 403 차단 |
| The Hill | NOT_USABLE | 40 | 0 / 40 | - | - | HTTP 403 (PerimeterX 봇 차단 페이지) |
| EE Times | NOT_USABLE | 9 | 0 / 9 | - | - | 피드는 정상인데 기사 페이지는 30초 내 응답 없음 |

- 본문을 얻은 8곳 모두 **RSS 제목과 페이지 제목 일치율 중앙값이 1.0**이어서 다른 기사가 붙은 경우는 없었습니다.
- 차단된 사이트는 같은 사이트에서 연속 3번 막히면 나머지 기사를 요청하지 않게 했습니다(`SKIPPED_HOST`). 로그인, 캡차 풀기, 차단 우회는 하지 않았습니다.

### 테스트 중 발견한 문제와 처리

| 문제 | 처리 |
|---|---|
| Mother Jones가 "기사 아님"으로 판정됨 (JSON-LD와 작성 시각 메타가 없음) | JSON-LD 기사 타입 또는 `og:type=article` 중 하나만 있으면 기사로 인정. 작성 시각은 RSS에 이미 있으므로 조건에서 뺌 |
| WIRED 제품 리뷰 5건이 "기사 아님"으로 판정됨 (`og:type=website`, JSON-LD `Review`) | `Review` 타입을 기사로 인정 |
| Ars Technica 본문이 광고를 사이에 두고 여러 덩어리로 나뉘어 trafilatura가 첫 덩어리만 가져감 | 사이트별 본문 영역을 모두 문서 순서대로 이어붙임 |
| NY Post에서 trafilatura가 Sports+ 구독 홍보, 뉴스레터 가입 박스, 연합 기사 머리글(제목·출처·게시 시각), 도박 고지문까지 본문에 넣음 | 본문 영역이 있는 사이트는 본문 영역을 최종 본문으로 사용, 뉴스레터 박스(`inline-module`) 제외 |
| 본문 영역에 관련 기사 제목(NY Post "Explore More"), 쇼핑 링크 목록(9to5Mac)이 섞임 | 링크 글자가 80% 이상인 문단 제외, 본문 끝에 문단 없이 남은 소제목 제거 |
| National Review는 본문이 HTML 태그가 아니라 페이지 안 JSON에만 있음 (trafilatura 0단어) | JSON의 `content.rendered`에서 본문 추출 |
| NY Post 기사 중 도박 프로모션(`/betting/`)이 테스트 기간 505건 중 25건 | `1_google_rss_source_test.ipynb`의 제외 구역 규칙을 가져와 다운로드 전에 제외 |
| EE Times 기사 페이지가 응답하지 않아 기사마다 재시도로 시간이 오래 걸림 | 기사 페이지는 재시도 1번, 연속 3번 실패하면 그 사이트 건너뜀 |

남은 오염 문구는 적고 모두 성격을 확인했습니다.
- Semiconductor Engineering 4건의 "Read more here.": 논문·자료 요약 글 끝의 원문 링크 문장
- WIRED 3건: "This story originally appeared on Ars Technica" 같은 재게재 출처 표기. **WIRED는 Ars Technica 기사를 재게재하므로 두 매체를 같이 수집하면 같은 기사가 중복될 수 있습니다.**
- Mother Jones 1건: RSS 본문 끝의 "READ MORE COVERAGE FROM OUR PARTNERS"

### rss_news 폴더에서 참고한 내용

팀원이 작성한 `rss_news/`(지금은 그중 필요한 코드·문서만 `team_rss_news/`에 남김)의 코드와 문서 중 아래 내용을 가져왔습니다.

| 팀원 파일(`team_rss_news/`) | 참고한 내용 | 이번 노트북에 반영한 곳 |
|---|---|---|
| `src/collect_article_bodies.py` | 차단 페이지 문구 ("pardon our interruption", "made us think you were a bot", "please enable JS and disable any ad blocker") | `BLOCK_HTML_MARKERS`에 추가 |
| `src/collect_article_bodies.py` | JSON-LD `articleBody`를 본문 후보로 쓰는 방식 (Business Insider) | 미등록 사이트에서 trafilatura가 일부만 잡으면 `articleBody` 사용 |
| `src/collect_article_bodies.py`, `src/integrated_notebook_bodies.py` | 매체별 본문 선택자(`SELECTORS`), 여러 본문 블록을 문서 순서대로 모으기(NBC), 바깥 블록만 사용 | `SITE_BODY_CONTAINERS`, `site_container_body` |
| `src/collect_article_bodies.py` | RSS 본문과 원문 본문 비교, 요약이 본문에 들어 있는지 확인 | `rss_recall`, `summary_in_body` (비교 방식은 문자 유사도 대신 5단어 묶음 겹침으로 바꿈) |
| `docs/rss_content_audit.md` | RSS 본문 필드가 있어도 전문이 아닐 수 있음 (Motley Fool이 "Continue reading"으로 끝나는 티저) | RSS 본문을 원문과 대조해서 전문일 때만 `RSS_BODY`로 판정, 티저 패턴(`RSS_TEASER_PATTERN`) |
| `docs/rss_content_audit.md` | Fortune RSS 끝의 "This story was originally featured on …" 출처 문구 | `RSS_FOOTER_PATTERN` |
| `docs/rss_media_review_summary_20261104.md`, `docs/media_review_decisions.md` | 정제가 필요한 문구 유형 (뉴스레터·앱 홍보, 추천/관련 기사, 출처 푸터) | 오염 검사 패턴 `BODY_JUNK_PATTERNS` |
| 같은 문서 | 요약만 있는 기사는 본문 대신 쓰지 않음 | `attach_bodies`가 본문을 못 얻으면 요약으로 채우지 않고 `NOT_COLLECTED`로 남김 |
| README | RSS 본문과 원문 본문을 덮어쓰지 않고 따로 보존, 로그인·유료벽·차단은 우회하지 않음 | `body_check.parquet`에 `rss_body`, `page_body`, `body`를 따로 저장, 차단 사이트 건너뛰기 |

rss_news 문서의 매체별 기록과 이번 결과를 비교하면 다음과 같습니다.
- **Ars Technica**: "공개 RSS는 부분 본문, 원문 추가 수집 필요" → 이번에도 RSS 본문이 원문의 26%뿐이어서 원문 추출로 판정했습니다.
- **TechCrunch**: "아래에 자동 연결되는 다음 기사는 제외" → 본문 영역으로 추출하니 trafilatura와 겹침이 1.0이었습니다. 본문 끝을 확인한 표본에서도 다음 기사가 붙은 경우는 없었습니다.
- **Fast Company**: rss_news에서는 "본문 일부 미추출·구독 제한"이었는데 이번에는 기사 페이지가 HTTP 403으로 막혔습니다.

### 본문 수집의 한계

- 기사 페이지를 **지금(2026-11) 받은 것**이라 2025-10 발행 당시 내용과 다를 수 있습니다.
  WIRED 3건은 RSS 시각과 페이지 작성 시각이 24시간 넘게 차이 났습니다. 선물 가이드, 서비스 설명처럼 계속 고쳐 쓰는 기사들입니다.
- 검증은 자동 겹침 비율과 표본 본문의 처음/끝 확인까지입니다. 브라우저에 보이는 화면과 기사 전체를 한 줄씩 대조하지는 않았습니다.
- 사이트별 본문 영역은 현재 HTML 구조 기준입니다. 사이트 개편으로 영역을 못 찾으면 trafilatura로 넘어갑니다. 이때는 Ars Technica 본문이 다시 절반만 잡히는 식의 문제가 생길 수 있어서, 수집 후 `body_words`를 주기적으로 확인해야 합니다.
- 페이지 안 JSON, JSON-LD `articleBody`를 포함해 공개 HTML 응답에 들어 있는 내용만 사용합니다.
  JSON-LD에 무료 여부(`isAccessibleForFree`)를 적는 사이트를 보면, National Review 38건과 WIRED 26건은 모두 무료였습니다.
  NY Post는 1건이 유료(`false`)로 표시돼 있었지만 공개 HTML에 본문이 있어 추출됐습니다 (`1_google_rss_source_test.ipynb`와 같은 기준).
- 통과 8곳 중 금융 전문 매체는 없습니다. 금융 쪽 본문은 기존 `1_google_rss_source_test.ipynb`(Google News 검색 + 원문 크롤링)에서 확보한 언론사와 같이 써야 합니다.

## 부록: 노트북 변수

| 변수 | 내용 |
|---|---|
| `CANDIDATE_FEEDS` | 테스트 후보 81개 `{feed_id: {source, name, section, url}}` |
| `EXCLUDED_FEEDS` | 테스트 전에 제외한 피드와 사유 |
| `LIVE_OK_FEEDS` / `LIVE_FAILED_FEEDS` | 1단계 라이브 점검 결과 |
| `DATE_ARCHIVE_FEEDS` / `PAGED_FEEDS` / `NO_PAST_ACCESS_FEEDS` | 2단계 접근 방식 판별 결과 |
| `PASSED_FEEDS` | 최종 통과 12개 (수집 방식, Atom 여부, 페이지 파라미터 포함) |
| `PASSED_DATE_ARCHIVE_FEEDS` / `PASSED_PAGED_FEEDS` | `PASSED_FEEDS`를 방식별로 나눈 것 |
| `PARTIAL_FEEDS` / `LIVE_ONLY_FEEDS` / `FAILED_FEEDS` | 나머지 판정 결과 |
| `WAYBACK_ONLY_FEEDS` | 참고용: 테스트 기간 archive.org 스냅샷이 있는 피드 |
| `FEED_DEPTH` | 통과 피드별 과거 깊이 |
| `SITE_BODY_CONTAINERS` | 사이트별 본문 영역 (태그, class) 7곳 |
| `SECTION_EXCLUDE_RULES` | 다운로드 전에 제외할 구역 (NY Post `/betting/`) |
| `RSS_BODY_FEEDS` | 본문: RSS 본문이 전문인 피드 (Mother Jones, Semiconductor Engineering) |
| `PAGE_BODY_FEEDS` | 본문: 원문 페이지에서 추출하는 피드 6개 |
| `BODY_UNSTABLE_FEEDS` / `BODY_NOT_USABLE_FEEDS` / `BODY_INSUFFICIENT_FEEDS` | 본문: 나머지 판정 결과 |
| `BODY_METHOD_BY_FEED` | 본문 수집에 쓰는 피드 `{feed_id: RSS_BODY / PAGE_BODY / UNSTABLE}` |
| `BODY_FAIL_REASON` | 본문 실패 주 사유 `{feed_id: 상태값}` |

| 함수 | 내용 |
|---|---|
| `collect_news(start, end)` | 통과 피드로 기간 기사 목록 수집 (RSS 본문 HTML `content` 포함) |
| `collect_news_with_body(start, end)` | 기사 목록 + 본문 (`body`, `body_source`, `body_status`, `body_words`) |
| `attach_bodies(news_df)` | 이미 받은 기사 목록에 본문만 붙이기 |
| `show_bodies(feed_id, status)` | 본문 처음/끝 눈으로 검수 |
