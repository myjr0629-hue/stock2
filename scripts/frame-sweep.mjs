#!/usr/bin/env node
// ============================================================================
// frame-sweep — 완성 영상을 «전 구간» 훑어 컨택트시트를 만든다 (겹침 전수 검사)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-13 대표 지적: "겹치게 나오는 것이 있다"):
//   프레임 몇 장만 뽑아 보는 검수로는 겹침을 못 잡는다. 겹침은 «특정 비트의
//   특정 값»에서만 터진다 — 예: value 가 11자('HIDDEN TAPE')일 때만 두 줄로 감겨
//   위아래를 덮었다. 짧은 값 비트만 보면 멀쩡해 보인다.
//   → 1초 간격으로 전 구간을 뽑아 시트로 만들어 «한 번에» 훑는다.
//
// 사용:  node scripts/frame-sweep.mjs out/x.mp4 [간격초=1] [시트당장수=10]
// 출력:  <영상경로>-sweep-N.jpg
//
// ⚠️ Remotion 동봉 ffmpeg 은 최소 빌드라 tile/vstack/rawvideo 필터가 없다.
//    합성은 sharp 로 한다.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { join, dirname, basename, extname } from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const sharp = createRequire(join(process.cwd(), 'package.json'))('sharp');

const IS_WIN = process.platform === 'win32';
const COMP = join('node_modules', '@remotion', IS_WIN ? 'compositor-win32-x64-msvc' : 'compositor-darwin-arm64');
const FF = join(COMP, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE = join(COMP, IS_WIN ? 'ffprobe.exe' : 'ffprobe');
const ENV = IS_WIN ? process.env : { ...process.env, DYLD_LIBRARY_PATH: COMP };

const SRC = process.argv[2];
if (!SRC) { console.error('사용: node scripts/frame-sweep.mjs <영상> [간격초] [시트당장수]'); process.exit(1); }
const STEP = Number(process.argv[3] || 1);
const PER = Number(process.argv[4] || 10);

const dur = parseFloat(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', SRC],
  { env: ENV }).toString());

// 세로 영상 5장을 가로로 → 시트 한 장. 320x569 면 자막까지 읽힌다.
const W = 320, H = 569, COLS = 5;
const times = [];
for (let t = 0; t < dur - 0.05; t += STEP) times.push(+t.toFixed(2));

const out = [];
for (let s = 0; s * PER < times.length; s++) {
  const chunk = times.slice(s * PER, (s + 1) * PER);
  const rows = Math.ceil(chunk.length / COLS);
  const tiles = [];
  for (let i = 0; i < chunk.length; i++) {
    const tmp = join(tmpdir(), `sweep-${i}.png`);
    execFileSync(FF, ['-y', '-v', 'error', '-ss', String(chunk[i]), '-i', SRC,
      '-vf', `scale=${W}:${H}`, '-frames:v', '1', tmp], { env: ENV });
    tiles.push({ input: readFileSync(tmp), left: (i % COLS) * W, top: Math.floor(i / COLS) * H });
    unlinkSync(tmp);
  }
  const dst = join(dirname(SRC), `${basename(SRC, extname(SRC))}-sweep-${s + 1}.jpg`);
  await sharp({ create: { width: W * COLS, height: H * rows, channels: 3, background: '#1A1A1A' } })
    .composite(tiles).jpeg({ quality: 86 }).toFile(dst);
  out.push(`${dst}   ${chunk[0]}s ~ ${chunk[chunk.length - 1]}s`);
}

console.log(`${basename(SRC)}  ${dur.toFixed(2)}초 · ${times.length}장 · ${STEP}초 간격`);
out.forEach((o) => console.log('  ' + o));
