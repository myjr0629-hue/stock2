#!/usr/bin/env node
// ============================================================================
// video-ref-measure — 레퍼런스 영상 L2(측정) 엔진
// ----------------------------------------------------------------------------
// 레퍼런스 분석은 2단이다 (.agent/VIDEO_ENGINE_RESEARCH_2026-07-31.md §7):
//   L1 의미  — mcp/video-analyst (Gemini, URL 직접). 무엇을 파는가/씬 구성/화면 텍스트.
//   L2 측정  — 이 스크립트. 컷·배경이동·애니메이션·밝기. 계산이라 답이 뒤집히지 않는다.
//
// 왜 필요한가: 2026-07-31, Gemini 2패스가 둘 다 「하단 1/3 불투명 패널」이라고 답했는데
// 실제 프레임에는 그런 패널이 없었다. 모델은 "있을 법한 레이아웃"을 지어낸다.
// L1이 준 레이아웃·모션·ms는 L2로 검증하기 전까지 정본에 기록하지 않는다.
//
// 사용:
//   node scripts/video-ref-measure.mjs <url-or-file> [--keep]
//   node scripts/video-ref-measure.mjs https://www.youtube.com/shorts/rLlOhZ-z8ms
//   node scripts/video-ref-measure.mjs out/our_render.mp4      # 우리 결과물 자가검수
//
// 의존(둘 다 추가 설치 없음):
//   ~/.local/bin/yt-dlp_macos      단독 바이너리. 시스템 파이썬 3.9와 무관.
//                                   (pip 설치본은 3.9 제약으로 2025.10까지 → 유튜브 못 엶)
//   node_modules/@remotion/compositor-darwin-arm64/{ffmpeg,ffprobe}
//                                   리모션 번들. DYLD_LIBRARY_PATH를 같은 폴더로 잡아야 실행됨.
//                                   최소 빌드라 필터 50개뿐 — scdet/ssim/select/showinfo 없고
//                                   rawvideo 먹서도 없다 → image2pipe로 덤프해 여기서 계산한다.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';

// 컴포지터 번들은 플랫폼별로 패키지가 다르다 (맥=darwin-arm64 / 윈도우=win32-x64-msvc).
// 맥은 dylib 탐색 경로를 같은 폴더로 잡아줘야 실행되고, 윈도우는 exe 옆 DLL을 스스로 찾는다.
const IS_WIN = process.platform === 'win32';
const COMP_PKG = IS_WIN ? 'compositor-win32-x64-msvc' : 'compositor-darwin-arm64';
const COMP_URL = new URL(`../node_modules/@remotion/${COMP_PKG}/`, import.meta.url);
const COMP = IS_WIN ? fileURLToPath(COMP_URL) : COMP_URL.pathname;
const EXE = IS_WIN ? '.exe' : '';
const FFMPEG = join(COMP, `ffmpeg${EXE}`);
const FFPROBE = join(COMP, `ffprobe${EXE}`);
const YTDLP = join(homedir(), IS_WIN ? '.local/bin/yt-dlp.exe' : '.local/bin/yt-dlp_macos');
const ENV = IS_WIN ? { ...process.env } : { ...process.env, DYLD_LIBRARY_PATH: COMP };

// 프록시 해상도. 작게 잡을수록 빠르고, 컷·이동 판정에는 이 정도로 충분하다.
const W = 64, H = 114, S = W * H;

const sh = (bin, args, opts = {}) =>
  execFileSync(bin, args, { env: ENV, maxBuffer: 1 << 30, ...opts });

function resolveInput(arg, work) {
  if (!/^https?:/.test(arg)) return arg;
  if (!existsSync(YTDLP)) {
    throw new Error(
      `yt-dlp 단독 바이너리가 없습니다: ${YTDLP}\n` +
      `  curl -L -o ${YTDLP} https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos && chmod +x ${YTDLP}`,
    );
  }
  const out = join(work, 'ref.%(ext)s');
  // 최고 화질로. px 측정값이 그대로 1080x1920 컴포지션 좌표가 되므로 저화질이면 전부 어긋난다.
  // 병합은 하지 않는다(ffmpeg PATH 불필요) — 측정에는 비디오 트랙만 있으면 된다.
  sh(YTDLP, ['--no-warnings', '-f', 'bestvideo[height<=1920]', '-o', out, arg], { stdio: 'inherit' });
  const found = readdirSync(work).filter((f) => f.startsWith('ref.')).sort()[0];
  return join(work, found);
}

