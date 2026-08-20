#!/usr/bin/env node
// ============================================================================
// declip — Flow 생성 클립의 「워터마크 제거 + 업스케일」 정본 공정
// ----------------------------------------------------------------------------
// ⛔ 대표 지시 2026-08-21:
//   "워터마크는 없게 해야지 (…) flow영상은 확대해서 안보이게 해야지"
//   "720이 기본이고 지금까지 그렇게 줬다. 니가 업스케일해서 사용하던지"
//
// ⛔ 워터마크 실측 (gold-btc-race.mp4, 720x1280 원본)
//   Google Flow 의 ✦ 마크가 **x 583~627 · y 1136~1180** 에 고정으로 박힌다.
//   흐릿한 배경에서도 눈에 띈다. 지우개(delogo)로는 자국이 남으므로 **잘라낸다.**
//
// 방법: 워터마크를 뺀 최대 9:16 사각형으로 크롭 → 1080x1920 로 lanczos 업스케일
//   크롭 576x1024 (x 0, y 112)  →  x<=576 이라 워터마크(583~) 가 확실히 빠진다
//   상단 112 / 하단 144 / 우측 144 를 버린다. 인물은 가운데 있어 살아남는다
//
// 사용: node scripts/declip.mjs <in.mp4> <out.mp4>
//       node scripts/declip.mjs --all      (bg/video 의 Flow 클립 일괄)
// ============================================================================
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const FFPROBE = join(FFDIR, 'ffprobe.exe');

// 워터마크를 뺀 최대 9:16 창 (720x1280 기준). 720 이 아닌 소스는 비율로 환산한다
export const WM = { x: 583, y: 1136 };          // 워터마크 좌상단 (실측)
const CROP = { w: 576, h: 1024, x: 0, y: 112 }; // 576 < 583 → 확실히 배제
const OUT = { w: 1080, h: 1920 };

export function declip(src, dst) {
  const p = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src], { encoding: 'utf8' });
  const [sw, sh] = (p.stdout || '').trim().split(',').map(Number);
  const k = sw / 720;                              // 720 기준 좌표를 소스 해상도로 환산
  const c = {
    w: Math.round(CROP.w * k) & ~1, h: Math.round(CROP.h * k) & ~1,
    x: Math.round(CROP.x * k) & ~1, y: Math.round(CROP.y * k) & ~1,
  };
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', src,
    '-vf', `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${OUT.w}:${OUT.h}:flags=lanczos,unsharp=5:5:0.45`,
    '-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', dst],
    { encoding: 'utf8' });
  return { ok: existsSync(dst), sw, sh, crop: c, err: (r.stderr || '').slice(-200) };
}

const direct = String(process.argv[1] || '').endsWith('declip.mjs');
if (direct) {
  const a = process.argv[2], b = process.argv[3];
  if (!a || !b) { console.error('사용: declip <in.mp4> <out.mp4>'); process.exit(1); }
  const r = declip(a, b);
  console.log(r.ok
    ? `  ✔ ${a}  ${r.sw}x${r.sh} → crop ${r.crop.w}x${r.crop.h}@(${r.crop.x},${r.crop.y}) → ${OUT.w}x${OUT.h}`
    : `  ✗ ${r.err}`);
  process.exit(r.ok ? 0 : 1);
}
