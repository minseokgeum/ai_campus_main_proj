# 미국 언론사 RSS 과거 뉴스 수집 테스트 결과

- 테스트일: 2026-11-04
- 테스트 기간: 2025-10-14 ~ 2025-10-15 (미국 동부시간, 이틀)
- 노트북: [newsrss_test.ipynb](newsrss_test.ipynb)
- 결과 파일: [newsrss_test/](newsrss_test/) (`feed_summary.csv`, `access_check.csv`, `live_check.csv`, `feed_lists.json`, `articles_2025-10-14_2025-10-15.parquet`)

## 1. 요약

- 검색어 없이 언론사 RSS만으로 **과거 원하는 날짜의 기사를 빠짐없이 모을 수 있는 피드는 81개 중 12개**입니다.
  테스트 기간 이틀 동안 12개 피드에서 1,294건을 받았고, 중복은 0건입니다.
- 12개 중 9개는 **WordPress 날짜 아카이브 피드**로 날짜를 직접 지정해서 받고, 2022-10-18까지 동작하는 것을 확인했습니다.
  나머지 3개는 **피드 페이지를 과거로 넘기는 방식**으로 받습니다.
- **CNBC, WSJ, MarketWatch, Bloomberg, NYT, Fox Business 등 핵심 금융 언론사는 RSS로 과거 기사를 가져올 방법이 없습니다.**
  지금부터 주기적으로 받아 쌓거나 다른 경로(Google News RSS 검색 등)와 같이 써야 합니다.
- archive.org(Wayback Machine)에 저장된 피드 사본을 이어붙이는 방식도 시도했지만, 요청 제한(HTTP 429) 때문에 제외했습니다.

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
| 1. 라이브 점검 | 정상 71 / 실패 10 |
| 2. 과거 접근 판별 | 날짜 아카이브 9, 페이지 역순회 3, 접근 불가 69 |
| 3~4. 실제 수집 | PASSED 12, PARTIAL 0 |

### 통과 피드 (`PASSED_FEEDS`)

| 언론사 | 분야 | 방식 | 10/14 | 10/15 | 합계 | 기사 없는 시간 (48시간 중) | 확인한 과거 깊이 |
|---|---|---|---:|---:|---:|---:|---|
| New York Post | 종합 | 날짜 아카이브 | 246 | 259 | 505 | 2 | 2022-10-18 |
| The Hill | 정치/종합 | 날짜 아카이브 (Atom) | 156 | 134 | 290 | 6 | 2022-10-18 |
| Investor's Business Daily | 증시 | 날짜 아카이브 | 63 | 68 | 131 | 25 | 2022-10-18 |
| Fast Company | 비즈니스 | 페이지 역순회 (`page`) | 67 | 40 | 107 | 16 | 1990년대 (옛 기사 날짜 일부 깨짐) |
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
| Quartz | 빈 피드 |

### 과거 접근 불가 (`LIVE_ONLY_FEEDS`, 59개)

지금 피드는 정상이지만 최근 기사만 주고 과거로 갈 방법이 없습니다.
CNBC(8개 섹션 전부), WSJ, MarketWatch, Bloomberg, Seeking Alpha, Motley Fool, Nasdaq, Investing.com, Fortune, Business Insider, Fox Business, Forbes, Axios, NYT, NPR, ABC, NBC, Politico, TIME, The Verge, Engadget, CNET, Tom's Hardware, Business Wire, PR Newswire 등입니다.

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
- 받는 것은 기사 목록(제목, 링크, 시각, 요약)뿐이고, 본문은 따로 크롤링해야 합니다.

다음 단계 후보:

1. 통과한 12개 피드로 백테스트 기간 기사 목록 수집 (`collect_news(start, end)`)
2. 과거 접근이 안 되는 금융 언론사(`LIVE_ONLY_FEEDS`)는 지금부터 주기적으로 받아 쌓는 수집기 구성
3. 금융 언론사 과거 기사는 기존 Google News RSS 검색 방식([news_collection.ipynb](news_collection.ipynb))과 병행

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
