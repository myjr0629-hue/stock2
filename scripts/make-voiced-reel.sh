#!/bin/bash
# ============================================================================
# make-voiced-reel — «말하는» 랭킹 영상 한 편을 끝까지 만든다.
#
#   랭킹 산출 → 스펙 → 나레이션(ElevenLabs) → 길이 측정 →
#   스펙의 장면 길이를 «음성에 맞춰» 재조정 → 렌더 → 합성
#
# ⚠️ 순서가 중요하다. 영상을 먼저 만들고 음성을 붙이면 길이가 어긋나
#    끝이 정지화면으로 남거나(실측 11초) 말이 잘린다.
#    **음성이 먼저고 영상이 거기에 맞춘다.**
#
# 실행: bash scripts/make-voiced-reel.sh <ko|en|ja> <출력.mp4> [frames_dir]
# ============================================================================
set -e
cd "$(dirname "$0")/.."
FF=node_modules/ffmpeg-static/ffmpeg
LOC="${1:-ko}"; OUT="${2:-/tmp/voiced-$LOC.mp4}"; FRAMES="${3:-}"
dur() { "$FF" -i "$1" 2>&1 | grep -oE "Duration: [0-9]+:[0-9]+:[0-9.]+" | head -1 | sed 's/Duration: //' \
        | awk -F: '{print $1*3600+$2*60+$3}'; }

SPEC="/tmp/vr-$LOC.json"; NARR="/tmp/vr-$LOC.mp3"; SILENT="/tmp/vr-$LOC-silent.mp4"

echo "[1/5] 스펙"
node scripts/make-deviation-spec.js "$LOC" "$FRAMES" > "$SPEC"

echo "[2/5] 나레이션"
node scripts/make-narration.js "$SPEC" "$NARR" "$LOC" 2>&1 | tail -1
AD=$(dur "$NARR")

echo "[3/5] 장면 길이를 음성 ${AD}초에 맞춤"
python3 - "$SPEC" "$AD" <<'PY'
import json, sys, io
spec_path, target = sys.argv[1], float(sys.argv[2])
spec = json.load(io.open(spec_path, encoding='utf-8'))
cur = sum(s.get('seconds', 3) for s in spec['scenes'])
# 음성 끝나고 0.6초 여유 — 마지막 말이 화면과 함께 끝나야 한다
k = (target + 0.6) / cur
for s in spec['scenes']:
    s['seconds'] = round(s.get('seconds', 3) * k, 2)
io.open(spec_path, 'w', encoding='utf-8').write(json.dumps(spec, ensure_ascii=False, indent=1))
print(f"   장면 합계 {cur:.1f}s → {cur*k:.1f}s (배율 {k:.2f})")
PY

echo "[4/5] 렌더"
python3 scripts/make-appreel.py "$SPEC" "$SILENT" | tail -1

echo "[5/5] 합성"
bash scripts/mux-narration.sh "$SILENT" "$NARR" "$OUT"
