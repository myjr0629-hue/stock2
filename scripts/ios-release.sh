#!/usr/bin/env bash
# ============================================================================
# ios-release — iOS 앱 하나를 «버전업 → 빌드 → 서명 → 업로드 → 심사제출» 까지
#               한 번에 끝낸다.
# ----------------------------------------------------------------------------
# 왜 만들었나 (2026-08-23 대표 지시: 「두번세번 하지 않게 처음부터 완벽하게」):
#   오늘 SIGNUM·UC 를 손으로 올리면서 같은 벽에 두 번 부딪혔다.
#     ① 배포 인증서가 «정말로» 없었다 → 대표가 Xcode 에서 생성(1회성, 1년 유효)
#     ② 인증서를 만든 뒤에도 기존 프로비저닝 프로파일이 «폐기된 옛 인증서»를
#        참조해 export 가 실패했다 → ASC API 로 프로파일을 새로 만들어 해결
#   ②는 다시 일어날 수 있어서 이 스크립트가 프로파일 유효성을 먼저 검사한다.
#
# 선행조건 (한 번만 하면 1년간 유지):
#   · 키체인에 `Apple Distribution: Signum Hq, LLC` 존재
#   · `~/Library/.../Provisioning Profiles/` 에 `<앱> AppStore 2026` 프로파일
#   · `~/.appstoreconnect/private_keys/AuthKey_2LD2B7366M.p8`
#   ※ 서명 중 키체인 허용 창이 뜨면 «항상 허용» 을 누를 것. 그러면 다음부터 안 뜬다.
#
# 사용:  ./scripts/ios-release.sh <signum|uc|wim> <새버전> "<새로운 기능 en>"
# 예:    ./scripts/ios-release.sh signum 1.4 "Bug fixes and improvements."
# ============================================================================
set -euo pipefail

APP_KEY="${1:?signum | uc | wim}"
NEW_VERSION="${2:?새 버전 (예: 1.4)}"
WHATS_NEW_EN="${3:-Stability and performance improvements.}"

case "$APP_KEY" in
  signum) PROJ_DIR="ios/App";        BUNDLE="com.signumhq.app";          ASC_APP="6783130444"; PROFILE="SIGNUM HQ AppStore 2026" ;;
  uc)     PROJ_DIR="uc-app/ios/App"; BUNDLE="com.signumhq.undercurrent";  ASC_APP="6788779895"; PROFILE="Undercurrent AppStore 2026" ;;
  wim)    PROJ_DIR="wim-app/ios/App";BUNDLE="com.signumhq.wim";           ASC_APP="6794356135"; PROFILE="WIM AppStore 2026" ;;
  *) echo "signum | uc | wim 중 하나"; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT="Apple Distribution: Signum Hq, LLC (25RG9GSHHZ)"
cd "$ROOT"

say() { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }

# ---- 0. 선행조건 검사 — 여기서 걸러야 30분짜리 빌드를 헛돌리지 않는다 ----
say "선행조건 검사"
security find-identity -v -p codesigning | grep -q "Apple Distribution: Signum Hq" \
  || { echo "✗ 배포 인증서 없음. Xcode → Settings → Apple Accounts → 팀 선택 → Manage Certificates → + → Apple Distribution"; exit 1; }
echo "  ✓ 배포 인증서"
python3 "$ROOT/scripts/ios_check_profile.py" "$PROFILE" "$BUNDLE" || exit 1

# ---- 1. 버전 올리기 ----
say "버전 $NEW_VERSION 로 올리는 중"
PBX="$PROJ_DIR/App.xcodeproj/project.pbxproj"
CUR_BUILD=$(grep -m1 -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$PBX" | grep -o '[0-9]*')
NEXT_BUILD=$((CUR_BUILD + 1))
sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $NEW_VERSION;/g" "$PBX"
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $NEXT_BUILD;/g" "$PBX"
echo "  marketing=$NEW_VERSION  build=$CUR_BUILD → $NEXT_BUILD"

# ---- 2. 아카이브 ----
ARCHIVE="/tmp/${APP_KEY}-archive.xcarchive"
say "아카이브 (몇 분 걸린다)"
rm -rf "$ARCHIVE"
xcodebuild -project "$PROJ_DIR/App.xcodeproj" -scheme App -configuration Release \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" -allowProvisioningUpdates archive \
  > "/tmp/${APP_KEY}-archive.log" 2>&1 \
  || { echo "✗ 아카이브 실패 — /tmp/${APP_KEY}-archive.log 확인"; tail -20 "/tmp/${APP_KEY}-archive.log"; exit 1; }
echo "  ✓ ARCHIVE SUCCEEDED"

# ---- 3. export (수동 서명) ----
# 자동 서명은 «Cloud signing permission error» 로 막힌다. 수동이 확실하다.
EXPORT_DIR="/tmp/${APP_KEY}-export"
PLIST="/tmp/${APP_KEY}-export.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>25RG9GSHHZ</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>$CERT</string>
  <key>provisioningProfiles</key><dict><key>$BUNDLE</key><string>$PROFILE</string></dict>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict></plist>
PL
say "서명·export"
echo "  ※ 키체인 허용 창이 뜨면 «항상 허용» 을 누를 것"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT_DIR" -exportOptionsPlist "$PLIST" \
  > "/tmp/${APP_KEY}-export.log" 2>&1 \
  || { echo "✗ export 실패"; tail -20 "/tmp/${APP_KEY}-export.log"; exit 1; }
echo "  ✓ EXPORT SUCCEEDED  ($(du -h "$EXPORT_DIR/App.ipa" | cut -f1))"

# ---- 4. 업로드 ----
say "App Store Connect 업로드"
xcrun altool --upload-app -f "$EXPORT_DIR/App.ipa" -t ios \
  --apiKey 2LD2B7366M --apiIssuer ede31c44-c5ac-437b-ab19-ad5d581ef6f9 2>&1 | tail -6

# ---- 5. 버전 생성·빌드연결·메타·제출 ----
say "버전 연결 및 심사 제출"
python3 "$ROOT/scripts/ios_submit.py" "$ASC_APP" "$NEW_VERSION" "$NEXT_BUILD" "$WHATS_NEW_EN"
