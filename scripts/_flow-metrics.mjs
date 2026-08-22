// 롱폼의 «리듬»을 숫자로 — 재훅 간격, 비유 밀도, 질문 밀도, 숫자 밀도
import { readFileSync } from 'node:fs';
const clean = (p) => {
  const raw = readFileSync(p, 'utf8'); const cues = []; let last = '';
  for (const blk of raw.split(/\r?\n\r?\n/)) {
    const m = blk.match(/(\d{2}):(\d{2}):(\d{2})\.\d+\s+-->/); if (!m) continue;
    const t = +m[1]*3600 + +m[2]*60 + +m[3];
    const txt = blk.split(/\r?\n/).slice(1).join(' ').replace(/<[^>]+>/g,'').replace(/&gt;/g,'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
    if (!txt || txt === last) continue; last = txt; cues.push({ t, txt });
  }
  let acc = ''; const out = [];
  for (const c of cues) {
    if (acc.endsWith(c.txt)) continue;
    let add = c.txt;
    for (let k = Math.min(acc.length, c.txt.length); k > 0; k--) if (acc.endsWith(c.txt.slice(0,k))) { add = c.txt.slice(k); break; }
    if (add.trim()) { out.push({ t: c.t, txt: add.trim() }); acc += add; }
  }
  return { cues: out, text: acc, dur: out[out.length-1]?.t || 1 };
};
const RE = {
  ko: {
    rehook: /(근데|그런데)\s*(여기서|이게|이제)|한 발(만)? 더|이게 끝이 아니|진짜 (이유|중요|무서운|날카로운)|여기가 (오늘|제일)|이상한 (게|신호)|소름/g,
    analogy: /처럼|같아|비유하|생각해 ?봐|셈이|딱 그거/g,
    question: /\?/g,
    number: /[0-9][0-9,.]*\s*(%|조|억|만|천|배|bp|원|달러|년|월|일|개|번|위)/g,
    you: /너|우리|여러분|당신/g,
  },
  en: {
    rehook: /But (here'?s|that'?s not|the more|remember)|here'?s where|But first|what'?s (really|actually)|the real (reason|problem)|Let me explain|Let monkey explain|And then he finds it|it gets interesting/gi,
    analogy: /think of it like|it'?s like|imagine|kind of like|as if|the same way|picture (a|the)/gi,
    question: /\?/g,
    number: /[0-9][0-9,.]*\s*(%|billion|trillion|million|x|times|percent|years?|days?|months?)/gi,
    you: /\byou\b|\byour\b|\bwe\b|\bour\b/gi,
  },
};
for (const arg of process.argv.slice(2)) {
  const [lang, path, label] = arg.split('::');
  const d = clean(path); const R = RE[lang];
  const min = d.dur / 60;
  const cnt = (re) => (d.text.match(re) || []).length;
  const hooks = [...d.cues].filter((c) => R.rehook.test(c.txt) && (R.rehook.lastIndex = 0, true));
  // 재훅 시점 목록
  const hookT = []; let prev = -999;
  for (const c of d.cues) { R.rehook.lastIndex = 0; if (R.rehook.test(c.txt) && c.t - prev > 20) { hookT.push(c.t); prev = c.t; } }
  const gaps = hookT.slice(1).map((t, i) => t - hookT[i]);
  const medg = gaps.length ? [...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)] : 0;
  console.log(`\n  ══ ${label} ══   ${Math.floor(d.dur/60)}분${d.dur%60}초 · ${d.text.length}자 · 분당 ${(d.text.length/min).toFixed(0)}자`);
  console.log(`   재훅        ${String(hookT.length).padStart(3)}회   분당 ${(hookT.length/min).toFixed(2)}   중앙 간격 ${medg}초`);
  console.log(`   비유        ${String(cnt(R.analogy)).padStart(3)}회   분당 ${(cnt(R.analogy)/min).toFixed(2)}`);
  console.log(`   물음표      ${String(cnt(R.question)).padStart(3)}회   분당 ${(cnt(R.question)/min).toFixed(2)}`);
  console.log(`   숫자        ${String(cnt(R.number)).padStart(3)}회   분당 ${(cnt(R.number)/min).toFixed(2)}`);
  console.log(`   2인칭·1인칭 ${String(cnt(R.you)).padStart(3)}회   분당 ${(cnt(R.you)/min).toFixed(2)}`);
  console.log(`   재훅 시점(분): ${hookT.map(t=>(t/60).toFixed(1)).join(' · ')}`);
}
