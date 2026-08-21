// 렌더 «전»에 최종 길이를 잰다. 렌더는 5분 걸린다 — 길이 때문에 다시 굽지 않는다.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const B = join(tmpdir(), 'signum-len.cjs');
execFileSync(process.execPath, [join('node_modules','esbuild','bin','esbuild'),
  'src/remotion/kit/index-len.ts','--bundle','--platform=node','--format=cjs',`--outfile=${B}`,'--log-level=silent']);
const m = await import(pathToFileURL(B).href);
for (const name of process.argv.slice(2)) {
  const s = m.SCRIPTS[`SCRIPT_${name.toUpperCase()}`];
  if (!s) { console.log(`  ✗ SCRIPT_${name} 없음`); continue; }
  const cut = m.cutFor(s, 'yt');
  const f = m.durationOf(cut), sec = f / 30;
  const W = m.WINDOW.yt;
  const ok = sec >= W.min && sec <= W.max;
  console.log(`  ${name.padEnd(10)} ${sec.toFixed(2)}초 (${f}f)  창 ${W.min}~${W.max}  ${ok?'✔':'✗ 밖'}  비트 ${cut.beats.length}개  아웃트로 ${cut.noOutro?'없음':'있음'}`);
}
