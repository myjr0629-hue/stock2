#!/usr/bin/env node
// ============================================================================
// tts-ads — 광고 대본(AD_<NAME>_VO)을 ElevenLabs 로 굽는다 (tts-beats 의 광고판)
// 사용: node scripts/tts-ads.mjs SIGNUM
// 출력: public/shorts/audio/ad-<name>/NN.mp3 + src/remotion/kit/voice-ad<name>.ts
// 규칙: 보이스/캐시/키 처리 전부 tts-beats 와 동일 (Adam · 문장단위 캐시)
// ============================================================================
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME = (process.argv[2] || '').toUpperCase();
if (!NAME) { console.error('사용: node scripts/tts-ads.mjs <SIGNUM|UC|WIM>'); process.exit(1); }

const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/ELEVENLABS_API_KEY=(\S+)/) || [])[1];
if (!KEY) { console.error('.env.local 에 키 없음'); process.exit(1); }

const VOICE_ID = 's3TPKV1kjDlVtZbl4Ksh';   // Adam (tts-beats 와 동일 정본)
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.25 };

execFileSync('npx', ['esbuild', 'src/remotion/kit/ads.ts', '--bundle', '--platform=node',
  '--format=cjs', '--outfile=/tmp/signum-ads.cjs', '--log-level=silent']);
const mod = await import('file:///tmp/signum-ads.cjs');
const vo = mod[`AD_${NAME}_VO`];
if (!vo) { console.error(`AD_${NAME}_VO 를 kit/ads.ts 에서 찾지 못함`); process.exit(1); }

const outDir = join('public/shorts/audio', `ad-${NAME.toLowerCase()}`);
mkdirSync(outDir, { recursive: true });

const FFPROBE = 'node_modules/@remotion/compositor-darwin-arm64/ffprobe';
const durOf = (f) => parseFloat(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
  { env: { ...process.env, DYLD_LIBRARY_PATH: 'node_modules/@remotion/compositor-darwin-arm64' } }).toString());

const results = [];
for (let i = 0; i < vo.length; i++) {
  const id = String(i).padStart(2, '0');
  const mp3 = join(outDir, `${id}.mp3`);
  const txt = join(outDir, `${id}.txt`);
  const cached = existsSync(mp3) && existsSync(txt) && readFileSync(txt, 'utf8') === vo[i];
  if (!cached) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: vo[i], model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (!res.ok) { console.error(`✗ ${id}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
    writeFileSync(txt, vo[i]);
  }
  const sec = Math.round(durOf(mp3) * 100) / 100;
  results.push({ id, sec });
  console.log(`  ${cached ? '↩' : '✔'} ${id} ${String(sec).padStart(5)}s  ${vo[i].slice(0, 46)}`);
}

const lc = NAME.toLowerCase();
const ts = `// 자동 생성 — scripts/tts-ads.mjs ${NAME} (수동 편집 금지)
import type { VoiceTrack } from './Briefing';

export const VOICE_AD${NAME}: VoiceTrack = {
  base: 'shorts/audio/ad-${lc}',
  beats: [
    ${results.map(r => `{ f: '${r.id}.mp3', sec: ${r.sec} }`).join(',\n    ')},
  ],
};
`;
writeFileSync(`src/remotion/kit/voice-ad${lc}.ts`, ts);
console.log(`\n합계 ${results.reduce((a, r) => a + r.sec, 0).toFixed(1)}s → voice-ad${lc}.ts`);
