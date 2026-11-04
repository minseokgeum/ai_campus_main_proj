# 주피터 통합 본문 처리

`src/integrated_notebook_bodies.py`는 저장된 시험 DB의 대기 기사에 대해 매체별 본문 함수를 연결한다. 기존 운영용 `continuous_collect.py`를 교체하지 않으며 RSS 재수집·주기 실행도 수행하지 않는다.

- 기본 DB: `outputs/continuous_notebook_test/articles.sqlite3`
- Engadget·CNBC·BBC·Guardian·TechCrunch·ABC: 저장된 노트북의 최신 함수를 추출했다. 기존 표본 성공은 매체 전체의 전문 검증이 아니다.
- 나머지 12개 매체: 통합 후보 선택자. 결과는 `integration_review`로 표시하며 새 통합 규칙의 성공·정제 충분성을 추가 확인해야 한다.
- Zacks: 기존 원문 차단에 따라 원문 요청 보류. RSS 데이터는 유지.
- MIT: 구독 제한으로 전문 대조를 못 한 표본이 있어 자동 처리 보류.
- NPR 별도 대본 링크 탐색, IEEE 태그 기반 시·문예 분류, 매체별 모든 홍보 영역 제거는 미완료다. 결과 상세 파일에 주의사항을 기록한다.
- 모든 결과는 전문 미검증이며 관계표 분석 자동 승인 기능은 없다. 후보 본문을 summary로 대체하지 않는다.

`run_batch(limit_per_source=1)`은 최대 18건의 원문을 요청한다. 기존 본문을 덮어쓰지 않고 `pending`만 처리한다. 기사별 결과 JSON과 요약은 `outputs/integrated_body_runs/`에 보존한다. 실패·검토 상태는 자동 재시도하지 않는다.

추가 규칙이 예전 노트북 코드와 일치하는 것으로 오해하지 않도록 후보 규칙을 별도 표시했다. DB를 사용하는 다른 수집 루프와 동시에 실행하지 않는다.

검증: 네트워크 없이 모듈 로딩, 20개 매체 등록, Engadget 빈 첫 영역, NBC 복수 블록·구독 추천 제거, ABC·Al Jazeera 중간 추천 제거 및 이후 문단 보존, BBC 안내 제거, 잘못된 URL·영상 경로 분류를 확인했다. 실제 18개 매체 전체 원문 요청은 실행하지 않았다.
