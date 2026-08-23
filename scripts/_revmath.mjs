// 「수익성만 보고 쇼츠를 만들 수 있는가」 — 실측 가능한 쪽(조회량)으로 계산한다.
//   ⛔ RPM 은 실측 불가 (우리가 YPP 밖이라 API 가 거부한다). 조회량만 잰다.
//   유튜브 쇼츠 수익화 문턱: 구독 1,000명 + 90일간 쇼츠 조회 1,000만
import { readFileSync } from 'node:fs';
const load=(p)=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch(e){return [];}};
const US=load('.agent/_newpool.json'), JP=load('.agent/_jp_pool.json');
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};

function chanStats(pool,label){
 const byCh={}; pool.forEach(v=>(byCh[v.ch]??=[]).push(v));
 const rows=[];
 for(const [ch,vs] of Object.entries(byCh)){
  if(vs.length<8) continue;
  const pubs=vs.map(x=>Date.parse(x.pub)).filter(Boolean).sort((a,b)=>a-b);
  if(pubs.length<8) continue;
  const days=(pubs[pubs.length-1]-pubs[0])/864e5||1;
  const total=vs.reduce((s,x)=>s+x.v,0);
  rows.push({ch,n:vs.length,days,total,
    per90:total/days*90,                    // 지금 속도로 90일 환산
    perVid:med(vs.map(x=>x.v)),
    perDay:vs.length/days,
    subs:vs[0].chSubs, ageM:vs[0].chAgeM});
 }
 rows.sort((a,b)=>b.per90-a.per90);
 const pass=rows.filter(r=>r.per90>=1e7);
 const subOk=rows.filter(r=>r.subs>=1000);
 const both=rows.filter(r=>r.per90>=1e7&&r.subs>=1000);
 console.log('\n  ══ '+label+' — 신규채널 '+rows.length+'곳 ══');
 console.log('   90일 환산 조회 1,000만 이상 : '+pass.length+'곳 ('+(pass.length/rows.length*100).toFixed(1)+'%)');
 console.log('   구독 1,000명 이상          : '+subOk.length+'곳 ('+(subOk.length/rows.length*100).toFixed(1)+'%)');
 console.log('   ⇒ 둘 다 충족 (수익화 가능)  : '+both.length+'곳 ('+(both.length/rows.length*100).toFixed(1)+'%)');
 console.log('\n   편당 조회 중앙값 (전체 채널) : '+med(rows.map(r=>r.perVid)).toLocaleString()+'회');
 console.log('   하루 업로드 중앙값          : '+med(rows.map(r=>r.perDay)).toFixed(2)+'편');
 if(both.length){
  console.log('\n   ── 둘 다 충족한 채널 상위 8 ──');
  console.log('   90일환산     편당중앙   하루   구독    개월  채널');
  both.slice(0,8).forEach(r=>console.log('   '+(r.per90/1e6).toFixed(1).padStart(7)+'M'
   +String(Math.round(r.perVid)).padStart(10)+r.perDay.toFixed(1).padStart(7)
   +String(r.subs).padStart(8)+r.ageM.toFixed(1).padStart(7)+'  '+r.ch.slice(0,24)));
 }
 // 필요한 편수 = 1,000만 / 편당조회
 const needed=(pv)=>pv>0? Math.ceil(1e7/pv/90):Infinity;
 console.log('\n   ── 편당 조회별로 «하루 몇 편» 이 필요한가 (90일 1,000만 기준) ──');
 for(const pv of [500,2000,10000,50000,200000]){
  const n=needed(pv);
  console.log('      편당 '+String(pv).padStart(7)+'회 →  하루 '+(n>50?'50편 초과 (사실상 불가)':n+'편'));
 }
 return rows;
}
const u=chanStats(US,'미국');
const j=chanStats(JP,'일본');
console.log('\n  ══ 우리 위치 ══');
console.log('   미국 채널  편당 중앙 42회 (새 포맷 337~418회) · 구독 2 · 30편');
console.log('   일본 채널  편당 중앙 2회 · 구독 0 · 4편');
console.log('   → 새 포맷 400회로 잡아도 90일 1,000만은 하루 '+Math.ceil(1e7/400/90)+'편이 필요하다');
