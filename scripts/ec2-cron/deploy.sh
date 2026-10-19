#!/bin/bash
# EC2 크론 워커 배포 — market-feed (2026-10-20)
#
# 사용(저장소 루트에서):
#   bash scripts/ec2-cron/deploy.sh                  # 번들 → 업로드 → node --check → 1회 시험 → PM2 재시작
#   bash scripts/ec2-cron/deploy.sh --env <파일>     # 첫 설치·키 교체 때: Upstash URL/토큰 2줄 파일(UPSTASH_REDIS_REST_URL=…)을 서버 .env 에 넣는다
#   bash scripts/ec2-cron/deploy.sh --stop           # 워커만 멈춤(→ 표식이 120초 뒤 낡아 Vercel 크론이 자동으로 예전처럼 일한다)
#
# 서버 배치: /opt/signum-cron/{market-feed-worker.js,.env(600),logs/} · PM2 «cron-market-feed» · Node /opt/node20(20.18, 기존 워커의 Node 16 과 분리)
# 비밀값: 저장소에 없다. 서버 .env 의 EC2_REDIS_PROXY_KEY 는 서버 안에서 /opt/signum-ws/.env 의 REDIS_PROXY_KEY 를 복사한다(전송 없음).
# 자격: .env.local 의 AWS 키(scripts/ec2-ssm.js)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ -f .env.local ] || export ENV_FILE=${ENV_FILE:-$HOME/.gemini/antigravity/scratch/stock2/.env.local}   # 워크트리엔 .env.local 이 없다
SSM="node scripts/ec2-ssm.js"
REMOTE=/opt/signum-cron
NAME=cron-market-feed
NODE20=/opt/node20/bin/node

if [ "${1:-}" = "--stop" ]; then
  $SSM "pm2 stop $NAME && pm2 save && pm2 list --no-color | grep -E 'cron-|name'"
  exit 0
fi

ENVFILE=""
if [ "${1:-}" = "--env" ]; then ENVFILE=${2:?Upstash env 파일 경로}; fi

BUILD=$(git rev-parse --short HEAD)$( [ -n "$(git status --porcelain -- src scripts/ec2-cron)" ] && echo "-dirty" || true)
OUT=$(mktemp -d)/market-feed-worker.js
node_modules/.bin/esbuild scripts/ec2-cron/market-feed-worker.ts --bundle --platform=node --target=node20 --format=cjs \
  --outfile="$OUT" --define:process.env.CRON_BUILD="\"$BUILD\"" --log-level=warning
echo "번들: $OUT ($(wc -c <"$OUT") bytes, build $BUILD)"
node --check "$OUT"

$SSM "mkdir -p $REMOTE/logs && chown -R ec2-user:ec2-user $REMOTE && $NODE20 -v"

if [ -n "$ENVFILE" ]; then
  grep -qE '^UPSTASH_REDIS_REST_URL=https://' "$ENVFILE" && grep -qE '^UPSTASH_REDIS_REST_TOKEN=.{40,}' "$ENVFILE" \
    || { echo "Upstash env 파일 형식이 아니다(자리표시자 금지)"; exit 1; }
  if grep -qiE 'SENSITIVE|PLACEHOLDER' "$ENVFILE"; then echo "자리표시자 값 — 중단"; exit 1; fi
  $SSM --file "$ENVFILE" "$REMOTE/.upstash.env.new"
  $SSM "cd $REMOTE && umask 077 && PK=\$(grep -E '^REDIS_PROXY_KEY=' /opt/signum-ws/.env | cut -d= -f2-) && [ -n \"\$PK\" ] && { echo 'EC2_REDIS_PROXY_URL=http://127.0.0.1:8081'; echo \"EC2_REDIS_PROXY_KEY=\$PK\"; echo 'NEXT_PUBLIC_SITE_URL=https://www.signumhq.com'; grep -E '^UPSTASH_REDIS_REST_(URL|TOKEN)=' .upstash.env.new; } > .env.new && mv .env.new .env && rm -f .upstash.env.new && chmod 600 .env && chown ec2-user:ec2-user .env && sed 's/=.*/=***/' .env"
fi

$SSM --file "$OUT" "$REMOTE/market-feed-worker.js.new"
# 새 파일 검사 → 1회 시험(실제 수집·쓰기, 운영 크론과 같은 일) → 통과하면 교체·재시작
ONCE=$($SSM "cd $REMOTE && $NODE20 --check market-feed-worker.js.new && { [ -f market-feed-worker.js ] && cp market-feed-worker.js market-feed-worker.js.prev || true; } && $NODE20 --env-file=$REMOTE/.env market-feed-worker.js.new --once > /tmp/cron-once.log 2>&1; rc=\$?; tail -6 /tmp/cron-once.log | cut -c1-400; [ \$rc -eq 0 ] && echo ONCE_OK")
echo "$ONCE"
echo "$ONCE" | grep -q ONCE_OK || { echo "1회 시험 실패 — 교체하지 않는다(운영 워커는 그대로)"; exit 1; }
$SSM "cd $REMOTE && mv market-feed-worker.js.new market-feed-worker.js && chown ec2-user:ec2-user market-feed-worker.js && (pm2 describe $NAME >/dev/null 2>&1 && pm2 restart $NAME --update-env || pm2 start $REMOTE/market-feed-worker.js --name $NAME --interpreter $NODE20 --node-args='--env-file=$REMOTE/.env' --max-memory-restart 200M --exp-backoff-restart-delay=1000 --time --output /dev/null --error $REMOTE/logs/pm2-error.log) && pm2 save && sleep 40 && pm2 list --no-color | grep -E 'name|$NAME' && tail -2 $REMOTE/logs/pm2-error.log; tail -3 $REMOTE/logs/market-feed-\$(date -u +%F).jsonl | cut -c1-300"
echo "배포 완료 — 되돌리기: bash scripts/ec2-cron/deploy.sh --stop (Vercel 이 120초 안에 자동 복귀)"
