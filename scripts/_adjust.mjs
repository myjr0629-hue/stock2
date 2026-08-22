// «폭발 전과 후에 무엇을 바꿨나» — 110개 영어권 신규 폭발 채널 전수로 잰다.
//   눈으로 본 것(길이를 줄였다)을 표본 전체에서 확인한다. 8개만 보고 결론내지 않는다.
import { readFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const BAD=/gold rate|jewell|nathiya|necklace|fashion|bonsai|parkour/i;
const rows=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<15) continue;
 const asc=[...vs].sort((a,b)=>a.idx-b.idx);
 const m=med(asc.map(x=>x.v))||1;
 const bi=asc.findIndex(x=>x.v>=Math.max(20000,m*8));
 if(bi<4||bi>asc.length-6) continue;                       // 앞뒤로 표본이 있어야 대조가 된다
 const nonAscii=asc.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(nonAscii>asc.length*0.3) continue;
 if(asc.filter(x=>BAD.test(x.t)).length>asc.length*0.2) continue;
 const pre=asc.slice(0,bi), post=asc.slice(bi+1);
 if(pre.length<4||post.length<5) continue;
 rows.push({ch,n:asc.length,bi:bi+1,
  preV:med(pre.map(x=>x.v)), postV:med(post.map(x=>x.v)),
  preS:med(pre.map(x=>x.sec)), postS:med(post.map(x=>x.sec)),
  preT:med(pre.map(x=>x.t.length)), postT:med(post.map(x=>x.t.length)),
  preH:med(pre.map(x=>(x.t.match(/#\w+/g)||[]).length)), postH:med(post.map(x=>(x.t.match(/#\w+/g)||[]).length))});
}
console.log('\n  ══ 폭발 전 → 후, 무엇이 달라졌나 (n='+rows.length+' 채널) ══\n');
const dS=rows.map(r=>r.postS-r.preS), dT=rows.map(r=>r.postT-r.preT), dH=rows.map(r=>r.postH-r.preH);
const dV=rows.map(r=>r.postV/Math.max(1,r.preV));
// 부호검정 (양측)
const sign=(a)=>{const p=a.filter(x=>x>0).length,n=a.filter(x=>x<0).length,t=p+n;
 if(!t)return{p,n,z:0}; const z=(p-t/2)/Math.sqrt(t/4); return {p,n,z};};
const f=(lab,arr,unit)=>{const s=sign(arr);
 console.log('   '+lab.padEnd(20)+'중앙 변화 '+(med(arr)>0?'+':'')+med(arr).toFixed(1)+unit
  +'   늘림 '+s.p+'채널 / 줄임 '+s.n+'채널   z='+s.z.toFixed(2)+'  '+(Math.abs(s.z)>1.96?'⇒ 유의':''));};
f('영상 길이',dS,'초'); f('제목 글자수',dT,'자'); f('해시태그 수',dH,'개');
console.log('\n   조회 중앙 배수 (후/전)  중앙 '+med(dV).toFixed(1)+'배');
console.log('   폭발이 일어난 순번      중앙 '+med(rows.map(r=>r.bi))+'번째 영상  (범위 '
 +Math.min(...rows.map(r=>r.bi))+'~'+Math.max(...rows.map(r=>r.bi))+')');
console.log('\n   폭발 후 길이 중앙값     '+med(rows.map(r=>r.postS))+'초');
console.log('   폭발 후 제목 중앙값     '+med(rows.map(r=>r.postT))+'자');
console.log('\n  ── 길이를 «줄인» 채널의 조회 변화 vs «늘린» 채널 ──');
const cut=rows.filter(r=>r.postS<r.preS), grow=rows.filter(r=>r.postS>r.preS);
console.log('   줄임 '+cut.length+'채널  조회 '+med(cut.map(r=>r.postV/Math.max(1,r.preV))).toFixed(1)+'배');
console.log('   늘림 '+grow.length+'채널  조회 '+med(grow.map(r=>r.postV/Math.max(1,r.preV))).toFixed(1)+'배');
console.log('\n  ── 채널별 (조회 배수 순) ──');
rows.sort((a,b)=>(b.postV/Math.max(1,b.preV))-(a.postV/Math.max(1,a.preV)));
rows.slice(0,14).forEach(r=>console.log('   '+String((r.postV/Math.max(1,r.preV)).toFixed(1)).padStart(6)+'배  '
 +r.bi+'번째 폭발  길이 '+r.preS+'→'+r.postS+'초  제목 '+r.preT+'→'+r.postT+'자  '+r.ch.slice(0,26)));
