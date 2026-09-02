#!/bin/bash
# ============================================================================
# daily-ranking-videos — 랭킹 영상 하루치를 «한 번»에 만든다.
#
# 왜: 유튜브가 우리 유일한 만 단위 도달 채널인데(28일 KR 1.3만), 손으로
# 만들다 보니 공급이 끊겼다. 공급이 끊기면 채널이 죽는다.
#
#   1) 평소 대비 이탈 랭킹 산출(만기 롤오버 방어 포함)
#   2) 앱 실화면 녹화(스크롤 0.8화면 — 「폰 스크롤로 인식될 정도」)
#   3) 3개 언어 렌더
#
# 실행: bash scripts/daily-ranking-videos.sh [출력폴더]
# ============================================================================
set -e
cd "$(dirname "$0")/.."
OUT="${1:-$HOME/Desktop/랭킹영상 $(date +%Y-%m-%d)}"
mkdir -p "$OUT"

echo "━━ 1/3 평소 대비 이탈 랭킹 산출 ━━"
node scripts/make-deviation-ranking.js 30 5

echo
echo "━━ 2/3 앱 실화면 녹화 ━━"
for L in ko en ja; do
  REEL_FRAMES="/tmp/rf-$L" REEL_SCROLL_SCREENS=0.8 \
    node scripts/make-appreel-capture.js "$L" cmd NVDA 110 signum >/dev/null 2>&1 \
    && echo "  $L 녹화 완료" || echo "  ⚠️ $L 녹화 실패(검수 게이트) — 이 언어는 폰 컷 없이 간다"
done

echo
echo "━━ 3/3 렌더 ━━"
for L in ko en ja; do
  FR=""; [ -d "/tmp/rf-$L" ] && FR="/tmp/rf-$L"
  node scripts/make-deviation-spec.js "$L" "$FR" > "/tmp/dev-$L.json"
  python3 scripts/make-appreel.py "/tmp/dev-$L.json" "$OUT/이탈랭킹-$L.mp4"
done

echo
echo "━━ 4/4 앱 광고 후첨 ━━"
# 랭킹 영상만으로는 설치로 안 간다. 끝에 4초 앱 광고를 붙인다.
# 광고 원본이 외장에 있어야 한다(윈도우 제작분).
OUTRO="${APP_OUTRO:-/Volumes/macportable/pdown/movie/SIGNUM_쇼츠_후첨_앱광고_KO_9x16_무음_발화자막없음.mp4}"
if [ -f "$OUTRO" ]; then
  for f in "$OUT"/이탈랭킹-*.mp4; do
    [ -e "$f" ] || continue
    bash scripts/append-app-outro.sh "$f" "${f%.mp4}_광고포함.mp4" "$OUTRO" >/dev/null && echo "  $(basename "${f%.mp4}")  광고 4초 후첨"
  done
else
  echo "  ⚠️ 광고 원본 없음 → 후첨 건너뜀 ($OUTRO)"
fi

echo
echo "완료 → $OUT"
ls -lh "$OUT"/*.mp4 | awk '{print "  ", $9, $5}'