function probe(file) {
  const raw = sh(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration',
    '-of', 'default=nw=1', file,
  ]).toString();
  const get = (k) => (raw.match(new RegExp(`${k}=(.+)`)) || [])[1]?.trim();
  const [num, den] = (get('r_frame_rate') || '30/1').split('/').map(Number);
  return { w: +get('width'), h: +get('height'), fps: num / den, dur: +get('duration') };
}

/** 전 프레임을 그레이스케일로 덤프. 최소 빌드에 rawvideo 먹서가 없어 image2pipe를 쓴다. */
function dumpGray(file, work) {
  // 셸 리다이렉션을 쓰지 않는다 — 윈도우에는 /bin/sh 가 없다.
  // execFileSync 가 stdout 을 그대로 Buffer 로 준다(ENV 는 sh() 안에서 플랫폼별로 처리).
  const buf = sh(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-i', file,
    '-vf', `scale=${W}:${H}`, '-pix_fmt', 'gray', '-c:v', 'rawvideo', '-f', 'image2pipe', '-',
  ]);
  writeFileSync(join(work, 'gray.raw'), buf);   // --keep 디버깅용
  return { buf, n: Math.floor(buf.length / S) };
}

const frame = (buf, i) => buf.subarray(i * S, (i + 1) * S);
const meanAbsDiff = (a, b, r0 = 0, r1 = H) => {
  let s = 0, k = 0;
  for (let y = r0; y < r1; y++) for (let x = 0; x < W; x++) { s += Math.abs(a[y * W + x] - b[y * W + x]); k++; }
  return s / k;
};

// ── 1) 컷 ───────────────────────────────────────────────────────────────────
function cuts(buf, n, fps, threshold = 18) {
  const out = [];
  for (let i = 1; i < n; i++) {
    const d = meanAbsDiff(frame(buf, i - 1), frame(buf, i));
    if (d > threshold) out.push({ frame: i, t: +(i / fps).toFixed(2), d: +d.toFixed(1) });
  }
  return out;
}

// ── 2) 배경이 움직이는가 ────────────────────────────────────────────────────
// 프레임간 차는 거의 0인데 «샷 처음↔끝» 누적차가 크면 = 아주 느린 연속 이동.
// 정지 이미지라면 누적차도 0이어야 한다. 이 대비가 판정의 전부다.
function backgroundMotion(buf, n, fps, cutFrames, bgRows = [6, 68]) {
  const bounds = [0, ...cutFrames, n];
  const rows = [];
  for (let i = 1; i < bounds.length; i++) {
    const [s0, s1] = [bounds[i - 1], bounds[i]];
    if (s1 - s0 < 30) continue;                       // 너무 짧은 샷은 건너뜀
    let sum = 0, k = 0;
    for (let j = s0 + 8; j < s1 - 4; j++) { sum += meanAbsDiff(frame(buf, j), frame(buf, j + 1), ...bgRows); k++; }
    rows.push({
      shot: `${(s0 / fps).toFixed(2)}~${(s1 / fps).toFixed(2)}s`,
      perFrame: +(sum / k).toFixed(2),
      spanned: +meanAbsDiff(frame(buf, s0 + 8), frame(buf, s1 - 4), ...bgRows).toFixed(2),
    });
  }
  return rows;
}

// ── 3) 이동의 종류 — 켄번즈(중심 확대) / 팬(평행이동) 정합 ──────────────────
// 둘 다 개선이 없으면 «내용 자체가 애니메이션되는 실사/3D». 정지 이미지+CSS 줌으로 재현 불가.
function motionKind(buf, aIdx, bIdx) {
  const A = frame(buf, aIdx), B = frame(buf, bIdx);
  const at = (img, x, y) => {
    x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    return img[y0 * W + x0] * (1 - fx) * (1 - fy) + img[y0 * W + x1] * fx * (1 - fy)
         + img[y1 * W + x0] * (1 - fx) * fy + img[y1 * W + x1] * fx * fy;
  };
  const zoomErr = (k) => { let s = 0, c = 0;
    for (let y = 12; y < H - 12; y++) for (let x = 8; x < W - 8; x++) {
      s += Math.abs(at(A, (x - W / 2) / k + W / 2, (y - H / 2) / k + H / 2) - B[y * W + x]); c++; }
    return s / c; };
  const shiftErr = (dx, dy) => { let s = 0, c = 0;
    for (let y = 12; y < H - 12; y++) for (let x = 8; x < W - 8; x++) {
      s += Math.abs(at(A, x - dx, y - dy) - B[y * W + x]); c++; }
    return s / c; };
  let bz = { k: 1, v: zoomErr(1) };
  for (let k = 0.90; k <= 1.15; k += 0.005) { const v = zoomErr(k); if (v < bz.v) bz = { k: +k.toFixed(3), v }; }
  let bs = { dx: 0, dy: 0, v: shiftErr(0, 0) };
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    const v = shiftErr(dx, dy); if (v < bs.v) bs = { dx, dy, v }; }
  return {
    baseline: +zoomErr(1).toFixed(2),
    bestZoom: { k: bz.k, err: +bz.v.toFixed(2) },
    bestShift: { dx: bs.dx, dy: bs.dy, err: +bs.v.toFixed(2) },
  };
}

