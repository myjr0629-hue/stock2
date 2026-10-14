#!/bin/bash
# ego-run — 같은 taskSpace만 FIFO로 직렬화하고 하드 타임아웃으로 실행한다.
# 왜 (2026-09-30): 동시 실행이 같은 작업 공간을 서로 빼앗았다.
# 2026-10-14: 전역 FIFO 때문에 다른 공간까지 수 시간 밀림 → 공간별 잠금.
# 사용: scripts/ego-run.sh <스크립트.mjs> [제한초=420]
# EGO_LOCK_GLOBAL=1: 전역 하나로 되돌린다. 자세한 전환 규약: ego-run-lock.md
# EGO_BIN / EGO_LOCK_DIR: 브라우저 없이 격리된 더미 시험에 사용한다.
SCRIPT="${1:-}"; LIMIT="${2:-420}"
if [ -z "$SCRIPT" ] || [ ! -f "$SCRIPT" ]; then echo "⛔ ego-run: 스크립트 파일이 없다: $SCRIPT" >&2; exit 2; fi
export PATH="/Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/0.5.0.32/Helpers:$PATH"
RUN_DIR=$(cd "$(dirname "$0")" && pwd) || exit 2
perl "$RUN_DIR/ego-run-lock.pl" "$SCRIPT" "$LIMIT" 2>&1 | grep -v 'ego-browser:notice'
exit "${PIPESTATUS[0]}"
