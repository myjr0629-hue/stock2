#!/bin/bash
# ============================================================================
# mux-narration — 영상에 나레이션을 합친다.
#
# ⚠️ [2026-09-01] 우리 영상은 오디오 스트림이 «아예 없었다». 틱톡·쇼츠는
#    무음을 밀어주지 않는다(실측: 틱톡 50회 조회·반응 0).
#
# ⚠️ 길이가 다르면 «긴 쪽»에 맞춘다. -shortest 를 쓰면 말이 잘려 결론이
#    사라진다. 음성이 길면 마지막 프레임을 유지(tpad)해 끝까지 말하게 한다.
#    실측: 나레이션 43.9초 vs 영상 32.6초 — 그냥 합치면 11초가 잘린다.
#
# ⚠️ 이 저장소에는 ffprobe 가 없다(ffmpeg-static 은 ffmpeg 만 준다).
#    길이는 ffmpeg 의 stderr 에서 읽는다.
#
# 실행: bash scripts/mux-narration.sh <video.mp4> <audio.mp3> <out.mp4>
# ============================================================================
set -e
cd "$(dirname "$0")/.."
FF=node_modules/ffmpeg-static/ffmpeg
dur() { "$FF" -i "$1" 2>&1 | grep -oE "Duration: [0-9]+:[0-9]+:[0-9.]+" | head -1 | sed 's/Duration: //' \
        | awk -F: '{print $1*3600+$2*60+$3}'; }
V="$1"; A="$2"; O="$3"
AD=$(dur "$A"); VD=$(dur "$V")
LONG=$(python3 -c "print(round(max($AD,$VD)+0.6,2))")
"$FF" -y -loglevel error -i "$V" -i "$A" \
  -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=120[v];[1:a]apad[a]" \
  -map "[v]" -map "[a]" -t "$LONG" \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -c:a aac -b:a 128k -movflags +faststart "$O"
echo "$O  (영상 ${VD}s · 음성 ${AD}s → ${LONG}s)"
