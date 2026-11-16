#!/bin/zsh
# 데모 배포판 갱신: 최신 자료(DATA_ROOT + 밤사이 프롬프트 brief)로 스냅샷을 만들고 Vercel 운영 배포(https://4digit-demo.vercel.app).
# 매일 장 전 봉인(seal_morning.sh) 끝·개장 직후 채점 뒤·장 마감 작업(after_close.sh) 끝에 불린다. 손으로 돌려도 된다.
export PATH=/opt/homebrew/bin:/usr/bin:/bin:$PATH
cd "$(dirname "$0")"
echo "--- 데모 배포 $(date +%H:%M:%S)"
~/4Digit/.venv/bin/python build_snapshot.py --days 6 2>&1 | grep -v WARNING | tail -1
if OUT=$(vercel deploy --prod --yes </dev/null 2>&1); then
  echo "배포 완료 $(date +%H:%M:%S) https://4digit-demo.vercel.app"
else
  echo "배포 실패(종료 코드 $?): vercel 로그인·네트워크 확인"; echo "$OUT" | tail -5
fi
