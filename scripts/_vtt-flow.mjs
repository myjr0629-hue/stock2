// 자동자막 VTT → «시간이 붙은 문장 흐름». 롱폼의 «설계»를 읽기 위한 도구.
import { readFileSync } from 'node:fs';
const raw = readFileSync(process.argv[2], 'utf8');
const cues = [];
let last = '';
for (const blk of raw.split(/\r?\n\r?\n/)) {
  const m = blk.match(/(\d{2}):(\d{2}):(\d{2})\.\d+\s+-->/);
  if (!m) continue;
  const t = +m[1]*3600 + +m[2]*60 + +m[3];
  const txt = blk.split(/\r?\n/).slice(1).join(' ')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!txt || txt === last) continue;
  last = txt;
  cues.push({ t, txt });
}
// 자동자막은 겹쳐서 나온다 — «새로 늘어난 부분»만 이어붙인다
let acc = '';
const clean = [];
for (const c of cues) {
  if (acc.endsWith(c.txt)) continue;
  let add = c.txt;
  for (let k = Math.min(acc.length, c.txt.length); k > 0; k--) {
    if (acc.endsWith(c.txt.slice(0, k))) { add = c.txt.slice(k); break; }
  }
  if (add.trim()) { clean.push({ t: c.t, txt: add.trim() }); acc += add; }
}
const mmss = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const step = Number(process.argv[3] || 30);
let bucket = -1, line = [];
const out = [];
for (const c of clean) {
  const b = Math.floor(c.t / step);
  if (b !== bucket) { if (line.length) out.push([bucket*step, line.join(' ')]); bucket = b; line = []; }
  line.push(c.txt);
}
if (line.length) out.push([bucket*step, line.join(' ')]);
console.log(`  총 ${mmss(clean[clean.length-1]?.t || 0)} · 글자 ${acc.length}자 · 분당 ${(acc.length/((clean[clean.length-1]?.t||1)/60)).toFixed(0)}자\n`);
for (const [t, s] of out) console.log(`  [${mmss(t)}] ${s}`);
