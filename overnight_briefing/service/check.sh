#!/bin/zsh
# 화면을 고친 뒤 한 번에 확인: 로컬 서버 다시 띄우기 → 화면 점검(smoke, 오류 0이어야 함) → 주요 화면 캡처(눈으로 볼 것).
# 사용: ./check.sh [캡처 폴더] [날짜 YYYYMMDD]     끝나면 캡처 폴더의 png를 열어 본다. 배포는 ./publish.sh
cd "$(dirname "$0")"
OUT=${1:-/tmp/ob_shots}; T=${2:-20261116}
kill $(lsof -ti tcp:8520) 2>/dev/null; sleep 1
nohup ~/4Digit/.venv/bin/uvicorn api.index:app --host 127.0.0.1 --port 8520 > /tmp/ob_uvicorn.log 2>&1 &
for i in {1..40}; do curl -s -o /dev/null http://127.0.0.1:8520/api/meta && break; sleep 2; done
for f in web/js/*.js; do node --check "$f" 2>&1 | head -3; done
~/4Digit/.venv/bin/python tests/smoke_front.py 2>&1 | grep -v WARNING | tail -2
~/4Digit/.venv/bin/python tests/shots.py http://127.0.0.1:8520 "$OUT" "$T" 2>&1 | tail -1
