#!/usr/bin/env bash
# ============================================================================
# store-release-widget-finish — 위젯 «재캡처»가 들어오면 1.10.0 스토어 이미지의 빈칸(위젯)을 한 번에 채운다.
#   입력: <번들>/raw/widget-capture-{ko,en,ja}.png  — 시뮬레이터 홈 화면(1206x2622), SIGNUM 위젯만 있는 페이지,
#         내 종목 = 게이트 통과 종목(NVDA·META·AMZN·GOOGL·PLTR). xcrun simctl io <UDID> screenshot 으로만 찍는다.
#   출력: 기본 스크린샷 widget 칸 · Play 위젯 스크린샷 · 위젯 이벤트 카드/상세 · Play 대표 이미지(위젯판)
# 사용: bash scripts/store-release-widget-finish.sh <번들 폴더(release-1.10.0)>
# ============================================================================
set -euo pipefail
B="${1:?번들 폴더}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PUP_ROOT="${PUP_ROOT:-$HOME/.gemini/antigravity/scratch/stock2}"   # puppeteer 가 설치된 저장소(node_modules)
for loc in ko en ja; do
  src="$B/raw/widget-capture-$loc.png"
  [ -f "$src" ] || { echo "⛔ $src 없음 — 위젯 재캡처가 먼저다"; exit 1; }
  python3 "$HERE/compose-widget-media.py" "$src" "$loc" "$B/widget-work" ${WIDGET_BOX:+--box "$WIDGET_BOX"}
done
python3 "$HERE/compose-promo-shots.py" "$B/screenshots/compose-spec.json"
python3 "$HERE/compose-promo-shots.py" "$B/play/play-widget-compose-spec.json"
( cd "$PUP_ROOT" && NODE_PATH="$PUP_ROOT/node_modules" KINDS=wcard,wdetail,wfeature node "$HERE/compose-event-media.cjs" "$B/widget-work/preview" "$B/event-widget" ko,en,ja W )
echo "✓ 끝 — 반드시 눈으로 확인: $B/widget-work/preview/widget-cut-*.png (게이트 실패 8종목 수치 0 · 위젯 잘림 없음)"
