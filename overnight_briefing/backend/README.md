# 서비스 백엔드: 배포에 실제로 쓰는 코드·자료 (2026-11-20)

데모(https://4digit-demo.vercel.app)가 **매일 실제로 돌리는 백엔드만** 모은 폴더다. 실험 코드·실험 장부는 `../model/`(11/12 연구 기록)에 있고, 화면·API는 `../service/`, 밤사이 AI 브리핑은 `../nightly_prompt/`, 밤 뉴스 수집·처리는 `../../news_search/`에 있다.

| 폴더 | 무엇 | 원본(나은 맥) |
|---|---|---|
| `engine/` | 노란띠(80% 시가 예측구간)·08:11 믿을 정도 카드, 개장 직후 채점, 규칙 확정 뒤 기록, 미국 뉴스 관계 연결 | `~/4Digit/research/overnight_backtest/` |
| `app_pipeline/` | 화면이 읽는 날짜별 자료(`app_data`) 만들기 | `~/4Digit/src/app/pipeline/` |
| `launchd/` | 평일 자동 실행 시각표(맥 launchd 설정) | `~/Library/LaunchAgents/` |
| `FILES.json` | 위 파일의 원본 경로 ↔ 이 폴더 경로 | — |

`engine/`에는 매일 도는 코드가 불러 쓰는 파일을 모두 넣었다. `src/explore*.py`, `workbench/core.py`, `i24_panel.py`처럼 이름은 실험 시기 것이어도 규칙 계산이 불러 쓰므로 빠지면 돌지 않는다. 규칙은 2026-11-02 15:17에 고정했다(`engine/workbench/protocol_e62_band.json`의 코드 해시).

## 하루 흐름(평일)

| 시각 | launchd | 스크립트 | 하는 일 | 만드는 것 |
|---|---|---|---|---|
| 밤새(상시) | news-collect · news-process | `../../news_search/news_collect.ipynb` · `news_process.ipynb` | 미국 뉴스 수집(수집 마감 06:00) → 같은 소식 묶기·이전 소식 판정 | `news_search/source/nightly/<T>/` |
| 06:10 | early-brief | `auto_early.sh` → `early_brief.sh` | 야간선물(06:00 마감) 받기(`live_refresh`) → 어제 저녁 거래(`evening_nxt`) → **07:30 카드**(`morning_card`) → 화면 날짜 파일(`build_live_day`) → 밤사이 AI 브리핑(`../nightly_prompt/run.py`) → 배포(`../service/publish.sh`) | `runs/claude_live_r1/card_<T>_0730.json`(+`.sha256`, `seal_log.txt`) |
| 08:15 | seal-morning | `auto_seal.sh` → `seal_morning.sh` | 개장 전 거래(08:00~08:10) 받기 → **08:11 카드**(믿을 정도) → 미국 뉴스 관계 연결(`news_morning.sh`: alpaca_latest → us_news_link → judge_cascade → sign → by_stock → segment → news_snapshot) → 09:01 **채점**(`check_open`) → 배포 | `card_<T>_0811.json`, `news_<T>/`, `check_<T>_<시각>.json` |
| 15:56 | after-close | `auto_after_close.sh` → `after_close.sh` | 16:05까지 기다림(지난 날짜면 바로) → 종가 받기 → **규칙 확정 뒤 기록**(`e100_forward`, 화면 '기록' 탭) → 기록 화면 파일(`build_forward_days`) → 배포 | `runs/claude_forward_r1/` |
| 18:10 | night-publish | `../service/publish.sh` | 밤 화면('준비 중') 배포 | — |

`after_close.sh` 안의 E104(빗나간 날 해부) 단계는 연구 화면용이라 이 폴더에 넣지 않았다. 없으면 그 줄만 실패하고 나머지는 돈다.

## 자료

**받는 곳**: 팀 드라이브 `ai_campus_main_proj_data/service_backend_<날짜>.zip`. 저장소 루트에서 `python scripts/data_bundle.py place <받은 zip 경로>`로 제자리에 푼다(목록 `MANIFEST.csv`의 크기·SHA-256으로 확인).

| 묶음 안 경로 | 무엇 |
|---|---|
| `backend/engine/workbench/runs/claude_live_r1/` | 날마다 개장 전에 고정한 07:30·08:11 카드(+해시), `seal_log.txt`(발행 시각·해시), 개장 직후 채점 `check_*`, 미국 뉴스 연결 고정본 `news_<T>/` |
| `backend/engine/workbench/runs/claude_forward_r1/` | 규칙 확정 뒤 기록(종목별·계좌별·날짜별) — 화면 '기록' 탭 |
| `backend/engine/workbench/runs/claude_events_r1/dart_filings.csv` | DART 공시 목록 — '어제 실적 공시' 주의의 입력 |
| `backend/app_data/` | 화면이 읽는 날짜별 자료(원본 `~/4Digit/src/app/data`): 카드·뉴스·야간선물 1분봉·저녁 거래 |
| `service/data/` | 지금 배포된 API가 그대로 내보내는 스냅샷(`day/<T>.json`, `meta`·`stocks`·`accounts`·`graph`·`track`·`live`) |

**묶음에 없는 것(다시 계산할 때만 필요)**: 가격 패널 `engine/data/`(국내 일봉·야간선물 일봉/1분봉·NXT 장전·미국 일봉, 약 552MB)와 날마다 만드는 `engine/workbench/live/<T>/`(약 100MB). 매일 결과를 받아 화면에 쓰는 데는 필요 없다.

**키**(저장소에 없음): 한국투자증권(시세·휴장일 CTCA0903R), DART, Alpaca, OpenAI, Finnhub — 나은 맥 `~/4Digit-solo/.env`.

## 이벤트·공시일은 어디서 나오나

| 화면에 뜨는 것 | 만드는 곳 | 하루 JSON 칸 |
|---|---|---|
| 어제 실적 공시가 나온 종목 주의 | `engine/workbench/morning_card.py`: DART 공시 목록에서 D ≤ 접수일 < T인 실적 공시(잠정실적·영업실적·손익구조 30% 변경·전망). `live_refresh`가 매일 이어 받는다 | `stocks[].cautions[]`(`kind: "e_earn"`) |
| 월요일 주의 | 같은 파일 | `market.cautions[]`(`kind: "mon"`) |
| 장 시간이 바뀌는 날(수능일 등) | `../service/core/extras.py`의 `SPECIAL` — **공식 공지로 확인한 날만 손으로 추가**(지금 11/19 수능일 하나) | `special`, `events[]`(`kind: "special"`) |
| 휴장일 | `engine/workbench/live_refresh.py`가 한국투자증권 국내휴장일조회(CTCA0903R)로 그날이 개장일인지 확인(조회 실패 시 주말만 막고 기록에 남김) | — |
| 이어진 미국 기업 실적 발표 | `extras.py`의 `earnings_events`: Finnhub 실적 달력, 관계 그림의 미국 기업(`TICKERS` 10개)만. 미국 날짜 + 1일을 한국 반영일로 | `events[]`(`kind: "earnings"`, `codes`에 이어진 종목) |

다른 화면에서 쓰려면 `service/data/day/<T>.json`의 위 칸을 그대로 읽으면 된다. 미국 휴장일(예: 11/26 추수감사절) 다음 아침 안내는 아직 `SPECIAL`에 없다.

## 나은 맥 경로를 가정한 곳

코드 일부가 경로를 직접 적는다. 다른 컴퓨터에서 돌리려면 같은 배치로 두거나 이 줄을 고친다.

- `~/4Digit/research/overnight_backtest/` = 이 폴더의 `engine/`(셸 스크립트·`build_forward_days.py`·`build_live_day.py`)
- `~/4Digit/src/app/data/` = `app_data`(`evening_nxt.py`, `app_pipeline/*`, `../service/build_snapshot.py`의 기본 `DATA_ROOT`)
- `~/4Digit-solo/` = 키(`.env`), 관계표·뉴스 DB(`us_news_link.py`, `news_snapshot.py`, `alpaca_latest.py`), 밤사이 브리핑용 파이썬
- 파이썬: 엔진은 `engine/.venv`, 화면·서비스는 `~/4Digit/.venv`

## 원본에서 다시 맞추기

이 폴더는 나은 맥 원본의 사본이다. 원본이 바뀌면 `./sync_from_mac.sh`로 다시 복사하고 커밋한다(`FILES.json` 목록 기준).
