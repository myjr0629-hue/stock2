#!/usr/bin/env node
// ============================================================================
// tts-beats — 대본(SCRIPT_XXX)에서 낭독을 뽑아 ElevenLabs 로 굽는다.
// ----------------------------------------------------------------------------
// 사용:  node scripts/tts-beats.mjs <스크립트이름>     예) node scripts/tts-beats.mjs CLOSE
// 출력:  public/shorts/audio/<이름소문자>/NN.mp3  (+ hook / outro / loop)
//        src/remotion/kit/voice-<이름소문자>.ts     ← VOICE_<이름> (파일명 + «실측» 초)
//
// 원칙 (SHORTS_ENGINE_MASTER §7):
//  · 낭독 문장 = beat.say + beat.ask — 자막과 같은 문자열. 다른 원고 금지.
//  · 낭독 «실측 길이»가 컷 길이의 정답 (Briefing.timingOf 가 소비)
//  · 키는 .env.local 의 ELEVENLABS_API_KEY — 코드·로그에 절대 출력하지 않는다
//  · 같은 문장은 다시 굽지 않는다 (파일 존재 + .txt 원문 일치 시 스킵 → 크레딧 절약)
// ============================================================================

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME = (process.argv[2] || '').toUpperCase();
if (!NAME) { console.error('사용: node scripts/tts-beats.mjs <CLOSE|FLIP|...>'); process.exit(1); }

// ── 키 로드 (.env.local) ────────────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/ELEVENLABS_API_KEY=(\S+)/) || [])[1];
if (!KEY) { console.error('.env.local 에 ELEVENLABS_API_KEY 가 없다'); process.exit(1); }

// ── 보이스 (브랜드 고정 1개 — 변경은 대표 승인 후 여기만) ────────────────────
// [2026-08-07 대표 지시: «가장 사람들이 좋아하는 목소리»] 보이스 라이브러리 실측:
// Adam - Engaging, Friendly = 남성 1위 (1y 사용 29억 자 · 채택 56.4만 = 전체 1위).
// 워크스페이스에 추가된 ID(s3TPKV...). 이전 Daniel(onwK4e9ZLuTAKqWW03F9)에서 교체.
const VOICE_ID = 's3TPKV1kjDlVtZbl4Ksh';
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.25 };

// ── 대본 로드 — scripts.ts 를 esbuild 로 즉석 번들해 require ─────────────────
execFileSync('npx', ['esbuild', 'src/remotion/kit/scripts.ts', '--bundle', '--platform=node',
  '--format=cjs', '--outfile=/tmp/signum-scripts.cjs', '--log-level=silent']);
const mod = await import('file:///tmp/signum-scripts.cjs');
const script = mod[`SCRIPT_${NAME}`] ?? mod.default?.[`SCRIPT_${NAME}`];
if (!script) { console.error(`SCRIPT_${NAME} 를 kit/scripts.ts 에서 찾지 못했다`); process.exit(1); }

// ── 낭독 목록 (자막과 같은 문자열 — \n 만 공백으로) ─────────────────────────
const flat = (t) => (t || '').replace(/\n/g, ' ').trim();
const segs = [
  { id: 'hook', text: flat(script.hook.line) },
  ...script.beats.map((b, i) => ({
    id: String(i).padStart(2, '0'),
    text: [flat(b.say), flat(b.ask)].filter(Boolean).join(' '),
  })),
  { id: 'outro', text: flat(script.outro.ask) },
  { id: 'loop', text: flat(script.loop) },
];

const outDir = join('public/shorts/audio', NAME.toLowerCase());
mkdirSync(outDir, { recursive: true });

// ── ffprobe (리모션 번들) 로 실측 길이 ──────────────────────────────────────
const FFPROBE = 'node_modules/@remotion/compositor-darwin-arm64/ffprobe';
const durOf = (f) => parseFloat(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
  { env: { ...process.env, DYLD_LIBRARY_PATH: 'node_modules/@remotion/compositor-darwin-arm64' } }
).toString());

const results = [];
for (const seg of segs) {
  const mp3 = join(outDir, `${seg.id}.mp3`);
  const txt = join(outDir, `${seg.id}.txt`);
  const cached = existsSync(mp3) && existsSync(txt) && readFileSync(txt, 'utf8') === seg.text;
  if (!cached) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: seg.text, model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (!res.ok) { console.error(`✗ ${seg.id}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
    writeFileSync(txt, seg.text);
  }
  const sec = Math.round(durOf(mp3) * 100) / 100;
  results.push({ id: seg.id, sec, cached });
  console.log(`  ${cached ? '↩' : '✔'} ${seg.id.padEnd(6)} ${String(sec).padStart(5)}s  ${seg.text.slice(0, 46)}`);
}

// ── 템플릿용 트랙 파일 생성 ─────────────────────────────────────────────────
const lc = NAME.toLowerCase();
const seg = (id) => { const r = results.find((x) => x.id === id); return `{ f: '${id}.mp3', sec: ${r.sec} }`; };
const beatSegs = results.filter((r) => /^\d+$/.test(r.id)).map((r) => seg(r.id)).join(',\n    ');
const ts = `// 자동 생성 — scripts/tts-beats.mjs ${NAME} (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_${NAME}: VoiceTrack = {
  base: 'shorts/audio/${lc}',
  hook: ${seg('hook')},
  beats: [
    ${beatSegs},
  ],
  outro: ${seg('outro')},
  loop: ${seg('loop')},
};
`;
writeFileSync(`src/remotion/kit/voice-${lc}.ts`, ts);
const total = results.reduce((a, r) => a + r.sec, 0);
console.log(`\n낭독 합계 ${total.toFixed(1)}s → src/remotion/kit/voice-${lc}.ts 생성`);
console.log(`다음: scripts.ts 의 SCRIPT_${NAME} 에  voice: VOICE_${NAME}  연결 후 렌더`);
