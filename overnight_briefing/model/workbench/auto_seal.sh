#!/bin/zsh -l
# 평일 08:15 자동 봉인(launchd com.4digit.seal-morning). 로그: runs/collect_logs/seal_<T>.log
T=$(date +%Y%m%d)
W=~/4Digit/research/overnight_backtest/workbench
# 11/11 추가: 11/11 아침 맥이 배터리로 잠들어 08:25 시작 → 08:50 다시 잠듦 → 09:19 깨어 카드가 개장 뒤(09:22) 발행됐다.
# 돌기 시작하면 끝날 때까지 맥이 잠들지 않게 붙잡고(-i 유휴 잠자기, -s 전원 연결 시 시스템 잠자기), 깬 직후 인터넷이 붙을 때까지 기다린다.
/usr/bin/caffeinate -i -s -w $$ &
for i in {1..18}; do /usr/bin/curl -s -o /dev/null --max-time 5 https://openapi.koreainvestment.com:9443 && break; sleep 10; done
$W/seal_morning.sh $T >> $W/runs/collect_logs/seal_$T.log 2>&1
