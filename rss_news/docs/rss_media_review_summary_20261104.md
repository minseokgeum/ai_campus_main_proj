# 뉴스 수집 가능·불가능 목록

기준일: 2026-11-04. 기존 RSS 시험과 사용자의 본문 확인 결과 기준.
‘불가능·보류’에는 RSS 목록은 받아지지만 현재 방식으로 본문을 확보하거나 확인하지 못한 매체도 포함한다. 표본 성공은 모든 기사의 전문 확보를 뜻하지 않는다.

## 수집 가능

### 처음 확인한 6개 매체

| 매체 | 주요 분야 | 피드 이름 | 코멘트 |
|---|---|---|---|
| CNBC | 증시·금융·경제·기업 | top, business, economy, finance, technology, world | - 일반 기사 원문 추가 수집 필요.<br>- 라이브 일부만 추출된 사례 있음. 영상 설명·구독 기사 구분 필요. |
| Fortune | 경제·기업·경영·투자 | all | - 본문 끝 행사·신청 홍보 제거 필요. |
| The Motley Fool | 투자·주식·기업분석 | headlines | - RSS는 티저·부분 본문일 수 있어 원문 추가 수집 필요. |
| Zacks | 투자·주식·실적분석 | commentary | - RSS 본문 확보. 홍보·반복 푸터 정제 필요.<br>- 원문 요청 차단 이력으로 자동 원문 수집은 제외 중. RSS 본문 누락 여부 확인 필요. |
| Fox Business | 경제·증시·기업·산업 | latest, economy, markets, technology | - 사진 캡션·출처·앱 홍보 제거 필요.<br>- 영상 포함 일반 기사와 영상 설명 전용 페이지 구분. |
| Business Insider | 기업·경제·금융·기술 | legacy_atom | - 기존 Atom 작동, 현행 공식 지원 미확인.<br>- 원문 추출이 RSS보다 짧아 문단 누락 여부 확인 필요. |

### 추가 확인한 매체

| 매체 | 주요 분야 | 피드 이름 | 코멘트 |
|---|---|---|---|
| BBC News | 일반뉴스·국제·경제·기술 | top, business, technology | - 일반 기사 본문 표시 성공.<br>- 사진 캡션·관련 링크·소셜 안내 정제 필요. |
| The Guardian | 국제·정치·경제·기술 | world, business, technology | - 본문 끝 카테고리·관련 링크 정제 필요. |
| Ars Technica | **기술·과학** | all_news | - 공개 RSS는 부분 본문. 원문 추가 수집 필요. |
| TechCrunch | 기술·스타트업·벤처투자 | all | - **Azure·Upwind 기사 2건 사용자 원문 대조 완료.**<br>- 아래에 자동 연결되는 다음 기사는 제외. |
| WIRED | 기술·과학·비즈니스·문화 | top, business | - 일부 구독 기사 원문 대조 불가.<br>- 쿠폰 기사는 유형 분류 필요. 쿠폰 내용 자체를 불필요 문구로 삭제하면 안 됨. |
| NPR | 일반뉴스·경제·정치·라디오 | news, business | - **라디오 기사는 공개 대본(Transcript)을 별도로 가져와야 하는 경우 있음. 자동 대본 탐색·저장 기능 추가 필요.**<br>- 공개 대본 추출 성공 표본 있음. |
| ProPublica | 탐사보도·정책·사회 | main | - **라디오·오디오 보도도 있으며, 확인한 라디오 표본은 기존 코드로 본문 추출 성공.**<br>- 제보·팟캐스트 안내 정제 필요. |
| IEEE Spectrum | 전기전자·공학·반도체·AI | all | - **시·문예 콘텐츠 제외를 위해 태그 수집·유형 분류 기능 추가 필요.**<br>- **More from Spectrum 등 추천·관련 기사 영역 자동 제거 기능 추가 필요. 실제 기사 부속 자료는 유지.** |
| MIT Technology Review | 신기술·AI·기술정책 | all | - 본문 선택자 수정 후 표시 성공.<br>- 뉴스 모음·브랜드 콘텐츠 유형 구분 필요. |
| ABC News | 일반뉴스·경제·기술 | top, business, technology | - 중간 Popular Reads 추천 영역만 제거. 뒤 본문 유지.<br>- AP 지원재단 고지는 본문과 분리 검토. |
| CBS News | 일반뉴스·경제·기술 | top, moneywatch, technology | - 기여자 표기·캡션 정제 필요. |
| NBC News | 일반뉴스·정치·경제·국제 | news | - FOR SUBSCRIBERS 추천 카드 제거.<br>- 여러 본문 블록을 모두 수집해야 누락 방지. 수정 후 사용자 확인.<br>- RSS 제목·현재 원문 제목 별도 보존. |
| Al Jazeera English | 국제·정치·경제 | all | - Recommended Stories 영역만 제거하고 뒤 본문 유지. |
| Engadget | 기술·전자기기·게임·디지털문화 | main | - 수정 후 3건 사용자 원문 일치 확인.<br>- 첫 번째 빈 영역이 아니라 모든 본문 문단을 선택해야 함. |

