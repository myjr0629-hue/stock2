#!/usr/bin/env node
// ============================================================================
// jp-voice-measure — 「잘 나온 일본 영상은 어떤 목소리를 쓰는가」를 실측한다
// ----------------------------------------------------------------------------
// ⛔ 왜 일레븐랩스 인기순위를 쓰지 않는가 (대표 지적 2026-08-21)
//   "인기있는 영상의 보이스를 확인해봐 추측아닌 ... 우리가 추측으로 하는것이 아니라"
//   공유 라이브러리의 복제수는 «제작자가 뭘 고르는지»다. «시청자가 뭘 보상하는지»가 아니다.
//   둘은 다른 값이다. ⇒ 실제로 조회가 나온 영상의 «소리»를 직접 잰다.
//
// 재는 것 (전부 파일에서 직접 계산 — 남의 주장이 아니다)
//   ① 기본주파수 F0 중앙값   자기상관으로 프레임마다 구해 유성음 프레임만 중앙
//                          (남성 85~180Hz · 여성 165~300Hz 가 통상 범위)
//   ② 말 속도               일본어 자동자막 글자수 / 영상 길이
//   ③ 음량                  ffmpeg loudnorm 1패스 입력 LUFS
//   ④ 음높이 변화폭          F0 사분위 범위 — 단조로운가 표정이 있는가
//
// ⛔ 한계 (보고에 반드시 같이 적는다)
//   BGM 이 깔린 영상은 F0 가 오염된다. 유성음 판정 문턱으로 줄이지만 0 은 아니다.
//   그래서 «상위 vs 하위»를 같이 재서 차이로 본다. 절대값 하나로 결론내지 않는다.
//
// 사용:  node scripts/jp-voice-measure.mjs [편수]     기본 상위20 + 하위20
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const N_EACH = Number(process.argv[2] || 20);
const TMP = '.agent/_voicetmp';
const OUT = '.agent/JP_VOICE.json';
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

const raw = JSON.parse(readFileSync('.agent/_jp_hour_raw.json', 'utf8'));
const { detail, subs } = raw;

// ── 대상 고르기 — 쇼츠만, 1년 이내 ──────────────────────────────────────────
const NOW = Date.parse('2026-08-21T00:00:00Z');
const pool = Object.entries(detail)
  .map(([id, v]) => ({ id, ...v, age: (NOW - Date.parse(v.pub)) / 86400000, sub: subs[v.ch] || 0 }))
  .filter((r) => r.dur > 0 && r.dur <= 90 && r.age <= 365 && r.sub > 0)
  // ⛔ 조회수 그대로 쓰면 «구독자 많은 채널»을 고르는 것과 같다. 구독자당으로 본다.
  .map((r) => ({ ...r, per: r.views / r.sub }));

pool.sort((a, b) => b.per - a.per);
const top = pool.slice(0, N_EACH);
const bot = pool.slice(-N_EACH);
console.log(`  쇼츠 풀 ${pool.length}편 → 상위 ${top.length} · 하위 ${bot.length}`);
console.log(`  상위 구독자당 중앙 ${top[Math.floor(top.length / 2)].per.toFixed(2)}  ·  하위 ${bot[Math.floor(bot.length / 2)].per.toFixed(3)}`);

// ── F0: 16kHz 모노로 디코드 후 자기상관 ─────────────────────────────────────
const SR = 16000, FRAME = 1024, HOP = 512;
const F0_MIN = 70, F0_MAX = 400;

function medianF0(pcmPath) {
  let buf;
  try { buf = readFileSync(pcmPath); } catch { return null; }
  const n = Math.floor(buf.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768;

  const lagMin = Math.floor(SR / F0_MAX), lagMax = Math.floor(SR / F0_MIN);
  const f0s = [];
  for (let s = 0; s + FRAME < n; s += HOP) {
    // 에너지가 낮은 프레임은 무음 — 건너뛴다
    let e = 0; for (let i = 0; i < FRAME; i++) e += x[s + i] * x[s + i];
    const rms = Math.sqrt(e / FRAME);
    if (rms < 0.02) continue;

    let best = 0, bestLag = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let c = 0;
      for (let i = 0; i < FRAME - lag; i += 2) c += x[s + i] * x[s + i + lag];
      c /= (FRAME - lag);
      if (c > best) { best = c; bestLag = lag; }
    }
    // ⛔ 주기성이 약하면 «유성음이 아니다» — 음악·잡음이 여기서 걸러진다
    const norm = best / (e / FRAME);
    if (bestLag && norm > 0.35) f0s.push(SR / bestLag);
  }
  if (f0s.length < 20) return null;
  f0s.sort((a, b) => a - b);
  const q = (p) => f0s[Math.floor(f0s.length * p)];
  return { med: q(0.5), q1: q(0.25), q3: q(0.75), frames: f0s.length };
}

