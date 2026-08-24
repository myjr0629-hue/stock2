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
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { jaPhonetic, isJa } from './_ja-phonetic.mjs';

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
// ⛔ 일본 채널은 목소리가 다르다 (2026-08-21 실측).
//   일본어 미국주식 쇼츠 25편에서 F0(음높이)와 구독자당 조회의 관계를 직접 쟀다:
//   스피어만 rho=-0.509, t=-2.84 → «낮을수록 성과가 좋다». 저음(~140Hz) 중앙 12.95 vs 고음 0.00.
//   Adam 은 영어 남성 1위지만 «일본어 채널의 근거»가 아니다. 그래서 JP 는 따로 고른다.
//   SIGNUM_VOICE 로 덮어쓸 수 있다 — 실측 후보는 .agent/JP_VOICE_PICK.json 에 있다.
// ⛔ 일본어 목소리를 «환경변수로만» 두면 매번 빠뜨린다 (2026-08-25 실측 사고).
//   SIGNUM_VOICE 를 안 붙이고 구우면 조용히 영어 목소리(Adam)로 일본어를 읽는다.
//   ⇒ 아래에서 «대본 언어를 보고» 기본값을 정한다. 환경변수는 덮어쓰기 용도로만 남긴다.
const VOICE_EN = 's3TPKV1kjDlVtZbl4Ksh';   // Adam — 영어권 남성 1위
const VOICE_JA = 'b34JylakFZPlGS0BnwyY';   // kenzo — 2026-08-25 대표 확정
//   후보 대조 실측(같은 문장·같은 세팅): kenzo F0 142.9Hz / kozy 148.1Hz
//   정본 근거는 「일본어는 F0 가 낮을수록 성과가 좋다」(rho=-0.509, t=-2.84 · 25편)
//   ⚠ 차이는 5Hz 로 작다. 「듣기 좋은가」는 재지 못했고 대표가 듣고 고른 것이다.
const MODEL = 'eleven_multilingual_v2';

// ⛔ 일본어는 «세팅이 다르다» (대표 지시 2026-08-25: "지금 음성이 너무 안좋다")
//   기존 0.45/0.8/0.25 는 style(연기 톤)이 섞여 일본어에서 억양이 튀었다.
//   권장값: stability 0.65~0.70 · similarity 0.85 · style 0.00 · speed 1.10~1.15
//   style 0 이 핵심이다 — 연기 톤을 완전히 빼야 낭독체가 된다.
const SETTINGS_EN = { stability: 0.45, similarity_boost: 0.8, style: 0.25 };
const SETTINGS_JA = { stability: 0.68, similarity_boost: 0.85, style: 0.0, speed: 1.12 };

// ── 대본 로드 — scripts.ts 를 esbuild 로 즉석 번들해 require ─────────────────
// npx 로 부르지 않는다 — 윈도우에서는 npx.cmd 라 Node 20+ 가 EINVAL 로 거부한다.
// 로컬 esbuild 의 JS 진입점을 node 로 직접 실행하면 세 OS 에서 똑같이 동작한다.
// /tmp 도 없으므로 임시 경로는 os.tmpdir() 로 잡는다.
const ESBUILD = join('node_modules', 'esbuild', 'bin', 'esbuild');
const BUNDLE = join(tmpdir(), 'signum-scripts.cjs');
execFileSync(process.execPath, [ESBUILD, 'src/remotion/kit/scripts.ts', '--bundle', '--platform=node',
  '--format=cjs', `--outfile=${BUNDLE}`, '--log-level=silent']);
const mod = await import(pathToFileURL(BUNDLE).href);
const script = mod[`SCRIPT_${NAME}`] ?? mod.default?.[`SCRIPT_${NAME}`];
if (!script) { console.error(`SCRIPT_${NAME} 를 kit/scripts.ts 에서 찾지 못했다`); process.exit(1); }

// ── 낭독 목록 (자막과 같은 문자열 — \n 만 공백으로) ─────────────────────────
const flat = (t) => (t || '').replace(/\n/g, ' ').trim();
// ★ say 와 ask 를 «한 파일»로 굽지 않는다.
//   합쳐 구우면 ask 자막이 언제 나와야 하는지 알 수 없어 «고정 프레임»으로 띄우게 되고,
//   그러면 자막이 낭독보다 2초 먼저 뜬다(2026-08-11 실측 결함). 따로 구워 «실측 초»로 맞춘다.
const segs = [
  { id: 'hook', text: flat(script.hook.say ?? script.hook.line) },   // say 가 있으면 «그걸» 읽는다 (화면은 line 그대로)
  ...script.beats.flatMap((b, i) => {
    const n = String(i).padStart(2, '0');
    const out = [{ id: n, text: flat(b.say) }];
    if (flat(b.ask)) out.push({ id: `${n}a`, text: flat(b.ask) });
    return out;
  }),
  // ⛔ noOutro 대본은 아웃트로가 아예 없다 — 있을 때만 굽는다 (2026-08-22)
  ...(script.outro?.ask ? [{ id: 'outro', text: flat(script.outro.ask) }] : []),
  { id: 'loop', text: flat(script.loop) },
];

