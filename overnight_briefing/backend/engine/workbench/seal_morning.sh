#!/bin/zsh
# 장 전 봉인: 08:11~08:59 사이에 실행. 끝난 장 자료 + 그날 NXT 08:00~08:10만으로 07:30·08:11 카드를 만들고 해시를 남긴다.
# 결과를 모르는 상태에서 고정한 '사전 예측' 기록이 되려면 반드시 09:00 전에 끝나야 한다(발행 시각이 카드에 찍힘).
# 사용: workbench/seal_morning.sh 20261111      → 장 마감 뒤: workbench/after_close.sh 20261111 (채점·E100·앱 갱신)
T=${1:-$(date +%Y%m%d)}
cd ~/4Digit/research/overnight_backtest
NOW=$(date +%H%M)
# 11/17 추가: 장 시간이 바뀌는 날(수능일 11/19: 정규장 10:00 개장, NXT 프리마켓 없음). 개장 시각 기준으로 봉인·채점 시각을 옮긴다.
OPEN=0900; [ "$T" = 20261119 ] && OPEN=1000
if [ "$NOW" -ge $OPEN ]; then echo "지금 $NOW: 이미 개장 뒤라 봉인이 아니다(사후 계산으로만 남는다). 계속하려면 FORCE=1"; [ "$FORCE" = 1 ] || exit 1; fi
if [ "$NOW" -lt 0811 ]; then echo "지금 $NOW: 08:11 전이라 NXT 08:10 봉이 없다. 07:30 카드만 만든다."; fi
PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name $T --env ~/4Digit-solo/.env --until $T --premarket-days $T --no-night 2>&1 | tail -2
for S in 0730 0811; do
  if [ "$S" = 0811 ] && [ "$NOW" -lt 0811 ]; then continue; fi
  # 11/17 추가: 06:10 이른 브리핑(early_brief.sh)이 07:30 카드를 이미 만들었으면 다시 만들지 않는다(_v2가 생기지 않게)
  if [ -f workbench/runs/claude_live_r1/card_${T}_$S.json ]; then echo "$S 카드가 이미 있다 → 건너뜀"; continue; fi
  PYTHONPATH=.:src .venv/bin/python workbench/morning_card.py --date $T --slot $S --root workbench/live/$T --events workbench/live/$T/dart_filings.csv 2>&1 | tail -1
done
echo "--- 봉인 해시(이 줄을 노션·메신저 등 시각이 남는 곳에 붙이면 사전 고정 증거가 된다)"
date "+%Y-%m-%d %H:%M:%S %Z"
cat workbench/runs/claude_live_r1/card_${T}_*.json.sha256 2>/dev/null
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') $T $(cat workbench/runs/claude_live_r1/card_${T}_*.json.sha256 2>/dev/null | tr '\n' ' ')" >> workbench/runs/claude_live_r1/seal_log.txt
# 11/10 추가: 봉인 카드를 앱 날짜 파일로 바로 넣는다(개장 전에도 앱에서 그날 카드가 보이게, 실제 시가는 장 마감 뒤)
~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_live_day.py --date $T 2>&1 | tail -1
# 11/10 추가: 지난밤 야간선물 1분봉(앱 '밤사이 흐름' 차트). 카드 계산에는 안 쓰므로 봉인 뒤에 받는다(한투 응답이 늦어도 봉인이 밀리지 않게).
echo "=== 야간선물 1분봉 $(date +%H:%M:%S)"
PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name $T --env ~/4Digit-solo/.env --until $T --night-only 2>&1 | tail -1 | cut -c1-200
# 11/10 추가: 카드 봉인 뒤 미국 뉴스 연결도 같은 아침에 고정(news_T/manifest.json 해시가 seal_log에 붙는다)
echo "=== 미국 뉴스 연결 봉인 $(date +%H:%M:%S)"
workbench/news_morning.sh $T
# 밤 차트 파일(1분봉 + 미국 기사 수·연결 기사 표식). 뉴스 연결이 끝난 뒤에 만든다.
~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_night_news.py $T 2>&1 | tail -1
# 11/16 추가: 카드 봉인 뒤 밤사이 프롬프트(민석 처리 결과 → 효은 추출 → 띠와 종합 한 줄)를 돌리고 데모 배포판을 갱신한다.
# 카드 봉인보다 뒤라 봉인 시각에는 영향이 없다. 실패해도 아래 채점은 계속한다.
echo "=== 밤사이 프롬프트 $(date +%H:%M:%S)"
P=~/4Digit/ai_campus_main_proj/overnight_briefing
# zsh는 맞는 파일이 없는 * 패턴을 오류로 처리하므로(ls a_* b_* 전체가 실패) find로 확인한다. 11/17 실제 실행에서 발견.
has_news() { [ -n "$(find "$1" -maxdepth 2 -name "$2" \( -path '*/summary_*/*' -o -path '*/morning_*/*' \) 2>/dev/null | head -1)" ]; }
if has_news ~/4Digit/ai_campus_main_proj/news_search/source/nightly/$T prompt_inputs.jsonl; then
  (cd $P/nightly_prompt && ~/4Digit-solo/.venv/bin/python run.py $T --max-cost 3 --workers 16 2>&1 | tail -3) || echo "밤사이 프롬프트 실패(계속)"
else
  echo "$T 프롬프트 입력 없음(뉴스 처리 안 됨) → 건너뜀"
fi
$P/service/publish.sh
# 11/11 추가: 09:01까지 기다렸다가 그날 시가로 두 카드를 채점(check_open, 카드 해시 확인 뒤)하고 앱 09:00 탭을 바로 채운다.
# 계좌 범위·E100·빗나간 종목 해부는 그대로 장 마감 뒤(after_close). 여기서 만든 check 파일이 있으면 장 마감 뒤에는 다시 받지 않는다.
until [ "$(date +%H%M)" -ge $((10#$OPEN + 1)) ]; do sleep 30; done
echo "=== 개장 직후 시가 채점 $(date +%H:%M:%S)"
for S in 0730 0811; do
  C=workbench/runs/claude_live_r1/card_${T}_$S.json
  [ -f "$C" ] && [ ! -f workbench/runs/claude_live_r1/check_${T}_$S.json ] && \
    (PYTHONPATH=.:src .venv/bin/python workbench/runs/claude_live_r1/check_open.py --date $T --env ~/4Digit-solo/.env --card $C --out workbench/runs/claude_live_r1/check_${T}_$S.json 2>&1 | grep -E '"in_band80"|"mae_H"|"dir_nxt_all"' | tr -d ' \n'; echo " $S") &
done
wait
~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_live_day.py --date $T --with-open 2>&1 | tail -1
$P/service/publish.sh
echo "=== 끝 $(date +%H:%M:%S)"
