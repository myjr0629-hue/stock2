#!/usr/bin/env bash
# 관제 콘솔 기동/재기동 — `bash scripts/hud/start.sh` · 종료는 `pkill -f hud/server.js`
cd "$(dirname "$0")/../.." || exit 1
pkill -f "hud/server.js" 2>/dev/null; sleep 0.5
nohup node scripts/hud/server.js > /tmp/hud.log 2>&1 &
sleep 2; tail -2 /tmp/hud.log
echo "→ http://127.0.0.1:7788"
