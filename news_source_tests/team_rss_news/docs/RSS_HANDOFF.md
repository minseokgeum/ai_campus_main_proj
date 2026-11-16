# RSS 통합 코드 인수인계

**2026-11-05 변경: 사용자 결정으로 WIRED를 RSS·본문 모두 신규 수집에서 제외했다. 현재 통합 실행 대상은 19개 매체·36개 피드다. 아래 20개·38개 수치는 제외 전 조사 이력이며, 실제 대상은 --show-config로 확인한다. 기존 WIRED 결과는 삭제하지 않는다.**

## 목적과 현재 범위

검색어 없이 20개 매체·38개 RSS 피드에서 기사 목록을 수집하고, 매체별 추출·정제 함수를 적용해 본문 후보와 이력을 누적한다. 그래프 DB·관계 추출은 포함하지 않는다.

**전 매체의 정제된 전문 확보를 보장하는 완성본은 아니다.** 코드 실행·데이터 누적은 통합했고, 표본에서 확인한 규칙과 미검증 후보 규칙을 구분한다. 본문이 있어도 전문 검증·분석 승인은 기본값 0이다. 요약만 있는 기사를 정상 본문으로 대체하지 않는다.

## 전달할 파일

- `src/rss_pipeline.py`: 새 환경에서 RSS → 본문 → 정제 → SQLite 저장을 실행하는 진입점.
- `src/integrated_notebook_bodies.py`: 매체별 추출·정제 규칙. 두 파일은 같은 폴더에 둔다.
- `config/feed_registry.csv`, `config/new_feed_candidates_20261029.csv`: 두 설정에서 허용된 20개 매체·38개 주소를 선택한다. 보류·비활성 행은 요청하지 않는다.
- `requirements.txt`, 이 설명서, `docs/media_review_decisions.md`: 환경·검토 기록.
- `notebook/rss_handoff.ipynb`: 선택 사항. 기존 실험 노트북 없이 실행·조회하는 짧은 예제.
- `tests/test_rss_pipeline.py`: 네트워크 없는 회귀 검증.

기존 DB·기사 전문·outputs는 실행에 필요하지 않다. 각자 새 DB를 생성한다. 코드 저장소에 기사 전문·인증정보를 포함하지 않는다.

## 설치·실행

프로젝트의 `rss_news` 폴더에서 실행한다. 팀원은 자신이 사용하는 Python 환경을 활성화한다. 필요한 경우에만 의존성을 설치한다.

```powershell
python -m pip install -r requirements.txt
```

네트워크 없이 설정 확인:

```powershell
python src/rss_pipeline.py --show-config
```

첫 소량 실행: 모든 RSS를 확인하고 매체별 대기 본문 최대 1건 처리.

```powershell
python src/rss_pipeline.py --collect --body-per-source 1
```

본문 요청이 가능한 최대 매체 수는 18개다. Zacks·MIT는 RSS만 유지한다. 대기 항목이 없으면 본문 요청은 생략된다.

RSS만 받기:

```powershell
python src/rss_pipeline.py --collect --body-per-source 0
```

10분 간격 시험: 실행 직후 한 번 수집하고 각 실행이 끝난 다음 600초를 기다린다. 총 3회 후 종료한다. Ctrl+C로 중단 가능하다.

```powershell
python src/rss_pipeline.py --collect --body-per-source 3 --cycles 3 --interval-seconds 600
```

본문 상한은 처리량 조절용이다. 발행량보다 처리량이 작으면 대기열이 늘어난다. 모든 본문을 한 번에 처리한 것으로 해석하지 않는다. 날짜 조건은 없으며 RSS에 현재 노출된 항목만 받는다. RSS의 과거 전체 기사 복원 기능은 아니다.

## 저장 위치와 상태

- 새 통합 DB: `data/combined_rss.sqlite3`. 실행 시 자동 생성. 기존 `outputs/continuous_notebook_test/articles.sqlite3`는 변경하거나 자동 병합하지 않는다.
- 실행 결과: `outputs/combined_rss/<UTC 실행 시각>/`. 피드 원본 응답, 피드별 성공·실패, 본문별 상세 JSON, 요약·실행 조건을 보존한다.
- `articles`: 정규화 URL·원래 URL, 매체·제목·발행일, 최초 발견·최근 확인, RSS 요약·RSS content, 추출 원문·정제 본문·상태·방식.
- `article_feeds`: 동일 기사가 여러 피드에 실린 출처·확인 이력.
- `body_attempts`: 본문 수집 시도별 결과·정제 삭제 기록·오류. RSS 원본은 실행별 파일로 보존.
- `pending`: 아직 본문 요청 전. `candidate_review`: 기존 표본 확인 규칙의 본문 후보. `integration_review`: 추가 후보 규칙의 본문 후보.
- `body_hold`: 매체별 원문 보류. `video_review`, `live_review`, `type_review`, `subscription_review` 등: 유형·구독 검토. `no_body_container`, `no_body`, `restricted`, `extraction_error`: 실패 원인별 상태.
- 실패·검토 항목은 자동 재시도하지 않는다. 규칙 수정 후 해당 URL을 별도로 검토·재처리해야 한다.

