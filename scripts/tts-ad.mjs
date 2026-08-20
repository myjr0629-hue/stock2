#!/usr/bin/env node
// ============================================================================
// tts-ad — 앱 광고 나레이션을 ElevenLabs 로 굽고 «실발화 길이»를 재서 내보낸다
// ----------------------------------------------------------------------------
// 왜 별도인가: tts-beats 는 SCRIPT_*(BriefingProps) 를 읽는다. 광고는 형식이 달라
//   여기서 «대본을 코드 안에» 두고 굽는다. 대본을 고치면 그 줄만 다시 굽힌다.
//
// 실측 장치는 tts-beats 와 동일하다 — ElevenLabs mp3 끝에 붙는 «꼬리 무음»을 잘라
//   컷 길이로 쓴다. 파일 길이를 그대로 쓰면 죽은 정지 구간이 생긴다.
//
// 실행:  node scripts/tts-ad.mjs
// 출력:  public/shorts/audio/adv5/NN.mp3  +  src/remotion/kit/voice-ad.ts
// ============================================================================

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── 대본 — 광고 흐름 ────────────────────────────────────────────────────────
// 규칙: 한 줄 = 한 비트. 2.6초 넘기지 않는다(자막이 3줄이 되면 화면이 무너진다).
//       수치를 말하지 않는다 — 캡처를 다시 뜨면 시세가 바뀐다.
const LINES = [
  { id: 'open',  text: 'Every options signal. One screen.' },
  { id: 'morn',  text: 'A morning briefing, before the bell.' },
  { id: 'pain',  text: 'Max pain. Where most options expire worthless.' },
  { id: 'gamma', text: 'Gamma flip. Where dealers stop cushioning the move.' },
  { id: 'whale', text: 'Whale flow. The size institutions are actually moving.' },
  { id: 'dark',  text: 'Dark pool. The volume nobody sees.' },
  { id: 'ai',    text: 'And Claude reads the whole book down to one line.' },
  { id: 'close', text: 'A closing briefing, every single day.' },
  { id: 'uc',    text: 'And Undercurrent. The money moving behind the news.' },
  { id: 'free',  text: 'All of it. Free.' },

  // ── 축약본(쇼츠 뒤 태그) 전용 — 3줄 · 합계 6초 안쪽 ──────────────────────
  { id: 'tag1',  text: 'Options data institutions pay for.' },
  { id: 'tag2',  text: 'Briefed before the bell, every day.' },
  { id: 'tag3',  text: 'SIGNUM HQ. Free.' },

  // ── 개념 트랙 #1 «옵션 만기 / Max Pain» — 수요 1위(318K) ────────────────
  // 규칙: 페이오프 전까지 «숫자를 말하지 않는다». 개념이 서야 숫자가 의미를 갖는다.
  { id: 'cp1a', text: 'Most options expire worthless.' },
  { id: 'cp1b', text: 'And there is one price where the most of them do.' },
  { id: 'cp1c', text: 'That price is called max pain.' },
  { id: 'cp1d', text: 'It is not a prediction. It is just where the contracts are stacked.' },
  { id: 'cp1e', text: 'On AMD right now, that price is four fifty.' },

  // 길이 실측(2026-08-20): 개념 설명 상위 3편이 46~56초였다 (1,570만 / 138만 / 90만).
  // 15초로 압축하면 개념이 서지 않는다 → 설명을 «펼친다».
  { id: 'cp1f', text: 'Every open option contract sits at some strike price.' },
  { id: 'cp1g', text: 'Add up what all of them would pay out at expiry, and one price makes that total the smallest.' },
  { id: 'cp1h', text: 'That is max pain. The level where option buyers, as a group, get the least back.' },
  { id: 'cp1i', text: 'The dealers who sold those options hedge around it, and that hedging is real buying and selling.' },
  { id: 'cp1j', text: 'Whether that actually pulls price toward it is debated.' },
  { id: 'cp1k', text: 'What is not debated is where the contracts sit.' },
  { id: 'cp1l', text: 'It moves as contracts open and close. It is a level, not a target.' },

  // 활용법 — 「그래서 어떻게 쓰는가」. 대표 지시(2026-08-20): 개념만 말하고 끝내지 말 것
  { id: 'cp1m', text: 'So how do you actually use it?' },
  { id: 'cp1n', text: 'When price sits well above max pain, the crowded side is upside calls.' },
  { id: 'cp1o', text: 'When it sits below, the crowd is leaning short.' },
  { id: 'cp1p', text: 'It tells you where the crowd is. It does not tell you where price goes.' },

  // ── 개념 트랙 #2 «RSI» — 검색 수요 1위(33,947, 최고 615K) ────────────────
  // 계획서에는 8순위였다. 수요 실측이 순서를 뒤집었다.
  // 우리 색: 개념 설명은 남들도 한다. 우리는 «그래서 실제로 어땠나»를 센다 (386건).
  { id: 'c2a', text: 'RSI above seventy means overbought.' },
  { id: 'c2b', text: 'Almost everyone reads that as sell.' },
  { id: 'c2c', text: 'Here is what RSI actually measures.' },
  { id: 'c2d', text: 'Average gains against average losses.' },
  { id: 'c2e', text: 'Over the last fourteen trading days.' },
  { id: 'c2f', text: 'Above seventy just means gains won.' },
  { id: 'c2g', text: 'It says nothing about what comes next.' },
  { id: 'c2h', text: 'AMD crossed seventy three times this spring.' },
  { id: 'c2i', text: 'It was higher five days later every time.' },
  { id: 'c2j', text: 'So we counted every crossing since 2021.' },
  { id: 'c2k', text: 'Twelve large caps. Three hundred eighty six.' },
  { id: 'c2l', text: 'Higher five days later, fifty seven percent.' },
  { id: 'c2m', text: 'On any given day, fifty three.' },
  { id: 'c2n', text: 'A four point gap. That is noise.' },
  { id: 'c2o', text: 'RSI over seventy is not a sell signal.' },
  { id: 'c2p', text: 'It describes the trend you are already in.' },
  { id: 'c2q', text: 'On AMD right now, RSI is forty five.' },
];

