// 수익화 문턱(90일 1,000만 + 구독 1,000)을 «실제로 넘은» 신규채널이 무엇을 만드는가.
//   ⛔ 주제 제한 없음. 수익만 본다는 전제.
import { readFileSync } from 'node:fs';
const load=(p)=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch(e){return [];}};
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
function pick(pool,label){
 const byCh={}; pool.forEach(v=>(byCh[v.ch]??=[]).push(v));
 const rows=[];
 for(const [ch,vs] of Object.entries(byCh)){
  if(vs.length<8) continue;
  const pubs=vs.map(x=>Date.parse(x.pub)).filter(Boolean).sort((a,b)=>a-b);
  if(pubs.length<8) continue;
  const days=(pubs[pubs.length-1]-pubs[0])/864e5||1;
  const per90=vs.reduce((s,x)=>s+x.v,0)/days*90;
  if(per90<1e7||vs[0].chSubs<1000) continue;
  rows.push({ch,vs,per90,perVid:med(vs.map(x=>x.v)),perDay:vs.length/days,
   subs:vs[0].chSubs,ageM:vs[0].chAgeM,
   sec:med(vs.map(x=>x.sec)),
   like:med(vs.filter(x=>x.v>1000).map(x=>x.like/x.v*100))||0});
 }
 rows.sort((a,b)=>b.per90-a.per90);
 console.log('\n  ══════ '+label+' — 수익화 문턱 통과 '+rows.length+'곳 ══════');
 for(const r of rows.slice(0,10)){
  console.log('\n  ── '+r.ch.slice(0,30)+'  (구독 '+r.subs.toLocaleString()+' · '+r.ageM.toFixed(1)+'개월)');
  console.log('     90일환산 '+(r.per90/1e6).toFixed(0)+'M · 편당중앙 '+Math.round(r.perVid).toLocaleString()
   +'회 · 하루 '+r.perDay.toFixed(1)+'편 · 길이중앙 '+r.sec+'초 · 좋아요율 '+r.like.toFixed(2)+'%');
  [...r.vs].sort((a,b)=>b.v-a.v).slice(0,3).forEach(x=>console.log('        '
   +(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)+'  '+String(x.sec).padStart(2)+'초  '+x.t.slice(0,44)));
 }
 console.log('\n   ── '+label+' 통과 채널 공통값 ──');
 console.log('      편당 조회 중앙 '+Math.round(med(rows.map(r=>r.perVid))).toLocaleString()+'회');
 console.log('      하루 업로드 중앙 '+med(rows.map(r=>r.perDay)).toFixed(1)+'편');
 console.log('      길이 중앙 '+med(rows.map(r=>r.sec))+'초');
 console.log('      개설 후 중앙 '+med(rows.map(r=>r.ageM)).toFixed(1)+'개월');
 console.log('      구독 중앙 '+Math.round(med(rows.map(r=>r.subs))).toLocaleString()+'명');
 return rows;
}
pick(load('.agent/_newpool.json'),'미국·영어권');
pick(load('.agent/_jp_pool.json'),'일본');