// ── 4) 컷 후 애니메이션 타임라인 (상단 텍스트 / 중단 차트) ──────────────────
function entranceTimeline(buf, n, fps, cutFrame, seconds = 4) {
  const TXT = [2, 34], CHART = [34, 97];
  const rows = [];
  for (let k = 0; k < Math.min(seconds * fps, n - cutFrame - 4); k += 3) {
    const i = cutFrame + k;
    rows.push({
      t: +(k / fps).toFixed(2),
      text: +meanAbsDiff(frame(buf, i), frame(buf, i + 3), ...TXT).toFixed(1),
      chart: +meanAbsDiff(frame(buf, i), frame(buf, i + 3), ...CHART).toFixed(1),
    });
  }
  return rows;
}

// ── 5) 우리 것과의 정량 비교 (자가검수 게이트에 그대로 쓰는 지표) ───────────
function vitals(buf, n, fps, cutCount, cutFrames = []) {
  let bright = 0, lit = 0;
  for (let i = 0; i < n; i++) {
    const f = frame(buf, i); let s = 0, L = 0;
    for (let k = 0; k < S; k++) { s += f[k]; if (f[k] > 40) L++; }
    bright += s / S; lit += L / S;
  }
  // ★ 샷별 평균 밝기 — «평균이 숨기는 분포»를 드러낸다
  const bounds = [0, ...cutFrames, n];
  const shotBrightness = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const a = bounds[b], z = bounds[b + 1];
    if (z - a < 2) continue;
    let sum = 0;
    for (let i = a; i < z; i++) {
      const f = frame(buf, i); let t = 0;
      for (let k = 0; k < S; k++) t += f[k];
      sum += t / S;
    }
    shotBrightness.push(+(sum / (z - a)).toFixed(1));
  }

  const secs = n / fps;
  return {
    shotBrightness,
    seconds: +secs.toFixed(1),
    meanBrightness: +(bright / n).toFixed(1),      // 레퍼런스 81.4 / 우리 실패작 5.2
    litPixelPct: +((lit / n) * 100).toFixed(1),    // 레퍼런스 50.6% / 우리 실패작 2.8%
    cuts: cutCount,
    secPerCut: cutCount ? +(secs / cutCount).toFixed(1) : null,
  };
}

