# 최종 모델 (규칙 고정 2026-11-02 15:17)

연구 폴더(`research/overnight_backtest`)에서 아침 카드를 만드는 데 필요한 코드와 고정 규칙만 옮긴 것이다. 폴더 구조는 원본과 같아서 같은 명령으로 돈다.
2026-11-12에 이 사본으로 그날 08:11 카드를 다시 만들어, 장 전 고정 카드와 200종목의 예상 시가·노란띠가 같음을 확인했다.

## 무엇이 들어 있나

| 파일 | 하는 일 |
|---|---|
| `workbench/morning_card.py` | 아침 카드. 종목별 예상 시가 H, 80%·90% 노란띠(S1), 08:11 믿을 정도(D08), 주의 문구(월요일·실적 공시 다음 날), 예시 계좌 금액 |
| `workbench/e62_band.py` | 노란띠·등급 규칙(고정, sha256 b9599c96…). `runs/claude_band_design_r1/`의 설계·선택 기록과 해시를 대조한다 |
| `workbench/live_panel.py` · `i24_panel.py` · `core.py` · `range_models.py` · `time_patterns.py` · `e46_leadlag.py` | 패널 만들기·특성 계산(카드가 import) |
| `src/*.py` | 처음 백테스트의 공통 함수와 H 계산식(카드가 import). 이름이 explore*인 것도 지금 모델이 쓰는 함수가 있어 같이 옮겼다 |
| `workbench/live_refresh.py` | 끝난 장 자료 이어 받기(KIS 주간·야간 일봉, 야간 1분봉, NXT 장전, DART 공시, 휴장일 확인) |
| `workbench/seal_morning.sh` · `after_close.sh` · `news_morning.sh` · `auto_*.sh` | 매일 운영: 08:15 카드 고정·뉴스 연결·09:01 시가 채점, 16:05 장 마감 뒤 누적 기록 |
| `workbench/runs/claude_live_r1/check_open.py` | 개장 직후 실제 시가로 카드 채점 |
| `workbench/e100_forward.py` · `e104_miss_anatomy.py` | 규칙 확정 뒤 누적 기록, 빗나간 종목 해부 |
| `workbench/us_news_*.py` · `alpaca_latest.py` · `news_days.py` · `news_snapshot.py` · `graph_v0.py` | 미국 기사 → 관계표 규칙 확인 → OpenAI 두 단계 판정 → 방향 → 종목별 모음 → 업종 핵심어 → 그날 몫 고정 |
| `workbench/protocol_*.json` · `runs/claude_band_design_r1/*.json` · `corrected_data_v2/` | 고정 규칙 설정과 설계 기록(모델 파라미터에 해당) |
| `data/universe.csv` · `fomc_dates.csv` · `fred_release_dates.csv` | 200종목 목록, 미국 일정 |
| `ref/relation_edges_v0.csv` · `runs/claude_graph_v0/` · `runs/claude_segments_r1/` | 관계표(미국 쪽 → 국내 종목, 근거 문장), 그래프, 사업보고서 기준 세부 업종 |
| `workbench/tests/` | 카드·띠·패널·운영 시험 |

## 실행

```bash
cd overnight_briefing/model
python -m venv .venv && .venv/bin/pip install -r requirements.txt
# 열쇠: KIS_APP_KEY, KIS_APP_SECRET, DART_API_KEY(.env, 올리지 않음). 뉴스 연결은 ALPACA·OPENAI 키
PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name 20261112 --env <.env 경로>          # 자료 폴더 workbench/live/20261112
PYTHONPATH=.:src .venv/bin/python workbench/morning_card.py --date 20261112 --slot 0811 \
  --root workbench/live/20261112 --events workbench/live/20261112/dart_filings.csv
PYTHONPATH=.:src .venv/bin/pytest workbench/tests -q
```

`live_refresh`는 이전 자료 폴더(`--base`)에 끝난 장을 덧붙이는 방식이다. 처음 시작할 때 필요한 2024-11 이후 일봉·야간선물·NXT 장전 자료는 용량과 공개 저장소 규칙 때문에 올리지 않았다(원본 컴퓨터의 `data/`, `workbench/live/`).
운영 스크립트(`*.sh`)는 원본 컴퓨터 경로(`~/4Digit/research/overnight_backtest`, `.venv`)를 그대로 쓴다. 다른 컴퓨터에서는 경로를 맞춘다.
Streamlit 화면(`../app`)은 환경변수 `OVERNIGHT_RESEARCH`로 이 폴더(또는 원자료가 있는 연구 폴더)를 가리키면 된다.
