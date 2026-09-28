#!/bin/bash
# cycle-watchdog — 시간당 마케팅 사이클이 멈췄는지 «앱 밖에서» 본다. (2026-09-28 대표 지시: 「이런일이 다시는 있게 하지마라」)
#
# 왜: 9/28 00:25~21:36 KST, 이 세션의 시간당 크론(목록엔 살아 있었다)이 한 번도 돌지 않았다.
#     맥은 잠들지 않았다(pmset: sleep prevented · 화면만 꺼짐). 앱의 예약 작업들도 9/26 23:52 이후 lastRunAt 이 그대로였다.
#     즉 멈춘 곳은 Claude 앱 안의 스케줄러다 — 앱 안의 장치로는 앱이 멈춘 걸 알 수 없다. 그래서 launchd(맥 자체)가 30분마다 본다.
# 판정: 모든 사이클은 OUTREACH-LOG.md 에 기록을 남긴다 → 그 파일의 마지막 수정이 2시간을 넘으면 «멈춤».
# 동작: 멈춤이면 맥 알림(소리) + 로그. 같은 멈춤에 30분마다 반복(대표가 볼 때까지). 사이클이 다시 돌면 조용해진다.
# 해제: launchctl bootout gui/$(id -u)/com.signumhq.cycle-watchdog
REPO="$HOME/.gemini/antigravity/scratch/stock2"
LOG_FILE="$REPO/.agent/marketing/OUTREACH-LOG.md"
OUT="$HOME/Library/Logs/signum-cycle-watchdog.log"
LIMIT=7200
now=$(date +%s)
last=$(stat -f %m "$LOG_FILE" 2>/dev/null || echo 0)
age=$(( now - last ))
if [ "$age" -gt "$LIMIT" ]; then
  mins=$(( age / 60 ))
  echo "$(date '+%F %T') STALE ${mins}m (log mtime $(date -r "$last" '+%F %T'))" >> "$OUT"
  /usr/bin/osascript -e "display notification \"마케팅 사이클이 ${mins}분째 멈춤 — Claude 앱에서 마케팅 세션에 한 줄 보내 주세요\" with title \"SIGNUM 마케팅 멈춤\" sound name \"Glass\"" >/dev/null 2>&1
else
  echo "$(date '+%F %T') ok $(( age / 60 ))m" >> "$OUT"
fi
