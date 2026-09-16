#!/bin/bash
# ============================================================================
# Rotate the EC2 Redis-proxy bearer key ON THE BOX (run as root via SSM).
#
#   phase 1 (dual-key window):
#     NEW_KEY_FILE=/tmp/proxy.key NEW_PROXY_FILE=/tmp/redis-proxy.js bash ec2-rotate-proxy-key.sh
#   phase 2 (after Vercel + Lambda + cron all use the new key):
#     FINALIZE=1 bash ec2-rotate-proxy-key.sh
#
# What phase 1 does — idempotent, no key value is ever printed:
#   • extracts the key the CURRENT deployed proxy accepts (its baked default or
#     env) so it can stay valid as REDIS_PROXY_KEY_PREV during the window
#   • /opt/signum-ws/.env  ← REDIS_PROXY_KEY (new) · REDIS_PROXY_KEY_PREV (old)
#                           · EXECUTOR_SECRET (copied from ~/toss-executor/.env.toss,
#                             needed by the proxy to verify remote trade:* writes)
#     and chmod 600 (it was 664 = world-readable, with API keys inside)
#   • ~/toss-executor/.env.toss ← REDIS_PROXY_KEY (the auto-engine reads it per call)
#   • root crontab ← `REDIS_PROXY_KEY=` env line (the intrinio-*/finra/treasury
#     cron scripts resolve the key at module load, before they read .env)
#   • installs the new redis-proxy.js (backup kept next to it) and restarts
#     redis-proxy + intrinio-ext-bars with the env, then probes /health with
#     the new key (expect 200), the old key (expect 200 in phase 1) and junk (401)
# Phase 2 removes REDIS_PROXY_KEY_PREV, restarts the proxy and proves the old
# key now gets 401.
# ============================================================================
set -euo pipefail
WS=/opt/signum-ws
ENVF=$WS/.env
TOSS=/home/ec2-user/toss-executor/.env.toss
PROXY=$WS/redis-proxy.js
export HOME=${HOME:-/home/ec2-user}
export PM2_HOME=${PM2_HOME:-/home/ec2-user/.pm2}
export PATH=$PATH:/usr/local/bin:/usr/bin

getenv() { { grep -E "^$2=" "$1" 2>/dev/null || true; } | head -1 | cut -d= -f2- | tr -d '\r'; } # never fails under set -e/pipefail
setenv() { # file key value
  touch "$1"; sed -i "/^$2=/d" "$1"; printf '%s=%s\n' "$2" "$3" >> "$1"
}
probe() { # label key → prints http code only
  local code; code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $2" http://127.0.0.1:8081/health || true)
  echo "  probe[$1] -> HTTP $code"
}

if [ "${FINALIZE:-0}" = "1" ]; then
  OLD=$(getenv "$ENVF" REDIS_PROXY_KEY_PREV)
  NEW=$(getenv "$ENVF" REDIS_PROXY_KEY)
  # PREV may already be gone from the file (re-run): take the old key from the newest proxy backup for the probe
  if [ -z "$OLD" ]; then BK=$(ls -t "$PROXY".bak-* 2>/dev/null | head -1); [ -n "$BK" ] && OLD=$(grep -oE 'REDIS_PROXY_KEY \|\| "[^"]+"' "$BK" | head -1 | sed -E 's/.*"([^"]+)"/\1/' || true); fi
  [ "$OLD" = "$NEW" ] && OLD=""
  [ -n "$NEW" ] || { echo "FATAL: no REDIS_PROXY_KEY in $ENVF"; exit 1; }
  sed -i '/^REDIS_PROXY_KEY_PREV=/d' "$ENVF"
  # pm2 keeps the env it saved at the last restart, so an absent variable is NOT removed by --update-env:
  # overwrite PREV with an empty string (the proxy ignores keys shorter than 16 chars) and save.
  export REDIS_PROXY_KEY="$NEW" REDIS_PROXY_KEY_PREV=""
  pm2 restart redis-proxy --update-env >/dev/null
  pm2 save >/dev/null 2>&1 || true
  sleep 2
  echo "finalized: PREV removed (file + pm2 env)"
  probe new "$NEW"
  [ -n "$OLD" ] && probe old "$OLD"
  probe junk "not-a-key-$(date +%s)"
  pm2 ls | grep -E 'redis-proxy|intrinio-ext-bars|signum-auto-engine' || true
  exit 0