/** 발행 전 검수 게이트. 2026-07-31 실패작(밝기 5.2·화소 2.8%·컷 0)이 여기서 걸린다. */
// [FIX 2026-08-04] «평균»이 분포를 숨겼다.
// V1 실측: 씬별 밝기 23·235·26·56·235·29·214·25 → 평균 91.8로 게이트 통과.
// 그런데 실제로 보면 «어두운 영상에 흰 화면이 세 번 번쩍»이었다(대표 지적).
// 나는 게이트 숫자를 맞추는 데 최적화했고, 그 숫자가 나를 속였다.
// → 씬별 «하한»과 씬 간 «격차 상한»을 추가한다. 통짜 평균만으로는 판정 불가.
export const GATE = {
  meanBrightness: 25,   // 전체 평균 하한 (검정 렌더 방지 — 실패작 5.2)
  litPixelPct: 15,      // 밝은 화소 비율 하한
  cutsPer30s: 4,        // 컷 밀도 하한
  shotMinBrightness: 18,// ★ 어떤 샷도 이보다 어두우면 안 된다
  // [FIX 2026-08-04] `shotMaxSpread: 110` 은 **틀린 기준이었다.**
  // 레퍼런스 원본을 직접 측정하니 격차가 220 이라 «레퍼런스가 내 게이트에서 탈락»했다.
  // 원인: 레퍼런스 뒤쪽 흰 배경 «법적 고지 카드»(한국 금융광고 의무사항) 때문.
  // 디자인 결함이 아니다. 진짜 문제는 «전역 격차»가 아니라 «번갈아 번쩍이는 것»이다.
  //   레퍼런스 인접 점프: 45·39·12·10·15·2·**210**·27·18·87 → 큰 점프 1회 (끝에서 한 번)
  //   내 V1  인접 점프: **212·209**·30·**179·206·185·189**   → 큰 점프 6회 (계속 번쩍)
  // → 전역 min/max 가 아니라 «인접 샷 점프가 큰 횟수»를 센다.
  shotJumpThreshold: 150,
  maxBigJumps: 2,
  // [2026-08-11 개정] 길이 게이트 — 플랫폼별 최적이 다르다(kit/variants.ts WINDOW).
  //   YT 48~58 · TikTok 28~38 · Reels 30~45  → 게이트는 «합집합» 28~58 을 본다.
  //   플랫폼 창 검사는 variantReport 가 따로 한다. 여기서는 «너무 짧다»만 막는다.
  //   훅 검증용 초단편은 --short 로 우회.
  minSeconds: 28,
  maxSeconds: 58,
};
export function gateCheck(v) {
  const fails = [];
  const short = process.argv.includes('--short');
  // ★ --lean : 「완주율 사냥」 판 (2026-08-13). CTA 를 «의도적으로» 뺐으므로 28초 하한이
  //   맞지 않는다. 대신 12~24초 창을 강제한다 — 하한을 없애면(--short) 실수가 안 잡힌다.
  //   근거: 모바일 실측 시청 13초. 완주율 70% 관문을 넘으려면 18.6초 이하여야 한다.
  const lean = process.argv.includes('--lean');
  const min = lean ? 12 : GATE.minSeconds;
  const max = lean ? 24 : GATE.maxSeconds;
  if (!short && v.seconds < min) fails.push(`길이 ${v.seconds}s < ${min}s${lean ? '' : ' (CTA가 눌린다)'}`);
  if (v.seconds > max) fails.push(`길이 ${v.seconds}s > ${max}s${lean ? ' (lean 은 24초 이하)' : ''}`);
  if (v.meanBrightness < GATE.meanBrightness) fails.push(`평균밝기 ${v.meanBrightness} < ${GATE.meanBrightness}`);
  if (v.litPixelPct < GATE.litPixelPct) fails.push(`밝은화소 ${v.litPixelPct}% < ${GATE.litPixelPct}%`);
  const need = Math.max(1, Math.round((v.seconds / 30) * GATE.cutsPer30s));
  if (v.cuts < need) fails.push(`컷 ${v.cuts} < ${need}`);
  if (Array.isArray(v.shotBrightness) && v.shotBrightness.length) {
    const lo = Math.min(...v.shotBrightness);
    if (lo < GATE.shotMinBrightness) fails.push(`가장 어두운 샷 ${lo.toFixed(1)} < ${GATE.shotMinBrightness}`);
    let jumps = 0;
    for (let i = 1; i < v.shotBrightness.length; i++) {
      if (Math.abs(v.shotBrightness[i] - v.shotBrightness[i - 1]) > GATE.shotJumpThreshold) jumps++;
    }
    if (jumps > GATE.maxBigJumps) fails.push(`밝기 급변 ${jumps}회 > ${GATE.maxBigJumps} (번쩍임)`);
  }
  return { pass: fails.length === 0, fails };
}

// ── main ────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg) {
  console.error('사용: node scripts/video-ref-measure.mjs <url-or-file>');
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), 'vrm-'));
const file = resolveInput(arg, work);
const meta = probe(file);
const { buf, n } = dumpGray(file, work);
const fps = meta.fps;

const cutList = cuts(buf, n, fps);
const v = vitals(buf, n, fps, cutList.length, cutList.map((c) => c.frame));
const gate = gateCheck(v);

console.log('\n══ 기본 ══');
console.log(`  ${meta.w}x${meta.h} · ${fps.toFixed(2)}fps · ${meta.dur.toFixed(2)}s · ${n}프레임`);

