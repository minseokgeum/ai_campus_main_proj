# 밤사이 뉴스 프롬프트(nightly_prompt)

최종 수정: 2026-11-16 (KST)

민석의 밤사이 처리 결과(`news_search/source/nightly/<보고 날짜>/morning_1차·2차/prompt_inputs.jsonl`)를 받아,
효은 추출 지시문(수정3)으로 묶음마다 정보를 뽑고, 종목마다 07:30 노란띠와 연결된 뉴스를 한 줄로 묶어 아침 브리핑 자료(`brief.json`)를 만든다.

```
prompt_inputs.jsonl ─ extract.py(묶음 1개 = 요청 1건) ─┬─ 종목 뉴스(관련 있음만, 같은 이야기는 하나)
                                                       ├─ 시장 뉴스(scope = 시장 전체)
07:30 카드 띠(days/<T>.json) ─ combine.py ─────────────┴─ 종목 한 줄 · 시장 한 줄 → out/<T>/brief.json
```

## 실행

```bash
~/4Digit-solo/.venv/bin/python run.py 20261116 --dry          # 호출 없이 입력 수·예상 비용
~/4Digit-solo/.venv/bin/python run.py 20261116 --max-cost 8   # 실행(상한을 넘으면 새 호출을 멈춘다)
```

- 모델: `gpt-6.1-terra`, effort medium, Responses API, JSON 스키마 엄격 모드, `store=False`. 그래프 구축 때와 같다(`nightly_prompt_requirements.md` 6장).
- 키는 `~/4Digit-solo/.env`에서 읽는다(`NIGHTLY_ENV_FILE`로 바꿀 수 있다). 값은 어디에도 쓰지 않는다.
- 같은 입력·지시문·모델이면 `out/raw/`의 원본 응답을 다시 쓴다(다시 돌려도 비용 0). 원본 응답에는 입력·토큰·비용이 함께 남는다.
- 본문이 없는 묶음(`body_ok: false`, 대부분 기사 아닌 페이지)은 부르지 않는다.
- 띠 파일 위치는 `NIGHTLY_DAYS_DIR`(기본 `~/4Digit/src/app/data/model/days`).

## 파일

| 파일 | 내용 |
|---|---|
| `prompts/nightly_extract_v1.md` + `.schema.json` | 묶음 추출: scope·기사 파악·제공 기업·관련 기업·기타 주체·시장 반응·사실·근거(효은 수정3) + 종목별 관련 판단·새 내용 판단(요구사항 3·4장) |
| `prompts/combine_v1.md` + `.schema.json` | 종목 한 줄: 띠 숫자 그대로, 뉴스는 나란히, 인과 단정·권유 금지 |
| `prompts/market_v1.md` + `.schema.json` | 시장 한 줄: 야간선물 변화율 + 시장 전체 뉴스 1~2개 |
| `extract.py` | 입력 글 만들기, OpenAI 호출·캐시·비용, 코드 검사(근거 인용이 원문에 그대로 있는지, 종목 목록, 금지어) |
| `combine.py` | 07:30 카드 띠 읽기(개장 뒤 결과는 읽지 않음), 종목·시장 한 줄, 숫자·인과·금지어 검사. 검사에 걸리면 규칙 문장으로 바꾸고 `checked=false` |
| `run.py` | 전체 실행, `out/<T>/brief.json`·`extract.jsonl` |

## brief.json

```
{T, generated_at, model, effort, prompt_version, prompt_hashes, note, inputs,
 stocks: {종목코드: {name, code, band:{H, L80, U80, grade_0811} | null,
          news: [{id, short_summary_ko, article_types, article_types_ko, title, url, source, published_at,
                  story:{id, status, novelty, novelty_note}, media_count, article_count,
                  relation:{path, evidence, source_ref, search_terms, term_kinds},
                  tone, scope, link_kind, reason, impact, impact_basis, facts, batch, checked, issues}],
          combined: {line_ko, stance, news_direction, used_news, checked, source, issues}}},
 market: {line_ko, x, checked, source, items:[...]},
 usage: {new_calls, cache_hits, cost_usd, tokens}}
```

- 뉴스 순서: 종목 고유 연결 → 서로 다른 매체 수 → 기사 수. 1차·2차에 같은 이야기가 있으면 매체 수가 많은 쪽(같으면 2차)만 남긴다.
- `stance`: `aligned`(뉴스 방향이 띠 중심 H와 같은 쪽) / `opposed` / `unclear` / `no_news`. 띠는 뉴스로 바뀌지 않는다.
- 띠가 없는 종목(200종목 밖)은 `band: null`이고 한 줄에도 그렇게 적는다.

