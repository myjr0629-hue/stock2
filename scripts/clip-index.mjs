#!/usr/bin/env node
// ============================================================================
// clip-index — 배경 클립이 «실제로 무엇을 보여주는지» 목록으로 만든다
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-24). 대표 지적이다.
//   미국 금리 편 배경을 «파일명만 보고» 골랐다. ani-point-same 을 「둘이 같은 방향」이라
//   생각하고 상관 설명에 깔았는데, 실제 그림은 «여우와 토끼 만화» 였다.
//   ani-rubber-band 는 로봇 놀이터, ani-expression-flip 은 우주복 입은 여우였다.
//   금융 데이터 영상에 아동 만화가 깔린 채로 렌더가 끝났다.
//
//   기존 라이브러리 문서(.agent/CLIP_LIBRARY.md · BG_LIBRARY.json · PROMPT_LIBRARY.json)는
//   «옛 세대 클립(brief/finance/hook…)» 만 다루고, 지금 실제로 쓰는 ani-*/ax-* 176개는
//   어디에도 «무엇이 찍혀 있는지» 가 없다. 그래서 매번 추측하게 된다.
//
// 하는 일
//   ① public/shorts/bg/video/*.mp4 전수 — 크기·비율·길이·밝기·움직임을 잰다
//   ② 클립마다 대표 프레임 3장을 이어붙여 .agent/clipsheet/<name>.jpg 로 남긴다
//   ③ .agent/CLIP_INDEX.json 에 기계용, CLIP_INDEX.md 에 사람용으로 쓴다
//   ④ desc 는 «사람(또는 내가 프레임을 보고)» 채운다. 채워진 값은 재실행해도 보존한다.
//
// ⛔ desc 없는 클립은 «쓰지 않는다». 파일명은 설명이 아니다.
//
// 사용:
//   node scripts/clip-index.mjs              전수 갱신 (측정 + 시트)
//   node scripts/clip-index.mjs --sheet=0    24개씩 묶은 대조 시트 생성 (0,1,2…)
//   node scripts/clip-index.mjs --need       desc 가 비어 있는 것만 나열
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const FFPROBE = join(FFDIR, 'ffprobe.exe');
const DIR = 'public/shorts/bg/video';
const SHEET = '.agent/clipsheet';
const OUT = '.agent/CLIP_INDEX.json';

const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  return (r.stdout || '') + (r.stderr || '');
};

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { clips: {} };
const files = readdirSync(DIR).filter((f) => f.endsWith('.mp4')).sort();

