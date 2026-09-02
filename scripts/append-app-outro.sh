#!/usr/bin/env bash
# ============================================================================
# append-app-outro — 랭킹 영상 뒤에 «앱 광고 4초»를 붙인다.
# ----------------------------------------------------------------------------
# 왜 (2026-09-02 대표 지시): 영상 제작은 윈도우에서 하고 맥은 홍보·앱관리를
# 맡되, 맥에서 만든 랭킹 영상에도 같은 광고 꼬리를 붙일 수 있어야 한다.
#
# 실측으로 확인한 사실:
#   · 랭킹 영상 = 1080x1920 / 30fps / h264 + aac
#   · 광고 꼬리 = 1080x1920 / 30fps / h264 / **무음**  ← 여기가 함정
#   · 무음 클립을 그냥 concat 하면 오디오 스트림 수가 안 맞아 깨진다
#     → anullsrc 로 «무음 트랙»을 만들어 붙인 뒤 concat 한다.
#
# ffmpeg 은 시스템에 없다. 저장소가 두 벌을 갖고 있다:
#   · node_modules/ffmpeg-static/ffmpeg            (6.0, concat/hstack 있음) ← 이걸 쓴다
#   · node_modules/@remotion/compositor-*/ffmpeg   (7.1, 최소빌드 — hstack 없음)
#
# 사용:  bash scripts/append-app-outro.sh <본편.mp4> [출력.mp4] [광고.mp4]
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

FF="$ROOT/node_modules/ffmpeg-static/ffmpeg"
FP="$ROOT/node_modules/@remotion/compositor-darwin-arm64/ffprobe"
export DYLD_LIBRARY_PATH="$ROOT/node_modules/@remotion/compositor-darwin-arm64"

MAIN="${1:?본편 mp4 경로}"
OUT="${2:-${MAIN%.mp4}_광고포함.mp4}"
OUTRO="${3:-/Volumes/macportable/pdown/movie/SIGNUM_쇼츠_후첨_앱광고_KO_9x16_무음_발화자막없음.mp4}"

[ -x "$FF" ] || { echo "✗ ffmpeg-static 없음: $FF"; exit 1; }
[ -f "$MAIN" ] || { echo "✗ 본편 없음: $MAIN"; exit 1; }
[ -f "$OUTRO" ] || { echo "✗ 광고 없음: $OUTRO"; exit 1; }

probe() { "$FP" -v error -select_streams "$1" -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$2" 2>/dev/null | paste -sd' ' -; }
echo "본편 : $(basename "$MAIN")  [$(probe v:0 "$MAIN")]"
echo "광고 : $(basename "$OUTRO")  [$(probe v:0 "$OUTRO")]"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 광고에 무음 오디오를 입혀 스트림 구성을 본편과 맞춘다.
"$FF" -v error -y -i "$OUTRO" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -shortest -c:v copy -c:a aac -b:a 128k "$TMP/outro_a.mp4"

# 규격을 강제로 통일해 concat 안전성을 확보(해상도·fps·SAR·픽셀포맷).
norm() {
  "$FF" -v error -y -i "$1" \
    -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p" \
    -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k -ar 48000 -ac 2 "$2"
}
echo "  규격 통일 중…"
norm "$MAIN"        "$TMP/a.mp4"
norm "$TMP/outro_a.mp4" "$TMP/b.mp4"

printf "file '%s'\nfile '%s'\n" "$TMP/a.mp4" "$TMP/b.mp4" > "$TMP/list.txt"
"$FF" -v error -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$OUT"

echo "✓ $OUT  [$(probe v:0 "$OUT")]"
