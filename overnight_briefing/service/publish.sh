#!/bin/zsh
# 데모 배포판 갱신: 최신 자료(DATA_ROOT + 밤사이 프롬프트 brief)로 스냅샷을 만들고 Vercel 운영 배포(https://4digit-demo.vercel.app).
# 매일 장 전 봉인(seal_morning.sh) 끝·개장 직후 채점 뒤·장 마감 작업(after_close.sh) 끝에 불린다. 손으로 돌려도 된다.
export PATH=/opt/homebrew/bin:/usr/bin:/bin:$PATH
cd "$(dirname "$0")"
echo "--- 데모 배포 $(date +%H:%M:%S)"
~/4Digit/.venv/bin/python -c "from core import extras as X; print(X.fetch_us_market())" 2>&1 | tail -1   # 11/19 홈 v2 미국 시장 칩(실패해도 계속)
~/4Digit/.venv/bin/python build_snapshot.py --days 10 2>&1 | grep -v WARNING | tail -1
# 11/18 추가: CLI 접근 토큰은 8시간짜리라, 만료 직후 자동 실행이 'Not authorized'로 실패한 적이 있다(11/18 05:10).
# 실패하면 vercel whoami로 토큰을 새로 받고 20초 뒤 한 번만 다시 올린다. 성공 경로는 그대로.
if OUT=$(vercel deploy --prod --yes </dev/null 2>&1); then
  echo "배포 완료 $(date +%H:%M:%S) https://4digit-demo.vercel.app"
else
  echo "배포 실패(종료 코드 $?) → 토큰 새로 받고 한 번 더"; echo "$OUT" | tail -2
  vercel whoami </dev/null >/dev/null 2>&1; sleep 20
  if OUT=$(vercel deploy --prod --yes </dev/null 2>&1); then
    echo "배포 완료(다시 시도) $(date +%H:%M:%S) https://4digit-demo.vercel.app"
  else
    echo "배포 실패(종료 코드 $?): vercel 로그인·네트워크 확인"; echo "$OUT" | tail -5
  fi
fi