// ── 언어 판별 → 전처리 + 세팅 ───────────────────────────────────────────────
// ⛔ 대본에 lang 필드가 없어서 «글자» 로 판별한다. 가나가 있으면 일본어다.
//   (한자만으로는 못 가른다 — 영어 대본에도 한자는 안 나오지만 확실한 신호는 가나다)
const IS_JA = segs.some((s) => isJa(s.text));
const SETTINGS = IS_JA ? SETTINGS_JA : SETTINGS_EN;
// ★ 목소리는 «대본 언어» 가 정한다. 환경변수는 덮어쓸 때만.
const VOICE_ID = process.env.SIGNUM_VOICE || (IS_JA ? VOICE_JA : VOICE_EN);
console.log(`  목소리 ${VOICE_ID === VOICE_JA ? 'kenzo (JA)' : VOICE_ID === VOICE_EN ? 'Adam (EN)' : VOICE_ID}`);
if (IS_JA) {
  for (const s of segs) {
    const before = s.text;
    s.text = jaPhonetic(s.text);
    if (s.text !== before) console.log(`  발음교정 ${s.id.padEnd(5)} ${before}  →  ${s.text}`);
  }
  console.log(`  일본어 세팅 적용 — stability ${SETTINGS.stability} · style ${SETTINGS.style} · speed ${SETTINGS.speed}\n`);
}

const outDir = join('public/shorts/audio', NAME.toLowerCase());
mkdirSync(outDir, { recursive: true });

// ── ffprobe (리모션 번들) 로 실측 길이 ──────────────────────────────────────
// 컴포지터는 플랫폼별 패키지다. 맥만 dylib 경로를 잡아줘야 하고, 윈도우는 exe 옆 DLL 을 찾는다.
const IS_WIN = process.platform === 'win32';
const COMP = join('node_modules', '@remotion', IS_WIN ? 'compositor-win32-x64-msvc' : 'compositor-darwin-arm64');
const FFPROBE = join(COMP, IS_WIN ? 'ffprobe.exe' : 'ffprobe');
const ENV = IS_WIN ? { ...process.env } : { ...process.env, DYLD_LIBRARY_PATH: COMP };
const durOf = (f) => parseFloat(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
  { env: ENV }
).toString());

// ── ★ 실발화 길이 (2026-08-13 실측 결함에서 나온 장치) ─────────────────────────
// 문제: ElevenLabs mp3 끝에 «꼬리 무음»이 붙는다. 파일 길이 2.32초인데 실제 발화는
//       1.75초에 끝났다. 파일 길이를 컷 길이로 쓰면 그 0.6초가 통째로 죽은 시간이 된다.
// 왜 치명적인가: 훅에서 이게 생기면 «스와이프 판정 구간»이 무음이 된다.
//       실측(원유편): 1.1~1.8초 무음 + 화면도 1.6초까지 정지 → 유효 조회 16%.
// 해법: 파일 길이 대신 «마지막으로 소리가 난 지점 + 짧은 여운»을 컷 길이로 쓴다.
//       오디오 자체는 끝까지 재생되지만, 잘리는 건 어차피 무음이라 손실이 없다.
const FFMPEG = join(COMP, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
const TAIL = 0.12;          // 발화 끝 뒤에 남기는 여운
const FLOOR = 0.015;        // 무음 판정 RMS

/** mp3 를 8kHz 모노 PCM 으로 풀어 «마지막 소리 지점»을 잰다 */
function speechEndOf(f) {
  const wav = join(tmpdir(), `spk-${process.pid}.wav`);
  execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', f, '-ac', '1', '-ar', '8000',
    '-f', 'wav', '-acodec', 'pcm_s16le', wav], { env: ENV });
  const buf = readFileSync(wav);
  let p = 12;
  while (p < buf.length - 8) {                       // 'data' 청크 찾기 (헤더 길이가 가변)
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'data') { p += 8; break; }
    p += 8 + size + (size % 2);
  }
  const SR = 8000, WIN = SR / 40;                     // 25ms 창
  let last = 0;
  for (let i = p, w = 0; i + WIN * 2 <= buf.length; i += WIN * 2, w++) {
    let sum = 0;
    for (let k = 0; k < WIN; k++) { const v = buf.readInt16LE(i + k * 2) / 32768; sum += v * v; }
    if (Math.sqrt(sum / WIN) > FLOOR) last = (w + 1) * 0.025;
  }
  try { unlinkSync(wav); } catch {}
  return last;
}

