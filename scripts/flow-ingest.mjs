#!/usr/bin/env node
// ============================================================================
// flow-ingest — Flow 로 만든 배경을 «워터마크 지우고» 라이브러리에 등록한다
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-17): "플로우에서 생성한 것은 항상 E:\SIGNUM_UPLOAD\video flow 에
//   넣을 테니 라이브러리 업데이트를 항상 해놔라."
//
// 사용:
//   node scripts/flow-ingest.mjs                    ← «새 파일»만 목록으로 보여준다
//   node scripts/flow-ingest.mjs "Shopping_carts=retail-carts-dusk|비 오는 주차장의 쇼핑카트 줄" ...
//        └ 인자 형식:  <원본파일명 일부>=<저장할이름>|<한 줄 설명>
//
// 하는 일
//   ① 원본에서 우하단 Flow 워터마크를 delogo 로 지운다
//   ② public/shorts/bg/video/<이름>.mp4 로 저장 (오디오 버림 — 배경은 무음)
//   ③ .agent/BG_LIBRARY.json 에 등록 (src·설명·loopFrames·원본파일명)
//   ④ loopFrames 를 «실측»해서 계산한다 — 대본에 그대로 붙여 쓰면 된다
//
// ★ loopFrames 규약: Remotion 은 30fps 로 렌더한다. 소스가 24fps 여도
//   loopFrames = «영상 초» × 30 이다. (24fps 240프레임 = 10초 → 300)
//
// ★ 워터마크 좌표 — 2026-08-17 실측 (세로 720x1280 기준)
//   4각 별이 x 579~624 · y 1136~1178 에 있다. 여유를 둬 60x57 로 덮는다.
//   ⚠️ 가로(1280x720) 소스는 좌표가 다르다(x=1128:y=570:w=64:h=60). 아래에서 분기한다.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'E:/SIGNUM_UPLOAD/video flow';
const OUT_DIR = 'public/shorts/bg/video';
const LIB = '.agent/BG_LIBRARY.json';
const FF = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';
const FP = FF.replace('ffmpeg.exe', 'ffprobe.exe');

// 워터마크 박스 — 방향별 실측치
const WM_PORTRAIT = 'delogo=x=572:y=1129:w=60:h=57';   // 720x1280
const WM_LANDSCAPE = 'delogo=x=1128:y=570:w=64:h=60';  // 1280x720

if (!existsSync(SRC_DIR)) { console.error(`원본 폴더가 없다: ${SRC_DIR}`); process.exit(1); }
mkdirSync(OUT_DIR, { recursive: true });

const lib = existsSync(LIB) ? JSON.parse(readFileSync(LIB, 'utf8')) : { clips: {} };
lib.clips ??= {};

const probe = (f) => {
  const raw = execFileSync(FP, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', f], { encoding: 'utf8' }).trim().split(/\r?\n/);
  return { w: +raw[0], h: +raw[1], sec: +raw[2] };
};

const sources = readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.mp4'));
const known = new Set(Object.values(lib.clips).map((c) => c.from).filter(Boolean));

// ── 인자 없음 → 아직 등록 안 된 파일만 보여주고 끝낸다 ──────────────────────
if (process.argv.length <= 2) {
  const fresh = sources.filter((f) => !known.has(f));
  console.log(`원본 ${sources.length}개 · 라이브러리 ${Object.keys(lib.clips).length}개`);
  if (!fresh.length) { console.log('\n새로 등록할 파일 없음.'); process.exit(0); }
  console.log(`\n★ 아직 등록 안 된 파일 ${fresh.length}개:\n`);
  for (const f of fresh) {
    const p = probe(join(SRC_DIR, f));
    console.log(`  ${f}`);
    console.log(`      ${p.w}x${p.h} · ${p.sec.toFixed(2)}s · loopFrames ${Math.round(p.sec * 30)}`);
  }
  console.log(`\n등록하려면:\n  node scripts/flow-ingest.mjs "<파일명일부>=<저장이름>|<설명>" ...`);
  process.exit(0);
}

// ── 인자 처리 ───────────────────────────────────────────────────────────────
let done = 0;
for (const arg of process.argv.slice(2)) {
  const [lhs, desc = ''] = arg.split('|');
  const [needle, name] = lhs.split('=');
  if (!needle || !name) { console.error(`형식 오류: ${arg}`); continue; }

  const hit = sources.find((f) => f.includes(needle));
  if (!hit) { console.error(`✗ 원본을 못 찾음: ${needle}`); continue; }

  const inPath = join(SRC_DIR, hit);
  const outPath = join(OUT_DIR, `${name}.mp4`);
  const p = probe(inPath);
  const wm = p.h > p.w ? WM_PORTRAIT : WM_LANDSCAPE;

  execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', inPath,
    '-vf', wm, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', outPath], { stdio: 'inherit' });

  const loopFrames = Math.round(p.sec * 30);
  lib.clips[name] = {
    src: `shorts/bg/video/${name}.mp4`,
    from: hit,
    desc,
    w: p.w, h: p.h, sec: +p.sec.toFixed(3), loopFrames,
    delogo: wm,
    addedAt: '2026-08-17',
  };
  console.log(`  ✔ ${name}  ${p.w}x${p.h} · ${p.sec.toFixed(2)}s · loopFrames ${loopFrames}  ${desc}`);
  done++;
}

writeFileSync(LIB, JSON.stringify(lib, null, 2), 'utf8');
console.log(`\n${done}개 등록 → ${LIB} (총 ${Object.keys(lib.clips).length}개)`);
console.log(`대본에 쓸 때:  bg: { kind: 'video', src: 'shorts/bg/video/<이름>.mp4', loopFrames: <위 값> }`);
