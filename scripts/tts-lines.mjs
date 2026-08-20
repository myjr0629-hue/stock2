#!/usr/bin/env node
// ============================================================================
// tts-lines — 대본(SCRIPT_*)이 아닌 «임의의 줄»을 굽는다 (트레일러·광고용)
// ----------------------------------------------------------------------------
// tts-beats 는 scripts.ts 의 beat 구조를 읽는다. 트레일러는 그 구조가 아니라
// 별도 경로가 필요하다. 보이스·모델·설정은 tts-beats 와 «같은 것»을 쓴다.
//
// 사용: node scripts/tts-lines.mjs <이름> "문장1" "문장2" ...
// 출력: public/shorts/audio/<이름>/NN.mp3  +  합본 <이름>.mp3 (무음 간격 포함)
// ============================================================================
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const FFPROBE = join(FFDIR, 'ffprobe.exe');

const NAME = process.argv[2];
const LINES = process.argv.slice(3);
if (!NAME || !LINES.length) { console.error('사용: tts-lines <이름> "문장" ...'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/ELEVENLABS_API_KEY=(\S+)/) || [])[1];
if (!KEY) { console.error('.env.local 에 ELEVENLABS_API_KEY 가 없다'); process.exit(1); }

// tts-beats.mjs 와 동일 — 브랜드 보이스는 한 개로 고정한다
const VOICE_ID = 's3TPKV1kjDlVtZbl4Ksh';
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.25 };

const dir = join('public', 'shorts', 'audio', NAME);
mkdirSync(dir, { recursive: true });

const secOf = (f) => +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();

const out = [];
for (let i = 0; i < LINES.length; i++) {
  const mp3 = join(dir, `${String(i).padStart(2, '0')}.mp3`);
  const txt = mp3.replace(/\.mp3$/, '.txt');
  const same = existsSync(mp3) && existsSync(txt) && readFileSync(txt, 'utf8') === LINES[i];
  if (!same) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: LINES[i], model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (!r.ok) { console.error(`  ✗ ${i} ${r.status} ${(await r.text()).slice(0, 120)}`); process.exit(1); }
    writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    writeFileSync(txt, LINES[i]);
  }
  const s = secOf(mp3);
  out.push({ file: `shorts/audio/${NAME}/${String(i).padStart(2, '0')}.mp3`, sec: +s.toFixed(2), text: LINES[i] });
  console.log(`  ${same ? '↩' : '✔'} ${String(i).padStart(2, '0')}  ${s.toFixed(2)}s  ${LINES[i]}`);
}
writeFileSync(`.agent/_tts_${NAME}.json`, JSON.stringify(out, null, 1));
console.log(`\n  합계 ${out.reduce((a, b) => a + b.sec, 0).toFixed(1)}s  →  .agent/_tts_${NAME}.json\n`);
