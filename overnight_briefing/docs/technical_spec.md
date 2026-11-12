# 장전 브리핑 엔진 기술 명세서

## 문서 정보

| 항목 | 내용 |
|---|---|
| 문서 번호 | 4D-SPEC-001 |
| 문서명 | 장전 브리핑 엔진 기술 명세서 |
| 판 | 1.4 |
| 작성일 | 2026-11-04(1.5판 2026-11-06) |
| 상태 | 초판(팀 검토 전) |
| 대상 독자 | 엔진 구현·운영 담당 개발자 |
| 상위 문서 | [모델 설계서 v2](https://claude.ai/artifact/4FpcMwsa9hdfDspMV39eX6)(모형 정의·검증 근거), [서비스 아키텍처](architecture.md)(서비스 전체 구성) |

### 개정 이력

| 판 | 일자 | 내용 |
|---|---|---|
| 1.0 | 2026-11-04 | 초판 |
| 1.1 | 2026-11-04 | GAP-01~04 해소에 따른 개정: 휴장일 확인(FR-01), 증분 갱신(FR-01), 야간 신호 무효일·휴장일 상태 카드(FR-10, §8), 카드 파일 이름 규칙과 덮어쓰기 금지(FR-10), 빈 수집 결과 처리(§8). §4.3 예시·상태 필드 추가, §6.1 휴장일 조회 API 추가, §9.1 시험 추가 |
| 1.2 | 2026-11-05 | A-01(§5.2)에 \(F2\)는 절편 없이 \(\beta^0\)를 쓴다는 구현 조건을 명시하고 부록 A에 파라미터 1행 추가. 동작 변경 없음 |
| 1.3 | 2026-11-05 | 만기일 밤 확인 반영: `missing_night` 사유 문구(§4.3) 수정, CON-07(만기일 밤 다음 계약 야간 미수집)과 TBD-05 추가, A-06 정정 공시 처리 비고 보완(E84), TBD-03에 계좌 구간 미달 진단(E85) 추가, `contract_mismatch` 사유 문구 정정, §9.1 등급 시험 1개 추가, 부록 A에 민감도 참조(E86). 산출 동작 변경 없음 |
| 1.4 | 2026-11-05 | 카드 기능 수정: 07:30 슬롯의 NXT 등급·사후 방향 채점 차단, 실제 날짜 입력의 명시적 슬롯·결과 분리, 등급 유효성·결측 보정 표시, 생성 시각 관계·자료 준비 상태 표시, 원정밀 금액 합산·반올림 규칙, 지원 범위·전체 평가 분모·결측 규칙과 관련 시험 반영. 계좌 구간 후속 연구 경로 명시. 11/4 예시 산출물은 이전 판으로 보존 |
| 1.5 | 2026-11-06 | 근거 갱신만, 산출 동작 변경 없음: CON-05에 과거 수집 NXT 분봉의 시작 시각 표기·수정주가 확인(E88), CON-06에 저장 자료 기업행사일 점검(E88), TBD-02에 종목 08:11 규칙의 처음 보는 과거 기간 확인(E89)과 계좌 08:11 띠 비교(E92), TBD-03에 E87·E92 결과, TBD-05에 거래량 최대 계약 규칙 대안(E81) |

## 1. 개요

### 1.1 목적

본 문서는 장전 브리핑 엔진(이하 "엔진")의 구현과 운영에 필요한 기능, 데이터, 알고리즘, 인터페이스, 예외 처리, 시험 기준을 규정한다. 모형을 선택한 근거와 검증 결과는 모델 설계서 v2에서 다루며 본 문서에서 반복하지 않는다.

### 1.2 적용 범위

| 구분 | 항목 |
|---|---|
| 포함 | 시세·공시 수집, 06:00·08:11 패널 생성, 시가 갭 점추정치·80%/90% 예측구간·방향 일치 등급·주의 문구 산출, 보유 금액 환산, 아침 카드(JSON) 생성·저장, 개장 후 채점 |
| 제외 | 화면(UI) 구현, 뉴스·사건 카드, 계좌 예측구간 제공(현재 AS1 미채택·후속 연구 지속), 08:11 NXT 중심 예측구간(연구 후보), 사전 예측 기록 장치(I16), 주문·계좌 기능 |

### 1.3 용어 및 약어

| 용어 | 정의 |
|---|---|
| T | 예측 대상 KRX 거래일 |
| D | T 직전 KRX 거래일 |
| 야간 세션 | D일 18:00 ~ T일 06:00 코스피200 선물 거래. 자료에는 D로 저장 |
| 근월물 | 만기가 가장 가까운 코스피200 선물 계약(3·6·9·12월물, 만기 = 해당 월 둘째 목요일) |
| 종목·일 | 한 종목의 한 거래일. 관측 단위 |
| 유효 관측 | 야간 수익률과 시가 갭이 모두 존재하는 종목·일 |
| 수익률 | 단순수익률, 소수 표기(0.01 = 1%) |
| %p | 두 수익률의 차이 |
| 점추정치 H | 시가 갭의 06:00 기준 점추정치(화면 이름: 06시 참고값) |
| 예측구간 S1 | 목표 포함률 80%(90%)의 경험적 보정 시가 예측구간(화면 이름: 시가 참고 범위, 노란띠) |
| 방향 일치 등급 D08 | NXT 08:10 체결가 방향과 시가 방향이 같을 확률의 3단계 등급(화면 이름: 믿을 정도) |
| 개발 종목 | 공통 계수를 학습하는 107종목. `e62_band.split_stocks`로 결정 |
| 아침 카드 | 엔진이 T마다 내는 화면 데이터(JSON) |
| KIS | 한국투자증권 Open API |
| DART | 금융감독원 전자공시 Open API |
| NXT | 넥스트레이드 대체거래소. 프리마켓 08:00~08:50 |
| KST | 한국 표준시. 본 문서의 모든 시각 |

### 1.4 참조 문서

| 문서 | 위치 |
|---|---|
| 모델 설계서 v2 | `docs/design/overnight_model_design.md`, [공유본](https://claude.ai/artifact/4FpcMwsa9hdfDspMV39eX6) |
| 서비스 아키텍처 | `docs/design/architecture.md`, [공유본](https://claude.ai/artifact/LpngQ4G3NiYsS64Wqacdpy) |
| 코드 함수 사전 | [공유본](https://claude.ai/artifact/V279BdWYUC831ACwp591ib) |
| 예측구간·등급 분석 계획 | `research/overnight_backtest/workbench/protocol_e62_band.json`(v2) |
| 패널 특징 분석 계획 | `research/overnight_backtest/workbench/protocol_i24_features.json` |

### 1.5 표기 규약

- 경로는 `research/overnight_backtest/` 기준 상대 경로다.
- 날짜는 `YYYYMMDD` 문자열, 시각은 `HHMMSS` 문자열이다. 과거 분석은 분봉 라벨을 시작 시각으로 가정한다. 실시간 API의 봉 라벨·완료 시각·수신 지연은 운영 전 확인 대상이다(CON-05).
- 수익률·구간 끝점은 소수, 금액은 원이다.
- "필수"는 반드시 구현해야 하는 요구사항, "권장"은 운영 품질을 위한 요구사항이다.

## 2. 시스템 개요

### 2.1 구성

```text
 KIS Open API ─┐
 DART API ─────┼─▶ C1 수집기 ─────▶ live/<T>/data/*.csv, live/<T>/dart_filings.csv
 FinanceDataReader ┘                  │
                                      ▼
                         C2 패널 생성기 ─▶ 06:00 표(z), 08:11 표(n)
                                      ▼
                         C3 모형 계산기 ─▶ H, S1 구간, D08 등급, 공시 표시
                                      ▼
                         C4 카드 생성기 ─▶ card_<T>_<slot>.json + .sha256 ─▶ 화면(범위 외)
                                      ▼ (개장 후)
                         C5 채점기 ─────▶ check_<T>.json
```

| ID | 구성 요소 | 모듈 | 입력 | 출력 |
|---|---|---|---|---|
| C1 | 수집기 | `workbench/live_refresh.py` | KIS·DART·FinanceDataReader, 연구 자료 사본 | `live/<T>/data/`, `refresh_manifest.json` |
| C2 | 패널 생성기 | `workbench/live_panel.py`, `workbench/i24_panel.py` | C1 산출물 | 06:00 표, 08:11 표, 입력 해시 |
| C3 | 모형 계산기 | `workbench/e62_band.py`, `workbench/range_models.py` | C2 산출물 | 구간·등급·공시 표시 |
| C4 | 카드 생성기 | `workbench/morning_card.py` | C2·C3 산출물, 보유 정보 | 아침 카드 JSON |
| C5 | 채점기 | `workbench/runs/claude_live_r1/check_open.py` | 아침 카드, T 시가 | 채점 JSON |

### 2.2 처리 일정

| 배치 | 실행 시각 | 처리 | 산출 | 표시 |
|---|---|---|---|---|
| B1 | T 06:05 ~ 07:20 | C1(선물 야간·종목 일봉·지수·공시) → C2 → C3 → C4 | `card_<T>_0730.json`(등급 없음) | 07:30 |
| B2 | T 08:11 ~ 08:15 | C1(T의 NXT 08:00~08:10 분봉) → C2 → C3 → C4 | `card_<T>_0811.json`(등급 포함) | 08:15 이전 |
| B3 | T 09:05 이후 | C5 | `check_<T>.json` | 내부 기록 |

B2의 점추정치·예측구간은 B1과 같아야 한다(NFR-02). 06:00 표는 NXT 자료를 쓰지 않으므로 두 배치의 구간 계산 입력이 같다. 위 표는 실행 일정이며 자료 준비 경계와는 다르다. 야간 자료의 수집 가능 기준은 신호의 기준일 D에서 달력상 하루 뒤인 **D+1 06:05**다. 월요일·휴일 뒤에도 이를 T 06:05로 바꾸지 않는다. 실제 날짜 카드의 수집 기록 확인은 FR-10을 따른다.

### 2.3 운영 환경

| 항목 | 내용 |
|---|---|
| 언어·런타임 | Python 3.12 |
| 패키지 | `requirements.txt` 고정판(numpy 2.5.4, pandas 3.0.6, scikit-learn 1.9.1, finance-datareader 0.9.202 등) |
| 실행 | `research/overnight_backtest`에서 `PYTHONPATH=.:src .venv/bin/python -m <모듈>` |
| 자격 증명 | `.env`: `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ENV`(기본 real), `DART_API_KEY` |
| 토큰 캐시 | `data/.secrets/kis_token.json` |
| 외부 접속 | `openapi.koreainvestment.com:9443`, `opendart.fss.or.kr`, FinanceDataReader 원천 |

## 3. 기능 요구사항

### 3.1 기능 목록

| ID | 기능 | 배치 | 구성 요소 | 구분 |
|---|---|---|---|---|
| FR-01 | 시세 수집 | B1, B2 | C1 | 필수 |
| FR-02 | 공시 수집 | B1 | C1 | 필수 |
| FR-03 | 거래일 매칭과 야간 수익률 산출 | B1, B2 | C2 | 필수 |
| FR-04 | 기준 종가와 실현 시가 갭 산출 | B1, B2 | C2 | 필수 |
| FR-05 | 시가 갭 점추정치 산출 | B1, B2 | C2 | 필수 |
| FR-06 | 80%·90% 예측구간 산출 | B1, B2 | C3 | 필수 |
| FR-07 | NXT 갭과 방향 일치 등급 산출 | B2 | C2, C3 | 필수 |
| FR-08 | 주의 문구 부여 | B1, B2 | C3, C4 | 필수 |
| FR-09 | 보유 금액 환산 | B1, B2 | C4 | 필수 |
| FR-10 | 아침 카드 생성·저장 | B1, B2 | C4 | 필수 |
| FR-11 | 개장 후 채점 | B3 | C5 | 권장 |

### 3.2 FR-01 시세 수집

| 항목 | 내용 |
|---|---|
| 입력 | T, 실행 시각, KIS 자격 증명, 연구 자료(`data/`) |
| 처리 | ⓪ KIS 국내휴장일조회로 T의 개장일 여부를 확인한다. 휴장일이면 자료를 받지 않고 `refresh_manifest.json`에 사유만 남긴 뒤 정상 종료한다. 조회에 실패하면 주말만 막고 확인 방법을 기록한다. ① 이어받을 자료 폴더를 정한다(`--base`). 기본값 `auto`는 같은 이름 폴더에 자료가 있으면 그 폴더, 없으면 이름이 더 앞인 가장 최근 자료 폴더, 둘 다 없으면 연구 `data/` 사본이다. 이어받은 자료의 마지막 날짜 다음 날부터만 받는다. ② 선물 근월물 일봉(주간 시장코드 `F`, 야간 `CM`)을 주간·야간 가운데 더 이른 마지막 날짜의 다음 날부터 T까지 받아, 종료된 세션만 추가한다. 주간은 그날 15:50 이후, 야간은 다음 날 06:05 이후를 종료로 본다. ③ 200종목 일봉 시가·종가(시장 `J`)를 마지막 확정 종가일까지 받는다. 확정 종가일은 실행 시각이 16:00 이후면 T, 그 전이면 T−1이다. ④ 코스피200 지수 일봉을 같은 기간까지 받는다. ⑤ 지정한 날짜의 NXT 1분봉(시장 `NX`, 08:00~08:10)을 200종목 받는다. 이미 있는 지난 날짜는 받지 않고, 실행일 당일은 08:11 이후에만 받으며, 미래 날짜는 받지 않는다. 새로 받을 행이 없으면 기존 표를 그대로 둔다 |
| 출력 | `futures_daily.csv`, `universe_daily.csv`, `kr_daily.csv`, `universe_premarket.csv` 갱신본(§4.1), `refresh_manifest.json`(시작·종료 시각, `trading_day`, `base`, 마지막 날짜, NXT 요청·수집·생략 날짜, 입력 파일 해시) |
| 수용 기준 | 휴장일에는 자료를 받지 않는다. 진행 중인 세션의 행이 0건이다. 기존 키(날짜·세션, 날짜·종목, 날짜·종목·분)의 행은 바뀌지 않는다. 연구 `data/`는 바뀌지 않는다 |

### 3.3 FR-02 공시 수집

| 항목 | 내용 |
|---|---|
| 입력 | 연구 공시 목록(`workbench/runs/claude_events_r1/dart_filings.csv`), DART 키, T |
| 처리 | 연구 목록의 마지막 접수일 다음 날부터 T까지 일자별 공시 목록을 전 페이지 조회하고, 종목 코드가 200종목에 속하는 행만 접수번호 기준 중복 없이 뒤에 붙인다 |
| 출력 | `live/<T>/dart_filings.csv`(필드 §4.1) |
| 수용 기준 | DART 호출 한도(`status = 020`)나 네트워크 오류가 나면 실행을 중단한다 |

### 3.4 FR-03 거래일 매칭과 야간 수익률 산출

| 항목 | 내용 |
|---|---|
| 입력 | `futures_daily.csv`, 야간 무거래 표시 표 |
| 처리 | ① T의 주간 행이 없으면 가격이 빈 행을 추가해 T를 만든다. ② 주간 세션 날짜를 이어 (D, T) 쌍을 만든다. ③ 무거래 표시 표에 없는 야간 세션은 규칙으로 표시를 만든다(§5.1). ④ `signal_valid`를 판정하고 참일 때만 야간 수익률 x와 그 절댓값 `ax`를 계산한다 |
| 출력 | 거래일 매칭 표: T, D, x, `ax`, `signal_valid`, `signal_reason`, `mon`, `hol` |
| 수용 기준 | `signal_valid`가 거짓이면 x는 결측이다. 0을 넣지 않는다 |

### 3.5 FR-04 기준 종가와 실현 시가 갭 산출

| 항목 | 내용 |
|---|---|
| 입력 | 거래일 매칭 표, `universe_daily.csv` |
| 처리 | 종목마다 기준 종가 `pc` = D 종가(0보다 클 때)를 붙인다. 실현 시가 갭 y = T 시가 ÷ 직전 거래일 종가 − 1을 계산하되, 직전 거래일(시가·종가가 모두 0보다 큰 가장 최근 날)이 D와 같을 때만 값을 둔다 |
| 출력 | 종목·일별 `pc`, `y`, `target_observed` |
| 수용 기준 | T의 y는 학습과 채점에만 쓰고 T의 계산 입력에는 들어가지 않는다(NFR-01) |

### 3.6 FR-05 시가 갭 점추정치 산출

| 항목 | 내용 |
|---|---|
| 입력 | 거래일 매칭 표, 실현 시가 갭 |
| 처리 | 알고리즘 A-01 |
| 출력 | 종목·일별 `M1`, `F2`, `r2`, `H`, `point_count` |
| 수용 기준 | 유효 관측이 120개 미만인 종목·일은 H가 결측이다 |

### 3.7 FR-06 80%·90% 예측구간 산출

| 항목 | 내용 |
|---|---|
| 입력 | 06:00 표(z), 개발 종목 목록, T |
| 처리 | 알고리즘 A-02, A-03 |
| 출력 | 종목별 `L80`, `U80`, `L90`, `U90` |
| 수용 기준 | 계수는 개발 종목의 T 이전 자료로만 학습한다. 같은 입력이면 결과가 같다 |

### 3.8 FR-07 NXT 갭과 방향 일치 등급 산출

| 항목 | 내용 |
|---|---|
| 입력 | NXT 1분봉(08:00~08:10), 08:11 표(n), 개발 종목 목록, T |
| 처리 | 알고리즘 A-04(NXT 갭), A-05(등급) |
| 출력 | 종목별 `grade_0811{level, p, nxt_g}` 또는 null |
| 수용 기준 | T에 NXT 체결이 없는 종목은 null이다. 등급 학습 자료가 60거래일 미만이면 전 종목 null이다 |

### 3.9 FR-08 주의 문구 부여

| 항목 | 내용 |
|---|---|
| 입력 | 공시 목록, 거래일 매칭 표 |
| 처리 | 알고리즘 A-06으로 실적 공시 표시(`e_earn`)를 만들고, `e_earn = 1`인 종목에 종목 주의 문구를, `mon = 1`인 T에 시장 주의 문구를 붙인다. 문구는 §4.3의 고정 문안이다 |
| 출력 | `stocks[].cautions[]`, `market.cautions[]` |
| 수용 기준 | 문구 종류는 `e_earn`, `mon` 두 가지뿐이다 |

### 3.10 FR-09 보유 금액 환산

| 항목 | 내용 |
|---|---|
| 입력 | 계좌별 보유 수량 `q`(종목 코드별), 현금, 종목별 `pc`·H·80% 구간 |
| 처리 | 종목 평가액 V = q × pc, 점추정 금액 = V × H, 구간 금액 = V × [L80, U80]을 표시 반올림 전 가격·모형 값으로 계산한다. 지원 종목 평가액·점추정 금액도 원정밀로 합산한 뒤 최종 필드만 원 단위로 반올림한다. 카드에 구간이 없는 종목은 추정에서 제외하되, 양의 유한 기준 종가가 있으면 제외 평가액을 따로 계산한다 |
| 출력 | `accounts[]`(§4.3) |
| 수용 기준 | `stock_value`·`H_sum_amount`는 지원 종목만의 합이며 `summary_scope = supported_holdings_only`로 명시한다. 제외 종목을 0%로 계산하지 않는다. 평가 불가 제외 종목이 하나라도 있으면 전체 평가액·전체 분모의 지원 비중은 null이다(§4.3). 종목 구간 금액을 더한 값을 계좌 구간으로 내지 않는다(`account_band.value = null`) |

### 3.11 FR-10 아침 카드 생성·저장

| 항목 | 내용 |
|---|---|
| 입력 | FR-05 ~ FR-09 결과, 규칙·코드·입력 해시 |
| 처리 | §4.3 형식의 JSON과 본문의 SHA-256을 같은 이름의 `.sha256` 파일로 저장한다. `slot`은 계산 전에 결정하며 `0730`에서는 당일 NXT 등급을 계산하지 않는다. 실제 날짜 입력(`--root`)에는 `--slot`이 필수이고, 과거 재생에서만 생략 시 등급이 있으면 `0811`, 없으면 `0730`으로 선택한다. CLI는 실제 생성 시각 `issued_at`, 목표 표시 시각 `slot_nominal_at`, 둘의 관계 `timing_status`를 기록한다. 휴장일이면 `status = holiday`, 야간 신호가 무효이면 `status = no_signal`과 사유(`reason`, `reason_text`)만 담은 상태 카드를 만든다. 기준 종가가 양의 유한값이 아니거나 H·구간이 유한하지 않은 종목은 `stocks`에서 빼고 `dropped`에 코드를 남긴다. 전부 탈락하면 `reason = no_eligible_stocks` 상태 카드를 낸다 |
| 출력 | `card_<T>_<slot>.json`, `card_<T>_<slot>.json.sha256`(같은 이름이 있으면 `_v2`, `_v3` …을 붙인 새 파일) |
| 수용 기준 | 기존 파일을 덮어쓰지 않는다. JSON에 NaN·무한대가 없다. `after_open`은 과거 재생의 `--with-outcome`에서만 넣고 실제 날짜 입력에서는 이 옵션을 거부한다. 과거 재생도 `0730`이면 `nxt_dir_match`는 null이다. 슬롯·모드·생성 시각만으로 장전 봉인·I16 승인·미래 검증 기록을 인정하지 않는다 |

실제 날짜 입력은 다음 준비 상태를 별도로 확인한다. 수집 기록의 `fetched`는 수신 성공이 아니라 수집 시도 날짜이며, 기록 통과 자체가 자료 품질이나 I16 자격을 보증하지 않는다.

| 경계 | 확인·처리 |
|---|---|
| 갱신 기록 | `refresh_manifest.json`이 NaN·무한대 없는 객체이며 시간대 있는 시작·완료 시각, 시작 ≤ 완료 ≤ 현재 시각, `trading_day.date = T`와 bool `open`을 확인한다. 없음·형식 오류·미완료·시간 순서 오류·미래 시각·대상일 불일치는 패널을 읽기 전에 `data_not_ready` 상태 카드로 남긴다 |
| 야간 자료 | `signal_T.D`가 확인되고 D < T이며 갱신 시작 ≥ D+1 06:05여야 한다. D를 확인하지 못하거나 너무 일찍 갱신한 경우, 야간 행·거래일 매칭이 누락된 경우 `data_not_ready`로 남긴다. 실제 날짜 입력의 누락 원인을 곧바로 휴장·만기일로 단정하지 않는다 |
| 0730 | 당일 NXT 등급은 요청하지 않는다(`grade_status.status = not_requested`). 야간 자료 준비와 모형 유효성이 충족되면 종목 범위만 산출한다 |
| 0811 | 갱신 시작 ≥ T 08:11, `premarket_days.asked`·`fetched`에 T 포함, `skipped`에는 T 없음, 당일 n 표와 유한하고 0이 아닌 g가 있어야 등급 계산을 허용한다. 준비 불충족이면 등급만 null로 두고 사유를 기록하며, 야간 자료로 계산할 수 있는 H·범위는 유지한다 |

야간 수집 조건을 통과한 뒤 확인된 신호 무효나 유효 종목 전부 탈락은 기존 `no_signal`로 남는다. `data_readiness.status = collection_gate_passed`와 카드 `status = ok`는 같은 뜻이 아니다.

### 3.12 FR-11 개장 후 채점

| 항목 | 내용 |
|---|---|
| 입력 | 아침 카드와 `.sha256`, T 시가(KIS 일봉) |
| 처리 | 카드 해시를 다시 계산해 저장값과 비교하고, 같을 때만 종목별 실현 시가 갭, 80%·90% 구간 포함 여부, 점추정 절대오차, 등급별 NXT 방향 일치를 계산한다 |
| 출력 | `check_<T>.json` |
| 수용 기준 | 해시가 다르면 채점하지 않는다. 출력 파일이 있으면 덮어쓰지 않는다 |

## 4. 데이터 명세

### 4.1 입력 데이터

| 파일 | 키 | 필드(타입, 단위) | 출처 | 용도 |
|---|---|---|---|---|
| `futures_daily.csv` | date, session | date(str), session(`day`·`night`), code(str), open·high·low·close(float, 지수포인트), volume(float, 계약) | KIS `FHKIF03020100` | 계산 |
| `universe_daily.csv` | date, code | date(str), code(str), Open·Close(float, 원) | KIS `FHKST03010100`(J) | 계산 |
| `universe.csv` | Code | Code(str), Name, Marcap, Market(`KOSPI`·`KOSDAQ`), Industry, group, etf | 고정 목록 200종목 | 계산 대상 |
| `universe_premarket.csv` | day, code, hhmmss | day(str), code(str), hhmmss(str, 분 시작), price(float, 원), volume(float, 주) | KIS `FHKST03010230`(NX) | 계산 |
| `nxt_premarket.csv` | day, code, hhmmss | day, code, date, hhmmss, price, volume. 같은 분이 두 파일에 있으면 이 파일 우선 | 연구 자료 | 계산 |
| `night_signal_flags.csv` | D | D(str), code, open·high·low·close·volume, `no_trade_signal`(bool), `zero_move_traded`(bool) | `workbench/corrected_data_v2/` | 계산 |
| `dart_filings.csv` | rcept_no | code, corp_code, rcept_no, rcept_dt(str), report_nm, corp_cls, flr_nm, rm | DART `list.json` | 계산 |
| `kr_daily.csv` | date, code | date, Open, High, Low, Close, Volume, code, name. code = `KS200`만 갱신 | FinanceDataReader | 패널 생성에 필요, 결과 미사용 |
| `night_minutes.csv`, `us_hourly.csv`, `vix_daily.csv`, `investor_daily.csv`, `fred_release_dates.csv`, `fomc_dates.csv`, `ks200_long.csv` | — | 연구 자료 사본 | 연구 자료 | 패널 생성에 필요, 결과 미사용 |

### 4.2 내부 데이터

06:00 표(z)와 08:11 표(n)는 종목·일 단위 표다. 엔진 결과에 쓰이는 열은 다음과 같다.

| 열 | 표 | 정의 | 단위 |
|---|---|---|---|
| T, D, code, name | z, n | 대상 거래일, 직전 거래일, 종목 코드, 종목명 | — |
| `x`, `ax` | z | 야간 수익률, 그 절댓값 | 수익률 |
| `pc` | z, n | D 종가 | 원 |
| `y` | z, n | 실현 시가 갭(T 행은 계산 입력에서 제거) | 수익률 |
| `M1`, `F2`, `r2`, `H` | z, n | A-01 결과 | 수익률, 0~1 |
| `e` | z | y − H | 수익률 |
| `sd08` | z | H 예측오차의 지수가중 RMS(s<sup>H</sup>, A-02) | 수익률 |
| `sd06`, `lsd` | z, n | (y − x)의 지수가중 RMS(s<sup>06</sup>, A-02)와 그 자연로그 | 수익률, 로그 |
| `g` | z: H와 같음, n: NXT 갭 | 구간 중심 열 | 수익률 |
| `size` | z: \|H\|, n: \|g\| | 크기 | 수익률 |
| `nxt` | n | NXT 08:10 이전 체결과 기준 종가가 모두 있으면 참 | bool |
| `e_earn`, `e_deal`, `e_rumor`, `e_periodic` | z, n | 공시 종류 표시(A-06) | 0/1 |
| `mon`, `hol` | z | 월요일, 연휴 뒤 | 0/1 |

### 4.3 출력 데이터: 아침 카드

| 필드 | 타입 | 단위·값 | 설명 |
|---|---|---|---|
| `case_id` | str | `morning_<T>` | 카드 식별자 |
| `status` | str | `ok` \| `no_signal` \| `holiday` \| `data_not_ready` | 산출 상태. `ok`가 아니면 `stocks`·`accounts`가 비어 있다 |
| `reason`, `reason_text` | str | 예: `no_eligible_stocks`, `refresh_manifest_missing`, `night_input_missing_unknown_reason`와 안내 문구 | `status`가 `ok`가 아닐 때의 사유. 실제 날짜 자료의 미확인 누락은 원인 미확인으로 표시 |
| `slot` | str | `0730` \| `0811` | 자료 시점 경계. `0730`에서는 당일 NXT 등급·방향 채점 없음 |
| `mode` | str | `live_snapshot` \| `historical_replay` | 실제 날짜용 자료 폴더의 스냅샷 / 연구 자료 재생. 장전 수신·봉인 여부와 별개 |
| `T`, `D` | str | YYYYMMDD | 대상일, 직전 거래일 |
| `timeline` | object | — | 산출 시각 설명 |
| `versions` | object | — | `band`(S1), `grade`(D08), `contract`, `protocol_sha256`, `e62_band_sha256`, `morning_card_sha256` |
| `issued_at` | str | ISO 8601(+09:00) | CLI가 기록한 실제 생성 시각 |
| `slot_nominal_at` | str | ISO 8601(+09:00) | T의 07:30 또는 08:11 목표 표시 시각 |
| `timing_status` | str | `historical_replay` \| `before_nominal` \| `at_nominal` \| `after_nominal` \| `0730_issued_at_or_after_0810` | 과거 재생은 첫 값. 실제 날짜 스냅샷은 목표 시각 전·동일·후를 표시하되, 0730 생성이 T 08:10 이상이면 마지막 값. 지연을 드러내는 기록이며 사전 봉인 자격은 부여하지 않음 |
| `data_readiness` | object | `{status, reason, reason_text, night_collection_threshold_at(확인 시)}` | 실제 날짜 모드의 준비 상태. status는 `data_not_ready`·`collection_gate_passed`·`not_applicable`(휴장). 야간 수집 기준 시각은 D+1 06:05의 KST ISO 값 |
| `grade_status` | object | `{status, reason, reason_text, graded_count(계산 단계 후)}` | 실제 날짜 모드의 등급 상태. status는 `not_requested`(0730)·`data_not_ready`·`unavailable`·`available`. 준비 조건 통과 후 등급 산출 종목이 없으면 `unavailable`·`grade_not_estimable`, 카드 자체 산출 불가이면 `band_unavailable`. 성공 시 사유는 null |
| `market.x` | float | 수익률 | 야간 수익률 |
| `market.cautions[]` | array | `{kind: "mon", text, detail}` | 시장 주의 문구 |
| `stocks[].code`, `name` | str | — | 종목 |
| `stocks[].base_close` | object | `{value: 원, date: D, kind: "관측"}` | 기준 종가 |
| `stocks[].H` | float | 수익률, 소수 6자리 | 점추정치 |
| `stocks[].band80`, `band90` | [float, float] | 수익률, 소수 6자리 | [하단, 상단] |
| `stocks[].target_coverage` | float | 0.8 | 목표 포함률 |
| `stocks[].eligibility_status` | str | `ok` | 산출 여부 |
| `stocks[].cautions[]` | array | `{kind: "e_earn", text, detail}` | 종목 주의 문구 |
| `stocks[].grade_0811` | object \| null | `{level: 높음·보통·낮음, p: 0~1, nxt_g: 수익률, imputed_features: [열 이름], imputation_method: "training_median"}` | NXT 방향 일치 등급. 0730, 등급 준비 미충족, 당일 g가 0·비유한값이거나 확률이 유효하지 않으면 null. 보정한 당일 설명변수(`size`, `lsd`, `r2`)를 목록에 표시 |
| `accounts[].holdings[]` | array | `{code, q, value: 원, H_amount: 원, band80_amount: [원, 원]}` | 종목별 금액 |
| `accounts[].excluded[]` | array | `{code, q, value: 원 또는 null, base_close: 관측 객체 또는 null, valuation_status: known·unknown, reason}` | 추정 제외 종목. 기준 종가가 양의 유한값이면 평가액·기준일을 기록하며, 그렇지 않으면 금액·기준 종가는 null |
| `accounts[].stock_value`, `H_sum_amount` | int | 원 | 지원 종목 평가액 합, 지원 종목 점추정 금액 합. 전체 계좌 합이 아님 |
| `accounts[].summary_scope` | str | `supported_holdings_only` | 위 두 합계의 지원 범위 |
| `accounts[].valuation` | object | 아래 표 | 전체·제외 평가액과 지원 비중을 위한 분모 상태 |
| `accounts[].account_band` | object | `{status, value: null, note}` | 현재 계좌 구간 미제공. AS1 미채택은 현재 판의 결과이며 후속 연구 종료를 뜻하지 않음(모델 설계서 §5.6) |
| `dropped` | array | 종목 코드 | 기준 종가가 양의 유한값이 아니거나 H·구간이 유한하지 않아 뺀 종목. 전부 탈락한 상태 카드에도 보존 |
| `candidates` | object | — | 기록 전용 후보 값. 화면 미사용 |
| `notes[]` | array | str | 재생은 사후 자료임을, 실제 날짜 스냅샷은 모드·생성 시각만으로 장전 봉인·I16 승인·미래 검증을 뜻하지 않음을 표시 |
| `inputs` | object | — | `live_snapshot`일 때 읽은 패널의 입력 파일 SHA-256·야간 표시 목록과 `refresh_manifest`. 준비 오류로 패널을 읽지 않았다면 패널 해시는 없으며, 갱신 기록이 없거나 파싱 불가이면 `refresh_manifest = null` |
| `after_open` | object | — | 과거 재생의 `with_outcome=True`에서만 포함. 구간 포함 여부는 반올림 전 끝점으로 계산. 0730의 NXT 방향 일치는 null |

`valuation`의 금액은 D 기준이며, 모든 합산은 반올림 전 값으로 한다.

| 필드 | 정의·결측 규칙 |
|---|---|
| `base_date`, `status` | D, `complete` 또는 `incomplete`. 가격을 평가할 수 없는 제외 종목이 하나라도 있으면 `incomplete` |
| `supported_stock_value` | 지원 종목 평가액 합. `stock_value`와 같음 |
| `known_excluded_stock_value` | 평가할 수 있는 제외 종목의 평가액 합. 평가 불가 종목의 금액을 0으로 추정한 전체 합이 아님 |
| `excluded_stock_value` | 모든 제외 종목을 평가할 수 있을 때 그 합계, 하나라도 평가 불가이면 null |
| `total_stock_value` | 지원 평가액 + 제외 평가액. 제외 평가액이 미확정이면 null |
| `total_account_value` | 전체 주식 평가액 + 입력 현금. 전체 주식 평가액이 미확정이면 null |
| `supported_stock_fraction` | 지원 주식 평가액 / 전체 주식 평가액. 분모가 미확정 또는 0 이하이면 null |
| `supported_account_fraction` | 지원 주식 평가액 / 현금 포함 전체 계좌 평가액. 분모가 미확정 또는 0 이하이면 null |
| `unvalued_codes` | 기준 종가가 없어 평가할 수 없는 제외 종목 목록 |

두 `fraction`은 0~1 비중으로, 예측구간의 포함률과 다르다. 제외 종목이 모두 평가 가능해도 그 종목의 H·범위를 추정하거나 전체 계좌 범위를 제공한다는 뜻은 아니다. 표시한 개별 원 단위 금액의 합과 원정밀로 합산한 최종 금액은 반올림 때문에 다를 수 있다.

예시(2026-11-04, 삼성전자 1종목·계좌 1개 발췌): **1.4 수정 이전 판의 저장 산출물**이다. 원문·숫자는 보존했으므로 위 최신 계약의 추가 필드와 동일한 형식이 아니다. 생성 시각이 당일 14:55인 스냅샷이며 장전 예측 기록으로 보지 않는다.

```json
{
  "case_id": "morning_20261104",
  "status": "ok",
  "mode": "live_snapshot",
  "T": "20261104",
  "D": "20261103",
  "slot": "0811",
  "issued_at": "2026-11-04T14:55:16+09:00",
  "market": {
    "x": 0.017003,
    "cautions": []
  },
  "stocks": [
    {
      "code": "005930",
      "name": "삼성전자",
      "base_close": {
        "value": 219500.0,
        "date": "20261103"
      },
      "H": 0.019542,
      "band80": [
        0.000966,
        0.038119
      ],
      "band90": [
        -0.004348,
        0.043432
      ],
      "target_coverage": 0.8,
      "eligibility_status": "ok",
      "cautions": [],
      "grade_0811": {
        "level": "높음",
        "p": 0.986,
        "nxt_g": 0.031891
      }
    }
  ],
  "accounts": [
    {
      "name": "A 반도체 집중",
      "cash": 2000000,
      "holdings": [
        {
          "code": "005930",
          "q": 37,
          "value": 8121500,
          "H_amount": 158710,
          "band80_amount": [
            7845,
            309583
          ]
        }
      ],
      "excluded": [],
      "stock_value": 19029500,
      "H_sum_amount": 387797,
      "account_band": {
        "status": "후보 · 표시 방식 팀 결정 대기",
        "value": null
      }
    }
  ]
}
```

주의 문구 고정 문안:

| kind | text |
|---|---|
| `e_earn` | 어제 실적 공시가 나온 종목이에요. 과거 이런 아침엔 시가가 범위 밖으로 더 자주 나갔어요. |
| `mon` | 월요일 아침이에요. 과거 월요일엔 시가가 범위 밖으로 더 자주 나갔어요. |

## 5. 알고리즘 명세

### 5.1 A-00 공통 규칙

- **야간 신호 유효성:** `signal_valid` = D 야간 행 존재 ∧ D 주간·D 야간·T 주간 계약 코드 동일 ∧ 무거래 표시 존재 ∧ 무거래 아님 ∧ D 주간 종가·D 야간 종가·D 야간 거래량 > 0. 새 야간 세션의 표시는 `no_trade_signal` = (거래량 = 0 ∧ 시가 = 고가 = 저가 = 종가), `zero_move_traded` = (거래량 > 0 ∧ 야간 종가 = D 주간 종가)로 만든다.
- **야간 수익률:** x = 야간 종가(D) ÷ 주간 종가(D) − 1.
- **종목 분할:** 개발 14종목(`protocol_i24_features.json`의 `development_codes`)을 뺀 186종목을 코드 순으로 정렬하고 시드 20261102로 섞은 앞 93종목을 검증 종목, 나머지와 개발 14종목을 개발 종목(107)으로 둔다. 공통 계수는 개발 종목으로만 학습한다.
- **날짜 가중치:** 행마다 1 ÷ (그날 행 수)를 주고 평균이 1이 되도록 나눈다.

### 5.2 A-01 시가 갭 점추정치

종목 i, 대상일 T에 대해, T 이전 유효 관측 최근 250개(최소 120개)로 계산한다.

\[
\beta=\frac{S_{xy}}{S_{xx}},\quad a=\bar y-\beta\bar x,\quad R^2=\frac{S_{xy}^2}{S_{xx}S_{yy}},\quad \beta^0=\frac{\sum xy}{\sum x^2}
\]

\[
M1=a+\beta x_T,\qquad F2=\frac{\beta^0+1}{2}x_T,\qquad H=\begin{cases}M1,&R^2<0.3\\F2,&R^2\ge0.3\end{cases}
\]

\(S_{xx}, S_{yy}, S_{xy}\)는 평균을 뺀 제곱합·곱합이다. \(S_{xx}\), \(S_{yy}\), \(\sum x^2\) 가운데 하나라도 0이면 결측이다.

\(F2\)는 원점을 지나며 절편을 두지 않는다. 기울기는 절편 포함 회귀의 \(\beta\)가 아니라 절편 없는 \(\beta^0\)를 쓴다. 절편을 넣은 변형(\(a + \frac{\beta+1}{2}x_T\))은 E80에서 평균 절대오차가 0.28% 커져 채택하지 않았다(모델 설계서 §5.1·§9).

### 5.3 A-02 지수가중 RMS

\(T\) 이전 유효 값 \(v_1,\dots,v_n\)(오래된 순, \(n \le 250\))에 대해

\[
s=\sqrt{\frac{\sum_{k=1}^{n}\lambda^{n-k}v_k^2}{\sum_{k=1}^{n}\lambda^{n-k}}},\qquad\lambda=0.94
\]

| 산출값 | v | 최소 개수 |
|---|---|---|
| \(s^H\)(`sd08`) | \(y - H\) | 20 |
| \(s^{06}\)(`sd06`) | \(y - x\) | 60 |

### 5.4 A-03 예측구간 S1

T마다 다음을 수행한다.

1. 개발 종목 행 가운데 y, H, \(s^H\)가 있고 \(s^H > 0\)인 행에서 T 이전 날짜를 모은다. 가장 최근 20거래일을 보정 표본 C, 그 앞 전부를 학습 표본 L로 둔다. L이 60거래일 미만이면 산출하지 않는다.
2. L에서 \(|x|\)의 1%·99% 분위 \(q_{01}, q_{99}\)로 자른 값의 평균 \(\mu\), 표준편차 \(\sigma\)(0이면 1)를 구하고 \(z = (\operatorname{clip}(|x|, q_{01}, q_{99}) - \mu) / \sigma\)로 표준화한다.
3. 목표 \(\ell = \log(|y - H| / s^H + 0.001)\)를 \([1, z]\)에 회귀한다. 가중치는 날짜 가중치 \(w_0\)에서 시작하고, 8회 반복하며 잔차 \(r\), 강건 척도 \(c = \max(\operatorname{MAD}(r)/0.67448975,\ 10^{-6})\)로 \(w = w_0 \cdot \min(1,\ 1.35c/|r|)\)를 갱신한다. 결과 계수는 \(b_0, b_1\)이다.
4. 척도 \(\hat\sigma = s^H \exp(\operatorname{clip}(b_0 + b_1 z, -8, 8))\).
5. C에서 \(u = |y - H| / \hat\sigma\)를 구하고, 날짜 가중 누적 비율이 0.8(0.9) 이상이 되는 첫 값을 \(\hat q_{0.8}\)(\(\hat q_{0.9}\))로 둔다.
6. T의 종목별 \([L_{80}, U_{80}] = H \mp \hat q_{0.8}\hat\sigma\), \([L_{90}, U_{90}] = H \mp \hat q_{0.9}\hat\sigma\). T의 y는 사용하지 않는다.

### 5.5 A-04 NXT 갭

- 대상 분봉: `hhmmss`가 080000~081000인 1분봉. 같은 종목·분이 두 파일에 있으면 `nxt_premarket.csv`를 쓴다.
- 유효 체결: 가격 > 0 ∧ 거래량 > 0.
- \(P\) = 마지막 유효 체결 분봉의 가격, \(g = P / pc - 1\). 마지막 체결이 08:10보다 앞이면 그 값을 쓰고 경과 분을 기록한다.
- `nxt` = \(P > 0\) ∧ \(pc > 0\) ∧ g 유한.

### 5.6 A-05 방향 일치 등급

1. 학습 표본: 개발 종목의 T 이전 08:11 표 행 가운데 g·y가 유한하고 \(g \ne 0\), \(y \ne 0\)인 행. 60거래일 미만이면 산출하지 않는다. 당일 추정도 유한하고 0이 아닌 g가 있는 종목만 대상으로 한다. `slot = 0730`이면 이 등급 계산을 호출하지 않는다.
2. 목표: \(t = 1[\operatorname{sign}(g) = \operatorname{sign}(y)]\).
3. 설명변수: \(|g|\), \(\log s^{06}\), \(R^2\)(계산열 `size`, `lsd`, `r2`). 학습 표본 중앙값으로 결측을 채우고 학습 표본 평균·표준편차(0이면 1)로 표준화한다. 당일 설명변수의 비유한값을 보정했다면 그 열 이름을 `imputed_features`에 기록한다. 이는 설명변수 보정이며 g가 없거나 0인 종목에 방향을 만들어 주지 않는다.
4. 모형: L2 정규화 로지스틱 회귀(scikit-learn `LogisticRegression`, `C = 1.0`, `max_iter = 400`), 표본 가중치 = 날짜 가중치.
5. 확률 p가 유한하고 0~1 안에 있을 때만 **반올림 전 확률**로 등급을 낸다. \(p \ge 0.90\) 높음, \(0.75 \le p < 0.90\) 보통, \(p < 0.75\) 낮음. 유효하지 않은 확률을 높은 등급으로 분류하지 않는다. 저장 p는 소수 3자리이므로 저장값으로 등급을 다시 판정하지 않는다(NFR-08).

### 5.7 A-06 공시 분류

| 표시 | 공시 제목 정규식 | 비고 |
|---|---|---|
| `e_earn` | `잠정\)?실적\|영업실적\|매출액또는손익구조` | 제목이 `[기재정정]`으로 시작하면 제외. `[첨부정정]`·`[첨부추가]`는 제외하지 않는다(현행). 늦은 정정·첨부 정정 처리는 E84 판정 전까지 현행 유지 |
| `e_deal` | `단일판매\|공급계약\|유상증자\|무상증자\|합병\|분할결정\|자기주식\|타법인주식\|신규시설투자\|상장결정\|증권예탁증권\|소송\|영업정지\|주요사항보고서` | 기록용 |
| `e_rumor` | `풍문\|해명\|조회공시\|투자판단` | 기록용 |
| `e_periodic` | `분기보고서\|반기보고서\|사업보고서` | 기록용 |

공시는 D ≤ 접수일 < T인 첫 T에 붙인다. T 당일 접수분은 쓰지 않는다.

## 6. 인터페이스 명세

### 6.1 외부 API

| 용도 · TR ID | 엔드포인트 | 주요 요청 값 | 사용 응답 필드 |
|---|---|---|---|
| KIS 토큰 | `POST /oauth2/tokenP` | appkey, appsecret | `access_token`, `access_token_token_expired` |
| 휴장일 확인 `CTCA0903R` | `GET /uapi/domestic-stock/v1/quotations/chk-holiday` | `BASS_DT` = T, `CTX_AREA_NK`·`CTX_AREA_FK` = 빈 값 | `output[].bass_dt`, `opnd_yn`(개장일 여부) |
| 선물 일봉 `FHKIF03020100` | `GET /uapi/domestic-futureoption/v1/quotations/inquire-daily-fuopchartprice` | `FID_COND_MRKT_DIV_CODE` = `F`·`CM`, `FID_INPUT_ISCD` = 근월물 코드, `FID_INPUT_DATE_1/2`, `FID_PERIOD_DIV_CODE` = `D` | `stck_bsop_date`, `futs_oprc`, `futs_hgpr`, `futs_lwpr`, `futs_prpr`, `acml_vol` |
| 종목 일봉 `FHKST03010100` | `GET /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice` | `FID_COND_MRKT_DIV_CODE` = `J`, `FID_INPUT_ISCD`, `FID_INPUT_DATE_1/2`, `FID_PERIOD_DIV_CODE` = `D`, `FID_ORG_ADJ_PRC` = `0` | `stck_bsop_date`, `stck_oprc`, `stck_clpr` |
| NXT 1분봉 `FHKST03010230` | `GET /uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice` | `FID_COND_MRKT_DIV_CODE` = `NX`, `FID_INPUT_ISCD`, `FID_INPUT_HOUR_1` = `081000`, `FID_INPUT_DATE_1` = T, `FID_PW_DATA_INCU_YN` = `N` | `stck_bsop_date`, `stck_cntg_hour`, `stck_prpr`, `cntg_vol` |
| 공시 목록 | `GET https://opendart.fss.or.kr/api/list.json` | `crtfc_key`, `bgn_de` = `end_de` = 날짜, `page_no`, `page_count` = 100 | `status`, `total_page`, `list[].stock_code`, `corp_code`, `rcept_no`, `rcept_dt`, `report_nm`, `corp_cls`, `flr_nm`, `rm` |
| 지수 일봉 | FinanceDataReader `DataReader("KS200", start, end)` | 기간 | Open, High, Low, Close, Volume |

KIS 공통 헤더는 `authorization: Bearer <token>`, `appkey`, `appsecret`, `tr_id`, `custtype: P`다. 호출 간격은 0.12초(선물 일봉 0.4초)이고, 응답 `msg_cd = EGW00201`(호출 한도)이면 1초, 통신 오류면 2초 쉰 뒤 최대 5회 다시 요청한다. 시세 조회 TR만 사용한다.

### 6.2 모듈 인터페이스

| 함수 | 입력 | 출력 |
|---|---|---|
| `live_refresh.main()` | CLI(§6.3) | `live/<name>/data/`, `dart_filings.csv`, `refresh_manifest.json` |
| `live_panel.frames(root, filings_path, T)` | 자료 폴더, 공시 목록 경로, T | `((z, n, dev, codes), manifest)` |
| `live_panel.build(root, cutoff, T, include_targets=True)` | 자료 폴더, `"06:00"`·`"08:11"`, T | `(panel, manifest)` |
| `e62_band.split_stocks(codes, dev)` | 전 종목, 개발 14종목 | `(개발 종목, 검증 종목)` |
| `e62_band.run_candidates(frame, train_codes, eval_codes, days, specs, asym)` | z, 학습 종목, 산출 종목, 날짜, `{"S1": (["ax"], [])}`, `()` | `{"S1": T·code·L80·U80·L90·U90 표}` |
| `e62_band.logit_prob(train, test, cols)` | 학습 표, 산출 표, `["size", "lsd", "r2"]` | 확률 배열 |
| `e62_band.event_flags(filings, calendar)` | 공시 목록, (T, D) 표 | (T, code)별 공시 표시 |
| `morning_card.build_card(z, n, dev, codes, day, accounts=None, with_outcome=False, signal=None, slot=None, allow_current_grade=True)` | 표, T, 보유 정보 `{이름: {"cash": 원, "hold": {코드: 수량}}}`, 야간 신호 판정, 슬롯, 당일 등급 계산 허용 여부. `slot=None`은 과거 재생 호환용 자동 선택, `with_outcome`은 과거 재생용 | 아침 카드 dict. 0730 또는 `allow_current_grade=False`이면 당일 등급을 계산하지 않음. 실제 날짜 준비 상태·모드·발행 시각은 CLI에서 기록 |
| `morning_card.issuance_timing(day, slot, issued_at, historical_replay=False)` | T, 슬롯, 시간대가 있는 실제 생성 시각, 재생 여부 | `{slot_nominal_at, timing_status}`. 시각 관계만 기록하며 사전 봉인 자격을 부여하지 않음 |
| `morning_card.load_refresh_manifest(root, day, now)` | 실제 날짜 자료 폴더, T, 시간대 있는 현재 시각 | `(갱신 기록 또는 None, 오류 사유 또는 None)` |
| `morning_card.night_readiness(refresh, day, signal)` | 검증한 갱신 기록, T, `signal_T` | 야간 준비 상태·사유·확인된 D+1 06:05 기준 시각 |
| `morning_card.grade_readiness(refresh, day, n)` | 검증한 갱신 기록, T, 당일 NXT 표 | 등급 계산 허용 여부. 수집 시도 기록과 유효 당일 입력을 함께 확인 |

### 6.3 명령줄 인터페이스

```bash
cd research/overnight_backtest

# B1 수집(06:05 이후): 직전 자료 폴더를 이어받아 끝난 장만
PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh \
  --name <T> --env <.env 경로> --until <T> [--base auto|none|<폴더>]

# B2 수집(08:11 이후): 같은 폴더에 T의 NXT 분봉을 더함
PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh \
  --name <T> --env <.env 경로> --until <T> --premarket-days <T>

# 카드 생성(B1은 --slot 0730, B2는 --slot 0811 필수). 같은 이름이 있으면 _v2 …
PYTHONPATH=.:src .venv/bin/python -m workbench.morning_card \
  --root workbench/live/<T> --events workbench/live/<T>/dart_filings.csv \
  --date <T> --slot <0730 또는 0811> [--out-dir <폴더> | --out <경로>]

# 과거 재생에서만 사후 결과를 함께 볼 수 있다. 0730이면 NXT 방향 채점은 여전히 null
PYTHONPATH=.:src .venv/bin/python -m workbench.morning_card \
  --date <과거 T> --slot 0730 --with-outcome --out <경로>

# B3 채점
PYTHONPATH=.:src .venv/bin/python workbench/runs/claude_live_r1/check_open.py \
  --date <T> --env <.env 경로> --card <카드 경로>
```

`--root`와 함께 `--slot`을 생략하거나 `--with-outcome`을 지정하면 자료를 읽기 전에 오류로 종료한다. 지원하지 않는 슬롯도 거부한다. 실제 날짜 스냅샷의 개장 후 채점은 별도 B3 산출물로 남긴다. 위 명령은 인터페이스 명세이며 예약 설치·운영 실행의 완료 증거가 아니다.

## 7. 비기능 요구사항

| ID | 항목 | 요구사항 | 확인 방법 |
|---|---|---|---|
| NFR-01 | 미래 정보 차단 | T의 계산에는 T보다 앞선 거래일의 실현값만 쓴다. 06:00 표에서는 08:11 이후 관측 열을 비운다. 카드 계산 입력에서 `y`, `e`, `target_observed`의 T 행을 지운다. 0730 카드에는 당일 NXT 등급과 NXT 방향 채점을 넣지 않는다 | `test_no_lookahead`, `test_forecast_ignores_todays_and_future_targets`, `test_0730_omits_later_grade_and_nxt_outcome` |
| NFR-02 | 결정성 | 같은 입력·코드·슬롯이면 카드 계산 수치가 같다(실제 생성 시각과 그에 따른 `timing_status` 제외). 같은 T의 B1·B2 카드는 H·구간이 같다 | AC-02, AC-03 |
| NFR-03 | 추적성 | 카드에 분석 계획·코드 해시, 실제 날짜 입력 파일 해시를 기록한다 | 카드 `versions`, `inputs` |
| NFR-04 | 연구 자료 보존 | 연구 `data/`와 연구 공시 목록을 바꾸지 않는다. 산출물은 새 폴더·새 파일에 쓴다 | 실행 전후 해시 비교 |
| NFR-05 | 처리 시간 | B1은 07:20 이전, B2는 08:15 이전에 완료한다. 참고: 2026-11-04 증분 갱신(직전 폴더 이어받기 + NXT 1일) 1분 37초, 연구 자료부터 다시 받기(7거래일) 12분 16초 | `refresh_manifest.json` 시작·종료 시각 |
| NFR-06 | 보안 | 자격 증명은 `.env`에서만 읽고 화면·로그·문서에 쓰지 않는다. 주문·계좌 API를 호출하지 않는다 | 코드 점검 |
| NFR-07 | 저장 무결성 | 카드·채점 파일은 덮어쓰지 않고, 카드에는 `.sha256`을 함께 둔다 | 파일 존재 검사 |
| NFR-08 | 수치 표현 | H·구간·NXT 갭은 소수 6자리, 등급 확률 p는 소수 3자리, 금액은 원 단위 정수로 저장한다. 현행은 Python 내장 `round`의 가장 가까운 값·동률이면 짝수 선택(ties-to-even)이며 이진 부동소수 표현의 제약을 따른다. 가격×수량, H·구간 금액 환산, 합산, 재생 구간 포함 판정과 등급 판정은 반올림 전 값으로 한다. 지원 비중도 반올림 전 분자·분모로 나눈다 | 원정밀 금액·끝점 시험(§9.1) |

소수 3자리로 저장한 p와 등급 경계는 표시상 어긋날 수 있다. 예를 들어 원확률 0.7496은 낮음이지만 저장값은 0.750이고, 0.8996은 보통이지만 0.900으로 저장된다. 화면은 확률 숫자를 숨기고 계산된 등급을 표시하는 방식을 권장하며, 숫자를 공개하려면 별도 표시 정책을 정한다. `round`는 십진수에서 항상 5를 올리는 규칙이 아니며, 원정밀도는 현행 부동소수 계산값을 뜻한다.

## 8. 예외 처리

| 상황 | 감지 | 처리 | 카드 |
|---|---|---|---|
| 잘못된 슬롯·실제 날짜 입력 옵션 | 지원하지 않는 슬롯, `--root`인데 슬롯 없음 또는 `--with-outcome` 동시 지정 | 자료를 읽기 전에 오류로 종료 | 생성 안 함 |
| 실제 날짜 갱신 기록 미확인 | 기록 없음·형식/시간대 오류·미완료·시간 순서 오류·미래 시각·대상일 불일치 | 패널을 읽지 않고 원인 기록 | `status = data_not_ready`, stocks·accounts 빈 배열 |
| 야간 자료 준비 미충족 | D 미확인, 갱신 시작 < D+1 06:05, 야간 행·거래일 매칭 누락 | 숫자 범위를 만들지 않고 준비 상태 기록. 누락 원인을 추정하지 않음 | `status = data_not_ready`, `data_readiness` 사유 |
| 0811 등급 자료 준비 미충족 | 갱신 시작 < T 08:11, 수집 기록 미확인·T 생략·수집 시도 없음 | 등급 계산을 막고 야간 자료의 H·범위는 유지 | 등급 null, `grade_status.status = data_not_ready` |
| 0811 당일 NXT 입력 미확인 | n에 당일 행 없음 또는 방향 있는 유효 g 없음 | 등급을 내지 않고 원인 기록 | 등급 null, `grade_status.status = unavailable` |
| T가 KRX 휴장일 | 국내휴장일조회 `opnd_yn = N` | 자료를 받지 않고 manifest에 사유를 남긴 뒤 정상 종료 | `status = holiday` 상태 카드 |
| 휴장일 조회 실패 | 응답에 T 없음 | 주말이면 휴장으로, 평일이면 개장으로 보고 확인 방법을 기록 | — |
| 야간 신호 무효 | `signal_valid` 거짓(`signal_reason`) | H·구간을 산출하지 않는다 | `status = no_signal` 상태 카드, `reason`에 사유 |
| 구간 학습 자료 부족 | 학습 표본 60거래일 미만 | 구간을 산출하지 않고 '구간 학습 자료가 60거래일 미만' 사유로 종료 | 생성 안 함 |
| 종목 기준 종가·H·구간이 무효 | 기준 종가가 양의 유한값이 아니거나 H·구간이 비유한값 | 해당 종목을 뺀다 | `dropped`에 코드 |
| 유효 종목 전부 탈락 | 위 필터 뒤 종목 0개 | 예외 대신 상태 카드를 낸다 | `status = no_signal`, `reason = no_eligible_stocks`, D·slot·dropped 보존, stocks·accounts 빈 배열, market.x null |
| 새로 받을 행 없음 | 응답 0건 | 기존 표를 그대로 둔다 | — |
| 종목 이력 부족 | H 또는 \(s^H\) 결측 | 해당 종목을 산출 대상에서 뺀다 | `stocks`에 없음, 계좌는 `excluded` |
| NXT 체결 없음 | `nxt` 거짓 | 등급을 산출하지 않는다 | `grade_0811 = null` |
| NXT 갭이 보합·비유한값 또는 등급 확률 무효 | g = 0·NaN·무한대, 또는 p가 비유한값·0~1 범위 밖 | 해당 종목 등급을 산출하지 않는다 | `grade_0811 = null` |
| 등급 설명변수 결측 | 유효 g가 있지만 `size`·`lsd`·`r2`에 비유한값 | 기존 학습 중앙값 보정 규칙을 쓰고 보정 열을 기록 | `imputed_features`, `imputation_method` |
| 제외 종목 가격 미확정 | 양의 유한 기준 종가 없음 | 알려진 제외 평가액은 보존하되 전체 분모를 추정하지 않는다 | `valuation.status = incomplete`, 전체·제외 평가액·지원 비중 null, `unvalued_codes` 기록 |
| 0730 카드 생성 지연 | 실제 날짜 모드에서 생성 시각 ≥ T 08:10 | 생성 시각을 소급하지 않고 지연 상태를 기록한다 | `timing_status = 0730_issued_at_or_after_0810` |
| 등급 학습 자료 부족 | 학습 60거래일 미만 | 전 종목 등급을 산출하지 않는다 | 전 종목 `null` |
| KIS 호출 한도 | `msg_cd = EGW00201` | 1초 대기 후 재요청(최대 5회) | — |
| KIS 통신 오류 | 예외 | 2초 대기 후 재요청(최대 5회), 실패 시 해당 요청은 빈 결과 | 누락 행은 결측으로 처리 |
| DART 호출 한도·통신 오류 | `status = 020`, 예외 | 실행을 중단한다 | 생성 안 함 |
| 근월물 표에 없는 날짜 | `common.FRONTS` 조회 실패 | 실행을 중단한다. 표를 갱신한다 | 생성 안 함 |
| 카드 해시 불일치 | SHA-256 비교 | 채점하지 않는다 | — |
| 출력 파일 존재 | 경로 확인 | 카드는 `_v2`, `_v3` …을 붙여 새로 저장하고, 채점 파일은 쓰지 않는다 | — |

## 9. 시험 및 인수 기준

### 9.1 자동 시험

```bash
cd research/overnight_backtest
PYTHONPATH=.:src .venv/bin/python -m pytest workbench/tests -q
```

513개 통과 기록은 2026-11-05의 1.4 수정 이전 판 기준이다. 1.4 후속 수정은 아래 집중 검사에서 **45개 통과·4개 제외**를 확인했다(자료 준비 경계 신규 21개와 기존 합성·운영 검사 24개). 제외한 4개는 실자료 학습을 사용하는 기존 검사다. 이는 모의 입력과 로컬 동작의 확인이며, 이전 전수 통과 기록을 새 판 전체 시험 결과로 간주하거나 실제 수신·미래 성능 증거로 세지 않는다.

```bash
PYTHONPATH=.:src .venv/bin/python -m pytest -q workbench/tests/test_morning_card.py \
  -k 'not no_lookahead and not same_as_sealed_routine and not grade_same_as_validated_function and not only_confirmed_messages' \
  workbench/tests/test_live_ops.py
```

| 시험 | 확인 내용 |
|---|---|
| `test_morning_card.py::test_no_lookahead` | T의 실현값을 임의로 바꿔도 카드가 같다 |
| `test_morning_card.py::test_same_as_sealed_routine` | 카드 구간이 최종 검증 루틴 결과와 소수 6자리까지 같다 |
| `test_morning_card.py::test_grade_same_as_validated_function` | 카드 등급이 E64와 같은 표·함수(개발 종목, 그날 이전 학습)로 낸 확률·등급과 같다 |
| `test_morning_card.py::test_only_confirmed_messages` | 문구 종류 ⊆ {`e_earn`, `mon`}, 계좌 구간 null, 제외 종목 처리 |
| `test_morning_card.py::test_0730_omits_later_grade_and_nxt_outcome` | 0730은 등급 함수를 호출하지 않고 사후 NXT 방향 일치도 null |
| `test_morning_card.py::test_0811_keeps_grade_but_replay_score_uses_exact_endpoints` | 0811 등급 유지, 재생 포함 여부는 원정밀 끝점으로 판정 |
| `test_morning_card.py::test_account_uses_exact_inputs_then_rounds_final_sum` | H·범위 금액을 원정밀 입력으로 계산하고 최종 합을 반올림하며 알려진 제외 평가액을 분모에 포함 |
| `test_morning_card.py::test_account_position_values_are_not_rounded_before_multiplication_or_sum` | 개별 평가액을 미리 반올림해 곱하거나 합산하지 않음 |
| `test_morning_card.py::test_unknown_excluded_price_leaves_total_and_coverage_unknown` | 평가 불가 제외 종목이 있으면 전체 평가액·지원 비중 null |
| `test_morning_card.py::test_all_invalid_stocks_return_status_card_with_dropped_codes` | 유효 종목 전부 탈락 시 상태 카드·기준일·슬롯·제외 목록 보존 |
| `test_morning_card.py::test_grade_requires_direction_and_finite_probability` | 보합·비유한 g와 무효 확률 제외, 유효 g의 설명변수 보정 열 기록 |
| `test_morning_card.py::test_invalid_live_or_slot_options_fail_before_loading` | 잘못된 슬롯·실제 날짜 입력 옵션을 자료 로드 전에 차단 |
| `test_morning_card.py::test_live_cli_preserves_0730_contract_and_labels_input_evidence` | 실제 날짜 CLI의 0730 경계·입력 근거·모드별 안내·계좌 분모·실제 시각 기록 |
| `test_morning_card.py::test_0730_issuance_timing_exposes_late_generation` | 07:30 전·동일·후, 08:10 이후·다음 날, 과거 재생의 시각 상태 |
| `test_morning_card.py::test_live_manifest_failures_stop_before_loading_panels` | 갱신 기록 없음·손상·미완료·시각/대상일 오류를 패널 로드 전에 상태 카드로 표시 |
| `test_morning_card.py::test_night_readiness_uses_signal_day_across_weekend_and_actual_start` | 주말·휴일 뒤에도 실제 신호 D+1 06:05로 비교하며 완료 시각 대신 시작 시각을 사용 |
| `test_morning_card.py::test_live_missing_night_does_not_infer_holiday_or_expiry` | 이른 수집과 원인 미확인 야간 누락을 구분하고 휴장·만기로 단정하지 않음 |
| `test_morning_card.py::test_live_0811_grade_gate_keeps_band_and_explains_missing_grade` | 08:11 준비 시각, 수집 시도·생략 기록, 당일 유효 입력과 등급 산출 가능성을 구분하며 준비 실패 시 범위 유지 |
| `test_live_panel.py::test_same_frames_as_research` | 실제 날짜 경로와 연구 경로의 z·n 표가 같다 |
| `test_live_panel.py::test_add_today_builds_x_from_previous_night` | T 빈 행 추가 후 x가 D 야간 종가로 계산된다 |
| `test_live_panel.py::test_flag_rule_reproduces_existing_table` | 야간 무거래 규칙이 기존 438세션 표와 같다 |
| `test_e62_band.py::test_event_uses_d_to_before_t_and_never_t` | 공시가 D ≤ 접수일 < T에만 붙는다 |
| `test_e62_band.py::test_prior_rms_excludes_current_and_future` | 지수가중 RMS에 당일·미래 값이 들어가지 않는다 |
| `test_e62_band.py::test_forecast_ignores_todays_and_future_targets` | 구간이 당일·미래 실현값에 영향받지 않는다 |
| `test_e62_band.py::test_candidates_train_only_on_training_codes` | 계수가 학습 종목으로만 정해진다 |
| `test_e62_band.py::test_split_is_stable_disjoint_and_keeps_dev_in_design` | 종목 분할이 고정·배타적이고 개발 14종목을 개발 쪽에 둔다 |
| `test_live_ops.py::test_parse_open_reads_only_the_asked_day`, `test_trading_day_falls_back_to_weekend_only` | 휴장일 판정과 조회 실패 시 대체 규칙 |
| `test_live_ops.py::test_premarket_todo_skips_have_future_and_not_ready` | NXT 수집 날짜 규칙(지난 날짜 중복·당일 08:11 전·미래 제외) |
| `test_live_ops.py::test_pick_base` | 이어받을 자료 폴더 선택 |
| `test_live_ops.py::test_no_signal_day_returns_status_card_not_error` | 야간 신호 무효일에 상태 카드를 낸다 |
| `test_live_ops.py::test_short_history_message_is_specific` | 학습 자료 부족 사유가 정확하다 |
| `test_live_ops.py::test_card_path_never_overwrites` | 카드 파일을 덮어쓰지 않는다 |
| `test_live_ops.py::test_refresh_functions_keep_table_when_nothing_new` | 새로 받을 행이 없을 때 기존 표를 유지한다 |

### 9.2 인수 기준

| ID | 기준 | 판정 |
|---|---|---|
| AC-01 | 9.1 자동 시험 전부 통과 | 통과·실패 |
| AC-02 | 과거 날짜 하나를 실제 날짜 경로로 재생한 카드의 H·구간이 연구 경로 결과와 같다 | 소수 6자리 일치 |
| AC-03 | 같은 T의 B1 카드와 B2 카드에서 모든 종목의 H, band80, band90이 같다 | 완전 일치 |
| AC-04 | 실제 거래일 하나에서 B1 → B2 → B3를 처리 일정(§2.2) 안에 마치고 카드 2개와 채점 파일 1개를 남긴다 | 파일·시각 확인 |
| AC-05 | 카드가 §4.3 형식·슬롯·지원 범위·결측 규칙을 따른다. 허용된 null은 보존하고 JSON의 NaN·무한대는 금지한다 | 형식 검사 |

### 9.3 운영 감시

| 지표 | 계산 | 조치 기준 |
|---|---|---|
| 일별 80% 포함률 | B3 채점의 `in_band80` | 19거래일 이동 평균이 우연 범위 하한 미만이면 재검토. 하한은 S1의 날짜별 변동으로 다시 계산해 정한다(미결 TBD-04) |
| 등급별 방향 일치 | B3 채점의 `by_grade` | 높음 > 보통 > 낮음 순서가 20거래일 이동 평균에서 깨지면 재검토 |
| 산출 종목 수 | 카드 `stocks` 길이 | 전일 대비 10% 넘게 줄면 수집 점검 |

## 10. 제약 및 미결 사항

### 10.1 제약 사항

| ID | 내용 |
|---|---|
| CON-01 | DART 공시는 접수 날짜만 제공한다. T 당일 접수 공시(장 전 잠정실적 포함)는 쓰지 않는다 |
| CON-02 | 근월물 표(`src/common.py`의 `FRONTS`)는 2027-03-11 만기분까지 있다. 이후 계약을 추가해야 한다 |
| CON-03 | 종목 목록은 200종목 고정이다. 편입·편출·상장폐지를 반영하지 않는다 |
| CON-04 | 시가·종가는 KIS 일봉 값이다. E81 저장 비교표의 2026-09-14~10-26(14종목·26일·364행)에서 우리 시가·전일 종가와 KRX 시가·기준가가 원 단위로 일치했다. 다른 186종목·실시간 수신과 공급자 전체 정의의 공식 동등성은 미확인이다(모델 설계서 §3.2). 원천 재조회까지 새로 검증했다는 뜻은 아니다 |
| CON-05 | 실시간 NXT 분봉 조회 API(`FHKST03010200`, `inquire-time-itemchartprice`)는 과거 수집 API와 다르다. 운영 전 봉 라벨·지연을 확인해야 한다 과거 수집 API(`FHKST03010230`, 시장 NX) 저장분은 크레온 1분봉 대조에서 시작 시각 표기가 사후에 강하게 지지됐다(사전 기준 99%에 못 미친 96.2%이고, 불일치는 받은 날 기준 수정주가 차이). 저장분 가격은 받은 날 기준 수정주가였다(E88). 실시간 API에는 적용하지 않는다. |
| CON-06 | 액면분할 등 기업행사에 따른 가격 불연속을 처리하는 규칙이 없다 저장 자료(200종목, 2024-10~2026-10)에서는 조정 사건 29건 중 26건의 시가갭이 수정주가 기준이었고 3건은 결측, 가짜 갭 0건이었다(E88). 실시간 원주가 수신과 기준을 맞추는 규칙은 여전히 필요하다. |
| CON-07 | 만기일(3·6·9·12월 둘째 목요일) 밤에도 야간 세션은 열리고 다음 계약이 거래된다. 수집기(`collect_futures`, `live_refresh.front`)는 `FRONTS`의 근월물 기간으로만 조회해 이 밤을 받지 않는다. 그래서 만기 다음 거래일은 `missing_night` 상태 카드가 된다(1년 4일, 다음은 2026-12-11). 근거는 모델 설계서 v2 §3.3이다 |

### 10.2 현재 구현 대비 보완 항목

| ID | 요구사항 | 상태 | 내용 |
|---|---|---|---|
| GAP-01 | §8 휴장일 실행 금지 | 해소(1.1) | 국내휴장일조회로 확인, 휴장일 상태 카드 |
| GAP-02 | §8 야간 신호 무효일 사유 기록 | 해소(1.1) | `no_signal` 상태 카드와 `reason` |
| GAP-03 | FR-10 슬롯별 파일명·덮어쓰기 금지 | 해소(1.1) | `card_<T>_<slot>.json`, 같은 이름이면 `_vN` |
| GAP-04 | NFR-05 처리 시간 | 해소(1.1) | 직전 폴더 이어받기(`--base auto`), NXT 중복 날짜 생략 |
| GAP-05 | §2.2 처리 일정 | 미해소 | 거래일 06:05·08:11·09:05 자동 실행 |
| GAP-06 | FR-09 사용자 보유 입력 | 미해소 | 예시 계좌(`common.ACCOUNTS`) 대신 보유 정보 입력 연동 |
| GAP-07 | §4.3 사용자 문구 | 미해소 | `detail`·`account_band.status` 문구의 내부 용어를 표준 용어로 교체 |

### 10.3 결정 필요 사항

| ID | 사항 | 선택지 |
|---|---|---|
| TBD-01 | 화면 기본 수준 | 80% 단독 / 80% + 자세히 보기 90% |
| TBD-02 | 08:11 구간 교체 | 07:30 구간 유지 / NXT 중심 구간으로 교체 종목 08:11 규칙(D08 등급·E78 분해)은 처음 보는 과거 74일에서 통과했다(E89). 계좌 08:11 띠 비교(E92)는 design 판정 불가·GR0 대비 우위 미확인으로 종료했다. |
| TBD-03 | 계좌 구간 후속 연구·표시 | 현재 AS1 제공은 보류하되 연구를 종료하지 않는다. E85 진단을 바탕으로 공통 충격·종목별 오차 분리, 08:11 관측 추가, 날짜 묶음 판정 등 대안을 연구 계약 검토 → 개발용 과거 비교 → 새 자료 검증 → 표시 결정 순으로 진행한다(모델 설계서 §5.6). 과거 진단을 새 검증 결과로 취급하지 않는다 E87(부호 분위·공동 척도 3후보)은 모두 v2 미달, E92(08:11 G 중심 고정 조건부 폭)는 판정 불가로 종료했다. 계좌 숫자 보류를 유지한다. |
| TBD-04 | 운영 감시 하한 | S1 기준 우연 범위 재계산 후 확정 |
| TBD-05 | 만기일 밤 처리 | 지금처럼 만기 다음 날 신호 없음 / 다음 계약의 \(D\) 주간·야간으로 같은 계약끼리 \(x\) 계산. E82는 규칙상 미달(이음 확인 C3), 회복일 오차·기존 날 영향은 통과. 12/10 만기 전에 결정 E81: 그 밤 거래량이 가장 많은 계약을 고르는 규칙(근월·차근월을 모두 받는다는 전제)은 E82와 같은 결과를 내는 일반 규칙이다. |

## 부록 A. 파라미터 일람

| 파라미터 | 값 | 단위 | 위치 |
|---|---|---|---|
| H 창 길이 | 250 | 유효 관측 개수 | `i24_panel.prior_point_models(window)` |
| H 최소 관측 | 120 | 개수 | `i24_panel.prior_point_models(minimum)` |
| H 선택 경계 | 0.3 | \(R^2\) | `i24_panel.prior_point_models` |
| F2 당김 | 1/2 | 비율 | `i24_panel.prior_point_models` |
| F2 절편 | 없음(원점 통과, 기울기 \(\beta^0\)) | — | `i24_panel.prior_point_models` |
| 지수가중 감쇠 | 0.94 | — | `i24_panel.prior_ewma`, `e62_band.prior_rms` |
| \(s^H\) 창·최소 | 250, 20 | 개수 | `e62_band.prior_rms` |
| \(s^{06}\) 창·최소 | 250, 60 | 개수 | `i24_panel.build_panel` |
| 보정 표본 | 20 | 거래일 | `range_models.split_history(calibration_days)` |
| 학습 표본 최소 | 60 | 거래일 | `range_models.split_history(minimum_train_days)` |
| 특징 절단 | 1%, 99% | 분위 | `e62_band.fit_scale` |
| 로그 보정 | 0.001 | — | `e62_band.fit_scale` |
| Huber 상수·반복 | 1.35, 8 | —, 회 | `e62_band.fit_scale` |
| 로그 척도 절단 | −8 ~ 8 | — | `e62_band.fit_scale` |
| 구간 분위 | 0.8, 0.9 | 누적 비율 | `e62_band.forecast_day` |
| 등급 정규화 | C = 1.0, 반복 400 | — | `e62_band.logit_prob` |
| 등급 학습 최소 | 60 | 거래일 | `morning_card.grade` |
| 등급 경계 | 0.75, 0.90 | 확률 | `e62_band.CUTS["D08"]` |
| 종목 분할 시드 | 20261102 | — | `e62_band.SEED` |
| NXT 분봉 창 | 080000 ~ 081000 | 과거 분석의 시작 시각 가정. 실시간 의미 미확인(CON-05) | `i24_panel.traded_nxt` |
| 세션 종료 판정 | 주간 15:50, 야간 다음 날 06:05 | KST | `live_refresh.finished` |
| KIS 재시도 | 최대 5회(한도 1초, 오류 2초 대기), 간격 0.12초 | — | `live_refresh.kis_get` |

값의 근거와 다른 값으로 바꿨을 때의 민감도(E86)는 모델 설계서 v2 §9에 있다.

## 부록 B. 요구사항-소스 대응표

| 요구사항 | 파일 | 함수 |
|---|---|---|
| FR-01 | `workbench/live_refresh.py` | `trading_day`, `parse_open`, `pick_base`, `premarket_todo`, `refresh_futures`, `refresh_stocks`, `refresh_ks200`, `refresh_premarket`, `finished`, `kis_get` |
| FR-02 | `workbench/live_refresh.py` | `refresh_dart` |
| FR-03 | `workbench/live_panel.py`, `workbench/i24_panel.py` | `add_today`, `night_flags`, `make_calendar` |
| FR-04 | `workbench/i24_panel.py` | `stock_labels` |
| FR-05 | `workbench/i24_panel.py` | `prior_point_models` |
| FR-06 | `workbench/e62_band.py`, `workbench/range_models.py` | `prior_rms`, `run_candidates`, `forecast_day`, `fit_scale`, `split_history`, `weighted_quantile`, `day_weights` |
| FR-07 | `workbench/i24_panel.py`, `workbench/e62_band.py`, `workbench/morning_card.py` | `traded_nxt`, `build_panel`, `prior_ewma`, `logit_prob`, `grade` |
| FR-08 | `workbench/e62_band.py`, `workbench/morning_card.py` | `classify`, `event_flags`, `build_card` |
| FR-09 | `workbench/morning_card.py` | `build_card` |
| FR-10 | `workbench/morning_card.py`, `workbench/live_panel.py` | `build_card`, `status_card`, `card_path`, `main`, `signal_of` |
| FR-11 | `workbench/runs/claude_live_r1/check_open.py` | `opens`, `main` |