function loudness(mp3) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp3, '-af',
    'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8', timeout: 120000 });
  const m = (r.stderr || '').match(/"input_i"\s*:\s*"(-?[\d.]+)"/);
  return m ? Number(m[1]) : null;
}

async function measure(v, label) {
  const base = `${TMP}/${v.id}`;
  const url = `https://www.youtube.com/watch?v=${v.id}`;
  // 오디오 + 일본어 자동자막
  const dl = spawnSync('yt-dlp', [url, '-f', 'bestaudio', '-x', '--audio-format', 'mp3',
    '--write-auto-subs', '--sub-langs', 'ja.*', '--sub-format', 'vtt',
    '-o', `${base}.%(ext)s`, '--no-warnings', '--socket-timeout', '25'],
    { encoding: 'utf8', timeout: 180000 });
  if (!existsSync(`${base}.mp3`)) { console.log(`   x ${v.id} 다운로드 실패`); return null; }

  // PCM 으로 변환
  spawnSync('ffmpeg', ['-v', 'error', '-i', `${base}.mp3`, '-ac', '1', '-ar', String(SR),
    '-f', 's16le', '-t', '60', `${base}.pcm`, '-y'], { timeout: 120000 });

  const f0 = medianF0(`${base}.pcm`);
  const lufs = loudness(`${base}.mp3`);

  // 자막 → 글자수
  let chars = null;
  for (const ext of ['ja.vtt', 'ja-orig.vtt', 'ja_JP.vtt']) {
    if (existsSync(`${base}.${ext}`)) {
      const t = readFileSync(`${base}.${ext}`, 'utf8');
      const lines = t.split('\n').filter((l) => l.trim() && !l.includes('-->') && !/^(WEBVTT|Kind:|Language:|\d+$)/.test(l.trim()));
      chars = [...new Set(lines)].join('').replace(/<[^>]*>/g, '').replace(/\s/g, '').length;
      break;
    }
  }

  rmSync(`${base}.pcm`, { force: true });
  rmSync(`${base}.mp3`, { force: true });
  for (const ext of ['ja.vtt', 'ja-orig.vtt', 'ja_JP.vtt']) rmSync(`${base}.${ext}`, { force: true });

  const row = { id: v.id, label, views: v.views, sub: v.sub, per: +v.per.toFixed(3), dur: v.dur,
    f0: f0 ? +f0.med.toFixed(1) : null, f0iqr: f0 ? +(f0.q3 - f0.q1).toFixed(1) : null,
    voiced: f0 ? f0.frames : 0, lufs, chars, cps: chars ? +(chars / v.dur).toFixed(2) : null };
  console.log(`   ${label === 'top' ? '▲' : '▽'} ${v.id}  F0 ${String(row.f0 ?? '-').padStart(6)}Hz  변화폭 ${String(row.f0iqr ?? '-').padStart(6)}  ${String(row.cps ?? '-').padStart(5)}자/초  ${String(row.lufs ?? '-').padStart(6)}LUFS`);
  return row;
}

const rows = [];
for (const v of top) { const r = await measure(v, 'top'); if (r) rows.push(r); }
for (const v of bot) { const r = await measure(v, 'bot'); if (r) rows.push(r); }

// ── 집계 ────────────────────────────────────────────────────────────────────
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const grp = (l) => rows.filter((r) => r.label === l);
const show = (l, name) => {
  const g = grp(l).filter((r) => r.f0);
  if (!g.length) { console.log(`  ${name}: 측정된 것 없음`); return null; }
  const male = g.filter((r) => r.f0 < 165).length;
  const o = { n: g.length, f0: med(g.map((r) => r.f0)), iqr: med(g.map((r) => r.f0iqr)),
    cps: med(g.map((r) => r.cps)), lufs: med(g.map((r) => r.lufs)),
    malePct: Math.round(male / g.length * 100) };
  console.log(`  ${name.padEnd(12)} n=${String(o.n).padStart(3)}  F0중앙 ${String(o.f0).padStart(6)}Hz  변화폭 ${String(o.iqr).padStart(6)}  말속도 ${String(o.cps).padStart(5)}자/초  음량 ${String(o.lufs).padStart(6)}LUFS  저음(<165Hz) ${o.malePct}%`);
  return o;
};

console.log('\n  ══ 집계 ══');
const T = show('top', '상위(잘된)');
const B = show('bot', '하위');

writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-08-21', nEach: N_EACH, top: T, bot: B, rows }, null, 1));
console.log(`\n  → ${OUT}`);
console.log('  ⛔ BGM 이 F0 를 오염시킬 수 있다. 상위·하위 «차이»로 읽고 절대값 하나로 결론내지 않는다.\n');
