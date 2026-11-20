#!/bin/zsh
# 고객 화면 열기: 서버가 꺼져 있으면 켜고 브라우저를 연다. 창을 닫아도 서버는 계속 돈다(끄기: lsof -ti tcp:8520 | xargs kill).
cd "$(dirname "$0")"
OB=$(cd .. && pwd)
if [ -f "$OB/local.conf" ]; then set -a; . "$OB/local.conf"; set +a; fi
PY=${PY_APP:-$(dirname "$OB")/.venv/bin/python}; [ -x "$PY" ] || PY=python3
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8520/api/meta; then
  nohup "$PY" -m uvicorn api.index:app --host 127.0.0.1 --port 8520 > /tmp/4digit_front.log 2>&1 &
  disown
  for i in {1..30}; do curl -s -o /dev/null --max-time 1 http://127.0.0.1:8520/api/meta && break; sleep 0.5; done
fi
open "http://127.0.0.1:8520"
