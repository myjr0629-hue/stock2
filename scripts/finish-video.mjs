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

// ── 밝기도 «밴드»로 맞춘다 (2026-08-21) ─────────────────────────────────────
// ⛔ 왜 여기서 하나
//   소리는 -14 LUFS 로 맞추면서 «그림»은 안 맞추고 있었다. 그래서 매번
//   「또 어둡게 만들었다」가 반복된다 (대표 반복 지적). 자를 하나 더 세운다.
//   기준 90~150 은 «중간 톤». 아래면 올리고, 위면 그대로 둔다 (밝은 건 문제가 아니다).
//
// ⛔ 왜 gamma 인가
//   brightness 는 전체를 통째로 밀어올려 검은 부분이 회색이 되고 대비가 죽는다.
//   gamma 는 «중간톤»만 들어올리므로 글자(흰색)와 어두운 판은 거의 그대로다.
//   그래서 자막 가독성을 해치지 않는다.
const yavgOf = (f) => {
  const o = run(['-hide_banner', '-nostats', '-i', f, '-vf',
    'format=gray,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
  const all = [...o.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
};

// ⛔ 대표 지시 2026-08-21 (2차): "의도적으로 밝기를 올리고... 눈이 부시다.
//   특별한 것 아니라면 안 해도 될 듯하다"
//   ⇒ 감마로 «강제로 들어올리는» 것을 «끈다». 재기만 하고 보고한다.
//   렌더가 원래 내는 톤을 존중한다 — 후보정으로 밀어올리면 화면이 뜬다.
//   ⛔ 정말 어두운 소재(YAVG 60 미만)는 «배경 클립»을 바꾸지, 감마로 덮지 않는다.
const BRIGHT = { min: 90, max: 150, LIFT: false };
const y0 = yavgOf(OUT);
if (y0 == null) console.log('  밝기  측정 실패');
else console.log(`  밝기  YAVG ${y0.toFixed(1)}  ${y0 >= BRIGHT.min ? '(밴드 안)' : y0 >= 60 ? '(밴드 아래 — 보정하지 않는다)' : '⛔ 매우 어둡다 — 배경 클립을 바꾼다'}`);

// ── 썸네일 ①  세로 1080x1920 = 프레임 0 (게이트가 픽셀로 대조한다) ─────────

run(['-y', '-loglevel', 'error', '-i', OUT, '-vf', 'select=eq(n\\,0)', '-vframes', '1', THUMB]);
console.log(`  썸네일  ${THUMB}  ${existsSync(THUMB) ? '✔' : '✗'}`);
// ── 썸네일 ②  가로 1280x720 — 검색·워치페이지용 (2026-08-21 실측) ──────────
// ⛔ 유튜브는 «세로» 썸네일을 받아도 1280x720 «가로»로 바꾼다.
//   그러면 좌우가 흐린 배경으로 채워지고 «가운데만» 우리 그림이 된다 — 확인함.
//   ⇒ 어차피 가로로 갈 거면 «처음부터 가로»로 만들어 보낸다.
//     제목이 있는 위쪽을 잘라 16:9 로 채운다. 검색 결과에서 글자가 훨씬 크게 보인다.
//   ⛔ 쇼츠 «피드»에 뜨는 세로 커버는 «별개 필드»이고 API 가 없다 — 그건 스튜디오에서만.
const THUMB16 = IN.replace(/\.mp4$/i, '_thumb16.jpg');
run(['-y', '-loglevel', 'error', '-i', THUMB,
  '-vf', 'crop=1080:608:0:720,scale=1280:720:flags=lanczos', '-q:v', '2', THUMB16]);
console.log(`  썸네일16:9  ${THUMB16}  ${existsSync(THUMB16) ? '✔' : '✗'}`);

console.log(`  → ${OUT}`);
