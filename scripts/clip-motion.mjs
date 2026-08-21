#!/usr/bin/env node
// ============================================================================
// clip-motion — 배경 클립마다 «동작이 가장 센 지점»을 찾아 기록한다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-21 조사)
//   쇼츠 배포의 단일 최대 신호는 VVSA(보고 남는가 vs 스와이프)다.
//   조사 결과: "첫 프레임이 «정지»가 아니라 «동작 중»이어야 뇌가 «뭔가 벌어진다»고 등록한다."
//
//   ★ 여기가 우리 자리다 — 남들은 촬영본을 감으로 자른다.
//     우리는 영상을 «코드»로 만든다. 클립의 어느 지점에서 시작할지 «고를 수 있다».
//     그래서 모든 클립의 동작 프로파일을 재두고, 훅은 «가장 센 순간»에서 시작한다.
//
// 재는 법: 0.25초 간격으로 프레임을 뽑아 이웃 프레임과의 픽셀 차이를 잰다.
//   차이가 큰 구간 = 화면이 많이 바뀌는 구간 = «동작 중».
//
// 사용: node scripts/clip-motion.mjs [클립이름...]   (없으면 전체)
// 출력: .agent/CLIP_MOTION.json
// ============================================================================
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FF = join(FFDIR, 'ffmpeg.exe'), FP = join(FFDIR, 'ffprobe.exe');
const DIR = 'public/shorts/bg/video';
const OUT = '.agent/CLIP_MOTION.json';
const TMP = process.env.TEMP || '.';

const args = process.argv.slice(2);
const files = args.length ? args.map((a) => (a.endsWith('.mp4') ? a : `${a}.mp4`))
  : readdirSync(DIR).filter((f) => f.endsWith('.mp4'));

const dur = (f) => {
  const r = spawnSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  return parseFloat((r.stdout || '0').trim()) || 0;
};

// ⛔ 한 번에 여러 프레임을 뽑아 «연속 차이»를 잰다.
//   프레임을 하나씩 뽑아 blend 하면 클립당 수십 번 호출이라 너무 느리다.
//   select 로 일정 간격 프레임만 남기고 tblend=difference 로 «이웃 간 차이»를 한 번에 낸다.
const profile = (f, step = 0.25) => {
  const r = spawnSync(FF, ['-v', 'error', '-i', f,
    '-vf', `fps=${(1 / step).toFixed(2)},scale=180:-1,format=gray,tblend=all_mode=difference,`
      + 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 27 });
  const txt = (r.stdout || '') + (r.stderr || '');
  return [...txt.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
};

const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { measuredAt: '2026-08-21', clips: {} };
let done = 0;
for (const name of files) {
  const p = join(DIR, name);
  const d = dur(p);
  if (!d) { console.log(`  x ${name}`); continue; }
  const prof = profile(p);
  if (prof.length < 4) { console.log(`  x ${name} (프로파일 실패)`); continue; }
  // 5초 창(=쇼츠 훅이 쓰는 길이) 중 «평균 동작»이 가장 큰 시작점
  const WIN = Math.min(20, prof.length);           // 0.25초 × 20 = 5초
  let best = 0, bestSum = -1;
  for (let i = 0; i + WIN <= prof.length; i++) {
    const s = prof.slice(i, i + WIN).reduce((a, b) => a + b, 0);
    if (s > bestSum) { bestSum = s; best = i; }
  }
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  store.clips[name] = {
    dur: +d.toFixed(1),
    motionMean: +mean.toFixed(2),
    motionAt0: +prof[0].toFixed(2),
    bestStartSec: +(best * 0.25).toFixed(2),
    bestWindowMotion: +(bestSum / WIN).toFixed(2),
  };
  done++;
  writeFileSync(OUT, JSON.stringify(store, null, 1));
}

const rows = Object.entries(store.clips).map(([k, v]) => ({ k, ...v }));
rows.sort((a, b) => b.bestWindowMotion - a.bestWindowMotion);
console.log(`\n  ══ 클립 동작 프로파일 (${rows.length}개) ══`);
console.log('   평균동작  0초동작  최고구간  시작초   클립');
for (const r of rows) {
  const flag = r.motionAt0 < r.motionMean * 0.5 ? '  ⛔ 0초가 정지에 가깝다' : '';
  console.log(`   ${String(r.motionMean).padStart(7)}  ${String(r.motionAt0).padStart(7)}  ${String(r.bestWindowMotion).padStart(7)}  ${String(r.bestStartSec).padStart(6)}   ${r.k.replace('.mp4', '')}${flag}`);
}
console.log(`\n  → ${OUT}`);
console.log('  ⛔ 훅에는 «최고구간»이 큰 클립을 쓰고, 그 «시작초»부터 재생한다.');
console.log('     0초가 정지에 가까운 클립을 0초부터 틀면 첫 프레임이 멈춰 보인다 → 스와이프.\n');
