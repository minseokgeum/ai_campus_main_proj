# RSS 본문 충실도 점검

점검일: **2026-10-29 (KST)**

## 범위와 판정 기준

대상은 기본 수집 결과 `outputs/20261029T080241_074663Z/articles.json`의 URL 중복 제거 후 536건이다. 파일 SHA-256은 `C8922CB1F79E517D7B15E22005A17A605E83D03DBB6EC41A9EA11F2485FBA394`다. 이 점검에서는 저장 파일만 읽었으며 새 RSS 요청이나 기사 원문 접속을 하지 않았다. 원본 파일도 수정하지 않았다.

실제 기사 레코드에는 다음 필드가 있다.

- 출처: `source_names`, `feed_refs`
- 기사 식별: `title`, `url`, `original_url`, `url_status`
- 발행일: `published_raw`, `published_utc`, `date_status`, `window_status`, `published_variants_utc`, `published_raw_variants`, `published_date_conflict`
- RSS 텍스트: `summary`, `feed_content`, `has_rss_body`

`article_body`, 원문 HTML, 본문 추출 방식·검토 상태 필드는 없다. 따라서 이 문서에서 `RSS 본문 있음`은 `feed_content`가 비어 있지 않다는 뜻일 뿐, 기사 원문의 전문 확보를 뜻하지 않는다.

분류는 서로 겹치지 않게 다음과 같이 계산했다.

- **제목만**: `summary`와 `feed_content`가 모두 비어 있음
- **요약만**: `summary`는 있고 `feed_content`는 비어 있음
- **RSS 본문 있음**: `feed_content`가 있음. 441건 모두 `summary`도 있음

글자 수는 저장된 정제 문자열의 Python 문자 수다. 분포는 비어 있지 않은 값만 대상으로 `최소 / P25 / 중앙값 / P75 / P90 / 최대` 순으로 표시한다.

## 매체별 텍스트 보유 현황

| 매체 | 전체 | 제목만 | 요약만 | RSS 본문 있음 | 본문 있으나 요약 없음 |
| --- | ---: | ---: | ---: | ---: | ---: |
| CNBC | 95 | 1 | 94 | 0 | 0 |
| Fortune | 9 | 0 | 0 | 9 | 0 |
| The Motley Fool | 50 | 0 | 0 | 50 | 0 |
| Zacks | 325 | 0 | 0 | 325 | 0 |
| Fox Business | 37 | 0 | 0 | 37 | 0 |
| Business Insider | 20 | 0 | 0 | 20 | 0 |
| **전체** | **536** | **1** | **94** | **441** | **0** |

전체 536건 중 RSS 본문 필드가 있는 비율은 82.3%지만, 매체별 형식 차이가 크다. CNBC는 본문 필드가 전혀 없고, The Motley Fool은 본문 필드가 있어도 짧은 티저인 경우가 많다.

## 글자 수 분포

### 요약

| 매체 | 값이 있는 건 | 평균 | 최소 / P25 / 중앙값 / P75 / P90 / 최대 |
| --- | ---: | ---: | --- |
| CNBC | 94 | 119.6 | 17 / 101 / 124 / 142 / 156 / 168 |
| Fortune | 9 | 128.9 | 81 / 101 / 131 / 144 / 156 / 190 |
| The Motley Fool | 50 | 88.8 | 50 / 75 / 84 / 92 / 123 / 153 |
| Zacks | 325 | 184.4 | 91 / 154 / 190 / 206 / 243 / 264 |
| Fox Business | 37 | 151.5 | 115 / 145 / 152 / 158 / 166 / 173 |
| Business Insider | 20 | 130.4 | 84 / 118 / 135 / 144 / 147 / 166 |
| **전체** | **535** | **158.8** | **17 / 122 / 155 / 193 / 237 / 264** |

### RSS 본문

| 매체 | 값이 있는 건 | 평균 | 최소 / P25 / 중앙값 / P75 / P90 / 최대 |
| --- | ---: | ---: | --- |
| CNBC | 0 | - | - |
| Fortune | 9 | 5,670.3 | 3,778 / 4,323 / 5,141 / 7,148 / 8,238 / 8,348 |
| The Motley Fool | 50 | 320.2 | 120 / 125 / 131 / 533 / 849 / 1,183 |
| Zacks | 325 | 4,454.8 | 2,108 / 3,658 / 4,326 / 4,459 / 6,501 / 13,023 |
| Fox Business | 37 | 3,112.9 | 1,208 / 2,224 / 2,870 / 3,380 / 3,855 / 10,625 |
| Business Insider | 20 | 4,224.7 | 2,079 / 2,614 / 2,938 / 5,216 / 7,074 / 11,315 |
| **전체** | **441** | **3,887.8** | **120 / 2,913 / 4,082 / 4,428 / 6,349 / 13,023** |

