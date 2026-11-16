# RSS 지속 수집 구조

## 운영 범위

`config/feed_registry.csv`가 지속 수집용 단일 설정이다. 기존 설정과 조사 파일은 조사 이력으로 그대로 보존한다.

- `default`: 기존 6개 매체의 14개 피드. 지속 수집 기본 대상이다.
- `test`: 확대 조사 10개 매체의 17개 피드. RSS 작동은 확인했지만 기본 승격 전 시험 대상으로 둔다.
- `hold`: 10개 비활성 행. Yahoo Finance·CNN Business의 현재 주소 미확인 행 2개와, 종목별·대만판·과거 주소 8개를 조사 이력으로 보존한다. 자동 요청하지 않는다.

공식 지원 상태와 실제 접속 성공은 별도 필드다. `official_support_status=confirmed`는 공식 안내를 확인한 경우에만 사용한다. Business Insider처럼 피드는 동작하지만 현행 공식 안내를 찾지 못한 경우는 `not_confirmed`다. 확대 후보 17개의 `body_quality_status`는 모두 `unverified`이며, 긴 RSS 텍스트도 전문으로 판정하지 않는다.

## 실행 흐름

`src/continuous_collect.py`는 한 실행에서 다음 순서를 지킨다.

1. 통합 설정을 검증하고 실행별 새 결과 폴더를 만든다.
2. 선택한 RSS·Atom 피드를 수집하고 원본 응답과 피드 상태를 저장한다.
3. 정규화 URL의 SHA-256을 `article_id`로 사용해 SQLite에 새 기사를 넣거나 기존 기사의 최근 확인 시각을 갱신한다.
4. RSS 관측 원문을 `rss_observations`에 실행·피드별로 추가한다.
5. 본문 수집이 허용된 기사를 `body_queue`에 넣고 이번 실행의 제한 건수만 처리한다.
6. 본문 실패는 `body_attempts`와 대기열 상태에 기록하고 다음 기사로 진행한다. RSS 실행 전체를 실패시키지 않는다.

동시 실행은 SQLite 옆 잠금 파일로 막는다. 모든 네트워크 기능은 `--collect`를 명시해야 시작한다.

## SQLite 저장 내용

기본 위치는 `data/rss_news.sqlite3`이다.

| 테이블 | 역할 |
| --- | --- |
| `runs` | 실행 시각, 상태, 설정 해시, 신규 기사·본문 시도 수 |
| `feeds` | 통합 설정의 현재 스냅샷과 공식 지원·품질 상태 |
| `feed_checks` | 실행별 피드 접속·분석 결과 |
| `articles` | 정규화 URL별 기사 현재 상태, 최초 발견·최근 확인, RSS 최신 필드와 추출 본문 |
| `article_sources` | 한 기사가 발견된 매체와 피드의 다대다 이력 |
| `rss_observations` | 실행·피드별 RSS 제목·요약·본문 원문 이력 |
| `body_queue` | `queued`, `retry_wait`, `success`, `partial`, `blocked`, `subscription`, `failed` 상태 |
| `body_attempts` | 원문 요청별 상태·이유·추출 방법·본문 후보·응답 해시 |

`articles.latest_rss_content`와 `articles.article_body`는 별도 열이다. 길이를 비교해 하나로 합치지 않는다. `full_text_verified`의 기본값은 항상 `0`이며, 추출 성공만으로 기사 전문이라고 판정하지 않는다.

## 요청·재시도 정책

- 매체별 요청 간격, 타임아웃, HTTP 요청 재시도 횟수는 통합 설정에서 관리한다.
- 한 HTTP 요청의 재시도 대상은 연결 오류, 408, 425, 429, 5xx다. 설정상 재시도는 최대 1회이며 상한은 3회다.
- 401·402와 구독·로그인 문구는 `subscription`, 403·407·451과 자동화 차단 문구는 `blocked`다. 두 상태는 자동 재시도하지 않는다.
- 본문 컨테이너를 찾지 못한 경우는 `failed`, 짧거나 구조가 제한된 추출 결과는 `partial`이다.
- 일시 오류만 `retry_wait`로 두고 기본 6시간 뒤 다시 시도한다. 기사당 누적 본문 시도 상한은 기본 3회다.
- 로그인, 쿠키 주입, 캡차 처리, 브라우저 위장·차단 우회는 하지 않는다.

