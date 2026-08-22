#!/usr/bin/env node
// ============================================================================
// clip-ingest — 받은 16:9 ani 클립을 «라이브러리에 넣을 수 있는 상태»로 만든다
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-22)
//   생성기 워터마크가 우하단에 박혀 나온다. 요금제와 무관하게 끌 수 없다.
//   쇼츠(9:16)는 상단-좌 크롭 0.9 로 지웠지만 «16:9 는 크롭하면 비율이 깨진다».
//   ⇒ 자르지 않고 «그 자리만 메운다» — ffmpeg delogo 는 테두리 픽셀로 안쪽을 보간한다.
//     화면 크기·비율이 그대로다.
//
// 하는 일 (순서대로)
//   ① 해상도 확인 — 16:9 가 아니면 멈춘다
//   ② 워터마크 제거 (delogo)
//   ③ 검수 3종 자동 측정 — 밝기 · 프레임간 변화 · 길이
//   ④ public/shorts/bg/video/<이름>.mp4 로 저장
//
// 사용
//   node scripts/clip-ingest.mjs <입력.mp4> <이름>              기본 상자로 처리
//   node scripts/clip-ingest.mjs <입력.mp4> <이름> --check      상자 위치만 눈으로 확인
//   node scripts/clip-ingest.mjs <입력.mp4> <이름> --box=x,y,w,h  상자 직접 지정
//
// ⛔ 상자는 «첫 클립에서 한 번» 눈으로 맞춘다. --check 로 before/after 를 뽑아 확인하고
//   그 값을 DEFAULT_BOX 에 박아둔 뒤로는 그대로 쓴다.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const FFPROBE = join(FFDIR, 'ffprobe.exe');
const run = (a) => {
  const r = spawnSync(FFMPEG, a, { maxBuffer: 1 << 30, encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
};

// ── 워터마크 상자 — 1920x1080 기준 우하단 ───────────────────────────────────
// ⛔ 첫 클립(1280x720)에서 «확대해 눈으로» 잡은 값이다 — ✦ 는 x 1145~1185 · y 582~622.
//   1920 기준으로 환산해 여유 8px 만 줬다.
//   ⛔ 상자를 크게 잡으면 «지운 자국»이 워터마크보다 더 눈에 띈다 (100x100 에서 확인).
//   매끈한 그라데이션 위에서는 상자가 작을수록 티가 안 난다.
const DEFAULT_BOX = { x: 1700, y: 855, w: 96, h: 96 };

const IN = process.argv[2];
const NAME = process.argv[3];
const CHECK = process.argv.includes('--check');
const boxArg = process.argv.find((a) => a.startsWith('--box='));

if (!IN || !NAME) {
  console.error('사용: node scripts/clip-ingest.mjs <입력.mp4> <이름> [--check] [--box=x,y,w,h]');
  process.exit(1);
}
if (!existsSync(IN)) { console.error(`  ✗ 파일이 없다: ${IN}`); process.exit(1); }

const box = boxArg
  ? (([x, y, w, h]) => ({ x, y, w, h }))(boxArg.slice(6).split(',').map(Number))
  : DEFAULT_BOX;

// ── ① 해상도 ────────────────────────────────────────────────────────────────
const probe = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
  '-of', 'default=nw=1', IN], { encoding: 'utf8' }).stdout || '';
const W = +(probe.match(/width=(\d+)/) || [])[1];
const H = +(probe.match(/height=(\d+)/) || [])[1];
const DUR = +(probe.match(/duration=([\d.]+)/) || [])[1];
console.log(`\n  입력  ${W}x${H}  ${DUR?.toFixed(1)}초`);
if (!W || !H) { console.error('  ✗ 해상도를 못 읽었다'); process.exit(1); }
if (W < H) {
  console.error('  ⛔ 세로 영상이다. 이 스크립트는 «16:9 롱폼용» 이다.');
  console.error('    세로 클립은 기존 절차(상단-좌 크롭)를 쓴다.');
  process.exit(1);
}
const ratio = (W / H).toFixed(2);
if (Math.abs(W / H - 16 / 9) > 0.02) console.log(`  ⚠ 16:9 가 아니다 (${ratio}) — 그래도 진행한다`);

