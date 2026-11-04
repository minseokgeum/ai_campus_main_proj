# 기사 원문 본문 수집 시험

시험일: **2026-10-29 17:35 KST**

## 범위와 의미

`docs/rss_content_audit.md`에서 선정한 6개 매체의 표본 18건을 다음 순서로 시험했다.

1. The Motley Fool
2. CNBC
3. Zacks
4. Fox Business
5. Fortune
6. Business Insider

입력은 `outputs/20261029T080241_074663Z/articles.json`이며 입력 SHA-256은 `c8922cb1f79e517d7b15e22005a17a605e83d03dbb6ec41a9ea11f2485fba394`다. 원본 536건과 그 안의 `summary`, `feed_content`는 수정하지 않았다.

수집기는 일반 공개 HTTP 요청만 사용했다. 로그인, 구독 쿠키, 캡차 해결, 브라우저 자동화, 유료벽 우회를 사용하지 않았다. 공개 HTML의 발행사별 본문 컨테이너 또는 JSON-LD `articleBody`만 읽었다. 결과에는 HTML 원문 대신 응답 바이트 수와 SHA-256을 남겼다.

상태의 의미는 다음과 같다.

- `success`: 공개 HTML에서 상당한 본문 후보를 추출했다. **전문 확인 완료라는 뜻이 아니다.**
- `partial`: 일부 텍스트만 추출됐거나 구조상 부분 본문으로 판단됐다.
- `blocked`: 로그인·구독·자동화 차단 페이지로 본문을 얻지 못했다.
- `failed`: 접속 또는 본문 컨테이너 탐색에 실패했다.

모든 결과의 `full_text_verified`는 `false`다. 길이, HTTP 200, 본문 컨테이너 존재만으로 전문 확보를 확정하지 않았다.

## 매체별 결과

| 매체 | 표본 | 성공 | 부분 | 차단 | 실패 | RSS 본문 합계 | 원문 후보 합계 | 판단 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| The Motley Fool | 3 | 3 | 0 | 0 | 0 | 1,862 | 82,382 | RSS는 짧은 티저였고 공개 원문에서 훨씬 많은 내용 확보 |
| CNBC | 3 | 2 | 0 | 1 | 0 | 0 | 4,392 | 일반 기사 2건은 공개 본문 확보, Investing Club 1건은 차단 |
| Zacks | 3 | 0 | 0 | 3 | 0 | 19,457 | 0 | HTTP 200이지만 세 건 모두 자동화 차단 페이지 |
| Fox Business | 3 | 3 | 0 | 0 | 0 | 14,703 | 18,346 | RSS보다 추가 내용이 있으나 영상 설명·캡션·CTA 혼입 |
| Fortune | 3 | 3 | 0 | 0 | 0 | 17,267 | 17,140 | RSS와 공개 DOM 본문이 거의 동일. RSS 쪽 출처 푸터 차이 |
| Business Insider | 3 | 3 | 0 | 0 | 0 | 16,024 | 13,197 | 공개 JSON-LD 본문은 RSS보다 짧고 캡션·푸터가 적음 |
| **전체** | **18** | **14** | **0** | **4** | **0** | **69,313** | **118,260** | 추출 성공과 전문 검증은 별개 |

## 기사별 비교

유사도는 정제된 RSS `feed_content`와 새 `article_body`의 문자 시퀀스 비교값이다. 문단 순서나 문구가 조금만 달라도 낮아질 수 있어 완전성 판정에는 사용하지 않았다.