Zacks는 파일럿에서 자동화 차단이 확인되어 통합 설정의 `body_collection_enabled=false`다. RSS는 계속 수집하지만 새 원문 요청은 자동 대기열에 넣지 않는다.

## 명령

오프라인 검증:

```powershell
& 'C:\Users\SD1-08\miniforge3\envs\aicam\python.exe' -m unittest discover -s tests -v
```

네트워크 없이 통합 설정을 검증하고 SQLite의 `feeds` 테이블만 동기화:

```powershell
& 'C:\Users\SD1-08\miniforge3\envs\aicam\python.exe' src\continuous_collect.py --sync-registry-only
```

기본·시험 피드를 모두 수집하고 본문 대기열을 최대 10건 처리:

```powershell
& 'C:\Users\SD1-08\miniforge3\envs\aicam\python.exe' src\continuous_collect.py --collect --tiers default,test --body-limit 10
```

RSS만 수집하려면 `--body-limit 0`, 기존 대기열만 처리하려면 `--body-only`를 사용한다. 매체를 제한하는 시험은 `--sources "The Motley Fool,CNBC"`, 피드 수 제한은 `--feed-limit 2`를 사용한다.

각 실행 결과는 `outputs/continuous/<UTC 실행 시각>/`에 생긴다. `feed_status.*`, `articles_seen.*`, `new_articles.*`, `body_results.*`, `database_summary.json`, `run_conditions.json`을 확인한다.

## 2026-10-29 소량 검증

Fortune 1개 피드, 최근 24시간, 본문 최대 2건으로 실제 실행했다.

- 성공 실행: `outputs/continuous/20261029T090159_195195Z/`
- 피드: HTTP 200·RSS 2.0 정상, 기간 내 9건
- SQLite 신규 기사: 9건, RSS 관측: 9건
- 본문 시도: 2건, `success` 2건, 대기 7건
- 두 건 모두 RSS 본문과 추출 본문을 별도로 보존했고 `full_text_verified=0`으로 남겼다.

먼저 실행한 제한 환경 진단 `outputs/continuous/20261029T090139_723092Z/`는 Windows 소켓 권한으로 `request_error`가 나서 기사 0건으로 종료됐다. 로그 이력으로 삭제하지 않았고, 네트워크가 허용된 동일 조건의 다음 실행에서 성공을 확인했다.

## Windows 작업 스케줄러 제안

권장 주기는 **2시간마다**다. RSS 목록의 항목 상한으로 인한 누락 위험을 줄이면서 발행사 요청량을 과도하게 높이지 않는 시작점이다. 실행당 본문은 20건으로 제한하고, 실제 누적량과 차단률을 확인한 뒤 조정한다.

다음 PowerShell 명령은 등록 예시일 뿐이며 현재 자동 등록하지 않았다.

```powershell
schtasks.exe /Create /TN "RSS News Continuous" /SC HOURLY /MO 2 /TR "`"C:\Users\SD1-08\miniforge3\envs\aicam\python.exe`" `"C:\ai_campus_main_proj\rss_news\src\continuous_collect.py`" --collect --tiers default,test --body-limit 20" /F
```

등록 전 같은 명령을 터미널에서 수동 실행하고 SQLite와 실행별 결과를 확인한다. 작업 스케줄러에는 비밀번호·구독 쿠키 같은 인증 정보를 넣지 않는다.

## 기존 결과 보존

다음 결과는 새 SQLite에 자동으로 가져오거나 수정하지 않는다.

- 기본 수집 536건: `outputs/20261029T080241_074663Z/`
- 확대 피드 시험 383건: `outputs/feed_expansion_research_20261029/20261029T083706_031577Z/`
- Yahoo·CNN 등 연구용 시험 85건: `outputs/feed_research_20261029/20261029T081558_858937Z/`

SQLite는 지속 수집 기능을 실행한 시점부터 새로 누적된다.