const env = readFileSync('.env.local', 'utf8');
const KEY = (env.match(/ELEVENLABS_API_KEY=(\S+)/) || [])[1];
if (!KEY) { console.error('.env.local 에 ELEVENLABS_API_KEY 가 없다'); process.exit(1); }

const VOICE_ID = 's3TPKV1kjDlVtZbl4Ksh';       // 브랜드 고정 (Adam - Engaging, Friendly)
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.42, similarity_boost: 0.8, style: 0.32 };  // 광고라 조금 더 살린다

const OUT = 'public/shorts/audio/adv5';
mkdirSync(OUT, { recursive: true });

const IS_WIN = process.platform === 'win32';
const COMP = join('node_modules', '@remotion', IS_WIN ? 'compositor-win32-x64-msvc' : 'compositor-darwin-arm64');
const FFPROBE = join(COMP, IS_WIN ? 'ffprobe.exe' : 'ffprobe');
const FFMPEG = join(COMP, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
const ENV = IS_WIN ? { ...process.env } : { ...process.env, DYLD_LIBRARY_PATH: COMP };

const durOf = (f) => parseFloat(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f], { env: ENV }).toString());

const TAIL = 0.12, FLOOR = 0.015;
function speechEndOf(f) {
  const wav = join(tmpdir(), `adspk-${process.pid}.wav`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', f, '-ac', '1', '-ar', '8000',
    '-f', 'wav', '-acodec', 'pcm_s16le', wav], { env: ENV });
  const buf = readFileSync(wav);
  let p = 12;
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'data') { p += 8; break; }
    p += 8 + size + (size % 2);
  }
  const SR = 8000, WIN = SR / 40;
  let last = 0;
  for (let i = p, w = 0; i + WIN * 2 <= buf.length; i += WIN * 2, w++) {
    let sum = 0;
    for (let k = 0; k < WIN; k++) { const v = buf.readInt16LE(i + k * 2) / 32768; sum += v * v; }
    if (Math.sqrt(sum / WIN) > FLOOR) last = (w + 1) * 0.025;
  }
  try { unlinkSync(wav); } catch {}
  return last;
}
function cutSecOf(f) {
  const full = durOf(f);
  try {
    const end = speechEndOf(f);
    if (!end || end < 0.15) return full;
    return Math.min(full, Math.round((end + TAIL) * 100) / 100);
  } catch { return full; }
}

const out = [];
for (const L of LINES) {
  const mp3 = join(OUT, `${L.id}.mp3`);
  const txt = join(OUT, `${L.id}.txt`);
  const cached = existsSync(mp3) && existsSync(txt) && readFileSync(txt, 'utf8') === L.text;
  if (!cached) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: L.text, model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (!res.ok) { console.error(`✗ ${L.id}: HTTP ${res.status}`); process.exit(1); }
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
    writeFileSync(txt, L.text);
  }
  const sec = cutSecOf(mp3);
  out.push({ ...L, sec });
  console.log(`  ${cached ? '↩' : '✔'} ${L.id.padEnd(6)} ${String(sec).padStart(5)}s  ${L.text}`);
}

const total = out.reduce((a, b) => a + b.sec, 0);
console.log(`\n  낭독 합계 ${total.toFixed(2)}초`);

const ts = `// 자동 생성 — scripts/tts-ad.mjs (수동 편집 금지, 재생성으로만 갱신)

export type AdLine = { id: string; f: string; sec: number; text: string };

export const VOICE_AD = {
  base: '${OUT.replace('public/', '')}',
  lines: [
${out.map((l) => `    { id: '${l.id}', f: '${l.id}.mp3', sec: ${l.sec}, text: ${JSON.stringify(l.text)} },`).join('\n')}
  ] as AdLine[],
};
`;
writeFileSync('src/remotion/kit/voice-ad.ts', ts);
console.log('  → src/remotion/kit/voice-ad.ts');