// 상자를 실제 해상도에 맞춰 비례 조정 (1920 기준으로 적어두었다)
const sx = W / 1920, sy = H / 1080;
const B = {
  x: Math.round(box.x * sx), y: Math.round(box.y * sy),
  w: Math.round(box.w * sx), h: Math.round(box.h * sy),
};
// delogo 는 상자가 화면 밖으로 나가면 실패한다
B.w = Math.min(B.w, W - B.x - 1);
B.h = Math.min(B.h, H - B.y - 1);
const delogo = `delogo=x=${B.x}:y=${B.y}:w=${B.w}:h=${B.h}`;
console.log(`  상자  x=${B.x} y=${B.y} w=${B.w} h=${B.h}`);

// ── --check : 상자만 눈으로 확인하고 끝 ─────────────────────────────────────
if (CHECK) {
  const TMP = process.env.TEMP || '.';
  const before = join(TMP, `ingest_${NAME}_before.png`);
  const after = join(TMP, `ingest_${NAME}_after.png`);
  const boxed = join(TMP, `ingest_${NAME}_box.png`);
  const t = Math.min(1, (DUR || 2) / 2);
  run(['-y', '-loglevel', 'error', '-ss', String(t), '-i', IN, '-frames:v', '1', before]);
  run(['-y', '-loglevel', 'error', '-ss', String(t), '-i', IN, '-vf', delogo, '-frames:v', '1', after]);
  run(['-y', '-loglevel', 'error', '-ss', String(t), '-i', IN, '-vf',
    `drawbox=x=${B.x}:y=${B.y}:w=${B.w}:h=${B.h}:color=red@0.8:t=4`, '-frames:v', '1', boxed]);
  console.log(`\n  ── 눈으로 확인 ──`);
  console.log(`   상자 위치  ${boxed}`);
  console.log(`   지우기 전  ${before}`);
  console.log(`   지운 뒤    ${after}`);
  console.log(`\n  상자가 어긋나면 --box=x,y,w,h 로 조정한 뒤 DEFAULT_BOX 에 박아둔다.`);
  process.exit(0);
}

// ── ② 워터마크 제거 + 저장 ──────────────────────────────────────────────────
const OUTDIR = 'public/shorts/bg/video';
if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });
const OUT = join(OUTDIR, `${NAME}.mp4`);
run(['-y', '-loglevel', 'error', '-i', IN, '-vf', delogo,
  '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', OUT]);
if (!existsSync(OUT)) { console.error('  ✗ 저장 실패'); process.exit(1); }

// ── ③ 검수 ──────────────────────────────────────────────────────────────────
const yavg = (() => {
  const o = run(['-hide_banner', '-nostats', '-i', OUT, '-vf',
    'format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']);
  const all = [...o.matchAll(/YAVG=([\d.]+)/g)].map((m) => +m[1]);
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
})();

const motion = (() => {
  const GW = 96, GH = 171, GS = GW * GH;
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', OUT, '-vf',
    `fps=6,scale=${GW}:${GH},format=gray`, '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 28, encoding: 'buffer' });
  const buf = r.stdout; const n = Math.floor(buf.length / GS);
  let over = 0, sum = 0;
  for (let i = 1; i < n; i++) {
    let s = 0;
    const a = buf.subarray((i - 1) * GS, i * GS), b = buf.subarray(i * GS, (i + 1) * GS);
    for (let k = 0; k < GS; k++) s += Math.abs(a[k] - b[k]);
    const v = s / GS; sum += v; if (v > 18) over++;
  }
  return { avg: sum / Math.max(1, n - 1), over, n: n - 1 };
})();

const ok = (label, pass, got, want) =>
  console.log(`   ${pass ? '✔' : '✗'} ${label.padEnd(14)} ${String(got).padEnd(22)} ${pass ? '' : '기준 ' + want}`);

console.log(`\n  ── 검수 ──`);
ok('16:9', Math.abs(W / H - 16 / 9) <= 0.02, `${W}x${H}`, '가로:세로 = 16:9');
ok('밝기', yavg != null && yavg >= 72, yavg?.toFixed(1) ?? '-', '>= 72');
ok('움직임', motion.over <= motion.n * 0.2, `평균 ${motion.avg.toFixed(1)} · 초과 ${motion.over}/${motion.n}`, '18 초과가 20% 이하');
ok('길이', DUR >= 5, `${DUR?.toFixed(1)}초`, '>= 5초 (루프 이음새)');

const pass = Math.abs(W / H - 16 / 9) <= 0.02 && yavg >= 72
  && motion.over <= motion.n * 0.2 && DUR >= 5;
console.log(`\n  → ${OUT}`);
console.log(pass
  ? '  ✅ 라이브러리에 넣어도 된다'
  : '  ⛔ 기준을 어겼다 — 다시 뽑거나, 왜 예외인지 적고 쓴다');