// ── --sheet: 24개씩 대조 시트 ────────────────────────────────────────────────
const sheetArg = process.argv.find((a) => a.startsWith('--sheet='));
if (sheetArg) {
  const page = +sheetArg.split('=')[1];
  const batch = files.slice(page * 24, page * 24 + 24);
  if (!batch.length) { console.log('  그 페이지는 비어 있다'); process.exit(0); }
  mkdirSync('.agent/_sheettmp', { recursive: true });
  batch.forEach((f, i) => {
    run(FFMPEG, ['-v', 'error', '-ss', '1', '-i', join(DIR, f), '-frames:v', '1',
      '-vf', 'scale=200:-1', '-y', `.agent/_sheettmp/${String(i).padStart(2, '0')}.jpg`]);
  });
  // ⛔ glob 패턴은 이 ffmpeg 빌드에서 지원되지 않는다 — 번호 시퀀스로 넣는다
  run(FFMPEG, ['-v', 'error', '-i', '.agent/_sheettmp/%02d.jpg', '-vf', 'tile=6x4',
    '-frames:v', '1', '-y', `.agent/clipsheet_page${page}.png`]);
  console.log(`\n  시트 .agent/clipsheet_page${page}.png  (6x4, 왼쪽위→오른쪽아래 순)`);
  batch.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f.replace('.mp4', '')}`));
  process.exit(0);
}

// ── --need: 설명이 없는 것 ──────────────────────────────────────────────────
if (process.argv.includes('--need')) {
  const need = files.map((f) => f.replace('.mp4', '')).filter((k) => !prev.clips[k]?.desc);
  console.log(`\n  설명 없는 클립 ${need.length} / ${files.length}`);
  console.log('  ' + need.join(' '));
  process.exit(0);
}

// ── 전수 측정 ───────────────────────────────────────────────────────────────
mkdirSync(SHEET, { recursive: true });
const clips = {};
let n = 0;
for (const f of files) {
  const key = f.replace('.mp4', '');
  const p = join(DIR, f);
  const info = run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-show_entries', 'format=duration',
    '-of', 'default=nw=1', p]);
  const w = +(info.match(/width=(\d+)/)?.[1] || 0);
  const h = +(info.match(/height=(\d+)/)?.[1] || 0);
  const sec = +(info.match(/duration=([\d.]+)/)?.[1] || 0);
  const y = run(FFMPEG, ['-v', 'error', '-i', p, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG',
    '-f', 'null', '-']);
  const ys = [...y.matchAll(/YAVG=([\d.]+)/g)].map((m) => +m[1]);
  const bright = ys.length ? +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(1) : null;

  // 대표 프레임 3장을 가로로 이어붙인 «미리보기»
  const prevJpg = join(SHEET, `${key}.jpg`);
  if (!existsSync(prevJpg) && sec > 1) {
    run(FFMPEG, ['-v', 'error', '-i', p, '-vf',
      `select='eq(n\\,5)+eq(n\\,${Math.round(sec * 12)})+eq(n\\,${Math.round(sec * 22)})',scale=240:-1,tile=3x1`,
      '-frames:v', '1', '-y', prevJpg]);
  }

  clips[key] = {
    file: `shorts/bg/video/${f}`,
    w, h, aspect: w > h ? '16:9' : '9:16', sec: +sec.toFixed(1), bright,
    preview: `.agent/clipsheet/${key}.jpg`,
    // ⛔ desc 는 «보고 적는» 값이다. 있으면 보존한다.
    desc: prev.clips?.[key]?.desc || '',
    tags: prev.clips?.[key]?.tags || [],
  };
  if (++n % 25 === 0) console.log(`  ${n}/${files.length}`);
}

writeFileSync(OUT, JSON.stringify({
  note: '배경 클립 전수 색인. desc 는 프레임을 «보고» 적는다 — 파일명은 설명이 아니다.',
  updatedAt: new Date().toISOString(), n: files.length, clips,
}, null, 2));

const L = ['# 배경 클립 색인', '',
  '> ⛔ `node scripts/clip-index.mjs` 가 다시 쓴다. 손으로 고치지 않는다 (desc 제외).',
  '> ⛔ **desc 가 빈 클립은 쓰지 않는다.** 2026-08-24, 파일명만 보고 고른 배경 세 개가',
  '> 여우·토끼 만화와 로봇 놀이터였고 금융 영상에 그대로 들어갔다.',
  '> 미리보기: `.agent/clipsheet/<이름>.jpg` (대표 프레임 3장)', '',
  `갱신 ${new Date().toISOString()} · ${files.length}편`, '',
  '| 이름 | 비율 | 초 | 밝기 | 무엇이 보이는가 |', '|---|---|---|---|---|'];
for (const [k, c] of Object.entries(clips))
  L.push(`| \`${k}\` | ${c.aspect} | ${c.sec} | ${c.bright ?? '-'} | ${c.desc || '**미기재**'} |`);
writeFileSync('.agent/CLIP_INDEX.md', L.join('\n') + '\n');
console.log(`\n  → .agent/CLIP_INDEX.json · .agent/CLIP_INDEX.md · ${SHEET}/`);
console.log(`  설명 없는 클립: ${Object.values(clips).filter((c) => !c.desc).length}편`);
