// QC for the NewsFlash cut (same checklist as the brief).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SP = __dirname;
const VID = path.join(SP, 'signum_flash_aug11.mp4');
const OUT = path.join(SP, 'qcf');
fs.mkdirSync(OUT, { recursive: true });
const run = (c) => execSync(c, { stdio: 'pipe' }).toString();
const runErr = (c) => { try { return execSync(c + ' 2>&1', { stdio: 'pipe' }).toString(); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };

const B = [[0, 1.6], [1.6, 6.5], [6.5, 9.6], [9.6, 13.8], [13.8, 17.9], [17.9, 21.3], [21.3, 25.2], [25.2, 29.4]];
const NAMES = ['cover', 'record', 'blink', 'strait', 'brent', 'oil', 'cpi', 'outro'];

const meta = JSON.parse(run(`ffprobe -v quiet -print_format json -show_format -show_streams "${VID}"`));
const v = meta.streams.find((s) => s.codec_type === 'video');
const a = meta.streams.find((s) => s.codec_type === 'audio');
console.log(`규격: ${v.width}x${v.height} ${eval(v.r_frame_rate)}fps · ${Number(meta.format.duration).toFixed(2)}s · ${a ? a.codec_name + ' ' + a.channels + 'ch' : '오디오 없음'}`);

console.log('\n비트별 오디오:');
B.forEach(([t0, t1], i) => {
  const o = runErr(`ffmpeg -v info -ss ${t0} -t ${(t1 - t0).toFixed(2)} -i "${VID}" -af volumedetect -f null -`);
  const mean = (o.match(/mean_volume:\s*(-?[\d.]+)/) || [])[1];
  console.log(`  B${i + 1} ${NAMES[i].padEnd(7)} mean ${mean}dB ${Number(mean) > -34 ? 'OK' : '⚠'}`);
});

console.log('\n프레임 추출:');
B.forEach(([t0, t1], i) => {
  const mid = (t0 + (t1 - t0) * 0.6).toFixed(2);
  run(`ffmpeg -v quiet -y -ss ${mid} -i "${VID}" -vframes 1 "${OUT}/f${i + 1}_${NAMES[i]}.png"`);
  console.log(`  f${i + 1}_${NAMES[i]}.png @${mid}s`);
});
run(`ffmpeg -v quiet -y -ss 0.02 -i "${VID}" -vframes 1 "${OUT}/f0_frame0.png"`);
console.log('  f0_frame0.png @0.02s (썸네일 프레임)');
