# RSS 매체 현황

확인일: **2026-10-29 (KST)**

이 문서는 기본 수집 결과 `outputs/20261029T080241_074663Z`와 별도 후보 조사 결과 `outputs/feed_research_20261029/20261029T081558_858937Z`를 기준으로 작성했다. 기본 수집 기간은 2026-10-22 17:02:40부터 2026-10-29 17:02:40까지(KST), `start <= published < end`인 168시간이다. 기본 결과의 URL 중복 제거 후 기사 536건은 수정하지 않았다.

상태는 HTTP 접속, RSS·Atom 분석, 기간 내 기사 유무를 나누어 판단한다. `정상·기간 내 0건`은 실패가 아니다. 다만 피드 항목이 수년 동안 갱신되지 않은 경우에는 XML이 분석되더라도 현재 뉴스 수집에 사용할 수 있는 피드로 판정하지 않는다. `RSS 본문`은 `<content>` 계열 요소가 있다는 뜻이며 기사 전문임을 보장하지 않는다.

## 매체별 요약

| 매체 | 현재 판정 | 확인된 피드 | 기간 내 고유 기사 | 요약·RSS 본문 | 주의점 |
| --- | --- | ---: | ---: | --- | --- |
| CNBC | 사용 가능 | 6/6 | 95 | 요약 제공, RSS 본문 없음 | `finance`는 정상 피드지만 기간 내 0건. 여러 피드 사이에 같은 URL이 있어 피드별 합계보다 고유 기사 수가 작다. |
| Fortune | 사용 가능 | 1/1 | 9 | 요약·RSS 본문 제공 | 요청 URL이 다른 Fortune 피드 URL로 이동한다. RSS 본문을 기사 전문으로 간주하지 않는다. |
| The Motley Fool | 사용 가능 | 1/1 | 50 | 요약·RSS 본문 제공 | 요청 URL이 API 형태 주소로 이동한다. 50개 잔존 항목만 확인한 결과다. |
| Zacks | 사용 가능 | 1/1 | 325 | 요약·RSS 본문 제공 | 한 번의 피드 스냅샷에 325건이 있었으며 기간 전체 누락 없음을 보장하지 않는다. |
| Fox Business | 사용 가능 | 4/4 | 37 | 요약·RSS 본문 제공 | 카테고리 피드는 각 25개 항목만 반환하며 오래된 항목도 섞여 있다. |
| Business Insider | 접속·분석 가능, 공식 지원 미확인 | 1/1 | 20 | 요약·RSS 본문 제공 | 기존 Atom 주소는 현재 동작한다. 미국판의 현행 공식 RSS 지원 안내는 확인하지 못했다. |
| Yahoo Finance | 미국 일반 뉴스 주소 미확인 | 0 | 0 | 일반 뉴스 기준 미확인 | AAPL 종목별 후보는 동작하지만 일반 뉴스 피드가 아니다. Yahoo 대만 증권판 RSS도 별도 지역 서비스다. |
| CNN Business | 현재 주소 미확인 | 0 | 0 | 미확인 | 과거 HTTP 피드는 분석되지만 2017년·2018년에 멈췄다. 현재 CNN 공식 안내는 뉴스레터와 알림을 안내하며 공개 Business RSS 주소는 확인하지 못했다. |

`사용 가능`은 2026-10-29 한 번의 접속·분석 결과다. 향후 지속 제공이나 공식 지원을 뜻하지 않는다. 매체별 기사 수는 URL 중복 제거 후이며, 기본 실행 전체는 피드별 기간 내 항목 580건에서 고유 URL 536건으로 정리됐다. 발행일 미확인 기사는 0건이었다.

## 기본 수집 피드 상세

확인 시각은 KST다. `요약 / RSS 본문` 수는 필터 전 응답 항목 전체에서 해당 요소가 있었던 수다.

