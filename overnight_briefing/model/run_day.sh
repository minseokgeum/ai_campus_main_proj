#!/usr/bin/env bash
# 노란띠 하루 실행기(파일로 저장하는 방식). 서버 DB에 넣는 실행기는 run_model.py(같은 단계, 같은 고정 규칙).
#
# 사용: ./run_day.sh <단계> [YYYYMMDD]      (날짜를 안 주면 오늘, 한국 시각)
#   0730  끝난 장·야간선물 일봉·공시 이어 받기 → 07:30 카드(예상 시작가 H, 노란띠 80·90%) → 해시 기록 → 지난밤 1분봉
#   0811  NXT 08:00~08:10 받기 → 08:11 카드(믿을 정도). 개장 전 거래가 없는 날은 건너뜀. 개장 뒤면 멈춤(FORCE=1로만)
#   open  개장 1분 뒤까지 기다렸다가 두 카드를 그날 시작가로 채점
#   close 종가 확정(CLOSE_FETCH, 기본 20:10) 뒤 그날 일봉 받기 → 규칙 확정 뒤 기록(E100)
# 개장·마감 시각과 휴장·개장 전 거래 여부는 market_calendar/special_days.csv에서 읽는다(날짜를 코드에 적지 않는다).
#
# 설정(환경변수, 또는 overnight_briefing/local.conf에 KEY=값으로. local.conf는 git에 올리지 않는다)
#   ENV_FILE           키 파일(기본: 저장소 루트 .env). KIS_APP_KEY·KIS_APP_SECRET·KIS_ENV·DART_API_KEY
#   OVERNIGHT_RESEARCH 엔진 폴더(기본: 이 폴더). 자료(workbench/live)와 결과(workbench/runs)가 여기 쌓인다
#   PY_ENGINE          엔진 파이썬(기본: 엔진 폴더 .venv, 없으면 python3)
#   CLOSE_FETCH        종가 받는 시각 HHMM(기본 2010)
#   1차 데모 화면 갱신(선택): DATA_ROOT(화면 자료 폴더)가 있으면 app/pipeline으로 화면 파일을 만들고,
#                            PUBLISH=1이면 service/publish.sh로 배포, NIGHTLY=1이면 밤사이 AI 브리핑(nightly_prompt)
set -uo pipefail
export TZ=Asia/Seoul
HERE=$(cd "$(dirname "$0")" && pwd)
OB=$(dirname "$HERE"); REPO=$(dirname "$OB")
if [ -f "$OB/local.conf" ]; then set -a; . "$OB/local.conf"; set +a; fi
STEP=${1:?단계: 0730 | 0811 | open | close}
T=${2:-$(date +%Y%m%d)}
ENGINE=${OVERNIGHT_RESEARCH:-$HERE}
ENV_FILE=${ENV_FILE:-$REPO/.env}
PY=${PY_ENGINE:-$ENGINE/.venv/bin/python}; [ -x "$PY" ] || PY=python3
APP_PY=${PY_APP:-$REPO/.venv/bin/python}; [ -x "$APP_PY" ] || APP_PY=python3
CLOSE_FETCH=${CLOSE_FETCH:-2010}
CARDS=workbench/runs/claude_live_r1
cd "$ENGINE" || exit 1
export PYTHONPATH=.:src OVERNIGHT_RESEARCH="$ENGINE"

# 그날 달력: KRX_OPEN OPEN CLOSE PREMARKET KINDS
eval "$("$PY" "$HERE/market_calendar/special_days.py" show "$T")"
echo "=== $STEP $T 시작 $(date +%H:%M:%S) · 개장 $OPEN 마감 $CLOSE 개장 전 거래 $PREMARKET ${KINDS:+· $KINDS}"
[ "$KRX_OPEN" = 1 ] || { echo "$T KRX 휴장 → 할 일 없음"; exit 0; }

# 돌기 시작하면 끝날 때까지 맥이 잠들지 않게(맥에서만), 인터넷이 붙을 때까지 최대 3분 기다림
command -v caffeinate >/dev/null && ( caffeinate -i -s -w $$ & )   # 손자 프로세스로 띄워 아래 wait가 기다리지 않게
for _ in $(seq 18); do curl -s -o /dev/null --max-time 5 https://openapi.koreainvestment.com:9443 && break; sleep 10; done

is_today() { [ "$T" = "$(date +%Y%m%d)" ]; }
wait_until() { is_today && until [ "$(date +%H%M)" -ge "$1" ]; do sleep 30; done; return 0; }
refresh() { "$PY" -m workbench.live_refresh --env "$ENV_FILE" --until "$T" "$@" 2>&1 | tail -2 | cut -c1-240; }

