#!/usr/bin/env node
// ============================================================================
// jp-voice-pick — 「잘 나온 영상의 목소리」에 «가장 가까운» 후보를 고른다
// ----------------------------------------------------------------------------
// 앞 단계(jp-voice-measure)에서 상위 16편 / 하위 11편의 F0 를 쟀다.
// 여기서 두 가지를 한다.
//   ① 그 차이가 «우연인가»를 검정한다 (맨-휘트니 U — 표본이 작고 분포를 모른다)
//   ② 후보 목소리 8개를 «같은 알고리즘»으로 재서, 상위 프로필에 가까운 순으로 세운다
//
// ⛔ 같은 알고리즘으로 재야 비교가 성립한다. 남의 스펙 시트를 믿지 않는다.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';

const SR = 16000, FRAME = 1024, HOP = 512, F0_MIN = 70, F0_MAX = 400;

function f0stats(pcmPath) {
  const buf = readFileSync(pcmPath);
  const n = Math.floor(buf.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768;
  const lagMin = Math.floor(SR / F0_MAX), lagMax = Math.floor(SR / F0_MIN);
  const f0s = [];
  for (let s = 0; s + FRAME < n; s += HOP) {
    let e = 0; for (let i = 0; i < FRAME; i++) e += x[s + i] * x[s + i];
    if (Math.sqrt(e / FRAME) < 0.02) continue;
    let best = 0, bestLag = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let c = 0;
      for (let i = 0; i < FRAME - lag; i += 2) c += x[s + i] * x[s + i + lag];
      c /= (FRAME - lag);
      if (c > best) { best = c; bestLag = lag; }
    }
    if (bestLag && best / (e / FRAME) > 0.35) f0s.push(SR / bestLag);
  }
  if (f0s.length < 20) return null;
  f0s.sort((a, b) => a - b);
  const q = (p) => f0s[Math.floor(f0s.length * p)];
  return { med: q(0.5), iqr: q(0.75) - q(0.25), frames: f0s.length };
}

// ── ① 상위 vs 하위가 우연인가 ───────────────────────────────────────────────
const V = JSON.parse(readFileSync('.agent/JP_VOICE.json', 'utf8'));
const top = V.rows.filter((r) => r.label === 'top' && r.f0).map((r) => r.f0);
const bot = V.rows.filter((r) => r.label === 'bot' && r.f0).map((r) => r.f0);

function mannWhitney(a, b) {
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  // 동점 처리 — 평균 순위
  let i = 0; const rank = new Array(all.length);
  while (i < all.length) {
    let j = i; while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rank[k] = r;
    i = j + 1;
  }
  const n1 = a.length, n2 = b.length;
  let R1 = 0; all.forEach((o, k) => { if (o.g === 0) R1 += rank[k]; });
  const U1 = R1 - n1 * (n1 + 1) / 2, U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const mu = n1 * n2 / 2, sd = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
  const z = (U - mu) / sd;
  // 양측 p — 정규근사
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
  return { U, z: +z.toFixed(2), p: +p.toFixed(4), n1, n2 };
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return y;
}

const mw = mannWhitney(top, bot);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log('  ══ ① 상위 vs 하위의 F0 차이가 우연인가 ══');
console.log(`   상위 n=${mw.n1}  중앙 ${med(top).toFixed(1)}Hz`);
console.log(`   하위 n=${mw.n2}  중앙 ${med(bot).toFixed(1)}Hz`);
console.log(`   맨-휘트니 U=${mw.U}  z=${mw.z}  p=${mw.p}  → ${mw.p < 0.05 ? '✔ 유의 (우연으로 보기 어렵다)' : '⛔ 유의하지 않다 — 방향만 참고한다'}`);

const IQRtop = V.rows.filter((r) => r.label === 'top' && r.f0iqr).map((r) => r.f0iqr);
const IQRbot = V.rows.filter((r) => r.label === 'bot' && r.f0iqr).map((r) => r.f0iqr);
const mw2 = mannWhitney(IQRtop, IQRbot);
console.log(`\n   음높이 «변화폭»  상위 ${med(IQRtop).toFixed(1)} vs 하위 ${med(IQRbot).toFixed(1)}   p=${mw2.p}  → ${mw2.p < 0.05 ? '✔ 유의' : '⛔ 유의하지 않다'}`);

// ── ② 후보 목소리를 같은 방법으로 잰다 ──────────────────────────────────────
const cands = JSON.parse(readFileSync('.agent/_jp_voicepick.json', 'utf8')).out;
console.log('\n  ══ ② 후보 목소리 실측 (같은 알고리즘) ══');
const TARGET_F0 = med(top), TARGET_IQR = med(IQRtop);
const scored = [];
for (const c of cands) {
  if (!existsSync(c.file)) { console.log(`   x ${c.name} 파일 없음`); continue; }
  const pcm = '.agent/_cand.pcm';
  spawnSync('ffmpeg', ['-v', 'error', '-i', c.file, '-ac', '1', '-ar', String(SR), '-f', 's16le', pcm, '-y'], { timeout: 60000 });
  const s = f0stats(pcm);
  rmSync(pcm, { force: true });
  if (!s) { console.log(`   x ${c.name} 측정 실패`); continue; }
  // 상위 프로필과의 거리 — F0 와 변화폭을 각각 표준화해서 더한다
  // ⛔ 변화폭(IQR)은 p=0.374 로 «증명되지 않았다». 순위에 넣지 않는다.
  //   증명된 것은 F0 하나뿐이고, 그것도 «낮을수록 좋다»는 단조 관계다
  //   (스피어만 rho=-0.509, t=-2.84, n=25). 중앙값에 가까울수록이 아니라 «낮을수록»이다.
  const d = s.med;
  scored.push({ ...c, f0: +s.med.toFixed(1), iqr: +s.iqr.toFixed(1), dist: +d.toFixed(3) });
}
scored.sort((a, b) => a.dist - b.dist);   // 낮은 F0 순
console.log(`   목표(상위 프로필)  F0 ${TARGET_F0.toFixed(1)}Hz  변화폭 ${TARGET_IQR.toFixed(1)}\n`);
console.log('   순위  F0(낮을수록 좋음)  변화폭   성별/나이         이름');
for (const s of scored)
  console.log(`   ${String(scored.indexOf(s)+1).padStart(4)}  ${String(s.f0).padStart(10)}Hz  ${String(s.iqr).padStart(6)}   ${(s.g + '/' + s.age).padEnd(18)} ${s.name}`);

writeFileSync('.agent/JP_VOICE_PICK.json', JSON.stringify({
  measuredAt: '2026-08-21', target: { f0: TARGET_F0, iqr: TARGET_IQR },
  test: { f0: mw, iqr: mw2 }, candidates: scored,
}, null, 1));
console.log(`\n  1위: ${scored[0]?.name}  (${scored[0]?.id})`);
console.log('  → .agent/JP_VOICE_PICK.json\n');