| 매체 | 피드명 | 실제 피드 URL | 확인 시각 | 접속·분석 | 기간 내 기사 | 요약 / RSS 본문 | 주의점 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| CNBC | top | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114` | 17:02:41 | HTTP 200, RSS 2.0 정상 | 30 | 29/30 · 0/30 | 요약 1건 없음. |
| CNBC | business | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147` | 17:02:41 | HTTP 200, RSS 2.0 정상 | 30 | 30/30 · 0/30 | 피드 간 URL 중복 가능. |
| CNBC | economy | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258` | 17:02:42 | HTTP 200, RSS 2.0 정상 | 8 | 30/30 · 0/30 | 전체 30건 중 22건은 기간 밖. |
| CNBC | finance | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664` | 17:02:43 | HTTP 200, RSS 2.0 정상·기간 내 0건 | 0 | 30/30 · 0/30 | 실패가 아니다. 30건 모두 기간 밖이며 최신 항목은 2026-10-21이다. |
| CNBC | technology | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910` | 17:02:43 | HTTP 200, RSS 2.0 정상 | 30 | 30/30 · 0/30 | RSS 본문 없음. |
| CNBC | world | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362` | 17:02:44 | HTTP 200, RSS 2.0 정상 | 30 | 29/30 · 0/30 | 요약 1건 없음. |
| Fortune | all | `https://fortune.com/feed/fortune-feeds/?id=3230629` | 17:02:44 | HTTP 200, RSS 2.0 정상 | 9 | 10/10 · 10/10 | 설정 주소 `https://fortune.com/feed/`에서 이동. 1건은 기간 밖. |
| The Motley Fool | headlines | `https://www.fool.com/a/feeds/foolwatch?apikey=foolwatch-feed` | 17:02:45 | HTTP 200, RSS 2.0 정상 | 50 | 50/50 · 50/50 | 설정 주소에서 이동. RSS 본문은 전문 보장 없음. |
| Zacks | commentary | `https://feed.zacks.com/commentary/AllStories/rss` | 17:02:45 | HTTP 200, RSS 2.0 정상 | 325 | 325/325 · 325/325 | RSS 본문은 전문 보장 없음. |
| Fox Business | latest | `https://moxie.foxbusiness.com/google-publisher/latest.xml` | 17:02:48 | HTTP 200, RSS 2.0 정상 | 25 | 25/25 · 25/25 | 응답 상한으로 보이는 25건만 확인. |
| Fox Business | economy | `https://moxie.foxbusiness.com/google-publisher/economy.xml` | 17:02:48 | HTTP 200, RSS 2.0 정상 | 10 | 25/25 · 25/25 | 15건은 기간 밖. |
| Fox Business | markets | `https://moxie.foxbusiness.com/google-publisher/markets.xml` | 17:02:49 | HTTP 200, RSS 2.0 정상 | 6 | 25/25 · 25/25 | 19건은 기간 밖. 가장 오래된 항목은 2026-09-11. |
| Fox Business | technology | `https://moxie.foxbusiness.com/google-publisher/technology.xml` | 17:02:49 | HTTP 200, RSS 2.0 정상 | 7 | 25/25 · 25/25 | 18건은 기간 밖. |
| Business Insider | legacy_atom | `https://feeds.businessinsider.com/custom/all` | 17:02:49 | HTTP 200, Atom 1.0 정상 | 20 | 20/20 · 20/20 | 동작 확인과 공식 지원 여부를 구분해야 한다. |

## Yahoo Finance·CNN Business·Business Insider 추가 조사

추가 시험은 기본 536건 폴더를 사용하지 않고 `outputs/feed_research_20261029/` 아래의 새 실행 폴더에 저장했다. 아래 최종 시험은 2026-10-29 17:15~17:16 KST에 수행했다.

| 매체·구분 | 시험 주소 | 실제 결과 | 기간 내 기사 | 요약 / RSS 본문 | 판정 |
| --- | --- | --- | ---: | --- | --- |
| Yahoo Finance 종목별 | `https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US` | HTTP 200, RSS 2.0 정상, 15항목 | 15 | 15/15 · 0/15 | **종목별 후보 사용 가능.** 미국판의 현행 공식 안내는 찾지 못했으므로 공식 지원으로 표시하지 않는다. 일반 뉴스 피드의 대체물도 아니다. |
| Yahoo Finance 미국 일반 뉴스(과거 후보) | `https://finance.yahoo.com/news/rssindex` | HTTP 404, HTML | 0 | 0 · 0 | 현재 사용 불가 주소. 다른 공식 일반 뉴스 주소는 미확인. |
| Yahoo 저자별(2017 공식 기사 안내) | `https://www.yahoo.com/author/david-pogue/rss` | 최종 URL에 `/`가 붙은 뒤 HTTP 404 | 0 | 0 · 0 | 과거 공식 안내 주소이나 현재 동작하지 않음. 일반 뉴스·종목별 피드가 아닌 저자별 피드다. |
| Yahoo 대만 증권판 일반 뉴스 | `https://tw.stock.yahoo.com/rss?category=news` | HTTP 200, RSS 2.0 정상, 50항목 | 50 | 50/50 · 0/50 | 지역판 공식 RSS는 사용 가능. 미국 Yahoo Finance와 별도 매체·언어권으로 취급한다. |
| CNN Business 과거 International Business HTTPS | `https://rss.cnn.com/rss/edition_business.rss` | TLS 연결 중 EOF 오류 | 0 | 0 · 0 | HTTPS 주소는 요청 실패. |
| CNN Business 과거 International Business HTTP | `http://rss.cnn.com/rss/edition_business.rss` | HTTP 200, RSS 2.0 정상, 20항목 | 0 | 20/20 · 0/20 | XML은 열리지만 최신 항목이 2017-02-13. 현재 뉴스 피드로 사용하지 않음. |
| CNNMoney 과거 latest HTTPS | `https://rss.cnn.com/rss/money_latest.rss` | TLS 연결 중 EOF 오류 | 0 | 0 · 0 | HTTPS 주소는 요청 실패. |
| CNNMoney 과거 latest HTTP | `http://rss.cnn.com/rss/money_latest.rss` | HTTP 200, RSS 2.0 정상, 1항목 | 0 | 1/1 · 0/1 | XML은 열리지만 유일한 항목이 2018-11-01. 현재 뉴스 피드로 사용하지 않음. |
| Business Insider 기존 Atom | `https://feeds.businessinsider.com/custom/all` | HTTP 200, Atom 1.0 정상, 20항목 | 20 | 20/20 · 20/20 | **접속·분석 가능.** 미국판 현행 공식 RSS 안내는 확인하지 못해 공식 지원 여부는 미확인. |