console.log('\n══ 활력 지표 (발행 검수) ══');
console.log(`  평균 밝기   ${v.meanBrightness} /255      (레퍼런스 81.4 / 실패작 5.2)`);
console.log(`  밝은 화소   ${v.litPixelPct}%            (레퍼런스 50.6% / 실패작 2.8%)`);
console.log(`  컷          ${v.cuts}회 ${v.secPerCut ? `→ ${v.secPerCut}초당 1` : '→ 컷 없음'}`);
if (v.shotBrightness?.length) {
  const lo = Math.min(...v.shotBrightness), hi = Math.max(...v.shotBrightness);
  console.log(`  샷별 밝기  ${v.shotBrightness.join(' · ')}`);
  let jm = 0;
  for (let i = 1; i < v.shotBrightness.length; i++) {
    if (Math.abs(v.shotBrightness[i] - v.shotBrightness[i - 1]) > GATE.shotJumpThreshold) jm++;
  }
  console.log(`             최소 ${lo} · 최대 ${hi} · 밝기 급변 ${jm}회   (하한 ${GATE.shotMinBrightness} / 급변 최대 ${GATE.maxBigJumps})`);
}
console.log(`  ${gate.pass ? '✅ GATE PASS' : '❌ GATE FAIL — ' + gate.fails.join(' / ')}`);

console.log('\n══ 컷 ══');
console.log('  ' + (cutList.length ? cutList.map((c) => `${c.t}s`).join('  ') : '(없음)'));
const bounds = [0, ...cutList.map((c) => c.frame), n];
console.log('  샷 길이: ' + bounds.slice(1).map((b, i) => ((b - bounds[i]) / fps).toFixed(2)).join(' / '));

console.log('\n══ 배경 이동 (프레임간 vs 샷 처음↔끝 누적) ══');
for (const r of backgroundMotion(buf, n, fps, cutList.map((c) => c.frame))) {
  console.log(`  ${r.shot.padEnd(18)} 프레임간 ${String(r.perFrame).padStart(5)}   누적 ${String(r.spanned).padStart(6)}`);
}
console.log('  → 프레임간≈0 인데 누적이 크면 «아주 느린 연속 이동». 정지 이미지면 누적도 0.');

if (cutList.length >= 2) {
  const s0 = cutList[0].frame, s1 = cutList[1].frame;
  const mk = motionKind(buf, s0 + 12, s1 - 12);
  console.log('\n══ 이동의 종류 ══');
  console.log(`  기준 오차            ${mk.baseline}`);
  console.log(`  최적 확대 k=${mk.bestZoom.k}    오차 ${mk.bestZoom.err}   ${mk.bestZoom.err < mk.baseline - 1 ? '← 켄번즈' : '(개선 없음 → 확대 아님)'}`);
  console.log(`  최적 이동 ${mk.bestShift.dx},${mk.bestShift.dy}       오차 ${mk.bestShift.err}   ${mk.bestShift.err < mk.baseline - 1 ? '← 팬' : '(개선 없음 → 이동 아님)'}`);
  // 판정은 데이터에서 나와야 한다. 2026-07-31 첫 판에서 이 줄이 고정 문구라 팬이 잡힌 샷에도
  // "둘 다 개선 없음"을 출력했다. 샷마다 기법이 다르다 — 실사 샷은 팬, 3D 렌더 샷은 내부 애니메이션.
  const zoomWins = mk.bestZoom.err < mk.baseline - 1;
  const shiftWins = mk.bestShift.err < mk.baseline - 1;
  console.log('  → ' + (
    shiftWins && zoomWins ? '확대+이동 = 켄번즈. 정지 이미지 + CSS transform으로 재현 가능.'
    : shiftWins ? `평행이동(팬) ${mk.bestShift.dx},${mk.bestShift.dy}px. 정지 이미지 + translate로 재현 가능.`
    : zoomWins ? `중심 확대 k=${mk.bestZoom.k}. 정지 이미지 + scale로 재현 가능.`
    : '둘 다 개선 없음 = 내용 자체가 애니메이션되는 실사/3D. 정지+CSS줌으로 재현 불가.'
  ));
  console.log('  ⚠️ 이 판정은 «첫 샷» 하나에 대한 것. 샷마다 기법이 다를 수 있다(실측 확인됨).');

  console.log('\n══ 컷 후 진입 타임라인 (상단 텍스트 / 중단 차트) ══');
  for (const r of entranceTimeline(buf, n, fps, s1)) {
    if (r.text > 1.5 || r.chart > 1.5) {
      console.log(`  +${String(r.t).padStart(5)}s   텍스트 ${String(r.text).padStart(5)}   차트 ${String(r.chart).padStart(5)}   ${'#'.repeat(Math.min(28, Math.round(Math.max(r.text, r.chart))))}`);
    }
  }
}

if (!process.argv.includes('--keep')) {
  try { unlinkSync(join(work, 'gray.raw')); } catch { /* noop */ }
}
console.log(`\n작업 폴더: ${work}${process.argv.includes('--keep') ? ' (--keep: 원본·덤프 보존)' : ''}\n`);
