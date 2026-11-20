#!/bin/zsh
# 아침 뉴스 연결 봉인: seal_morning.sh가 카드 봉인 뒤 부른다(카드 봉인을 늦추지 않으려고 카드 다음에 둔다).
# 밤사이 알파카 기사 이어 받기 → 관계표 규칙 연결 → OpenAI 두 단계 판정(같은 입력은 캐시) → 방향 → 종목별 모음 → 업종 핵심어 → 그날 몫 고정(news_snapshot).
# 사용: workbench/news_morning.sh 20261111
T=${1:-$(date +%Y%m%d)}
cd ~/4Digit/research/overnight_backtest/workbench
if ! grep -q '"open": true' live/$T/refresh_manifest.json 2>/dev/null; then echo "$T 개장일 확인(live/$T) 없음 → 뉴스 봉인 건너뜀"; exit 0; fi
S=~/4Digit-solo/.venv/bin/python
P=~/4Digit/.venv/bin/python
NEED=$($P -c "from news_days import prev_trading_day, window; print(window('$T', prev_trading_day(['$T']))[0].tz_convert('UTC').isoformat())")
echo "--- 뉴스 $(date +%H:%M:%S) 알파카(창 시작 $NEED 이후 빠진 것만)"
$S alpaca_latest.py $NEED 2>&1 | tail -2
echo "--- 연결 $(date +%H:%M:%S)"
NEWS_DAYS=$T $P us_news_link.py 2>&1 | grep -A1 "\"$T\"" | head -4
NEWS_DAYS=$T $S us_news_judge_cascade.py 2>&1 | grep " $T " | head -4
$S us_news_sign.py 2>&1 | tail -1
$P us_news_by_stock.py 2>&1 | tail -1
NEWS_DAYS=$T $P us_news_segment.py 2>&1 | tail -1 | cut -c1-80
echo "--- 고정 $(date +%H:%M:%S)"
$P news_snapshot.py --date $T 2>&1 | tail -2
