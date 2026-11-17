# ai_campus_main_proj
2026.10.12~2026.11.27

한국 투자자에게 **밤사이 미국 뉴스 중 보유 종목과 관련된 것**을 골라 보여 주는 서비스. DART 공시와 미국 뉴스로 국내 기업–해외 기업·제품을 잇는 그래프 DB를 만들고, 그래프에서 종목마다 구글 뉴스 검색어를 만든다. 결정 사항과 근거는 [`graph_db/graphDB.md`](graph_db/graphDB.md)(요약: [`graphDB_summary.md`](graph_db/graphDB_summary.md))에 있다.

## 폴더

| 폴더 | 내용 |
|---|---|
| `graph_db/` | 그래프 DB 만들기: DART·뉴스 수집과 LLM 추출, 이름 통일, 제품 사전, Neo4j 적재, 검색어 만들기. 노트북과 `graphDB.md`, 지시문(`prompts/`) |
| `news_search/` | 밤사이 기사 모으기: 검색어로 구글 뉴스 RSS 검색, 거르기, 같은 소식 묶기, 대표 기사 본문 받기, 프롬프트 입력. 24시간 수집 `news_collect.ipynb`, 수집 마감 뒤 처리 `news_process.ipynb`(사용자가 고른 표시 시각 30분 전에 한 번). 결정은 [`news_search.md`](news_search/news_search.md) |
| `news_search_tests/` | 구글 뉴스 검색 방식 시험(`search_tests.ipynb`: 매체, OR 묶음, 기간 조건, 거르기, 검색어 모양). 서비스 실행에는 필요 없음 |
| `news_source_tests/` | 뉴스 매체·수집 방식을 정할 때 한 시험(근거 보관). [README](news_source_tests/README.md) |
| `graph_news_overview.md` | **처음 보는 팀원용 안내**: 그래프 DB, 검색어, 구글 뉴스 수집·처리가 무엇을 만들고 어떻게 도는지, 결과 위치와 첫 실전 결과 |
| `nightly_prompt_requirements.md` | 밤사이 뉴스 프롬프트를 만드는 팀원에게 전하는 요구사항(입력·출력, 유형 분류, 그래프용 추출 형식, 실행 조건, 시험 방법) |
| `scripts/` | 보조 스크립트: 데이터 묶음 만들기·풀기(`data_bundle.py`) |
| `market_data/` | 기준 자료: 상장사·WI26 업종(`sector.json`), 토스 테마(`toss_theme.json`), 지수 구성 종목. [README](market_data/README.txt) |
| `backtest/`, `data_research/`, `stockdata_collection/` | 다른 작업(시세 수집, 백테스트 등) |

## 준비

1. **Python 3.11**과 패키지: `python -m pip install -r requirements.txt`
2. **비밀값**: `.env.example`을 프로젝트 루트에 `.env`로 복사해 값을 채운다. `.env`는 git에 올리지 않는다.
3. **Codex CLI**(일부 LLM 단계를 구독으로 돌린다): 설치 후 `codex login`. 노트북은 모델을 직접 지정한다(`gpt-6.1-terra`, 일부 `gpt-6.1-sol`).
4. **Neo4j**: 로컬 Docker(`neo4j-graph`, 7474·7687 포트). 주소·계정은 `.env`.
5. **데이터**: git에는 코드·문서와 기준 자료만 있다. 중간·결과 데이터는 아래 "데이터 받기"에서 받는다.

## 데이터 받기 (팀 구글 드라이브)

DART·뉴스 자료와 그것으로 만든 중간·결과 파일은 법적 문제와 용량 때문에 git에 올리지 않고 **팀 구글 드라이브**에 날짜를 붙인 묶음(zip)으로 둔다. 드라이브는 팀원 계정만 열 수 있다(공유: 제한됨).

