# RSS 매체·피드 현황 확인

RSS·Atom 주소의 현재 접속 및 분석 결과를 확인하고 매체 현황표와 기사 목록을 저장하는 프로젝트입니다. 기본 RSS 수집기는 원문 페이지를 방문하지 않으며, 지속 수집기는 새 기사를 제한된 본문 대기열에 넣어 공개 페이지만 처리합니다. 로그인·유료벽·차단은 우회하지 않습니다. 관계 추출, 기존 536건 원문 일괄 수집, Neo4j는 포함하지 않습니다.

지속 수집은 `config/feed_registry.csv`, `src/continuous_collect.py`, `data/rss_news.sqlite3`를 사용합니다. RSS 실행별 결과와 누적 SQLite를 동시에 남기고, 새 기사만 본문 대기열에 연결합니다. 상세 정책과 스케줄러 예시는 `docs/continuous_collection.md`에 있습니다.

## 지속 수집

통합 설정의 `default`는 기존 14개 피드, `test`는 확대 후보 17개 피드, `hold`는 주소 미확인·종목별·지역판·과거 주소를 포함한 10개 비활성 행입니다. `hold`는 실행 대상으로 선택할 수 없습니다. 확대 후보의 본문 품질은 모두 `unverified`로 보존합니다.

```powershell
& 'C:\Users\SD1-08\miniforge3\envs\aicam\python.exe' src\continuous_collect.py --collect --tiers default,test --body-limit 10
```

본문 수집 실패는 RSS 수집 전체를 중단하지 않습니다. RSS 요약·본문과 원문 페이지에서 추출한 본문은 서로 덮어쓰지 않고 별도 필드와 이력 테이블에 보존합니다. 성공 상태도 전문 확정을 의미하지 않습니다.

## 기본 수집 대상

참고 자료: `C:\ai_campus_main_proj\graph_handoff_review_20261029\handoff_20261028_team_v1`의 `README.md`, `portable/rss_collect.py`.

2026-10-29 조사와 실제 접속 시험을 기준으로 `config/feeds.csv`를 기본 설정으로 확정했습니다.

| 구분 | 매체와 피드 | 운영 판정 |
| --- | --- | --- |
| 기본 수집 | CNBC 6개, Fortune 1개, The Motley Fool 1개, Zacks 1개, Fox Business 4개, Business Insider 1개 | 총 6개 매체·14개 URL 유지 |
| 보류 | Yahoo Finance 미국 일반 뉴스 | 공식 안내를 우선 조사했으나 현재 주소 미확인. 빈 URL 행으로 남겨 요청하지 않음 |
| 보류 | CNN Business | 과거 피드는 2017·2018년에 갱신이 멈춤. 최신 수집에서 제외하고 빈 URL 행으로 남김 |
| 연구용 | Yahoo Finance 종목별, Yahoo 대만 증권판 | `config/research_candidates_20261029.csv`에 분리. 기본 실행에 포함하지 않음 |

Business Insider의 기존 Atom 주소는 2026-10-29 접속과 분석에 성공했으므로 기본 14개에 유지합니다. 다만 미국판의 현행 공식 RSS 지원 안내는 확인하지 못했으므로 `기본 수집·공식 지원 미확인`으로 표시합니다. 접속 성공이 공식 지원을 뜻하지 않습니다.

CNN 과거 주소를 포함한 연구 후보 파일은 조사 재현용이며 기본 수집 설정으로 사용하지 않습니다. 상세 근거와 피드별 결과는 `docs/rss_media_status.md`를 봅니다.

## 실행 환경과 명령

기존 Miniforge `aicam` 환경을 사용합니다. 새 가상환경을 만들지 않습니다. PowerShell에서 프로젝트 폴더로 이동한 후 실행합니다.

```powershell
conda activate aicam
python --version
python src/collect_rss.py --help
```

활성화 없이 같은 환경을 직접 사용할 수도 있습니다.

```powershell
& 'C:\Users\SD1-08\miniforge3\envs\aicam\python.exe' src/collect_rss.py --help
```

필요한 패키지는 기존 `aicam` 환경에 설치했습니다. 환경을 다시 구성하거나 패키지가 없을 때만 아래 명령을 실행합니다.

```powershell
conda run -n aicam python -m pip install -r requirements.txt
```

**아래 명령은 인터넷 수집을 시작합니다.** 실행 시점 기준 직전 168시간을 기본 기간으로 사용합니다. `--collect` 없이는 네트워크를 사용하지 않고 종료합니다.

```powershell
conda run --no-capture-output -n aicam python src/collect_rss.py --collect
# 기간과 종료 시각 지정 예시 (시간대 필수)
conda run --no-capture-output -n aicam python src/collect_rss.py --collect --hours 168 --end '2026-10-29T18:00:00+09:00'
```

추가 옵션: `--config config/feeds.csv`, `--output outputs`, `--timeout 25`(읽기 제한 초; 연결 제한 8초). 기본 경로는 프로젝트 루트 기준이며 명시한 상대 경로는 현재 작업 폴더 기준입니다.

`config/feeds.csv`의 Yahoo Finance와 CNN Business 행에는 URL이 없으므로 기본 실행에서도 `not_configured`로 기록되고 네트워크 요청을 하지 않습니다. `config/research_candidates_20261029.csv`는 명시적으로 지정하지 않는 한 사용되지 않습니다.

## 실행 결과