fi

[ -f "${NEW_KEY_FILE:-}" ] || { echo "FATAL: NEW_KEY_FILE missing"; exit 1; }
[ -f "${NEW_PROXY_FILE:-}" ] || { echo "FATAL: NEW_PROXY_FILE missing"; exit 1; }
NEW=$(tr -d '[:space:]' < "$NEW_KEY_FILE")
[ ${#NEW} -ge 32 ] || { echo "FATAL: new key shorter than 32 chars"; exit 1; }

# key the running proxy accepts today: env in its .env, else the default baked into the deployed file
OLD=$(getenv "$ENVF" REDIS_PROXY_KEY)
if [ -z "$OLD" ] && [ -f "$PROXY" ]; then
  OLD=$(grep -oE 'REDIS_PROXY_KEY \|\| "[^"]+"' "$PROXY" | head -1 | sed -E 's/.*"([^"]+)"/\1/' || true)
fi
[ "$OLD" = "$NEW" ] && OLD=""

EXEC=$(getenv "$TOSS" EXECUTOR_SECRET)
[ -n "$EXEC" ] || echo "WARN: EXECUTOR_SECRET not found in $TOSS — remote trade:* writes will be rejected until it is set"

# ── env files ──
setenv "$ENVF" REDIS_PROXY_KEY "$NEW"
if [ -n "$OLD" ]; then setenv "$ENVF" REDIS_PROXY_KEY_PREV "$OLD"; else sed -i '/^REDIS_PROXY_KEY_PREV=/d' "$ENVF"; fi
[ -n "$EXEC" ] && setenv "$ENVF" EXECUTOR_SECRET "$EXEC"
chown ec2-user:ec2-user "$ENVF"; chmod 600 "$ENVF"
setenv "$TOSS" REDIS_PROXY_KEY "$NEW"; chown ec2-user:ec2-user "$TOSS"; chmod 600 "$TOSS"

# ── root crontab: env line on top (cron does not read .env files) ──
( echo "REDIS_PROXY_KEY=$NEW"; crontab -l 2>/dev/null | grep -v '^REDIS_PROXY_KEY=' ) | crontab -

# ── proxy code ──
cp -p "$PROXY" "$PROXY.bak-$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
cp "$NEW_PROXY_FILE" "$PROXY"; sed -i 's/\r$//' "$PROXY"; chown ec2-user:ec2-user "$PROXY"
node --check "$PROXY"

# ── restart with env (proxy also reads $ENVF itself, so a pm2 resurrect is safe) ──
export REDIS_PROXY_KEY="$NEW" REDIS_PROXY_KEY_PREV="$OLD"
[ -n "$EXEC" ] && export EXECUTOR_SECRET="$EXEC"
pm2 restart redis-proxy --update-env >/dev/null
pm2 restart intrinio-ext-bars --update-env >/dev/null || true
pm2 save >/dev/null 2>&1 || true
sleep 2
echo "rotation phase 1 done (dual-key window open: prev=$([ -n "$OLD" ] && echo yes || echo no))"
probe new "$NEW"
[ -n "$OLD" ] && probe old "$OLD"
probe junk "not-a-key-$(date +%s)"
echo "  env file: $(stat -c '%U %a' "$ENVF") vars: $(cut -d= -f1 "$ENVF" | tr '\n' ' ')"
echo "  crontab env line: $(crontab -l | grep -c '^REDIS_PROXY_KEY=')"
pm2 ls | grep -E 'redis-proxy|intrinio-ext-bars|signum-auto-engine' || true
pm2 logs redis-proxy --lines 5 --nostream 2>/dev/null | grep 'Redis Proxy' || true