## 수집 불가능·보류

| 매체 | 주요 분야 | 피드 이름·범위 | 이유·코멘트 |
|---|---|---|---|
| The New York Times | 일반뉴스·경제·기술 | business, technology | - RSS 목록은 확보. 원문 DataDome 차단·HTTP 403.<br>- **자동 본문 수집 제외 반영 완료.** |
| Bloomberg | 금융·증시·산업·기술 | markets, industries, technology | - RSS 목록은 확보. 원문 3건 HTTP 403. |
| MarketWatch | 증시·금융·투자 | top_stories | - RSS 목록은 확보. 원문 HTTP 401·DataDome 접근 확인 응답. |
| The Wall Street Journal | 경제·기업·증시 | us_business, markets | - RSS 목록은 확보. 원문 HTTP 401·DataDome 접근 확인 응답. |
| Financial Times | 국제경제·금융·기업 | home | - RSS 목록은 확보. 원문 HTTP 403·Cloudflare 보안 확인 응답. |
| The Verge | 기술·전자기기·디지털문화 | main | - RSS 목록은 확보. 구독 제한·짧은 본문으로 원문 대조 곤란.<br>- 사용자 결정으로 본문 수집 제외·보류. |
| The Atlantic | 시사·정치·사회·문화 | all | - RSS 목록은 확보. 원문 HTTP 403. |
| Manufacturing Dive | 제조업·공장투자·산업정책 | news | - RSS 목록은 확보. 기존 본문 감사 HTTP 403로 보류. |
| Supply Chain Dive | 물류·운송·조달·공급망 | news | - RSS 목록은 확보. 원문 HTTP 403 반복.<br>- Fox Business와 별개의 매체. |
| Construction Dive | 건설업·건설투자·인프라 | news | - RSS 목록은 확보. 최신 사용자 시험 원문 HTTP 403. |
| Fast Company | 기업·혁신·디자인·기술 | main | - 확인 RSS의 갱신이 오래되어 최신 수집 제외.<br>- 본문 일부 미추출·구독 제한으로 원문 대조 곤란. |
| CNN Business | 경제·기업·금융 | 과거 edition_business, money_latest | - 과거 피드가 2017·2018년 기사에 정체.<br>- 현행 Business RSS 주소 미확인. |
| Yahoo Finance | 금융·증시·기업 | 미국 일반 뉴스 | - 시험 주소 404·현행 일반 뉴스 RSS 주소 미확인.<br>- 작동한 종목별·대만판 RSS는 별도 연구용이며 기본 대상에서 제외. |

**공통 기준: summary만 있는 기사는 관계표 대상에서 제외. 주피터에서 확인한 추출·정제 규칙은 운영 자동 수집 코드에 별도 반영해야 한다.**
