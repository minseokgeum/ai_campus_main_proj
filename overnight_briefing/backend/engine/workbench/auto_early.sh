#!/bin/zsh -l
# 평일 06:10 이른 브리핑(launchd com.4digit.early-brief). 로그: runs/collect_logs/early_<T>.log
T=$(date +%Y%m%d)
W=~/4Digit/research/overnight_backtest/workbench
/usr/bin/caffeinate -i -s -w $$ &
for i in {1..18}; do /usr/bin/curl -s -o /dev/null --max-time 5 https://openapi.koreainvestment.com:9443 && break; sleep 10; done
$W/disk_guard.sh >> $W/runs/collect_logs/early_$T.log 2>&1
$W/early_brief.sh $T >> $W/runs/collect_logs/early_$T.log 2>&1
