// ⛔ 우리 진짜 문제는 «폭발이 없다» 가 아니다. «기저가 42회» 다.
//   같은 신규 채널인데 어떤 곳은 기저 900회, 어떤 곳은 40회다. 그 차이를 만드는 것을 찾는다.
import { readFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const C=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<12) continue;
 const nonAscii=vs.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(nonAscii>vs.length*0.3) continue;
 const asc=[...vs].sort((a,b)=>Date.parse(a.pub)-Date.parse(b.pub));
 const days=(Date.parse(asc[asc.length-1].pub)-Date.parse(asc[0].pub))/864e5||1;
 // 하루 업로드 «최대» — 몰아올리기를 하는가
 const perDay={}; asc.forEach(x=>perDay[x.pub]=(perDay[x.pub]||0)+1);
 const dayCounts=Object.values(perDay);
 // 주제 일관성 — 제목 단어의 상위 10개가 전체를 얼마나 덮는가
 const w={}; asc.forEach(x=>x.t.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
   .filter(k=>k.length>3&&!/^(this|that|with|from|they|have|what|your|will|about|been|were|when|than|then|into|more|most|just|like|only|over|make|made|does|after|before|their|there|which|would|could|shorts|viral|short)$/.test(k))
   .forEach(k=>w[k]=(w[k]||0)+1));
 const top10=Object.values(w).sort((a,b)=>b-a).slice(0,10).reduce((s,x)=>s+x,0);
 C.push({ch,n:asc.length,
  medV:med(asc.map(x=>x.v)),
  perMonth:asc.length/(days/30.4),
  maxPerDay:Math.max(...dayCounts),
  avgPerDay:asc.length/Object.keys(perDay).length,
  multiDayPct:dayCounts.filter(c=>c>=3).length/dayCounts.length*100,
  medSec:med(asc.map(x=>x.sec)),
  secSpread:med(asc.map(x=>Math.abs(x.sec-med(asc.map(y=>y.sec))))),
  focus:top10/asc.length,
  subs:asc[0].chSubs, ageM:asc[0].chAgeM});
}
C.sort((a,b)=>b.medV-a.medV);
console.log('\n  ══ 영어권 신규 채널 '+C.length+'개 — 기저(중앙 조회) 를 무엇이 가르나 ══\n');
const rk=v=>{const i=v.map((x,j)=>[x,j]).sort((a,b)=>a[0]-b[0]);const r=new Array(v.length);i.forEach(([,j],k)=>r[j]=k+1);return r;};
const sp=(A,B)=>{const X=rk(A),Y=rk(B),n=A.length,m=(n+1)/2;let nu=0,dx=0,dy=0;
 for(let i=0;i<n;i++){nu+=(X[i]-m)*(Y[i]-m);dx+=(X[i]-m)**2;dy+=(Y[i]-m)**2;}
 const rho=nu/Math.sqrt(dx*dy);return {rho,t:rho*Math.sqrt((n-2)/(1-rho*rho))};};
const V=C.map(c=>c.medV);
const F=[['월 업로드 수','perMonth'],['하루 최대 업로드','maxPerDay'],['하루 평균 업로드','avgPerDay'],
 ['하루 3편+ 비율 %','multiDayPct'],['영상 길이 중앙','medSec'],['길이 들쭉날쭉','secSpread'],
 ['주제 집중도','focus'],['채널 나이(개월)','ageM'],['총 편수','n']];
for(const [lab,k] of F){
 const {rho,t}=sp(C.map(c=>c[k]),V);
 console.log('   '+lab.padEnd(20)+'rho='+rho.toFixed(3).padStart(7)+'  t='+t.toFixed(2).padStart(6)+'  '
  +(Math.abs(t)>1.96?(rho>0?'⇒ 유의 (많을수록 좋음)':'⇒ 유의 (많을수록 나쁨)'):''));
}
const hi=C.slice(0,Math.floor(C.length/3)), lo=C.slice(-Math.floor(C.length/3));
console.log('\n  ══ 기저 상위 1/3 vs 하위 1/3 ══');
console.log('                        상위'+hi.length+'개      하위'+lo.length+'개');
const cmp=(lab,k,d=1)=>console.log('   '+lab.padEnd(20)+med(hi.map(c=>c[k])).toFixed(d).padStart(9)
 +med(lo.map(c=>c[k])).toFixed(d).padStart(12));
cmp('기저 조회',      'medV',0);
cmp('월 업로드',      'perMonth');
cmp('하루 최대 업로드','maxPerDay');
cmp('하루 3편+ 비율%','multiDayPct');
cmp('길이 중앙(초)',  'medSec',0);
cmp('주제 집중도',    'focus',2);
cmp('채널 나이(개월)','ageM');
console.log('\n  ── 우리 (SIGNUM HQ) ──');
console.log('   기저 조회 42   월 업로드 ~76   하루 최대 4편   하루 3편+ 비율 56%   길이 27초');
console.log('\n  ── 기저 상위 12개 채널 ──');
C.slice(0,12).forEach(c=>console.log('   '+String(c.medV).padStart(7)+'회  월'+c.perMonth.toFixed(0).padStart(3)
 +'편  하루최대'+String(c.maxPerDay).padStart(2)+'  3편+비율'+c.multiDayPct.toFixed(0).padStart(3)+'%  '
 +String(c.medSec).padStart(3)+'초  '+c.ch.slice(0,26)));
