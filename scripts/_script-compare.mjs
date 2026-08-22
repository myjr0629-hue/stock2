// 대본의 «말투»를 잰다 — 딱딱한가 친근한가. 영어끼리만 비교한다.
import { readFileSync } from 'node:fs';
const cleanVtt = (p) => {
  const raw = readFileSync(p, 'utf8'); const cues = []; let last = '';
  for (const blk of raw.split(/\r?\n\r?\n/)) {
    if (!/-->/.test(blk)) continue;
    const t = blk.split(/\r?\n/).slice(1).join(' ').replace(/<[^>]+>/g,'').replace(/&gt;/g,'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
    if (!t || t === last) continue; last = t; cues.push(t);
  }
  let acc = '';
  for (const c of cues) {
    if (acc.endsWith(c)) continue;
    let add = c;
    for (let k = Math.min(acc.length, c.length); k > 0; k--) if (acc.endsWith(c.slice(0,k))) { add = c.slice(k); break; }
    acc += add;
  }
  return acc;
};
const ours = () => {
  const s = readFileSync('src/remotion/kit/scripts-longform.ts','utf8');
  const a=[...s.matchAll(/^\s+(say|ask):\s*'([^']+)'/gm)].map(m=>m[2]);
  const b=[...s.matchAll(/^\s+(say|ask):\s*"([^"]+)"/gm)].map(m=>m[2]);
  return a.concat(b).join(' ');
};
const syl = (w) => (w.toLowerCase().replace(/[^a-z]/g,'').replace(/e$/,'').match(/[aeiouy]+/g)||['x']).length;
const M = (name, text, minutes) => {
  const sents = text.split(/(?<=[.!?])\s+/).filter(x=>x.trim().length>3);
  const words = text.split(/\s+/).filter(w=>/[a-z]/i.test(w));
  const hard = words.filter(w => syl(w) >= 3).length;
  const c = (re) => (text.match(re)||[]).length;
  console.log(`\n  ══ ${name} ══`);
  console.log(`   문장 수        ${sents.length}      평균 ${(words.length/sents.length).toFixed(1)}단어/문장`);
  console.log(`   3음절+ 어려운말 ${(hard/words.length*100).toFixed(1)}%`);
  console.log(`   물음표         ${(c(/\?/g)/minutes).toFixed(2)}/분`);
  console.log(`   you / your     ${(c(/\byou\b|\byour\b/gi)/minutes).toFixed(2)}/분`);
  console.log(`   we / our       ${(c(/\bwe\b|\bour\b/gi)/minutes).toFixed(2)}/분`);
  console.log(`   축약형(it's 등) ${(c(/\b\w+'(s|re|t|ll|ve|d)\b/gi)/minutes).toFixed(2)}/분`);
  console.log(`   구어 시작어    ${(c(/\b(So|And|But|Now|Here|Look|Okay|Well|Because)\b/g)/minutes).toFixed(2)}/분`);
  console.log(`   감정·과장어    ${(c(/\b(crazy|insane|wild|huge|massive|shocking|terrible|amazing|absurd|ridiculous|brutal|nightmare|disaster)\b/gi)/minutes).toFixed(2)}/분`);
  console.log(`   사람·캐릭터    ${(c(/\bCharlie\b|\bSam\b|\bhe\b|\bshe\b|\bthey\b|\bthem\b|\bhis\b|\bher\b|\btheir\b/gi)/minutes).toFixed(2)}/분`);
};
M('MonkeyExplains 15:36', cleanVtt('C:/Users/seamo/AppData/Local/Temp/subs/sy4HzG_qzKw.en.vtt'), 15.6);
M('SIGNUM 롱폼 7:19', ours(), 7.32);
