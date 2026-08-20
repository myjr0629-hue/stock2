#!/usr/bin/env node
// ============================================================================
// ref-fleet — 레퍼런스 «여러 편»을 같은 자로 재서 우리 것과 나란히 놓는다
// ----------------------------------------------------------------------------
// 왜 만드는가 (2026-08-20 대표 지시)
//   "한 레퍼런스 뿐만 아니라 다양한 레퍼런스를 비교 좋은점은 차용 고도화"
//   "자막 음성까지도 레퍼런스를 참고하자"
//
//   video-ref-measure.mjs 는 «한 편을 깊게» 판다(컷·켄번즈 정합·등장 타임라인).
//   이건 «여러 편을 같은 지표로» 줄세운다. 목적이 다르므로 따로 둔다.
//
// ⛔ 눈으로 보고 판단하지 않는다. 전부 계산값이다.
//   화면: 컷속도·모션량·밝기·채도·자막띠 위치·화면 텍스트 밀도
//   소리: LUFS·LRA·발화속도(WPM)·무음비·BGM 유무
//   자막: 큐당 단어수·큐 길이·초당 단어수
//
// 사용:  node scripts/ref-fleet.mjs .agent/_fleet.json
//        [{ "tag":"primate-inflation", "url":"https://youtube.com/shorts/..." },
//         { "tag":"OURS",              "file":"E:/.../C1.mp4", "vtt":null }]
// 출력:  .agent/REF_FLEET.json  +  콘솔 비교표
// ============================================================================

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const FFPROBE = join(FFDIR, 'ffprobe.exe');
const CACHE = '.agent/_fleet_cache';
mkdirSync(CACHE, { recursive: true });

