// 일본 «금융» 신규채널에 실제로 폭발작이 있는가 — 감동·유머 채널을 걸러내고 본다.
import { readFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_jp_pool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
// 금융 어휘가 제목에 실제로 든 것만
const FIN=/(株|投資|NISA|資産|運用|配当|利回り|円安|円高|日経|米国株|ドル|金利|決算|銘柄|証券|口座|貯金|節約|お金|年収|給料|税|保険|ローン|不動産|ビットコイン|仮想通貨|半導体|エヌビディア|FRB|インフレ|経済)/;
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
console.log('\n  ══ 채널별 «금융 비중» ══');
const finCh=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<8) continue;
 const share=vs.filter(x=>FIN.test(x.t)).length/vs.length;
 if(share>=0.5) finCh.push({ch,n:vs.length,share,subs:vs[0].chSubs,ageM:vs[0].chAgeM,
   med:med(vs.map(x=>x.v)),max:Math.max(...vs.map(x=>x.v)),vs});
}
finCh.sort((a,b)=>b.max-a.max);
console.log('   채널                        구독   개월  편수  조회중앙   최고    금융비중');
finCh.slice(0,18).forEach(c=>console.log('   '+c.ch.slice(0,22).padEnd(24)
 +String(c.subs).padStart(7)+c.ageM.toFixed(1).padStart(6)+String(c.n).padStart(5)
 +String(c.med).padStart(9)+String(c.max>=1e6?(c.max/1e6).toFixed(1)+'M':Math.round(c.max/1000)+'k').padStart(8)
 +(c.share*100).toFixed(0).padStart(8)+'%'));
console.log('\n  ══ 일본 «금융» 신규채널 폭발작 (자기채널 8배+ · 5만회+) ══');
const hits=[];
finCh.forEach(c=>{const m=c.med||1;
 c.vs.filter(x=>x.v>=50000&&x.v>=m*8&&x.sec<=95&&FIN.test(x.t)).forEach(x=>hits.push({...x,chMed:m}));});
hits.sort((a,b)=>b.v-a.v);
if(!hits.length) console.log('   ⛔ 없다 — 일본 금융 신규채널에서 폭발작이 잡히지 않는다');
else hits.slice(0,20).forEach(x=>console.log('   '+x.id+'  '
 +(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)+'  '+String(x.sec).padStart(2)+'초  '
 +String(Math.round(x.v/x.chMed)).padStart(4)+'배  '+x.ch.slice(0,14).padEnd(15)+x.t.slice(0,32)));
console.log('\n  ── 대조 ──');
console.log('   금융 채널 '+finCh.length+'개 · 그 중 폭발작 '+hits.length+'편');
const all=P.filter(x=>x.sec>=4&&x.sec<=95);
const allHits=all.filter(x=>x.rel>=8&&x.v>=50000);
console.log('   전체 일본 신규채널 폭발작 '+allHits.length+'편 (금융 비중 '+(hits.length/Math.max(1,allHits.length)*100).toFixed(1)+'%)');
if(finCh.length) console.log('   금융 채널 조회 중앙 '+med(finCh.map(c=>c.med))+'회');
