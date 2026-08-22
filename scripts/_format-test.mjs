// «어떤 포맷이 이기는가» — 재사용/랭킹/해설 포맷을 20,691편에서 직접 검정한다.
import { readFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const S=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<10) continue;
 const nonAscii=vs.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(nonAscii>vs.length*0.3) continue;
 const m=med(vs.map(x=>x.v))||1;
 vs.filter(x=>x.sec>0&&x.sec<=90).forEach(x=>S.push({...x,rel:x.v/m}));
}
const mw=(A,B)=>{const all=[...A.map(v=>({v,g:0})),...B.map(v=>({v,g:1}))].sort((a,b)=>a.v-b.v);
 all.forEach((x,i)=>x.rank=i+1);
 const R1=all.filter(x=>x.g===0).reduce((s,x)=>s+x.rank,0);
 const n1=A.length,n2=B.length,U=R1-n1*(n1+1)/2,mu=n1*n2/2,sd=Math.sqrt(n1*n2*(n1+n2+1)/12);
 return (U-mu)/sd;};
const T=[
 ['랭킹·순위 (top N · ranked · #1)', x=>/\b(top\s*\d+|ranked|ranking|rank(ing)?\s|#\s?[1-9]\b|best\s+\d+|worst\s+\d+|\d+\s+(best|worst|richest|biggest))\b/i.test(x.t)],
 ['리스트 («숫자 + 명사» 로 시작)', x=>/^\s*\d+\s+[a-z]/i.test(x.t)],
 ['해설·반응 («here.s how» · reacts · explains)', x=>/\b(here.?s (how|what|why)|reacts?|reaction|explain(s|ed)?|breakdown|analysis)\b/i.test(x.t)],
 ['남의 발언 인용 (said · answers · roast)', x=>/\b(said|says|answers?|asked|roast(s|ing)?|admits|reveals?|responds?|exposed)\b/i.test(x.t)],
 ['대결·비교 (vs)', x=>/\bvs\.?\b|\bversus\b|then\s*(vs|and)\s*now/i.test(x.t)],
 ['금액 비교 ($ 두 개 이상)', x=>((x.t.match(/\$[\d,]+/g)||[]).length>=2)],
 ['시간 경과 (years ago · in 10 years)', x=>/\b(\d+\s*years?\s*(ago|later)|over\s*\d+\s*years?|in\s*\d+\s*years?|decade)\b/i.test(x.t)],
 ['유명 «사람» 이름', x=>/\b(elon|musk|bezos|jobs|buffett|gates|cuban|zuckerberg|jensen|huang|altman|trump|ma\b|ambani|tata)\b/i.test(x.t)],
];
console.log('\n  ══ 포맷별 성과 (n='+S.length+' · 채널별 정규화 배수) ══\n');
const out=[];
for(const [lab,f] of T){
 const A=S.filter(f),B=S.filter(x=>!f(x));
 if(A.length<25){console.log('   '+lab.padEnd(40)+'표본 부족('+A.length+')');continue;}
 out.push({lab,n:A.length,a:med(A.map(x=>x.rel)),b:med(B.map(x=>x.rel)),z:mw(A.map(x=>x.rel),B.map(x=>x.rel)),
   hit:A.filter(x=>x.rel>=20).length/A.length*100});
}
out.sort((x,y)=>y.z-x.z);
out.forEach(o=>console.log('   '+o.lab.padEnd(40)+String(o.n).padStart(5)+'편  '
 +o.a.toFixed(2)+' vs '+o.b.toFixed(2)+'  z='+o.z.toFixed(2).padStart(6)
 +'  폭발률 '+o.hit.toFixed(1)+'%  '+(o.z>1.96?'⇒ 유의':o.z<-1.96?'⇒ 나쁨':'')));
const base=S.filter(x=>x.rel>=20).length/S.length*100;
console.log('\n   (전체 평균 폭발률 '+base.toFixed(1)+'%)');