/** 컷 길이로 쓸 값 — 실발화 + 여운. 측정 실패 시 파일 길이로 안전하게 되돌린다. */
function cutSecOf(f) {
  const full = durOf(f);
  try {
    const end = speechEndOf(f);
    if (!end || end < 0.15) return full;              // 소리를 못 찾으면 원본 길이
    return Math.min(full, Math.round((end + TAIL) * 100) / 100);
  } catch { return full; }
}

const results = [];
for (const seg of segs) {
  const mp3 = join(outDir, `${seg.id}.mp3`);
  const txt = join(outDir, `${seg.id}.txt`);
  // ⛔ 캐시 키에 «목소리와 세팅» 을 넣는다 (2026-08-25 실측 사고).
  //   문장만 키로 쓰던 때, 일본 목소리를 kenzo 로 바꿨더니 «문장이 바뀐 6개만» 다시 구워지고
  //   나머지 12개는 옛 목소리로 남았다. 한 영상 안에서 목소리가 갈리는데 로그는 정상으로 보였다.
  //   ⇒ 목소리·모델·세팅이 하나라도 달라지면 전부 다시 굽는다.
  const stamp = `# ${VOICE_ID} ${MODEL} ${JSON.stringify(SETTINGS)}\n${seg.text}`;
  const cached = existsSync(mp3) && existsSync(txt) && readFileSync(txt, 'utf8') === stamp;
  if (!cached) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: seg.text, model_id: MODEL, voice_settings: SETTINGS }),
      // ⛔ seg.text 는 «이미 전처리된» 문자열이다. 캐시 .txt 도 이 값으로 저장되므로
      //   전처리 규칙을 고치면 자동으로 다시 구워진다 (원문만 저장하면 조용히 옛 음성이 남는다).
    });
    if (!res.ok) { console.error(`✗ ${seg.id}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
    writeFileSync(txt, stamp);
  }
  // ★ 파일 길이가 아니라 «실발화 길이»를 쓴다 (꼬리 무음 제거 — 위 주석 참조)
  const full = Math.round(durOf(mp3) * 100) / 100;
  const sec = cutSecOf(mp3);
  const cut = Math.round((full - sec) * 100) / 100;
  results.push({ id: seg.id, sec, cached });
  console.log(`  ${cached ? '↩' : '✔'} ${seg.id.padEnd(6)} ${String(sec).padStart(5)}s`
    + `${cut > 0.05 ? ` (꼬리 -${String(cut).padEnd(4)})` : '              '}  ${seg.text.slice(0, 38)}`);
}

// ── 템플릿용 트랙 파일 생성 ─────────────────────────────────────────────────
const lc = NAME.toLowerCase();
const seg = (id) => { const r = results.find((x) => x.id === id); return r ? `{ f: '${id}.mp3', sec: ${r.sec} }` : null; };
// ⛔ noOutro 대본은 아웃트로 줄 자체를 트랙에서 뺀다 (2026-08-22)
const outroLine = () => { const v = seg('outro'); return v ? `  outro: ${v},
` : ''; };
const GAP = 0.18;   // say 끝 ↔ ask 시작 사이의 숨. 자막 전환도 이 시점에 맞춘다.
const beatSegs = results.filter((r) => /^\d+$/.test(r.id)).map((r) => {
  const a = results.find((x) => x.id === `${r.id}a`);
  const total = a ? Math.round((r.sec + GAP + a.sec) * 100) / 100 : r.sec;
  return a
    ? `{ f: '${r.id}.mp3', sec: ${total}, saySec: ${r.sec}, ask: { f: '${r.id}a.mp3', sec: ${a.sec} } }`
    : `{ f: '${r.id}.mp3', sec: ${r.sec} }`;
}).join(',\n    ');
const ts = `// 자동 생성 — scripts/tts-beats.mjs ${NAME} (수동 편집 금지, 재생성으로만 갱신)
import type { VoiceTrack } from './Briefing';

export const VOICE_${NAME}: VoiceTrack = {
  base: 'shorts/audio/${lc}',
  hook: ${seg('hook')},
  beats: [
    ${beatSegs},
  ],
${outroLine()}  loop: ${seg('loop')},
};
`;
writeFileSync(`src/remotion/kit/voice-${lc}.ts`, ts);
const total = results.reduce((a, r) => a + r.sec, 0);   // 숨 제외 순수 낭독
console.log(`\n낭독 합계 ${total.toFixed(1)}s → src/remotion/kit/voice-${lc}.ts 생성`);
console.log(`다음: scripts.ts 의 SCRIPT_${NAME} 에  voice: VOICE_${NAME}  연결 후 렌더`);