본문 길이 구간을 보면 형식 차이가 더 분명하다.

| 매체 | 0자 | 1~199자 | 200~999자 | 1,000~2,999자 | 3,000자 이상 |
| --- | ---: | ---: | ---: | ---: | ---: |
| CNBC | 95 | 0 | 0 | 0 | 0 |
| Fortune | 0 | 0 | 0 | 0 | 9 |
| The Motley Fool | 0 | 35 | 12 | 3 | 0 |
| Zacks | 0 | 0 | 0 | 35 | 290 |
| Fox Business | 0 | 0 | 0 | 21 | 16 |
| Business Insider | 0 | 0 | 0 | 10 | 10 |

The Motley Fool은 50건 중 35건(70%)이 200자 미만이다. 표본에는 이미지 출처, 언론 문의 주소, 날짜와 `Continue reading`만 있는 120~131자 텍스트가 확인됐다. 이 매체의 `has_rss_body=true`를 기사 본문 확보로 해석하면 안 된다.

## 요약과 본문의 중복

비교 전 양쪽 문자열에 Unicode NFKC 정규화, 소문자 변환, 연속 공백 축약을 적용했다.

| 판정 | 건수 | 설명 |
| --- | ---: | --- |
| 정규화 후 완전 동일 | 0 | 요약과 본문 전체가 같은 사례 없음 |
| 완전 동일은 아니지만 95% 이상 유사 | 0 | 문자 시퀀스 유사도 기준 |
| 한쪽이 다른 쪽에 포함되고 길이도 90% 이상 | 0 | 사실상 같은 길이의 중복 사례 없음 |
| 요약이 훨씬 긴 본문 안에 그대로 포함 | 2 | Business Insider 2건. 전체 텍스트가 같은 것은 아님 |
| 요약·본문이 모두 있고 위 조건에 해당하지 않음 | 439 | 텍스트상 별도 내용 |

Business Insider의 다음 2건은 요약 문장이 본문 안에 그대로 들어 있지만 본문은 각각 2,630자와 2,665자로 훨씬 길다. 따라서 `요약=본문`으로 분류하지 않았다.

