#!/usr/bin/env node
// ============================================================================
// frame-audit — 「첫 프레임이 움직이는가」 「끝이 처음으로 이어지는가」를 픽셀로 잰다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-21 조사)
//   쇼츠 배포의 단일 최대 신호는 «스와이프율»이다. 50% 이상이면 강하고 30% 미만이면 배포가 죽는다.
//   스와이프를 막는 것은 «첫 프레임이 정지 화면이 아니라 동작 중»일 때다 —
//   보는 사람 뇌가 "뭔가 벌어지고 있다"고 등록해야 손가락이 멈춘다.
//   그리고 «루프»: 끝난 뒤 2초 안의 재시청은 부분 새 뷰로 가중된다.
//   끝 프레임이 첫 프레임으로 «자연스럽게» 이어지면 루프가 걸린다.
//
//   우리는 영상을 코드로 만든다 — 그래서 이 둘을 «잴 수 있고 고칠 수 있다».
//   남들은 감으로 하는 것을 우리는 숫자로 한다. 이게 우리 자리다.
//
// 재는 것
//   ① 초반 동작량   프레임 0~15 의 평균 픽셀 변화 (클수록 «움직인다»)
//   ② 루프 이음새   마지막 프레임 vs 프레임 0 의 픽셀 차이 (작을수록 «이어진다»)
//
// 사용: node scripts/frame-audit.mjs <video.mp4> [...]
// ============================================================================
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const FFDIR = 'C:/Users/seamo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin';
const FF = join(FFDIR, 'ffmpeg.exe'), FP = join(FFDIR, 'ffprobe.exe');
const files = process.argv.slice(2);
if (!files.length) { console.error('사용: frame-audit <video.mp4> [...]'); process.exit(1); }

const dur = (f) => {
  const r = spawnSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  return parseFloat((r.stdout || '0').trim());
};

// 두 시점 프레임의 «평균 절대 픽셀 차이» — ffmpeg blend=difference + signalstats YAVG
// ⛔ 한 파일을 두 번 -ss 로 여는 필터 체인은 동작하지 않았다 (2026-08-21).
//   ⇒ 프레임을 «파일로» 뽑아 두 장을 blend 한다. 단순하고 확실하다.
const TMP = process.env.TEMP || '.';
const grab = (f, t, out) => {
  spawnSync(FF, ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1',
    '-vf', 'scale=270:-1,format=gray', '-y', out], { encoding: 'utf8' });
};
const diff = (f, tA, tB) => {
  const A = join(TMP, 'fa_a.png'), B = join(TMP, 'fa_b.png');
  grab(f, tA, A); grab(f, tB, B);
  const r = spawnSync(FF, ['-v', 'error', '-i', A, '-i', B,
    '-filter_complex', '[0][1]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG',
    '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = ((r.stdout || '') + (r.stderr || '')).match(/YAVG=([\d.]+)/);
  return m ? +Number(m[1]).toFixed(2) : null;
};

console.log('\n  ══ 프레임 감사 ══');
console.log('   초반동작  루프이음새   길이   파일');
console.log('   (클수록↑) (작을수록↑)');
for (const f of files) {
  const d = dur(f);
  if (!d) { console.log(`   x ${f}`); continue; }
  // ① 0.0초 vs 0.5초 — 첫 반 초에 화면이 얼마나 바뀌나
  const motion = diff(f, 0, 0.5);
  // ② 마지막 프레임 vs 첫 프레임
  const seam = diff(f, Math.max(0, d - 0.12), 0);
  const name = f.split(/[\/]/).pop();
  const gate = d < 30 ? 65 : 50;
  console.log(`   ${String(motion ?? '-').padStart(8)}  ${String(seam ?? '-').padStart(9)}   ${d.toFixed(1)}s   ${name}   (완청 게이트 ${gate}%)`);
}
console.log('');
console.log('  ⛔ 절대 기준은 없다 — 우리 영상끼리 «비교»해서 어느 것이 정지 화면으로 시작하는지 찾는다.');
console.log('  ⛔ 30초 미만은 완청 65% 를 요구하고, 30~60초는 50% 다. 우리 상한 30초는 «불리한 쪽» 경계다.\n');