매번 `outputs/<실제 실행 UTC 시각_마이크로초>Z/`에 새 폴더를 만들고 기존 결과는 덮어쓰지 않습니다.

현재 보존 결과는 다음처럼 서로 독립적입니다.

- 기본 수집: `outputs/20261029T080241_074663Z/` — URL 중복 제거 후 536건
- 추가 후보 시험: `outputs/feed_research_20261029/20261029T081558_858937Z/` — 85건

두 결과는 목적과 피드 구성이 다르므로 합치지 않습니다. 기본 실행 결과의 `feeds_snapshot.csv`는 실행 당시 설정을 보존하며, 이후 `config/feeds.csv`의 판정 문구가 바뀌어도 수정하지 않습니다.

추가 연구 결과도 기본 결과와 분리합니다.

- 원문 본문 표본 시험: `outputs/article_body_pilot_20261029/20261029T083520_417122Z/`
- 매체 확대 RSS 시험: `outputs/feed_expansion_research_20261029/20261029T083706_031577Z/`
- 원문 시험 보고서: `docs/article_body_pilot.md`
- 확대 후보 보고서: `docs/rss_expansion_candidates.md`
- 확대 후보 설정과 상태: `config/feed_expansion_candidates_20261029.csv`, `config/feed_expansion_status_20261029.csv`

원문 시험은 명시한 18건만 대상으로 하며 전체 536건을 방문하지 않습니다. 확대 후보 기사 383건도 기본 536건과 합치지 않습니다.

지속 수집 SQLite는 실행한 시점부터 새로 누적합니다. 기존 536건·383건·85건을 자동 가져오지 않고 기존 파일도 수정하지 않습니다.

| 파일 | 내용 |
| --- | --- |
| `media_summary.csv` | 매체별 사용 가능·경고·실패 피드 수, URL 중복 제거 기사 수 |
| `feed_status.csv`, `feed_status.json` | 피드별 HTTP 코드, 최종 URL, 응답 형식, 분석 결과, 오류, 기간 내·외 및 날짜 미확인 항목 수 |
| `articles.csv`, `articles.json` | 제목, 원문 URL, 발행일 원문·UTC, 요약, RSS 본문 및 유무, 날짜·URL 상태, 출처 피드 |
| `raw_feeds/NN.bin` | HTTP 응답 원본 바이트. HTML 오류 응답도 보존. 최대 10MB이며 초과 시 prefix만 저장하고 실패 표시 |
| `feeds_snapshot.csv` | 실행에 사용한 설정 원본 |
| `run_conditions.json` | 기간, 실행 인자, 설정 해시, Python 경로·버전, 패키지 버전, 시작·종료 시각, 완료 상태 |

실행 중 중단되면 `run_conditions.json`이 `running`으로 남고 완료 출력 일부가 없을 수 있습니다. `completed`는 처리 완료를 의미하며 모든 피드의 성공을 의미하지 않습니다.

## 판정과 기사 처리 규칙

- 접속 상태(`access_status`)와 분석 상태(`parse_status`)를 분리합니다. HTTP 2xx만 접속 성공이며 RSS·Atom 버전 식별이 필요합니다. 200 HTML은 성공 피드가 아닙니다.
- `ok`: 경고 없는 정상 피드이고 기간 내 기사 있음. `no_articles_in_window`: 정상 피드이나 기간 내 발행일 확인 기사 0건. 피드 자체가 비어 있거나 날짜 미확인 기사만 있는 경우도 포함하며 항목 수로 구분합니다.
- 파서 경고는 `feed_warning` 또는 `no_articles_in_window_warning`으로 표시합니다. 기사 추출이 가능해도 정상 피드로 확정하지 않습니다. `request_error`, `http_error`, `parse_error`, `response_too_large`는 실패입니다. URL 없는 후보는 `not_configured`이며 접속하지 않습니다.
- 매체 상태: 설정된 모든 피드가 경고 없이 분석되면 `available`, 일부만 정상이면 `partial`, 정상 없이 경고만 있으면 `needs_review`, 모두 실패하면 `unavailable`, 주소가 없으면 `not_configured`입니다. 기간 내 기사 0건도 정상 피드입니다.
- 기간은 `시작 <= published < 종료`입니다. `updated`를 발행일로 대신 쓰지 않습니다. 발행일 누락·해석 불가·시간대 누락은 `date_status=unknown`, `window_status=unknown_date`로 보관합니다. 기간 내 기사로 세지 않습니다.
- 알려진 기간 밖 기사는 기사 목록에서 제외하되 피드 원본과 항목 수는 남깁니다. 피드별 항목 수는 중복 제거 전이며 매체별 기사 수는 중복 제거 후입니다.
- HTTP(S) URL에서 fragment와 알려진 추적 매개변수만 제거하여 실행 내 중복을 합칩니다. 출처와 날짜 변형을 보존하며 발행일 충돌을 표시합니다. URL 없는 항목도 보관하지만 URL 중복 제거는 할 수 없어 개별 행으로 남깁니다.
- RSS 본문은 `content` 요소의 텍스트 존재 기준입니다. 요약과 구분하며 전체 기사 전문을 보장하지 않습니다. `collect_rss.py`는 원문 페이지를 방문하지 않습니다.

RSS에 현재 남아 있는 기사만 확인합니다. 과거 기간 전체 기사 확보나 누락 없음은 보장하지 않으며, 과거 성공 이력도 현재 가용성의 근거로 재사용하지 않습니다. CSV는 UTF-8 BOM, JSON은 UTF-8로 저장합니다.