const sh = (bin, args, o = {}) => execFileSync(bin, args, { maxBuffer: 1 << 30, ...o });
const shq = (bin, args) => {
  const r = spawnSync(bin, args, { maxBuffer: 1 << 30, encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
};

// ── 프록시 해상도 ───────────────────────────────────────────────────────────
// 자막띠를 «행 단위»로 찾아야 하므로 세로를 충분히 준다. 가로는 판정에 영향이 적다.
const GW = 96, GH = 171, GS = GW * GH;

function fetchOne(item) {
  if (item.file) return { video: item.file, vtt: item.vtt || null };
  const base = join(CACHE, item.tag);
  const mp4 = `${base}.mp4`;
  if (!existsSync(mp4)) {
    sh('yt-dlp', ['--no-warnings', '-f', 'bv*[height<=1920]+ba/b', '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFDIR, '-o', mp4, item.url], { stdio: 'inherit' });
  }
  // 자동 자막 — 발화속도·큐 구조의 «원본 근거». ASR 을 우리가 돌릴 필요가 없다
  if (!readdirSync(CACHE).some((f) => f.startsWith(item.tag) && f.endsWith('.vtt'))) {
    try {
      // ⛔ 2026-08-21: 일본 레퍼런스를 재려면 자막 언어를 바꿀 수 있어야 한다.
      //   item.lang 이 없으면 기존대로 en.
      sh('yt-dlp', ['--no-warnings', '--skip-download', '--write-auto-subs', '--sub-langs', `${item.lang || 'en'}.*`,
        '--sub-format', 'vtt', '-o', base, item.url], { stdio: 'ignore' });
    } catch {}
  }
  const vtt = readdirSync(CACHE).filter((f) => f.startsWith(item.tag) && f.endsWith('.vtt'))[0];
  return { video: mp4, vtt: vtt ? join(CACHE, vtt) : null };
}

function probe(f) {
  const r = shq(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate', '-show_entries', 'format=duration',
    '-of', 'default=nw=1', f]);
  const g = (k) => (r.match(new RegExp(`${k}=(.+)`)) || [])[1]?.trim();
  const [n, d] = (g('r_frame_rate') || '30/1').split('/').map(Number);
  return { w: +g('width'), h: +g('height'), fps: n / d, dur: +g('duration') };
}

/** 그레이 프레임 전량 덤프 */
function gray(f) {
  const buf = sh(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', f,
    '-vf', `scale=${GW}:${GH}`, '-pix_fmt', 'gray', '-c:v', 'rawvideo', '-f', 'image2pipe', '-']);
  return { buf, n: Math.floor(buf.length / GS) };
}
const fr = (b, i) => b.subarray(i * GS, (i + 1) * GS);

// ── 화면 ────────────────────────────────────────────────────────────────────
function visual(file, fps) {
  const { buf, n } = gray(file);
  if (!n) return null;

  // 컷 + 모션
  let cuts = 0, motion = 0;
  for (let i = 1; i < n; i++) {
    let s = 0;
    const a = fr(buf, i - 1), b = fr(buf, i);
    for (let k = 0; k < GS; k++) s += Math.abs(a[k] - b[k]);
    const d = s / GS;
    motion += d;
    if (d > 18) cuts++;
  }
  motion /= (n - 1);

  // 밝기 분포
  const means = [];
  for (let i = 0; i < n; i += 2) {
    const f = fr(buf, i); let s = 0;
    for (let k = 0; k < GS; k++) s += f[k];
    means.push(s / GS);
  }
  means.sort((a, b) => a - b);
  const q = (p) => means[Math.min(means.length - 1, Math.floor(p * means.length))];

  // ── 자막띠 · 텍스트 밀도 ──────────────────────────────────────────────────
  // 글자는 «가로 방향 고주파»다. 행마다 |x - x+1| 을 합치면 글자 있는 행이 솟는다.
  const rowE = new Float64Array(GH);
  const step = Math.max(1, Math.floor(n / 220));
  let sampled = 0;
  for (let i = 0; i < n; i += step) {
    const f = fr(buf, i); sampled++;
    for (let y = 0; y < GH; y++) {
      let s = 0;
      for (let x = 1; x < GW; x++) s += Math.abs(f[y * GW + x] - f[y * GW + x - 1]);
      rowE[y] += s / (GW - 1);
    }
  }
  for (let y = 0; y < GH; y++) rowE[y] /= sampled;
  const sorted = [...rowE].sort((a, b) => a - b);
  const med = sorted[Math.floor(GH / 2)];
  const hi = sorted[Math.floor(GH * 0.9)];
  const thr = med + (hi - med) * 0.55;
  const bands = [];
  let s0 = -1;
  for (let y = 0; y < GH; y++) {
    const on = rowE[y] > thr;
    if (on && s0 < 0) s0 = y;
    if ((!on || y === GH - 1) && s0 >= 0) { if (y - s0 >= 2) bands.push([s0, y]); s0 = -1; }
  }
  // 하단 자막은 «화면 아래쪽 40% 안의 가장 큰 띠»로 본다
  const lower = bands.filter((b) => b[0] > GH * 0.55);
  const capBand = lower.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
  const textRows = rowE.filter((v) => v > thr).length;
  const edgeAbs = rowE.reduce((a, b) => a + b, 0) / GH;   // 절대 디테일량 — 비교 가능

  // 채도
  const rgb = sh(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file,
    '-vf', `fps=2,scale=32:57`, '-pix_fmt', 'rgb24', '-c:v', 'rawvideo', '-f', 'image2pipe', '-']);
  let sat = 0, cnt = 0;
  for (let k = 0; k + 2 < rgb.length; k += 3) {
    const r = rgb[k], g = rgb[k + 1], b = rgb[k + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx === 0 ? 0 : (mx - mn) / mx; cnt++;
  }

  return {
    cutsPerMin: +(cuts / (n / fps) * 60).toFixed(1),
    motion: +motion.toFixed(2),
    brightMean: +(means.reduce((a, b) => a + b, 0) / means.length).toFixed(1),
    brightP10: +q(0.1).toFixed(1), brightP90: +q(0.9).toFixed(1),
    sat: +(sat / cnt * 100).toFixed(1),
    capTopPct: capBand ? +(capBand[0] / GH * 100).toFixed(1) : null,
    capBotPct: capBand ? +(capBand[1] / GH * 100).toFixed(1) : null,
    textRowPct: +(textRows / GH * 100).toFixed(1),
    edgeAbs: +edgeAbs.toFixed(2),
  };
}

// ── 소리 ────────────────────────────────────────────────────────────────────
function audio(file) {
  const ln = shq(FFMPEG, ['-hide_banner', '-i', file, '-af',
    'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
  const num = (k) => { const m = ln.match(new RegExp(`"${k}"\\s*:\\s*"(-?[\\d.]+)"`)); return m ? +m[1] : null; };

  // 무음 구간 — 발화 사이 «쉼»이 몇 %인가. BGM 이 깔리면 무음이 거의 안 잡힌다
  const sd = shq(FFMPEG, ['-hide_banner', '-i', file, '-af',
    'silencedetect=noise=-34dB:d=0.22', '-f', 'null', '-']);
  const durs = [...sd.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => +m[1]);
  const total = +(shq(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file]).trim());
  const silence = durs.reduce((a, b) => a + b, 0);

  return {
    lufs: num('input_i'), lra: num('input_lra'), tp: num('input_tp'),
    silencePct: +(silence / total * 100).toFixed(1),
    silenceCount: durs.length,
  };
}

// ── 자막 ────────────────────────────────────────────────────────────────────
function parseVtt(p) {
  if (!p || !existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const cues = [];
  const re = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})[^\n]*\n([\s\S]*?)(?=\n\n|\n\d{2}:|$)/g;
  const sec = (t) => { const [h, m, s] = t.split(':'); return +h * 3600 + +m * 60 + parseFloat(s); };
  for (const m of raw.matchAll(re)) {
    const txt = m[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (txt) cues.push({ a: sec(m[1]), b: sec(m[2]), txt });
  }
  const uniq = [];
  for (const c of cues) if (!uniq.length || uniq[uniq.length - 1].txt !== c.txt) uniq.push(c);

  // 롤업 겹침 제거 — 누적 단어열의 «꼬리»와 새 큐의 «머리»가 겹치면 그만큼만 새로 센다
  const all = [];
  let addedPerCue = [];
  for (const c of uniq) {
    const w = c.txt.split(/\s+/).filter(Boolean);
    let ov = 0;
    const max = Math.min(w.length, all.length, 24);
    for (let k = max; k > 0; k--) {
      let same = true;
      for (let j = 0; j < k; j++) {
        if (all[all.length - k + j].toLowerCase() !== w[j].toLowerCase()) { same = false; break; }
      }
      if (same) { ov = k; break; }
    }
    const add = w.slice(ov);
    if (add.length) { all.push(...add); addedPerCue.push({ n: add.length, a: c.a, b: c.b }); }
  }
  const span = uniq.length ? uniq[uniq.length - 1].b - uniq[0].a : 0;
  return {
    cues: addedPerCue.length,
    words: all.length,
    wpm: span ? +(all.length / span * 60).toFixed(0) : null,
    wordsPerCue: addedPerCue.length ? +(all.length / addedPerCue.length).toFixed(1) : null,
    cueSec: addedPerCue.length ? +(span / addedPerCue.length).toFixed(2) : null,
  };
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const items = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = [];
for (const it of items) {
  process.stdout.write(`  ${it.tag.padEnd(22)}`);
  try {
    const { video, vtt } = fetchOne(it);
    const p = probe(video);
    const v = visual(video, p.fps);
    const a = audio(video);
    const s = it.subs === false ? null : parseVtt(vtt);
    out.push({ tag: it.tag, views: it.views ?? null, sec: +p.dur.toFixed(1), fps: +p.fps.toFixed(2), ...v, ...a, subs: s });
    console.log(`✔ ${p.dur.toFixed(1)}s`);
  } catch (e) {
    console.log(`✗ ${String(e.message).split('\n')[0].slice(0, 70)}`);
  }
}
writeFileSync('.agent/REF_FLEET.json', JSON.stringify(out, null, 1));

const R = (v, w, d = 1) => (v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(d) : v)).toString().padStart(w);
console.log('\n  화면');
console.log('  ' + 'tag'.padEnd(22) + '초'.padStart(6) + '컷/분'.padStart(8) + '모션'.padStart(7) + '밝기'.padStart(7) + 'p10'.padStart(7) + '채도%'.padStart(7) + '엣지'.padStart(8) + '텍스트행%'.padStart(10) + '자막띠'.padStart(12));
for (const r of out) console.log('  ' + r.tag.padEnd(22) + R(r.sec, 6) + R(r.cutsPerMin, 8) + R(r.motion, 7) + R(r.brightMean, 7) + R(r.brightP10, 7) + R(r.sat, 7) + R(r.edgeAbs, 8, 2) + R(r.textRowPct, 10) +
  (r.capTopPct === null ? '—'.padStart(12) : `${r.capTopPct.toFixed(0)}~${r.capBotPct.toFixed(0)}%`.padStart(12)));
console.log('\n  소리 · 자막');
console.log('  ' + 'tag'.padEnd(22) + 'LUFS'.padStart(8) + 'LRA'.padStart(7) + '무음%'.padStart(7) + 'WPM'.padStart(7) + '단어/큐'.padStart(9) + '큐초'.padStart(7));
for (const r of out) console.log('  ' + r.tag.padEnd(22) + R(r.lufs, 8) + R(r.lra, 7) + R(r.silencePct, 7) + R(r.subs?.wpm, 7, 0) + R(r.subs?.wordsPerCue, 9) + R(r.subs?.cueSec, 7, 2));
console.log('\n  → .agent/REF_FLEET.json\n');
