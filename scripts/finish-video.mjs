#!/usr/bin/env node
// ============================================================================
// finish-video — 렌더 «후» 마감 공정. 이 단계를 빼면 게이트를 못 넘는다
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-21)
//   GOLD821 첫 렌더가 -19.01 LUFS 로 나와 게이트(-15.5~-13)를 어겼다.
//   확인해보니 «렌더 파이프라인에 정규화 단계가 아예 없었다» — 지금까지의 통과는
//   낭독 볼륨이 우연히 맞았던 것이지 보장된 것이 아니었다.
//
// 하는 일  ① 2-pass loudnorm → -14 LUFS  ② 프레임 0 을 «정확히» 썸네일로 추출
//   ⛔ 썸네일은 -ss 로 뽑으면 키프레임으로 튄다. select=eq(n,0) 이어야 한다.
//
// 사용: node scripts/finish-video.mjs <in.mp4> [out.mp4]
// ============================================================================
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FFMPEG = join(FFDIR, 'ffmpeg.exe');
const run = (a) => { const r = spawnSync(FFMPEG, a, { maxBuffer: 1 << 30, encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); };

const IN = process.argv[2];
if (!IN || !existsSync(IN)) { console.error('사용: finish-video <in.mp4> [out.mp4]'); process.exit(1); }
const OUT = process.argv[3] || IN;
const TMP = IN.replace(/\.mp4$/i, '.norm.mp4');
const THUMB = IN.replace(/\.mp4$/i, '_thumb.jpg');

// ── 1패스: 측정 ─────────────────────────────────────────────────────────────
const m = run(['-hide_banner', '-nostats', '-i', IN, '-af',
  'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
const j = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
console.log(`  측정  ${j.input_i} LUFS  TP ${j.input_tp}  LRA ${j.input_lra}`);

// ── 2패스: 보정 ─────────────────────────────────────────────────────────────
run(['-y', '-hide_banner', '-loglevel', 'error', '-i', IN, '-af',
  `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}` +
  `:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', TMP]);
if (!existsSync(TMP)) { console.error('  ✗ 정규화 실패'); process.exit(1); }

// ── 검증: 정말 밴드 안에 들어왔는가 ─────────────────────────────────────────
const v = run(['-hide_banner', '-nostats', '-i', TMP, '-af',
  'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
const jv = JSON.parse(v.slice(v.lastIndexOf('{'), v.lastIndexOf('}') + 1));
const li = parseFloat(jv.input_i);
console.log(`  보정  ${li} LUFS  ${li >= -15.5 && li <= -13 ? '✔ 밴드 안' : '✗ 밴드 밖 — 확인 필요'}`);

if (OUT === IN) { unlinkSync(IN); renameSync(TMP, IN); } else { renameSync(TMP, OUT); }

// ── 썸네일 = 프레임 0 (게이트가 픽셀로 대조한다) ────────────────────────────
run(['-y', '-loglevel', 'error', '-i', OUT, '-vf', 'select=eq(n\\,0)', '-vframes', '1', THUMB]);
console.log(`  썸네일  ${THUMB}  ${existsSync(THUMB) ? '✔' : '✗'}`);
console.log(`  → ${OUT}`);
