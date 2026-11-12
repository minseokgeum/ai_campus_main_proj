#!/bin/zsh -l
# 평일 15:56 장 마감 뒤 갱신(launchd com.4digit.after-close). 같은 날 이미 돌고 있으면 건너뛴다.
T=$(date +%Y%m%d)
W=~/4Digit/research/overnight_backtest/workbench
# 11/11 추가: 11/11 아침 맥이 배터리로 잠들어 08:25 시작 → 08:50 다시 잠듦 → 09:19 깨어 카드가 개장 뒤(09:22) 발행됐다.
# 돌기 시작하면 끝날 때까지 맥이 잠들지 않게 붙잡고(-i 유휴 잠자기, -s 전원 연결 시 시스템 잠자기), 깬 직후 인터넷이 붙을 때까지 기다린다.
/usr/bin/caffeinate -i -s -w $$ &
for i in {1..18}; do /usr/bin/curl -s -o /dev/null --max-time 5 https://openapi.koreainvestment.com:9443 && break; sleep 10; done
if pgrep -f "after_close.sh $T" >/dev/null; then echo "$(date) 이미 실행 중 → 건너뜀" >> $W/runs/collect_logs/after_close_$T.log; exit 0; fi
$W/after_close.sh $T >> $W/runs/collect_logs/after_close_$T.log 2>&1
for S in 0730 0811; do
  C=$W/runs/claude_live_r1/card_${T}_$S.json
  [ -f "$C" ] && [ ! -f "$W/runs/claude_live_r1/check_${T}_$S.json" ] && (cd ~/4Digit/research/overnight_backtest && PYTHONPATH=.:src .venv/bin/python workbench/runs/claude_live_r1/check_open.py --date $T --env ~/4Digit-solo/.env --card $C > /dev/null 2>&1; mv workbench/runs/claude_live_r1/check_$T.json workbench/runs/claude_live_r1/check_${T}_$S.json 2>/dev/null)
done