### 조사 출처와 해석

- Yahoo 미국판 공식 도움말의 [Yahoo Finance 도구 안내](https://help.yahoo.com/kb/SLN24381.html)와 [검색 안내](https://help.yahoo.com/kb/SLN2340.html)에서는 RSS를 찾지 못했다. 검색 범위에서 현행 미국판 일반 뉴스 RSS 공식 안내도 찾지 못했다.
- Yahoo Finance의 2017년 공식 기사 [How to find Pogue's stuff on Yahoo Finance](https://finance.yahoo.com/news/how-to-find-david-pogues-stuff-on-yahoo-finance-110615434.html)는 저자별 RSS 주소를 안내하지만, 2026-10-29 실제 시험에서는 404였다.
- Yahoo 대만 증권판의 [공식 RSS 안내](https://tw.finance.yahoo.com/rss-index)는 일반 뉴스·카테고리·종목별 RSS를 별도로 안내한다. `tw.stock.yahoo.com` 피드는 실제 분석에도 성공했지만 미국 Yahoo Finance의 일반 뉴스 피드로 합치지 않는다.
- Yahoo 미국 종목별 후보와 중단된 일반 뉴스 주소는 현재 상태를 교차 확인하기 위해 [Feeder의 Yahoo RSS 점검 자료](https://feeder.co/knowledge-base/rss-content/yahoo-news-rss-feeds/)도 참고했다. 이는 Yahoo 공식 지원 근거가 아니다.
- CNN의 현재 [공식 알림·이메일 안내](https://help.cnn.com/Answer/Detail/000001024)는 뉴스레터, 앱 알림, 웹 알림을 안내하지만 공개 RSS 주소는 제시하지 않는다. 과거 공식 RSS 페이지 주소인 `https://www.cnn.com/services/rss/`에서도 이번 조사로 현행 Business 피드를 확인하지 못했다.
- CNN 후보 주소는 과거 CNN 피드를 보존한 [외부 CNN RSS 목록](https://support.itesmedia.tv/available-rss-feeds-from-cnn)과 [피드 디렉터리](https://www.feedfabrik.com/directory/)에서 교차 확인했다. 실제 시험 결과, HTTP 응답은 살아 있어도 콘텐츠가 수년간 갱신되지 않았다.
- Business Insider 미국판의 현행 공식 RSS 안내는 이번 검색에서 찾지 못했다. [Business Insider Germany의 공식 RSS 안내](https://www.businessinsider.de/informationen/abonniert-die-rss-feeds-von-business-insider-deutschland/)는 독일 지역판 안내이며 미국판 `feeds.businessinsider.com/custom/all`의 공식 지원 근거로 사용하지 않았다.

공식 안내를 찾지 못했다는 사실은 서비스가 공식적으로 미지원이라고 단정하는 근거가 아니다. 따라서 Yahoo Finance 미국 일반 뉴스와 CNN Business는 **주소 미확인**, Business Insider는 **접속·분석 가능 / 공식 지원 미확인**으로 기록한다.

## 결과 파일

- 기본 536건: `outputs/20261029T080241_074663Z/articles.csv`, `articles.json`
- 기본 피드 현황: `outputs/20261029T080241_074663Z/feed_status.csv`, `feed_status.json`
- 추가 후보 최종 시험: `outputs/feed_research_20261029/20261029T081558_858937Z/`
- 추가 후보의 원본 응답: 위 폴더의 `raw_feeds/`
- 추가 후보 설정 스냅샷: 위 폴더의 `feeds_snapshot.csv`
- 조사용 설정 원본: `config/research_candidates_20261029.csv`

기사 원문 페이지 방문, 기사 전문 추가 수집, 반도체 분류, 관계 추출은 수행하지 않았다.
