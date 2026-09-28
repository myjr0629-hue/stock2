#!/bin/bash
# cycle-watchdog — 시간당 마케팅 사이클이 멈췄는지 «앱 밖에서» 본다. (2026-09-28 대표 지시: 「이런일이 다시는 있게 하지마라」)
#
# 왜: 9/28 00:25~21:36 KST, 이 세션의 시간당 크론(목록엔 살아 있었다)이 한 번도 돌지 않았다.
#     맥은 잠들지 않았다(pmset: sleep prevented · 화면만 꺼짐). 앱의 예약 작업들도 9/26 23:52 이후 lastRunAt 이 그대로였다.
#     즉 멈춘 곳은 Claude 앱 안의 스케줄러다 — 앱 안의 장치로는 앱이 멈춘 걸 알 수 없다. 그래서 launchd(맥 자체)가 30분마다 본다.
# 판정: 모든 사이클은 OUTREACH-LOG.md 에 기록을 남긴다 → 그 파일의 마지막 수정이 75분을 넘으면 «멈춤».
# 동작: 멈춤이면 맥 알림(소리) + 로그. 같은 멈춤에 30분마다 반복(대표가 볼 때까지). 사이클이 다시 돌면 조용해진다.
# 해제: launchctl bootout gui/$(id -u)/com.signumhq.cycle-watchdog
REPO="$HOME/.gemini/antigravity/scratch/stock2"
LOG_FILE="$REPO/.agent/marketing/OUTREACH-LOG.md"
OUT="$HOME/Library/Logs/signum-cycle-watchdog.log"
LIMIT=4500   # 75분 — 매시 사이클이 한 번 빠지면 바로 알린다(9/28 23:4x 2시간→75분)
now=$(date +%s)
# ★2026-09-29 03:18 오경보: 사이클이 1.5시간 일하며 게시는 계속했는데 OUTREACH-LOG 만 늦게 써서 «121분 멈춤»이 울렸다.
#   → 셋 중 «가장 최근» 수정 시각으로 판정: 작업 기록 · 발행 원장(게시마다 갱신) · 사이클 시작 신호(.heartbeat)
LEDGER="$REPO/.agent/marketing/PUBLISH-LEDGER.json"; BEAT="$REPO/.agent/marketing/.heartbeat"
last=0
for f in "$LOG_FILE" "$LEDGER" "$BEAT"; do m=$(stat -f %m "$f" 2>/dev/null || echo 0); [ "$m" -gt "$last" ] && last=$m; done
age=$(( now - last ))

# ★2026-09-28 23:4x 실측 원인: 9/27 23:16 백그라운드로 넘어간 ego-browser 스크립트(PID 6020)가 kill(TERM)에도 안 죽고 24시간 «진행 중»으로
#   남아 있었다 → 세션이 «한가함»이 안 돼 크론이 한 번도 불리지 않았다(kill -9 하자마자 작업이 «완료» 처리됐다).
#   그래서 45분 넘게 살아 있는 «ego-browser nodejs» 는 멈춘 것으로 보고 -9 로 정리한다(내 자동화 스크립트만 이 이름으로 돈다).
now_ts=$(date +%s)
ps -axo pid=,lstart=,command= | grep "ego-browser nodejs" | grep -v grep | while read -r pid rest; do
  start=$(echo "$rest" | awk '{print $1,$2,$3,$4,$5}')
  st=$(date -j -f "%a %b %d %T %Y" "$start" +%s 2>/dev/null || echo "$now_ts")
  if [ $(( now_ts - st )) -gt 2700 ]; then
    kill -9 "$pid" 2>/dev/null && echo "$(date '+%F %T') KILLED hung ego-browser pid=$pid age=$(( (now_ts - st) / 60 ))m" >> "$OUT"
  fi
done
if [ "$age" -gt "$LIMIT" ]; then
  mins=$(( age / 60 ))
  echo "$(date '+%F %T') STALE ${mins}m (최근 활동 $(date -r "$last" '+%F %T'))" >> "$OUT"
  /usr/bin/osascript -e "display notification \"마케팅 사이클이 ${mins}분째 멈춤 — Claude 앱에서 마케팅 세션에 한 줄 보내 주세요\" with title \"SIGNUM 마케팅 멈춤\" sound name \"Glass\"" >/dev/null 2>&1
else
  echo "$(date '+%F %T') ok $(( age / 60 ))m" >> "$OUT"
fi
