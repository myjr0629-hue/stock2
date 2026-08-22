// 롱폼의 «실제 시각»을 뽑는다 — 레퍼런스와 구조를 시각으로 대조하기 위해
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const B = join(tmpdir(), 'signum-lft.cjs');
execFileSync(process.execPath, [join('node_modules','esbuild','bin','esbuild'),
  'src/remotion/kit/index-len.ts','--bundle','--platform=node','--format=cjs',`--outfile=${B}`,'--log-level=silent']);
const m = await import(pathToFileURL(B).href);
const s = m.SCRIPTS.SCRIPT_LFEARN;
const v = s.voice;
const mmss = (x) => `${String(Math.floor(x/60)).padStart(2,'0')}:${String(Math.round(x%60)).padStart(2,'0')}`;
let t = v.hook ? Math.max(2.0, v.hook.sec + 0.45) : 3;
console.log(`  [00:00] 훅  "${s.hook.say}"`);
s.beats.forEach((b, i) => {
  const sg = v.beats[i];
  const sec = sg ? Math.max(2.2, sg.sec + 0.55) : 4;
  console.log(`  [${mmss(t)}] ${String(i).padStart(2)} ${(b.eyebrow||'').padEnd(24)} | ${b.say}`);
  t += sec;
});
console.log(`  [${mmss(t)}] 루프  "${s.loop.replace(/\n/g,' ')}"`);
