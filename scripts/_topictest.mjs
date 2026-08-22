// «무엇을 다루면 터지는가» — 신규 채널 전체 영상을 채널별 정규화해 소재를 검정한다.
//   ⛔ 채널 크기 교란 방지: 각 영상을 «그 채널 자신의 중앙값» 으로 나눈 배수로만 비교한다.
import { readFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const S=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<10) continue;
 const nonAscii=vs.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(nonAscii>vs.length*0.3) continue;                 // 영어권만
 const m=med(vs.map(x=>x.v))||1;
 vs.filter(x=>x.sec>0&&x.sec<=90).forEach(x=>S.push({...x,rel:x.v/m}));
}
console.log('\n  영어권 신규채널 쇼츠 '+S.length+'편 (채널별 중앙값으로 정규화)\n');
const mw=(A,B)=>{const all=[...A.map(v=>({v,g:0})),...B.map(v=>({v,g:1}))].sort((a,b)=>a.v-b.v);
 all.forEach((x,i)=>x.rank=i+1);
 const R1=all.filter(x=>x.g===0).reduce((s,x)=>s+x.rank,0);
 const n1=A.length,n2=B.length,U=R1-n1*(n1+1)/2,mu=n1*n2/2,sd=Math.sqrt(n1*n2*(n1+n2+1)/12);
 return (U-mu)/sd;};
const PEOPLE=/\b(elon|musk|bezos|jobs|buffett|gates|cuban|zuckerberg|jensen|huang|lisa su|ma\b|jack ma|altman|trump|ronaldo|messi|mrbeast|ambani|tata)\b/i;
const BRAND=/\b(apple|tesla|amazon|google|microsoft|nvidia|meta|netflix|blackberry|nokia|sony|toyota|samsung|xiaomi|starbucks|mcdonald|coca|nike|dewalt|nascar|tiktok|openai|spacex)\b/i;
const T=[
 ['유명 «사람» 이름',            x=>PEOPLE.test(x.t)],
 ['유명 «브랜드» 이름',           x=>BRAND.test(x.t)],
 ['대결·비교 (vs · then/now)',   x=>/\bvs\.?\b|\bversus\b|then\s*(vs|and)\s*now|rich vs|before\s*(vs|and)\s*after/i.test(x.t)],
 ['이야기 («when» 으로 시작)',    x=>/^\s*when\b/i.test(x.t)],
 ['금액 ($ · million · billion)', x=>/(\$[\d,]+|\b\d+\s*(million|billion|trillion|crore|lakh)\b)/i.test(x.t)],
 ['일일 시황·지표',              x=>/\b(today|market|index|closed|rose|fell|gained|dropped|session|premarket|rally|selloff)\b/i.test(x.t)],
 ['숫자 %',                    x=>/\d+\s*%/.test(x.t)],
 ['「How」로 시작',              x=>/^\s*how\b/i.test(x.t)],
 ['「Why」로 시작',              x=>/^\s*why\b/i.test(x.t)],
 ['감정·과장어',                x=>/\b(crazy|insane|shocking|unbelievable|secret|nobody|never|worst|best|biggest|fastest|richest|genius|stunned|exposed)\b/i.test(x.t)],
 ['이모지 있음',                x=>/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(x.t)],
];
console.log('  ══ 소재·제목 장치별 성과 (배수 = 그 채널 중앙값 대비) ══');
const out=[];
for(const [lab,f] of T){
 const A=S.filter(f),B=S.filter(x=>!f(x));
 if(A.length<25){console.log('   '+lab.padEnd(30)+'표본 부족('+A.length+')');continue;}
 const z=mw(A.map(x=>x.rel),B.map(x=>x.rel));
 out.push({lab,n:A.length,a:med(A.map(x=>x.rel)),b:med(B.map(x=>x.rel)),z});
}
out.sort((x,y)=>y.z-x.z);
out.forEach(o=>console.log('   '+o.lab.padEnd(30)+String(o.n).padStart(5)+'편   '
 +o.a.toFixed(2)+' vs '+o.b.toFixed(2)+'   z='+o.z.toFixed(2).padStart(6)+'  '
 +(o.z>1.96?'⇒ 유의 (좋음)':o.z<-1.96?'⇒ 유의 (나쁨)':'')));
console.log('\n  ══ 폭발작(자기 채널 20배 이상)의 소재 구성 ══');
const HIT=S.filter(x=>x.rel>=20);
console.log('   폭발작 '+HIT.length+'편 중:');
for(const [lab,f] of T){
 const c=HIT.filter(f).length, base=S.filter(f).length/S.length*100;
 if(c>=3) console.log('      '+lab.padEnd(30)+String(c).padStart(4)+'편 ('+(c/HIT.length*100).toFixed(0)+'%)   전체평균 '+base.toFixed(0)+'%');
}
