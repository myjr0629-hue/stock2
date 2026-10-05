#!/usr/bin/env bash
# 안드로이드 제출 전 «필수» 검사 — AAB 안에 캡시터 설정(서버 주소)·플러그인 목록·오프라인 화면이 들어 있는지.
# 왜(2026-10-05): 9/30 1.3.1 을 워크트리(~/signum-worktrees/widget-ref)에서 빌드했는데 그 폴더엔 cap sync 로 생기는
#   gitignore 파일(assets/capacitor.config.json·capacitor.plugins.json·public/)이 없었다 → 설정 없는 앱이 출시돼
#   https://localhost/ 를 열고 «연결 거부» — 10/1~10/5 안드 사용자 전원이 앱을 못 썼다. 빌드는 경고 없이 성공했다.
# 사용: bash scripts/android-release-check.sh android/app/build/outputs/bundle/release/app-release.aab
set -euo pipefail
AAB="${1:?AAB 경로}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
unzip -q -o "$AAB" 'base/assets/*' 'base/manifest/AndroidManifest.xml' -d "$T" 2>/dev/null || true
fail=0
CFG="$T/base/assets/capacitor.config.json"
if [ ! -f "$CFG" ]; then echo "⛔ capacitor.config.json 없음 — 정상 저장소에서 npx cap sync android 뒤 다시 빌드"; fail=1; else
  URL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('server',{}).get('url',''))" "$CFG")
  if [ "$URL" = "https://www.signumhq.com/en/app-view/dash" ]; then echo "✓ server.url = $URL"; else echo "⛔ server.url = «$URL» (운영 주소 아님 — 미리보기·라이브리로드 환경변수가 섞였나)"; fail=1; fi
fi
PJ="$T/base/assets/capacitor.plugins.json"
if [ -f "$PJ" ] && grep -q '@revenuecat/purchases-capacitor' "$PJ"; then echo "✓ capacitor.plugins.json ($(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$PJ")개, RevenueCat 포함)"; else echo "⛔ capacitor.plugins.json 없음 또는 RevenueCat 없음"; fail=1; fi
if [ -f "$T/base/assets/public/index.html" ]; then echo "✓ public/index.html(오프라인 화면)"; else echo "⛔ public/index.html 없음"; fail=1; fi
VER=$(strings "$T/base/manifest/AndroidManifest.xml" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
echo "· versionName(매니페스트 문자열) = ${VER:-?}"
[ "$fail" = 0 ] && echo "✅ 통과 — 제출해도 된다" || { echo "❌ 실패 — 제출 금지"; exit 1; }