## 2026-11-16 첫 실행

- 묶음 86개 중 본문 있는 77개 추출, 호출 89건(시험 1·숫자 검사 고친 뒤 1 포함), **$0.98**(본 실행 입력 386k 중 캐시 304k, 출력 173k 토큰). 묶음당 약 4초(동시 8건), 전체 약 5분.
- 시험 종목 18개, 뉴스 있는 종목 10개, 종목 뉴스 31건, 시장 뉴스 12건. scope: 산업·기업 56, 시장 전체 12, 무관 9.
- 관련 판단이 검색 잡음을 걸렀다: 종목-묶음 97쌍 중 32쌍만 관련(대한항공 14→0 'Shell' 다른 뜻, 크래프톤 17→0 Microsoft 잡음).
- 근거 인용 검사 실패 1/77(`20261116_1차_337`).
- 고칠 것
  1. 종목 쪽 영향(`impact_for_stock`)이 31건 모두 '불명'이었다. 연결 관계(공급·경쟁)를 따라 방향을 정할 수 있는 예를 지시문에 넣은 v2를 시험한다.
  2. 약한 연결이 남는다: 배당주 목록 기사의 'DHT 유조선' → HD한국조선해양·한화에어로스페이스, 중국 자율주행 기사의 Mercedes-Benz → POSCO홀딩스. 본문에서 스치기만 한 언급은 관련 없음으로 두는 규칙을 더한다.
  3. 제목이 "report"인 기사(예: 젠슨 황 복귀 검토)를 한 줄에 옮길 때 "보도에 따르면"이 빠질 수 있다.
  4. 본문 기사 `url`이 비어 있는 묶음이 있다(입력 쪽).
- 결합 설명력 평가는 실험 장부 E106(`research/overnight_backtest/docs/experiments.html#e106`).

## 효은 2.5~2.7 ↔ 그래프 스키마(news_v5) 맞춤안

밤사이 추출도 그래프에 쌓이므로(요구사항 5장) 관계 이름·방향을 `graph_db/prompts/news_v5.md`에 맞춘다. 지금 v1은 효은 수정3 정의를 그대로 쓰고, 아래는 v2에서 바꿀 안이다.

**2.5 관련 기업(`related_companies.role`) → news_v5 `relations.role`(주체 → 대상 방향 포함)**

| 효은 role | news_v5 role | 방향 |
|---|---|---|
| supplier / customer | 공급(파는 쪽 → 사는 쪽), 사는 쪽 시점이면 구매·사용 | 효은은 primary 기준 상대 역할만 적으므로 주체·대상을 분명히 적는 칸이 필요 |
| acquirer / target | 인수·투자(사는 쪽 → 대상). 파는 쪽이 있으면 매각 | |
| partner | 합작·제휴 | 순서 무관 |
| competitor | 경쟁 | 기사가 경쟁이라고 말할 때만(같음) |
| investor | 지분이면 인수·투자, 지분 없는 돈이면 자금 지원 | |
| potential_beneficiary | 영향(원인 개체 → 기업, direction +) | news_v5의 영향은 원인이 정책·원자재·사건 개체여야 한다 |
| other | 기타 + role_note | |
| (없음) | 수주·발주, 생산, 라이선스, 규제·인허가, 시설 건설·운영, 소송·분쟁, 정책 입장 | 효은 목록에 없어 '기타'로 빠진다. news_v5 15역할을 그대로 쓰는 쪽을 권장 |

- 효은 `impact`(유리·불리·무관·혼재)는 news_v5에 칸이 없다(영향의 direction만 있음). 브리핑용으로 남기고 그래프에는 넣지 않는다.

**2.6 기타 주체(`others`)**: news_v5는 사람을 개체로 넣지 않는다. `government_regulator`는 개체 type 기관으로 넣고 관계는 규제·인허가 / 자금 지원 / 정책 입장으로 둔다. `person`은 브리핑 문장(statements의 speaker)에만 쓰고 그래프에는 넣지 않는다.

**2.7 시장 반응(`market_reaction`)**: news_v5는 주가 등락을 뽑지 않는다. 브리핑 화면용으로만 두고 그래프에는 넣지 않는다. 지수·업종 움직임이 기사의 주제이면 events의 '가격·지표 변동'(숫자 없이)으로 남길 수 있다.

**그 밖**: news_v5 `relevant`는 `scope`(시장 전체 / 산업·기업 / 무관)로 바꾼다(요구사항 5장). 종목 연결 근거(`relation.path`)는 그래프 근거 문장을 그대로 쓴다.