- [Google has a plan to keep ads alive even when AI agents do the shopping](https://www.businessinsider.com/google-advertising-alive-even-when-ai-agents-do-the-shopping-2026-10): 요약 84자, 본문 2,630자
- [Microsoft cuts capex forecast on AI capacity delays](https://www.businessinsider.com/microsoft-trims-ai-spending-plans-to-170b-as-azure-revenue-surges-2026-10): 요약 100자, 본문 2,665자

이 검사는 텍스트 중복을 확인한 것이며 의미상 같은 내용을 다른 문장으로 쓴 경우까지 판별하지 않는다. 반대로 요약과 본문이 다르고 본문이 길어도, 원문 일부 누락이나 홍보 문구 혼입 여부는 원문 대조 전에는 알 수 없다.

## 매체별 대표 표본

각 매체에서 최대 3건을 골랐다. 짧은 값, 중간 또는 특징적인 값, 긴 값을 우선해 서로 다른 문제를 드러내도록 했다.

| 매체 | 제목·URL | 요약 / 본문 길이 | 확인할 문제 |
| --- | --- | ---: | --- |
| CNBC | [Shell nearly doubles quarterly profit year-on-year as refining margins soar to record high](https://www.cnbc.com/2026/10/29/shell-earnings-oil-q3.html) | 0 / 0 | 제목 외 텍스트가 전혀 없다. 원문 비교 시험의 최우선 표본. |
| CNBC | [Our next steps for Alphabet stock after earnings disappoint at nearly every turn](https://www.cnbc.com/investingclub/2026/10/28/our-next-steps-for-alphabet-stock-after-earnings-disappoint-at-nearly-every-turn.html) | 17 / 0 | `Alphabet whiffed.`만 저장됐다. 유료·클럽 기사에서 요약이 극단적으로 짧은지 확인 필요. |
| CNBC | [Billionaire Ambani cries tears of joy as Jio Platforms becomes the second most valued Indian firm](https://www.cnbc.com/2026/10/29/ambani-billionaire-jio-ipo-india.html) | 168 / 0 | CNBC 내 긴 요약 표본이지만 본문은 없다. 요약만으로 내용 분석 가능한 범위를 점검해야 한다. |
| Fortune | [Alphabet’s Google Cloud revenue doubles to $31 billion as cash flow stays deep red](https://fortune.com/2026/10/28/alphabet-google-stock-drops-cloud-revenue-doubles-free-cash-flow-negative/) | 93 / 3,778 | 기사형 텍스트지만 끝에 Fortune 출처 푸터가 있다. 원문의 문단·미디어·누락 범위 확인 필요. |
| Fortune | [For the first time since 1992, a Fed governor and president dissented together, as Kevin Warsh says the ‘monetary medicine’ is starting to work](https://fortune.com/2026/10/28/fed-rates-steady-kevin-warsh-president-governor-laura-ullrich/) | 131 / 5,141 | 중간 길이 표본. 페이월 또는 RSS 잘림 여부를 원문과 비교해야 한다. |
| Fortune | [Can Southeast Asia pitch itself as an ‘all-in-one’ chip hub?](https://fortune.com/2026/10/29/southeast-asia-semiconductor-supply-chain/) | 101 / 8,348 | 긴 텍스트지만 길이만으로 전문 판정 불가. 원문 문단 수와 끝부분 일치 여부 확인 필요. |
| The Motley Fool | [Boot Barn (BOOT) Q2 2027 Earnings Call Transcript](https://www.fool.com/earnings/call-transcripts/2026/10/29/boot-barn-boot-q2-2027-earnings-call-transcript/?source=iedfolrf0000001) | 88 / 120 | 본문 필드는 이미지 출처·날짜·언론 문의·`Continue reading`뿐이다. 실질 본문 없음에 가깝다. |
| The Motley Fool | [Anthropic's IPO Is Coming: 5 Key Numbers Investors Need to Know](https://www.fool.com/investing/2026/10/29/anthropic-s-ipo-is-coming-5-key-numbers-investors-need-to-know/?source=iedfolrf0000001) | 106 / 559 | 기사 도입부 뒤 `Continue reading`으로 끝나는 명확한 일부 본문 표본. |
| The Motley Fool | [This Is SpaceX's Biggest Risk, and It's Not What You Think](https://www.fool.com/investing/2026/10/29/this-is-spacexs-biggest-risk-and-its-not-what-you/?source=iedfolrf0000001) | 70 / 1,183 | 매체 내 최장 표본도 `Continue reading`으로 끝난다. 긴 티저이지 전문이라고 볼 수 없다. |
| Zacks | [Do Options Traders Know Something About Atour Lifestyle Stock We Don't?](https://www.zacks.com/stock/news/3017681/do-options-traders-know-something-about-atour-lifestyle-stock-we-don-t?cid=CS-ZC-FT-tale_of_the_tape%7Coptions-3017681) | 104 / 2,108 | 기사형 텍스트 뒤 거래 홍보와 Zacks 푸터가 붙는다. 본문과 홍보 영역 경계 확인 필요. |
| Zacks | [Cimpress (CMPR) Reports Q1 Loss, Lags Revenue Estimates](https://www.zacks.com/stock/news/3017872/cimpress-cmpr-reports-q1-loss-lags-revenue-estimates?cid=CS-ZC-FT-fundamental_analysis%7Cyseop_template_4-3017872) | 192 / 4,326 | 중앙 길이 표본. 수익률 홍보 문구가 포함되어 순수 기사 텍스트가 아니다. |
| Zacks | [3 HVAC Stocks to Watch as Heating & Cooling Demand Accelerates](https://www.zacks.com/commentary/3016869/3-hvac-stocks-to-watch-as-heating-cooling-demand-accelerates?cid=CS-ZC-FT-industry_outlook-3016869) | 145 / 13,023 | 전체 최장 본문. 긴 기사와 주식 추천 홍보가 결합됐는지 경계 검증 필요. |
| Fox Business | [How much income Americans need to retire comfortably in every state](https://www.foxbusiness.com/economy/how-much-income-americans-need-retire-comfortably-every-state) | 141 / 1,208 | 짧은 기사형 본문 뒤 관련 기사 제목이 붙는다. 원문이 더 긴지 확인 필요. |
| Fox Business | [How parents can claim their child's Trump Account, possible $1,000 seed contribution](https://www.foxbusiness.com/economy/how-parents-can-claim-childs-trump-account-possible-1000-seed-contribution) | 150 / 2,870 | 본문이 목록 도입부에서 끝나 보인다. RSS 잘림 여부를 원문과 비교해야 한다. |
| Fox Business | [Florida's manufacturing ambitions take flight as aerospace, medtech giants fuel Sunshine State's economic push](https://www.foxbusiness.com/economy/floridas-manufacturing-ambitions-take-flight-aerospace-medtech-giants-fuel-sunshine-states-economic-push) | 152 / 10,625 | 매체 내 최장 표본이지만 마지막에 `READ MORE` 문구가 있다. 관련 링크·푸터 혼입 확인 필요. |
| Business Insider | [Albertsons won't insure employees' spouses if they're eligible for their own health coverage](https://www.businessinsider.com/albertsons-limiting-health-insurance-for-employee-spouses-2026-10) | 122 / 2,079 | 이미지 캡션과 `Read the original article` 푸터가 포함된다. 실제 본문 시작·끝 비교 필요. |
| Business Insider | [Google has a plan to keep ads alive even when AI agents do the shopping](https://www.businessinsider.com/google-advertising-alive-even-when-ai-agents-do-the-shopping-2026-10) | 84 / 2,630 | 요약이 본문 안에 그대로 포함된 2건 중 하나. 중복 문장과 본문 경계를 확인해야 한다. |
| Business Insider | [Jennifer Lawrence and Josh Hutcherson will appear in 'The Hunger Games: Sunrise on the Reaping.' Here's everything we know about the film.](https://www.businessinsider.com/sunrise-on-the-reaping-hunger-games-prequel-cast-trailer-2026) | 145 / 11,315 | 매체 내 최장 표본. 이미지 캡션·업데이트 누적·푸터가 섞였는지 원문 비교 필요. |

## 다음 원문 비교 시험 제안

새 원문 비교를 시작할 때의 우선순위는 다음이 적절하다.

1. **The Motley Fool — 최우선.** 50건 모두 `feed_content`가 있지만 35건이 200자 미만이고 표본이 `Continue reading`으로 끝난다. `has_rss_body`를 실질 본문 확보 여부로 쓰지 않도록 별도 품질 판정이 필요하다.
2. **CNBC — 최우선.** 95건 모두 RSS 본문이 없고 1건은 제목만 있다. 요약만으로 후속 분석할 수 있는 기사와 원문 본문이 꼭 필요한 기사를 구분해야 한다. Investing Club 같은 접근 제한 유형도 따로 확인할 필요가 있다.
3. **Zacks — 높은 우선순위.** 전체의 325건으로 데이터 비중이 가장 크며 본문은 길지만 투자 홍보·성과 문구·출처 푸터가 반복된다. 원문 대조를 통해 기사 본문 경계와 제거 가능한 공통 보일러플레이트를 정해야 한다.
4. **Fox Business — 중간 우선순위.** 기사형 텍스트가 있지만 관련 기사 제목, 대문자 CTA, 목록 도중 종료로 보이는 사례가 있다. 짧은·중간·긴 표본을 비교해 RSS 잘림 규칙을 확인하는 것이 좋다.
5. **Fortune — 중간 우선순위.** 9건 모두 3,778자 이상으로 비교적 충실해 보이지만 페이월, 문단 누락, 미디어 캡션 제외 여부는 길이로 판단할 수 없다. 표본 수가 적으므로 3건 비교로 형식을 먼저 확인할 수 있다.
6. **Business Insider — 중간 우선순위.** 20건 모두 긴 본문을 제공하지만 이미지 캡션과 출처 푸터가 포함되고, 2건은 요약 문장이 본문에 그대로 반복된다. 기존 Atom의 공식 지원 여부도 미확인이므로 내용 범위와 형식 안정성을 함께 점검해야 한다.

원문 비교 시험을 하더라도 기존 `summary`와 `feed_content`는 그대로 보존하고, 원문에서 새로 추출한 값은 별도 `article_body`와 추출 시각·방식·접속 상태·검토 상태로 저장하는 것이 적절하다. RSS 본문과 원문 본문의 길이만 비교해 전문 여부를 자동 확정해서는 안 된다.