| 매체 | 기사 | 상태 | RSS 요약 / 본문 / 원문 후보 | 방법·유사도 | 실제 비교에서 확인한 점 |
| --- | --- | --- | ---: | --- | --- |
| The Motley Fool | [Boot Barn earnings call transcript](https://www.fool.com/earnings/call-transcripts/2026/10/29/boot-barn-boot-q2-2027-earnings-call-transcript/?source=iedfolrf0000001) | 성공 | 88 / 120 / 73,984 | `.article-body`, 0.0032 | RSS는 이미지·문의·계속 읽기 문구뿐이었다. 공개 DOM에는 205개 문단의 실적 발표·질의응답이 있으며 Operator 종료 문구까지 확인했다. 렌더링 화면과의 전문 일치는 확인하지 않았다. |
| The Motley Fool | [Anthropic's IPO Is Coming](https://www.fool.com/investing/2026/10/29/anthropic-s-ipo-is-coming-5-key-numbers-investors-need-to-know/?source=iedfolrf0000001) | 성공 | 106 / 559 / 4,155 | `.article-body`, 0.2352 | RSS는 도입부에서 `Continue reading`으로 끝났고 공개 DOM은 22문단으로 확장됐다. 주가 정보 블록이 섞여 있다. |
| The Motley Fool | [This Is SpaceX's Biggest Risk](https://www.fool.com/investing/2026/10/29/this-is-spacexs-biggest-risk-and-its-not-what-you/?source=iedfolrf0000001) | 성공 | 70 / 1,183 / 4,243 | `.article-body`, 0.4347 | RSS보다 논거와 결론이 추가됐다. 공개 DOM 16문단을 얻었지만 기사 전문 여부는 길이로 확정하지 않았다. |
| CNBC | [Shell quarterly profit](https://www.cnbc.com/2026/10/29/shell-earnings-oil-q3.html) | 성공 | 0 / 0 / 1,384 | `.ArticleBody-articleBody` | RSS는 제목뿐이었고 공개 DOM에서 8문단을 추가했다. 페이지 스크립트에 premium/captcha 문자열이 있었으나 공개 본문 컨테이너는 읽혔다. |
| CNBC | [Alphabet stock next steps](https://www.cnbc.com/investingclub/2026/10/28/our-next-steps-for-alphabet-stock-after-earnings-disappoint-at-nearly-every-turn.html) | **차단** | 17 / 0 / 0 | 본문 컨테이너 없음 | HTTP 200이지만 Investing Club premium 표시만 확인됐다. 로그인하거나 우회하지 않았다. |
| CNBC | [Ambani and Jio Platforms](https://www.cnbc.com/2026/10/29/ambani-billionaire-jio-ipo-india.html) | 성공 | 168 / 0 / 3,008 | `.ArticleBody-articleBody` | RSS 요약만 있던 기사에서 공개 DOM 16문단을 추가했다. 원문 렌더링과 문단별 완전 비교는 하지 않았다. |
| Zacks | [Atour Lifestyle options](https://www.zacks.com/stock/news/3017681/do-options-traders-know-something-about-atour-lifestyle-stock-we-don-t?cid=CS-ZC-FT-tale_of_the_tape%7Coptions-3017681) | **차단** | 104 / 2,108 / 0 | 차단 페이지 | HTTP 200 응답이 기사 대신 `Pardon Our Interruption`과 쿠키·JavaScript 요구를 반환했다. RSS 본문과 비교할 공개 원문을 얻지 못했다. |
| Zacks | [Cimpress Q1 loss](https://www.zacks.com/stock/news/3017872/cimpress-cmpr-reports-q1-loss-lags-revenue-estimates?cid=CS-ZC-FT-fundamental_analysis%7Cyseop_template_4-3017872) | **차단** | 192 / 4,326 / 0 | 차단 페이지 | 같은 자동화 차단. 우회하지 않았다. |
| Zacks | [3 HVAC Stocks](https://www.zacks.com/commentary/3016869/3-hvac-stocks-to-watch-as-heating-cooling-demand-accelerates?cid=CS-ZC-FT-industry_outlook-3016869) | **차단** | 145 / 13,023 / 0 | 차단 페이지 | 같은 자동화 차단. 긴 RSS 본문이 전문인지 원문과 대조하지 못했다. |
| Fox Business | [Retirement income by state](https://www.foxbusiness.com/economy/how-much-income-americans-need-retire-comfortably-every-state) | 성공 | 141 / 1,208 / 2,099 | `.article-body`, 0.7361 | RSS에서 빠진 주별 목록이 추가됐다. 원문 후보에는 영상 제목·설명, 이미지 캡션, 앱 다운로드 CTA가 섞였다. |
| Fox Business | [Claiming a child's Trump Account](https://www.foxbusiness.com/economy/how-parents-can-claim-childs-trump-account-possible-1000-seed-contribution) | 성공 | 150 / 2,870 / 3,884 | `.article-body`, 0.8529 | RSS가 멈춘 뒤의 ETF 목록이 추가됐다. 영상 설명과 앱 다운로드 CTA도 포함됐다. |
| Fox Business | [Florida manufacturing ambitions](https://www.foxbusiness.com/economy/floridas-manufacturing-ambitions-take-flight-aerospace-medtech-giants-fuel-sunshine-states-economic-push) | 성공 | 152 / 10,625 / 12,363 | `.article-body`, 0.9262 | RSS와 핵심 본문이 매우 유사하며 원문 후보에는 영상 설명·캡션과 `READ MORE`가 추가됐다. 순수 기사 본문 경계 정제가 필요하다. |
| Fortune | [Alphabet Google Cloud](https://fortune.com/2026/10/28/alphabet-google-stock-drops-cloud-revenue-doubles-free-cash-flow-negative/) | 성공 | 93 / 3,778 / 3,739 | `.article-content`, 0.9933 | RSS와 공개 DOM이 거의 같다. RSS 끝의 `This story was originally featured` 푸터가 DOM 본문에는 없어 RSS가 39자 더 길다. |
| Fortune | [Fed dissent](https://fortune.com/2026/10/28/fed-rates-steady-kevin-warsh-president-governor-laura-ullrich/) | 성공 | 131 / 5,141 / 5,088 | `.article-content`, 0.9931 | RSS와 공개 DOM이 거의 같고 RSS 출처 푸터가 주된 차이다. 페이월 밖 공개 응답 범위만 비교했다. |
| Fortune | [Southeast Asia chip hub](https://fortune.com/2026/10/29/southeast-asia-semiconductor-supply-chain/) | 성공 | 101 / 8,348 / 8,313 | `.article-content`, 0.9959 | 세 표본 중 가장 높은 일치. RSS 출처 푸터를 제외하면 공개 DOM과 거의 같다. 전문 여부는 렌더링 페이지와 확정 비교하지 않았다. |
| Business Insider | [Albertsons employee spouses](https://www.businessinsider.com/albertsons-limiting-health-insurance-for-employee-spouses-2026-10) | 성공 | 122 / 2,079 / 1,605 | JSON-LD `articleBody`, 0.8713 | JSON-LD는 핵심 기사 문장 중심이며 RSS의 이미지 캡션·출처 푸터보다 짧다. RSS에만 있는 모든 문구가 비본문인지까지 확정하지 않았다. |
| Business Insider | [Google ads and AI agents](https://www.businessinsider.com/google-advertising-alive-even-when-ai-agents-do-the-shopping-2026-10) | 성공 | 84 / 2,630 / 2,169 | JSON-LD `articleBody`, 0.9039 | 공개 JSON-LD가 RSS보다 461자 짧다. 캡션·푸터 제거 효과와 실제 문단 누락을 렌더링 화면 없이 완전히 구분하지 못했다. |
| Business Insider | [Hunger Games prequel](https://www.businessinsider.com/sunrise-on-the-reaping-hunger-games-prequel-cast-trailer-2026) | 성공 | 145 / 11,315 / 9,423 | JSON-LD `articleBody`, 0.9087 | RSS보다 1,892자 짧다. 이미지 캡션과 푸터 차이가 있으나 업데이트 문단 누락 여부도 추가 확인이 필요하다. |

## 검토 범위와 한계

실제 비교는 다음 범위에서 수행했다.

- HTTP 상태와 최종 URL, 응답 형식 확인
- 발행사별 DOM 본문 컨테이너 또는 JSON-LD `articleBody` 추출
- 추출 본문의 시작·끝, 문단 수, 반복 CTA·캡션·푸터 확인
- 기존 RSS 요약·본문과 글자 수, 문자열 유사도, 주요 시작·끝 문구 비교
- 차단 페이지 문구와 공개 본문 컨테이너 부재 확인

JavaScript 렌더링 후 화면, 로그인 사용자 화면, 구독자 화면, 이미지·영상 내부 텍스트는 확인하지 않았다. 따라서 `success` 14건도 `full_text_verified=false`다. Zacks와 CNBC Investing Club은 접근 제한을 그대로 기록하고 중단했다.

## 저장 결과

- 최종 결과 폴더: `outputs/article_body_pilot_20261029/20261029T083520_417122Z/`
- JSON: `results.json`
- CSV: `results.csv`
- 실행 조건·상태 정의: `run_conditions.json`
- 표본 스냅샷: `samples_snapshot.csv`
- 표본 원본: `config/article_body_pilot_20261029.csv`
- 수집 코드: `src/collect_article_bodies.py`

각 결과는 원래 RSS 레코드를 그대로 포함하고, 새 `article_id`, `article_body`, `body_collected_at_utc`, `extraction_method`, `body_status`, `status_reason`, HTTP·응답 메타데이터와 비교 필드를 덧붙였다. 기본 536건에는 병합하지 않았다.
