// Self-QC pass: per-beat frames + audio level check + element presence probes.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SP = __dirname;
const VID = path.join(SP, 'signum_copper_60s.mp4');
const OUT = path.join(SP, 'qc');
fs.mkdirSync(OUT, { recursive: true });
const run = (c) => execSync(c, { stdio: 'pipe' }).toString();
const runErr = (c) => { try { return execSync(c + ' 2>&1', { stdio: 'pipe' }).toString(); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };

const BEATS = [[0, 5.9], [5.9, 10.4], [10.4, 14.4], [14.4, 20.9], [20.9, 25.4], [25.4, 33.6], [33.6, 39.8], [39.8, 46.2], [46.2, 51.7]];
const NAMES = ['hook', 'price', 'chip', 'gap', 'deficit', 'tickers', 'cp1', 'cp2', 'outro'];

console.log('=== 1. 컨테이너 ===');
const meta = JSON.parse(run(`ffprobe -v quiet -print_format json -show_format -show_streams "${VID}"`));
const v = meta.streams.find((s) => s.codec_type === 'video');
const a = meta.streams.find((s) => s.codec_type === 'audio');
console.log(`  ${v.width}x${v.height} ${eval(v.r_frame_rate)}fps · ${Number(meta.format.duration).toFixed(2)}s · v:${v.codec_name} a:${a ? a.codec_name + ' ' + a.channels + 'ch' : '없음'} · ${(meta.format.size / 1e6).toFixed(1)}MB`);

console.log('\n=== 2. 비트별 오디오 레벨 (나레이션 존재 확인) ===');
BEATS.forEach(([t0, t1], i) => {
  const o = runErr(`ffmpeg -v info -ss ${t0} -t ${(t1 - t0).toFixed(2)} -i "${VID}" -af "volumedetect" -f null -`);
  const mean = (o.match(/mean_volume:\s*(-?[\d.]+)/) || [])[1];
  const max = (o.match(/max_volume:\s*(-?[\d.]+)/) || [])[1];
  const ok = Number(mean) > -32 ? 'OK' : '⚠ 무음 의심';
  console.log(`  B${i + 1} ${NAMES[i].padEnd(8)} ${t0}-${t1}s  mean ${mean}dB  max ${max}dB  ${ok}`);
});

console.log('\n=== 3. 비트별 프레임 추출 (육안 검수용) ===');
BEATS.forEach(([t0, t1], i) => {
  const mid = (t0 + (t1 - t0) * 0.62).toFixed(2);
  run(`ffmpeg -v quiet -y -ss ${mid} -i "${VID}" -vframes 1 "${OUT}/b${i + 1}_${NAMES[i]}.png"`);
  console.log(`  b${i + 1}_${NAMES[i]}.png @ ${mid}s`);
});

console.log('\n=== 4. 고정 요소 픽셀 프로브 ===');
// masthead red rule (x=52,y=150) should be red; brand plate (x=700,y=1700) dark; date zone bright
function px(t, x, y) {
  const o = run(`ffmpeg -v quiet -ss ${t} -i "${VID}" -vf "crop=1:1:${x}:${y},format=rgb24" -vframes 1 -f rawvideo -`);
  const b = Buffer.from(o, 'binary');
  return [b[0], b[1], b[2]];
}
const probes = [
  ['마스트헤드 레드룰', 3.0, 54, 150, (p) => p[0] > 120 && p[1] < 90],
  ['브랜드 플레이트', 3.0, 700, 1700, (p) => p[0] < 150],
  ['날짜 영역 밝기', 3.0, 1000, 118, (p) => p[0] > 150],
  ['티커 로고 FCX', 29.0, 200, 630, (p) => !(p[0] > 235 && p[1] > 235 && p[2] > 235)],
  ['아웃트로 앱아이콘', 49.0, 265, 290, (p) => p[0] < 120],
];
for (const [name, t, x, y, test] of probes) {
  const p = px(t, x, y);
  console.log(`  ${name.padEnd(16)} @${t}s (${x},${y}) rgb(${p.join(',')}) → ${test(p) ? 'OK' : '⚠ 확인 필요'}`);
}
console.log('\nQC 완료 — qc/ 폴더의 프레임 9장 육안 확인 필요');
