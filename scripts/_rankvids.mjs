import { readFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const S=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<10) continue;
 const na=vs.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(na>vs.length*0.3) continue;
 const m=med(vs.map(x=>x.v))||1;
 vs.filter(x=>x.sec>0&&x.sec<=90).forEach(x=>S.push({...x,rel:x.v/m}));
}
const RANK=/\b(top\s*\d+|ranked|ranking|#\s?[1-9]\b|best\s+\d+|worst\s+\d+|\d+\s+(best|worst|richest|biggest))\b/i;
const TIME=/\b(\d+\s*years?\s*(ago|later)|over\s*\d+\s*years?|in\s*\d+\s*years?|decade)\b/i;
console.log('\n  ══ 랭킹 포맷 폭발작 (자기채널 20배+ · 조회순) ══');
S.filter(x=>RANK.test(x.t)&&x.rel>=10&&x.v>=200000).sort((a,b)=>b.v-a.v).slice(0,12)
 .forEach(x=>console.log('   '+x.id+'  '+(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)
  +'  '+String(x.sec).padStart(2)+'초  '+String(Math.round(x.rel)).padStart(3)+'배  '+x.ch.slice(0,15).padEnd(16)+x.t.slice(0,50)));
console.log('\n  ══ 시간경과 포맷 폭발작 ══');
S.filter(x=>TIME.test(x.t)&&x.rel>=5&&x.v>=100000).sort((a,b)=>b.v-a.v).slice(0,10)
 .forEach(x=>console.log('   '+x.id+'  '+(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)
  +'  '+String(x.sec).padStart(2)+'초  '+String(Math.round(x.rel)).padStart(3)+'배  '+x.ch.slice(0,15).padEnd(16)+x.t.slice(0,50)));