기존 본문이 있는 URL을 재요청·덮어쓰지 않는다. 원문 수정사항을 자동 재수집하는 기능, 매체 간 동일 보도 의미 중복 판정은 없다. 알려진 URL 추적 인자만 제외하며 서로 다른 URL의 본문 동일성까지 합치지 않는다.

동일 DB 동시 실행을 막는 `.lock` 파일을 사용한다. 비정상 종료 후 남으면 실행 중인 수집이 없는지 확인하고 잠금 파일만 제거한다. DB를 삭제하지 않는다.

## 규칙 적용·제한

| 매체·항목 | 반영한 규칙 | 남은 확인 |
|---|---|---|
| Engadget | 빈 첫 영역을 건너뛰고 전체 본문 영역 탐색 | 새 페이지 구조 변경 감시 |
| CNBC | 본문 영역, 라이브·영상·구독 경로 분리, 확인한 Pro 구독 장벽 문구 | URL·문구에 드러나지 않는 구독 형태 |
| BBC | 일반 기사 경로, 확인한 관련 링크·뉴스레터 문단 제거 | 다른 문구·실제 태그 목록의 분리 |
| Guardian·TechCrunch | 본문 영역 및 영상·라이브 등 별도 유형 분리 | 새로운 홍보 영역 |
| ABC | 기사 주소 검사, 위젯·잘못 결합된 URL 제외, Popular Reads 영역 제거 | 다른 추천 형식 |
| Business Insider | 실제 확인한 post-body-content 추가 | **구독 제한 표본의 전문·누락 대조 불가. 표본 성공으로 자동 승인 금지** |
| Ars Technica | 실제 확인한 article .post-content 추가 | 사용자 표본 확인 완료. 모든 기사 전문 검증은 아님 |
| Motley Fool | 확인한 무료 은퇴 보고서 홍보 제목·문단·추적 링크 조합 제거 | 다른 상품·보고서 홍보 형식. 금액·주제 단어만으로 삭제하지 않음 |
| NBC | 복수 본문 블록 수집, subscriberRecirc 추천 카드 제거 | 새로운 추천 형식·기자 소개 |
| Al Jazeera | Recommended Stories 영역만 제거 | 다른 관련 링크 형식 |
| Fox | 사진·영상 영역, 확인한 추천·앱 홍보·캡션·기여자 표기 분리 | 확인한 표본 중심의 규칙. 모든 홍보·사진 형식 지원을 보장하지 않음 |
| Fortune·CBS 등 | 매체별 본문 후보 위치와 명확한 부가 요소 제거 | 행사 홍보·CTA·캡션·기여자 표기 전체 제거는 미완료 |
| NPR | 현재 페이지의 대본 후보 영역 우선 탐색 | **별도 Transcript 링크 탐색·소개문과 대본 충분성 구분 미완료** |
| ProPublica | 본문 후보 영역 | 라디오 유형·제보·팟캐스트 안내 정제 미완료 |
| IEEE Spectrum | 본문 후보·일부 관련 영역, 확인한 추천 제목·링크 4개 제외 | **시·문예 태그 분류·다른 추천 형식 제거 미완료** |
| WIRED | 본문 후보 위치 | 구독 제한·쿠폰 기사 유형 판별 미완료 |
| Zacks·MIT | RSS만 수집하고 원문 자동 요청 보류 | Zacks 원문 차단 이력, MIT 구독으로 전문 대조 불가 |

로그인·구독 제한·캡차·자동화 차단은 우회하지 않는다. 보류 매체를 정상 본문 확보 매체로 보고하지 않는다.

## 검증 및 다음 담당자 확인

```powershell
python -m unittest discover -s tests -p test_rss_pipeline.py -v
```

네트워크 없이 20개 매체·38개 피드 설정, 새 DB 생성·중복 방지·피드 다중 출처, 본문 재요청 방지, 실패 후 다음 기사 계속 처리, 보류·잘못된 주소 제외, 실제 확인한 본문 선택자 및 Motley Fool 홍보 제거·이후 정상 문단 유지가 검증됐다.

**새 실행 파일로 실제 전체 원문 수집은 아직 재검증하지 않았다.** 기존 통합 본문 실행 기록은 2026-11-04에 15개 매체 후보 확보·2개 미추출·2개 보류·Engadget 대기 없음이었다. 이후 Business Insider·Ars 본문 위치를 수정했고, Ars는 사용자 본문 확인 완료, Business Insider 표본은 구독으로 원문 대조 불가였다.

인수 후 첫 작업은 소량 명령 1회 실행 → summary·실패·본문 경계 확인이다. 전문 검증과 관계표 승인 기능은 별도로 구현해야 한다.
