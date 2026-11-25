# 당신이 잠든 사이에 · 장 전 브리핑 (노란띠)

밤사이 미국 장과 코스피200 야간선물이 이미 반영한 변화를, 내 보유 종목의 예상 시작가·80% 예상 범위(노란띠)·금액으로 바꿔 보여 주는 증권사 앱 안 아침 브리핑의 **모델과 1차 데모**다.

| 폴더 | 무엇 | 안내 |
|---|---|---|
| `model/` | **노란띠 모델**(팀원 원본. 서버 운영·수정은 저장소 루트 `night_model/`에서, 2026-11-25부터): 고정 규칙(2026-11-02 15:17), 자료 이어 받기, 06:30·08:11 카드, 개장 직후 채점, 규칙 확정 뒤 기록, 특별한 날 달력. 하루 실행기 두 가지(파일 `run_day.sh`, 서버 DB `run_model.py`) | [`model/README.md`](model/README.md) |
| `service/` | 1차 데모 화면·API·배포(https://4digit-demo.vercel.app). 수연 버전 `/`, 원래 버전 `/orig/` | [`service/README.md`](service/README.md) |
| `app/` | 화면 자료 만들기(`app/pipeline`: 카드·채점·야간 1분봉 → 날짜 파일)와 Streamlit 검증 화면. `service/`가 `app/core`의 읽기 함수를 그대로 쓴다 | [`app/README.md`](app/README.md) |
| `nightly_prompt/` | 밤사이 AI 브리핑(뉴스 처리 결과 + 노란띠 → 종목별 한 줄) | [`nightly_prompt/README.md`](nightly_prompt/README.md) |
| `docs/` | 모델 설계서·기술 명세서·화면 설계·실험 장부 | 브라우저로 html 열기 |

## 어떻게 이어지나

```
model/run_day.sh 0730 · 0811 · open · close      (서버: model/run_model.py → DB model 영역 → 고객 화면 web/)
   │  카드·채점·기록: model/workbench/runs/
   ▼  (1차 데모) DATA_ROOT가 있으면
app/pipeline/*.py  → 화면 날짜 파일(DATA_ROOT/model/days/<T>.json, 야간 1분봉, 어제 저녁 NXT)
   ▼  PUBLISH=1이면
service/publish.sh → 스냅샷(service/data) → Vercel 배포
```

## 설정

- **키**: 저장소 루트 `.env`에 `KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_ENV`(비우면 실전)·`DART_API_KEY`, 밤사이 AI 브리핑은 `OPENAI_API_KEY`, 다가오는 일정의 미국 실적 발표일은 `FINNHUB_API_KEY`(선택). git에 올리지 않는다.
- **컴퓨터마다 다른 경로**: `local.conf.example`을 `local.conf`로 복사해 채운다(엔진 폴더, 화면 자료 폴더, 파이썬, 배포 여부). git에 올리지 않는다. 비우면 저장소 안 위치를 쓴다. 코드에는 개인 컴퓨터 경로를 적지 않는다.
- **날짜를 코드에 적지 않는다**: 휴장·개장 시각·개장 전 거래 여부는 `model/market_calendar/special_days.csv`(기준과 출처는 `model/README.md` 5장).

## 지금 기록의 성격

- 노란띠·믿을 정도 규칙은 2026-11-02 15:17에 고정했다(`model/workbench/e62_band.py` sha256 `b9599c96…`). 그 뒤에 온 날만 처음 보는 검증이다.
- 규칙 확정 뒤 14거래일(11/3~11/20, 200종목, 2,800종목-날): 시가가 80% 범위 안 77.6%, 시가 오차 H 1.62%p vs 야간선물 그대로 2.17%p, 08:11 '높음' 종목의 개장 전 거래 방향 = 시가 방향 96.1%(928). 날짜가 적어 판정이 아니라 쌓아 가는 기록이다. 1차 데모가 16:05에 받은 종가 문제(`model/README.md` 결정할 것 2)가 이 숫자에 주는 영향은 아직 세지 않았다.
- 예상 범위는 과거 비슷한 아침에 실제 시가가 들어온 정도로 만든 참고 범위다. 확률이나 수익 보장이 아니며 매매 권유가 아니다.
