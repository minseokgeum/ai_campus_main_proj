#!/bin/zsh
# 06:10 이른 브리핑(11/17 팀 결정: 밤사이 뉴스 마감은 06:00 하나, 브리핑은 06:30부터).
# 07:30 카드는 06:00 야간선물 마감 자료만 쓰므로 06:10에 만들어도 같은 규칙이다. 개장 2시간 50분 전에 고정되니 '장 전 고정' 기록도 단단해진다.
# 순서: 07:30 카드 + 봉인 해시 → 앱 날짜 파일 → 야간선물 1분봉 → 뉴스 처리(06:00 마감) 끝 기다리기 → 밤사이 프롬프트 → 데모 배포.
# 08:11 카드·뉴스 연결 봉인·09:00 채점은 그대로 08:15 seal_morning.sh가 한다(07:30 카드가 있으면 건너뛴다).
T=${1:-$(date +%Y%m%d)}
cd ~/4Digit/research/overnight_backtest
C=workbench/runs/claude_live_r1/card_${T}_0730.json
if [ -f "$C" ]; then echo "07:30 카드가 이미 있다 → 카드는 건너뛰고 뉴스·배포만"; else
  echo "=== 07:30 카드 $(date +%H:%M:%S)"
  PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name $T --env ~/4Digit-solo/.env --until $T --premarket-days $T --no-night 2>&1 | tail -2
  PYTHONPATH=.:src .venv/bin/python workbench/morning_card.py --date $T --slot 0730 --root workbench/live/$T --events workbench/live/$T/dart_filings.csv 2>&1 | tail -1
  echo "--- 봉인 해시"; date "+%Y-%m-%d %H:%M:%S %Z"; cat ${C}.sha256 2>/dev/null
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $T $(cat ${C}.sha256 2>/dev/null | tr '\n' ' ')" >> workbench/runs/claude_live_r1/seal_log.txt
  ~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_live_day.py --date $T 2>&1 | tail -1
  echo "=== 야간선물 1분봉 $(date +%H:%M:%S)"
  PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name $T --env ~/4Digit-solo/.env --until $T --night-only 2>&1 | tail -1 | cut -c1-200
fi
# 11/17 낮 추가: 어제 저녁 NXT 마지막 거래(화면 참고용. 카드·띠 계산·봉인과 무관한 별도 파일). 뉴스 처리를 기다리는 동안 받는다(약 1분). 실패해도 계속.
echo "=== 어제 저녁 NXT(참고용) $(date +%H:%M:%S)"
(PYTHONPATH=.:src .venv/bin/python workbench/evening_nxt.py --date $T --env ~/4Digit-solo/.env 2>&1 | tail -1) || echo "어제 저녁 NXT 실패(계속)"
N=~/4Digit/ai_campus_main_proj/news_search/source/nightly/$T
echo "=== 뉴스 처리 기다리기 $(date +%H:%M:%S)"
# 11/17 민석 갱신: 처리 결과는 summary_<표시 시각>/(예: summary_0630). 그 전 형식 morning_<차수>/도 받는다.
# zsh는 맞는 파일이 없는 * 패턴을 오류로 처리하므로(ls a_* b_* 전체가 실패) find로 확인한다. 11/17 실제 실행에서 발견.
has_news() { [ -n "$(find "$1" -maxdepth 2 -name "$2" \( -path '*/summary_*/*' -o -path '*/morning_*/*' \) 2>/dev/null | head -1)" ]; }
until has_news $N timing.json || [ "$(date +%H%M)" -ge 0645 ]; do sleep 20; done
has_news $N timing.json && echo "뉴스 처리 결과 있음" || echo "06:45까지 뉴스 처리 결과가 없다 → 프롬프트 건너뜀"
P=~/4Digit/ai_campus_main_proj/overnight_briefing
if has_news $N prompt_inputs.jsonl; then
  echo "=== 밤사이 프롬프트 $(date +%H:%M:%S)"
  (cd $P/nightly_prompt && ~/4Digit-solo/.venv/bin/python run.py $T --max-cost 3 --workers 16 2>&1 | tail -3) || echo "밤사이 프롬프트 실패(계속)"
fi
$P/service/publish.sh
echo "=== 끝 $(date +%H:%M:%S)"
