#!/bin/zsh
# 11/17 추가: 자동 작업 시작 전 저장 공간 확인. 11/16 아침 빈 공간 0으로 카드 발행이 개장 뒤로 밀렸다.
# 여유가 1.5GB 밑이면 다시 받을 수 있는 VS Code 업데이트 내려받기 캐시만 지운다(나은 11/16 삭제 승인 항목). 다른 것은 지우지 않는다.
FREE_MB=$(df -m /System/Volumes/Data | awk 'NR==2{print $4}')
echo "=== 저장 공간 $(date +%H:%M:%S): 여유 ${FREE_MB}MB"
if [ "$FREE_MB" -lt 1500 ]; then
  C=~/Library/Caches/com.microsoft.VSCode.ShipIt
  if [ -d "$C" ]; then rm -rf "$C"; echo "  여유 부족 → VS Code 업데이트 캐시 삭제, 지금 여유 $(df -m /System/Volumes/Data | awk 'NR==2{print $4}')MB"; fi
fi
