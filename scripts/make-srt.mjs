// ============================================================================
// scripts/make-srt.mjs — 브리핑 대본에서 «영상과 오차 없는» SRT 를 뽑는다
// ----------------------------------------------------------------------------
// 왜 필요한가: 유튜브는 자막을 «색인»한다. 우리 유입의 90%가 검색(티커)이라
//   SRT 를 올리면 그 자체가 검색 표면이 된다. 화면에 구운 자막은 색인되지 않는다.
//
// 타이밍은 Briefing.timingOf 와 «같은 식»을 쓴다:
//   hookSec  = max(2.0, voice.hook.sec + 0.45)
//   beatSec  = max(base, voice.beats[i].sec + 0.35)     base = beat.sec ?? 3.0(또는 shot/source 면 4.5)
//   ctaSec   = max(2.0, voice.outro.sec + 0.3)
//   loopSec  = max(2.5, voice.loop.sec + 0.2)
//   컷 시작은 F(s)=round(s*30) 프레임 누적 — 렌더와 동일
//   비트 안에서 ask 는 saySec + 0.18 초에 바뀐다 (Say2 와 동일)
//
// ★ 계산이 맞는지 «렌더된 영상 길이»와 대조해서 증명한다. 어긋나면 실패로 끝낸다.
//
// 실행:  node scripts/make-srt.mjs AMD819 [검증용.mp4]
// ============================================================================

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const NAME = (process.argv[2] || '').toUpperCase();
const CHECK = process.argv[3];
if (!NAME) { console.error('사용: node scripts/make-srt.mjs <AMD819> [영상.mp4]'); process.exit(1); }

const FPS = 30;
const F = (s) => Math.round(s * FPS);

// 대본 로드 — tts-beats.mjs 와 같은 방식 (esbuild 즉석 번들)
const ESBUILD = join('node_modules', 'esbuild', 'bin', 'esbuild');
const BUNDLE = join(tmpdir(), 'signum-srt.cjs');
execFileSync(process.execPath, [ESBUILD, 'src/remotion/kit/scripts.ts', '--bundle', '--platform=node',
  '--format=cjs', `--outfile=${BUNDLE}`, '--log-level=silent']);
const mod = await import(pathToFileURL(BUNDLE).href);
const p = mod[`SCRIPT_${NAME}`];
if (!p) { console.error(`SCRIPT_${NAME} 없음`); process.exit(1); }

const v = p.voice;
const flat = (s) => (s || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
const baseSec = (b) => b.sec ?? (b.visual?.kind === 'shot' || b.visual?.kind === 'source' ? 4.5 : 3.0);

const cues = [];
let fr = 0;
const push = (startF, endF, text) => {
  if (!text) return;
  cues.push({ a: startF / FPS, b: endF / FPS, t: text });
};

// ── 훅 ──────────────────────────────────────────────────────────────────────
const hookSec = v?.hook ? Math.max(2.0, v.hook.sec + 0.45) : 3.0;
push(fr, fr + F(hookSec), flat(p.hook.say ?? p.hook.line));
fr += F(hookSec);

// ── 비트 (say → ask) ────────────────────────────────────────────────────────
p.beats.forEach((b, i) => {
  const seg = v?.beats?.[i];
  const sec = seg ? Math.max(baseSec(b), seg.sec + 0.35) : baseSec(b);
  const len = F(sec);
  const askAt = seg?.ask ? F((seg.saySec ?? 0) + 0.18) : null;
  if (askAt !== null && askAt < len) {
    push(fr, fr + askAt, flat(b.say));
    push(fr + askAt, fr + len, flat(b.ask));
  } else {
    push(fr, fr + len, flat(b.say) + (flat(b.ask) ? ' ' + flat(b.ask) : ''));
  }
  fr += len;
});

// ── CTA · 루프 ──────────────────────────────────────────────────────────────
const ctaSec = v?.outro ? Math.max(2.0, v.outro.sec + 0.3) : 2.0;
push(fr, fr + F(ctaSec), flat(p.outro.ask));
fr += F(ctaSec);

const loopSec = v?.loop ? Math.max(2.5, v.loop.sec + 0.2) : 2.5;
push(fr, fr + F(loopSec), flat(p.loop));
fr += F(loopSec);

// ── 검증 — 렌더된 영상과 프레임 수가 같아야 한다 ────────────────────────────
if (CHECK) {
  const FFPROBE = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffprobe.exe';
  const n = Number(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', CHECK])
    .toString().trim().replace(/,/g, ''));
  if (n !== fr) {
    console.error(`✗ 타이밍 불일치 — 계산 ${fr}프레임 vs 영상 ${n}프레임. SRT 를 쓰지 않는다.`);
    process.exit(1);
  }
  console.log(`✔ 타이밍 검증 통과 — 계산과 영상이 둘 다 ${fr}프레임 (${(fr / FPS).toFixed(2)}초)`);
}

// ── SRT 출력 ────────────────────────────────────────────────────────────────
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = cues.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.t}\n`).join('\n');
const out = `E:/SIGNUM_UPLOAD/${NAME}.srt`;
writeFileSync(out, srt, 'utf8');

console.log(`\n자막 ${cues.length}개 · 총 ${(fr / FPS).toFixed(2)}초`);
cues.forEach((c) => console.log(`  ${ts(c.a)}  ${c.t}`));
console.log(`\n→ ${out}`);
