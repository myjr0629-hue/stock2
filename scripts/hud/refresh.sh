#!/bin/bash
# 관제 자동 갱신 진입점 — launchd(com.signumhq.hud-refresh)가 부른다: `bash scripts/hud/refresh.sh auto`
# launchd 의 PATH 에는 nvm 의 node 가 없다 → 여기서 찾는다. 문서 폴더(~/Documents/signum-work)는 node 만 열린다(launchd 아래 Apple 기본 도구는 막힘) — 실제 일은 전부 refresh.js(node)가 한다.
DIR="$(cd "$(dirname "$0")" && pwd)"
NODE=""
for n in "$(command -v node 2>/dev/null)" "$HOME"/.nvm/versions/node/v22*/bin/node "$HOME"/.nvm/versions/node/v20*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$n" ] && [ -x "$n" ] && NODE="$n" && break
done
if [ -z "$NODE" ]; then echo "[$(date '+%F %T')] node 를 찾지 못함 — 관제 자동 갱신 불가" >&2; exit 127; fi
exec "$NODE" "$DIR/refresh.js" "$@"
