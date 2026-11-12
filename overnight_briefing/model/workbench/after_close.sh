#!/bin/zsh
# 장 마감 뒤 한 번: 그날(T) 주간장까지 이어 받아 E100 전방 기록, 빗나간 종목 해부(E104 v2), 앱 날짜 파일을 갱신한다. 반복 예약 아님.
# 사용: workbench/after_close.sh 20261110   (16:05 전에 실행하면 16:05까지 기다렸다가 시작)
# 11/10 정정: live_refresh는 그날 종가를 16:00 뒤에만 넣는다. 15:55에 시작하면 그날이 빠진 채 E100이 다시 계산됐다.
#             그래서 16:05까지 기다리고, 그날 종가가 안 들어왔으면 E100·해부·앱을 건드리지 않고 멈춘다.
T=$1
cd ~/4Digit/research/overnight_backtest
until [ "$(date +%H%M)" -ge 1605 ]; do sleep 60; done
echo "=== 자료 이어 받기 $(date +%H:%M:%S)"
PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name ${T}c --env ~/4Digit-solo/.env --until $T 2>&1 | tail -3
grep -o '"universe_daily_last": "[0-9]*"' workbench/live/${T}c/refresh_manifest.json
if ! grep -q "\"universe_daily_last\": \"$T\"" workbench/live/${T}c/refresh_manifest.json; then
  echo "그날($T) 종가가 아직 없다 → E100·해부·앱 갱신 안 함(기존 기록 유지). 나중에 다시: workbench/after_close.sh $T"
  exit 1
fi
echo "=== E100 $(date +%H:%M:%S)"
PYTHONPATH=.:src .venv/bin/python workbench/e100_forward.py --root workbench/live/${T}c 2>&1 | tail -16
echo "=== E104 v2 빗나간 종목 해부(사업 기준 업종) $(date +%H:%M:%S)"
~/4Digit/.venv/bin/python workbench/e104_miss_anatomy.py --no-news --segments --root live/${T}c --out runs/claude_miss_r2 2>&1 | head -14
echo "=== 앱 날짜 파일 $(date +%H:%M:%S)"
.venv/bin/python ~/4Digit/src/app/pipeline/build_forward_days.py --root workbench/live/${T}c 2>&1 | tail -3
echo "=== 끝 $(date +%H:%M:%S)"