make_card() {   # 슬롯 카드가 없을 때만 만든다(같은 날 다시 돌려도 _v2가 생기지 않게)
  local S=$1 C=$CARDS/card_${T}_$1.json
  if [ -f "$C" ]; then echo "$S 카드가 이미 있다 → 건너뜀"; return 0; fi
  "$PY" workbench/morning_card.py --date "$T" --slot "$S" --root "workbench/live/$T" --events "workbench/live/$T/dart_filings.csv" 2>&1 | tail -1
  echo "--- 고정 해시(시각이 남는 곳에 붙이면 사전 고정 증거)"; date "+%Y-%m-%d %H:%M:%S %Z"; cat "$C.sha256" 2>/dev/null
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $T $(cat "$C.sha256" 2>/dev/null | tr '\n' ' ')" >> $CARDS/seal_log.txt
}

screen() {      # 1차 데모 화면 파일(선택)
  [ -n "${DATA_ROOT:-}" ] || return 0
  "$APP_PY" "$OB/app/pipeline/$1" "${@:2}" 2>&1 | tail -1 | cut -c1-200 || echo "화면 파일 실패(계속)"
}
publish() { [ "${PUBLISH:-0}" = 1 ] && "$OB/service/publish.sh"; return 0; }

case $STEP in
0730)
  refresh --name "$T" --no-night
  make_card 0730
  echo "=== 지난밤 야간선물 1분봉 $(date +%H:%M:%S)"; refresh --name "$T" --night-only
  screen build_live_day.py --date "$T"
  screen evening_nxt.py --date "$T"
  if [ "${NIGHTLY:-0}" = 1 ]; then
    (cd "$OB/nightly_prompt" && "${PY_PROMPT:-$APP_PY}" run.py "$T" --max-cost 3 --workers 16 2>&1 | tail -3) || echo "밤사이 AI 브리핑 실패(계속)"
  fi
  publish ;;
0811)
  [ "$PREMARKET" = 1 ] || { echo "$T 개장 전 거래가 없는 날($KINDS) → 08:11 카드 없음"; exit 0; }
  NOW=$(date +%H%M)
  if is_today && [ "$NOW" -ge "$OPEN" ] && [ "${FORCE:-0}" != 1 ]; then echo "지금 $NOW: 개장 뒤라 장 전 고정이 아니다(FORCE=1로만 사후 계산)"; exit 1; fi
  if is_today && [ "$NOW" -lt 0811 ]; then echo "지금 $NOW: 08:11 전이라 NXT 08:10 봉이 없다"; exit 1; fi
  refresh --name "$T" --premarket-days "$T" --no-night
  make_card 0730          # 06:10 단계가 실패했을 때만 여기서 만든다
  make_card 0811
  screen build_live_day.py --date "$T"
  publish ;;
open)
  wait_until $((10#$OPEN + 1))
  for S in 0730 0811; do
    C=$CARDS/card_${T}_$S.json O=$CARDS/check_${T}_$S.json
    if [ -f "$C" ] && [ ! -f "$O" ]; then
      ("$PY" $CARDS/check_open.py --date "$T" --env "$ENV_FILE" --card "$C" --out "$O" 2>&1 | grep -oE '"in_band80": [0-9.]+' | head -1; echo " $S") &
    fi
  done; wait
  screen build_live_day.py --date "$T" --with-open
  publish ;;
close)
  # 16:00~20:00(NXT 애프터마켓)에는 KIS 일봉의 그날 종가 칸이 움직이는 값이라 끝난 뒤에 받는다
  # (11/11 16:05~17:28에 받은 종가는 200종목 중 186종목이 KRX 확정 종가와 달랐다)
  wait_until "$CLOSE_FETCH"
  refresh --name "${T}c"
  if ! grep -q "\"universe_daily_last\": \"$T\"" "workbench/live/${T}c/refresh_manifest.json" 2>/dev/null; then
    echo "그날($T) 종가가 아직 없다 → 기록을 건드리지 않음. 나중에 다시: ./run_day.sh close $T"; exit 1
  fi
  "$PY" workbench/e100_forward.py --root "workbench/live/${T}c" 2>&1 | tail -4
  screen build_forward_days.py --root "workbench/live/${T}c"
  publish ;;
*) echo "모르는 단계: $STEP"; exit 2 ;;
esac
echo "=== $STEP $T 끝 $(date +%H:%M:%S)"