- 주소: [ai_campus_main_proj_data](https://drive.google.com/drive/folders/1oj6OMBNftt-muaeQL5bmanKTefMR3Ge6?usp=sharing)
- **받는 법**(명령 하나): 드라이브에서 필요한 묶음(zip)을 내려받아 **압축을 풀지 말고** `~/Downloads`(또는 `~/Downloads/ai_campus_main_proj_data`)에 둔 뒤, 저장소 루트에서 실행한다.

  ```
  python scripts/data_bundle.py place
  ```
  두 폴더에서 묶음 이름(`<묶음>_<날짜>.zip`)인 파일을 찾아 **묶음마다 가장 최근 날짜 것만** 저장소 기준 경로 그대로 제자리에 푼다. 파일 목록(크기·SHA-256)으로 빠짐없이 들어갔는지 확인하고, 이미 같은 파일은 건너뛰고, 내용이 다른 파일은 알려 준다(`--overwrite`를 주면 덮어쓴다). 다른 곳에 둔 zip은 경로를 직접 준다: `python scripts/data_bundle.py place 경로/graph_data_20261116.zip`.
- **올리는 법**: `python scripts/data_bundle.py pack`(기본 저장 위치 `~/Downloads/ai_campus_main_proj_data/`, 일부만은 `--only graph_data,news_search_data`)으로 만든 묶음을 드라이브 폴더(하위 폴더 없이 한 곳)에 올리고 아래 표의 날짜·크기를 고친다. 옛 묶음은 지우지 않는다. 묶음 종류와 지금 로컬 용량은 `python scripts/data_bundle.py list`.

| 묶음 | 최신 날짜 | 크기(압축) | 담긴 것 | 언제 필요한가 |
|---|---|---|---|---|
| `graph_data` | 2026-11-16 | 154MB | `graph_db/source`에서 DART 원문만 뺀 것(파일 5,610개, 546MB): DART 파싱 표·사업의 내용, 뉴스(거르기·LLM 응답·최종본·DB 스냅샷), 이름 통일·제품 사전·LLM 제품 사전·검색어 결과, Neo4j 표, 대상 기업 | 대부분. 앞 단계를 다시 돌리지 않고 원하는 단계부터 이어서 돌릴 때 |
| `dart_raw` | 2026-11-15 | 510MB | DART 원문 다운로드(`graph_db/source/dart/raw`, 파일 18,178개) | DART 파싱부터 다시 돌릴 때만(없으면 `dart_collector`로 다시 받는다) |
| `news_search_data` | 2026-11-16 | 80MB | 밤사이 뉴스(`news_search/source`, 파일 6,086개): 보고 날짜별 수집 기사·응답 원본·처리 결과(`prompt_inputs.jsonl`), 임시 검색어 표(`terms/`), 임베딩·원문 페이지 캐시, 지난 묶음 기록(이전 소식 확인용) | 수집·처리를 이어서 돌리거나 지난밤 결과·프롬프트 입력을 볼 때 |
| `news_tests` | 2026-11-16 | 286MB | 뉴스 매체 시험(`news_source_tests`)과 구글 뉴스 검색 방식 시험(`news_search_tests/source`)의 결과와 캐시(파일 4,456개) | 시험 노트북을 요청 없이 다시 볼 때만. **11-15 묶음은 옛 폴더 구조(`news_search/source`)라 쓰지 않는다** |
| `backtest_data` | 2026-11-16 | 69MB | 백테스트 캐시와 결과(`backtest/data`: KRX API 캐시·분봉 캐시·야후 분봉, `backtest/outputs`, 파일 1,210개) | 백테스트 노트북을 API 요청 없이 다시 돌릴 때 |
| `creon_1min` | 2026-11-16 | 6.5GB | 크레온 KRX 1분봉(`stockdata_collection/creon_1min`: 전체 종목 스냅샷·반도체 15종목·조회 범위 점검, 파일 6,328개) | 분봉 백테스트. 크레온으로 다시 받으려면 하루 넘게 걸린다 |

## 실행 순서 (graph_db)

노트북은 `graph_db/` 폴더에서 연다. 비용이 드는 단계는 스위치가 꺼져 있어(`RUN = False` 등) 켜야 요청을 보낸다. 같은 입력으로 끝난 요청은 건너뛰므로 다시 실행해도 된다. 자세한 흐름과 갱신 방식은 `graphDB.md` 1.1·1.2.

| 순서 | 노트북 | 하는 일 | 필요한 것 | 스위치 | 외부 요청·비용 |
|---|---|---|---|---|---|
| 1 | `dart_targets` | 서비스 대상 후보(`targets.csv`) | `market_data/`, `KRX_API_KEY` | | KRX API(무료) |
| 2 | `dart_collector` | DART 공시 받기 | `OPENDART_API_KEY` | | OpenDART(무료, 처음 약 18,000건·2~3시간) |
| 3 | `dart_parser` | 지분·계열 표 | | | 없음 |
| 4 | `dart_business_parser` | 사업의 내용 → LLM 입력 | | | 없음 |
| 5 | `dart_business_extractor` | 사업의 내용 LLM 추출 | `OPENAI_API_KEY` 또는 Codex | `RUN`, `RUNNER` | 배치 API 약 $15~20 |
| 6 | `dart_business_cleaner` | DART 최종본 | | | 없음 |
| 7 | `news_collector` | 미국 뉴스 상시 수집(윈도우 PC에서 계속 돈다) | `NEWS_DB_URL`, 알림 키 | `REQUIRE_MYSQL`, `RUN_FOREVER` | 언론사 RSS(무료) |
| 8 | `news_filter` | 뉴스가 아닌 글 거르기 | `NEWS_DB_READ_URL`(안 되면 `source/news/snapshot_*`) | | 없음 |
| 9 | `news_extractor` | 뉴스 LLM 추출 | `OPENAI_API_KEY` 또는 Codex | `RUN`, `RUNNER` | 배치 API 기사당 약 $0.006 |
| 10 | `news_cleaner` | 뉴스 최종본 | | | 없음 |
| 11 | `name_unifier` | 기업 이름 통일 | | | 없음 |
| 12 | `product_dictionary` | 제품 사전(규칙) | | | 처음 한 번 WordNet 받기 |
| 13 | `product_llm` | 제품 사전(LLM): 제품군 → 노드 분류 → 계층 → 브랜드. **10절에서 검토표(`graph_db/review/family_review.csv`) 알림이 나오면 LLM 결과를 직접 검토해 표를 고친 뒤 다음으로** | Codex, `OPENAI_API_KEY` | `RUN`, `BATCH_SUBMIT`, `TREE_BATCH_SUBMIT`, `RETRY_CHOICE` | Codex 구독 + 배치 API 약 $6 |
| 14 | `product_apply` | LLM 제품 사전 적용 | | | 없음 |
| 15 | `graph_db` | 그래프 표 만들기와 Neo4j 적재 | Neo4j, `NEO4J_*` | `LOAD` | 없음(로컬) |
| 16 | `search_terms` | 종목 유형, 검색어 후보, 업종·테마·회사 기본 검색어 | Codex | `RUN` | Codex 구독(요청 4건) |
| 17 | `../news_search_tests/search_tests` | 구글 뉴스 검색 방식 시험(매체, OR 묶음, 거르기, 검색어 시험. 서비스 실행에는 필요 없음) | | `RUN` | 구글 뉴스 RSS(무료, 한 IP에서 시간당 수백 건이면 막힘) |
| 18 | `../news_search/news_collect` | 24시간 수집(11절): 수집 마감(표시 시각 `SUMMARY_TIME` 30분 전, 기본 07:30)에 맞춘 일정(밤 22시~마감 1시간, 저녁 16~22시 2시간, 낮 마감~16시 4시간 간격), 수집 마감 표시 파일 | 알림 키 | `RUN_COLLECT`(시험 칸은 `RUN`) | 구글 뉴스 RSS(무료, 시험 종목 18개·검색어 170개 기준 하루 약 7,100건) |
| 19 | `../news_search/news_process` | 수집 마감 뒤 처리(10절 대기하며 돌리기): 취침 시각(`BEDTIME`) 전 기사는 비교용으로 등록, 뒤 기사는 묶기 → 이전 소식 확인 → 종목별 10개 묶음 → 본문 받기 → 프롬프트 입력. 수집과 함께 켜 둔다 | `OPENAI_API_KEY`(임베딩), 알림 키 | `WATCH_RUN`(골라 돌리기는 `PROCESS_RUN`) | OpenAI 임베딩(하룻밤 $0.01~0.03), 원문 주소 복원·원문 페이지(무료) |

- `db_test`는 처리 단계가 아니라 수집 DB를 조회하는 노트북이다.
- 비용과 시간은 2026년 11월 한 번 전체를 만들 때 기준이다.

## 관리 규칙

- 결정은 그래프 DB·검색어 만들기는 `graph_db/graphDB.md`, 뉴스 검색·밤사이 처리는 `news_search/news_search.md`에 적는다(정한 것은 본문, 정할 것은 "결정할 것").
- 외부 요청(웹, LLM API)을 보내는 실행은 예상 건수·시간·비용을 먼저 알리고 승인받는다.
- 새 패키지를 쓰면 `requirements.txt`, 새 키를 쓰면 `.env.example`에 더한다.
- git에 올리는 데이터는 사람이 받아 오거나 만든 기준 자료뿐이다. 코드가 만든 파일은 폴더별 `.gitignore`로 막고 팀 드라이브로 공유한다(`scripts/data_bundle.py`). 새 데이터 폴더를 만들면 `scripts/data_bundle.py`의 묶음 목록(`BUNDLES`)에 넣을지 정한다.
