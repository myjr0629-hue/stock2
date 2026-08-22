// «신규 채널이 처음부터 지금까지 무엇을 바꿨나» — 업로드 순서대로 세워 변곡점 전후를 대조한다.
//   보는 것: 길이 · 제목 구조 · 소재 · 해시태그 · 업로드 간격 — 폭발 «전» 과 «후» 로 나눠서
import { readFileSync, writeFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
// 영어권 + 금융/비즈니스 + 실제 폭발이 있는 채널만
const BAD=/gold rate|jewell|nathiya|necklace|fashion|bonsai|parkour|cake|cuisine/i;
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const cands=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<15) continue;
 const asc=[...vs].sort((a,b)=>a.idx-b.idx);
 const m=med(asc.map(x=>x.v))||1;
 const bi=asc.findIndex(x=>x.v>=Math.max(20000,m*8));
 if(bi<0) continue;
 const nonAscii=asc.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300]/gu,''))).length;
 if(nonAscii>asc.length*0.3) continue;                       // 비영어 채널 제외
 if(asc.filter(x=>BAD.test(x.t)).length>asc.length*0.2) continue;
 cands.push({ch,asc,m,bi,subs:asc[0].chSubs,ageM:asc[0].chAgeM,peak:Math.max(...asc.map(x=>x.v))});
}
cands.sort((a,b)=>b.peak-a.peak);
console.log('\n  ══ 영어권 신규 폭발 채널 '+cands.length+'개 ══\n');
const tag=t=>(t.match(/#\w+/g)||[]).length;
for(const c of cands.slice(0,8)){
 const {ch,asc,bi,m}=c;
 const pre=asc.slice(0,bi), post=asc.slice(bi);
 console.log('  ═══════════════════════════════════════════════════════════');
 console.log('  '+ch+'   구독 '+c.subs.toLocaleString()+' · 개설 '+c.ageM.toFixed(1)+'개월 · '+asc.length+'편');
 console.log('  ▶ 폭발 = '+(bi+1)+'번째  ('+asc[bi].v.toLocaleString()+'회, '+asc[bi].sec+'초, '+asc[bi].pub+')');
 console.log('      "'+asc[bi].t.slice(0,72)+'"');
 if(pre.length>=3){
  console.log('\n   ── 폭발 «전» '+pre.length+'편 ──');
  console.log('      조회 중앙 '+med(pre.map(x=>x.v)).toLocaleString()+'회 · 길이 중앙 '+med(pre.map(x=>x.sec))
   +'초 · 제목 중앙 '+med(pre.map(x=>x.t.length))+'자 · 해시태그 중앙 '+med(pre.map(x=>tag(x.t))));
  pre.slice(-4).forEach(x=>console.log('        '+String(x.v).padStart(8)+'회 '+String(x.sec).padStart(2)+'초  '+x.t.slice(0,62)));
 }
 console.log('\n   ── 폭발 «후» '+post.length+'편 ──');
 console.log('      조회 중앙 '+med(post.map(x=>x.v)).toLocaleString()+'회 · 길이 중앙 '+med(post.map(x=>x.sec))
  +'초 · 제목 중앙 '+med(post.map(x=>x.t.length))+'자 · 해시태그 중앙 '+med(post.map(x=>tag(x.t))));
 post.slice(0,4).forEach(x=>console.log('        '+String(x.v).padStart(8)+'회 '+String(x.sec).padStart(2)+'초  '+x.t.slice(0,62)));
 const top=[...asc].sort((a,b)=>b.v-a.v).slice(0,5);
 console.log('\n   ── 이 채널 상위 5편 (여기에 «반복되는 틀» 이 보인다) ──');
 top.forEach(x=>console.log('        '+String(x.v).padStart(9)+'회 '+String(x.sec).padStart(2)+'초  '+x.t.slice(0,64)));
 console.log('');
}
writeFileSync('.agent/_evolve.json',JSON.stringify(cands.slice(0,8).map(c=>({ch:c.ch,subs:c.subs,ageM:c.ageM,bi:c.bi,vids:c.asc})),null,1));
