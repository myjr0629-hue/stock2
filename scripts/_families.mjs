// 랭킹 말고 «또 어떤 유형» 이 터지는가 — 신규채널 폭발작을 유형별로 갈라 본다.
//   ⛔ 제목 장치(vs·Why)가 아니라 «콘텐츠 유형» 으로 나눈다. 복제하려면 유형이 필요하다.
import { readFileSync, writeFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const S=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<10) continue;
 const na=vs.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(na>vs.length*0.35) continue;
 const m=med(vs.map(x=>x.v))||1;
 vs.filter(x=>x.sec>=4&&x.sec<=95).forEach(x=>S.push({...x,rel:x.v/m}));
}
const HIT=S.filter(x=>x.rel>=15&&x.v>=200000);
console.log('\n  신규채널 쇼츠 '+S.length+'편 · 그 중 폭발작 '+HIT.length+'편\n');
const FAM=[
 ['A 두대상+시간누적',  /\bvs\.?\b|\bversus\b|\b\d+\s*years?\s*(ago|later)\b|then\s*(vs|and)\s*now|\bcompared? to\b/i],
 ['B 남의클립+해설',    /\bwhen\b.*\b(took|tried|said|did|made)\b|\bthis (ad|commercial|scene|clip|interview)\b|\breacts?\b|\bexplains?\b|\binterview\b|\bcourtroom\b/i],
 ['C 선택질문',        /\bwhich (door|one|would)\b|\bwould you (choose|take|rather)\b|\bor\b.*\?$|\bchoose\b/i],
 ['D 랭킹',           /\btop\s*\d+|\branked?\b|\branking\b|#\s?[1-9]\b|\bbest\s+\d+|\bworst\s+\d+/i],
 ['E 정체폭로 (실은/비밀)', /\b(secret|truth|really|actually|nobody (knows|tells)|hidden|exposed|behind the)\b/i],
 ['F 인물 마인드셋',    /\b(mindset|discipline|habit|rule|lesson|advice|philosophy|routine)\b/i],
 ['G 금액 충격',       /\$\s?\d|\b\d+\s*(million|billion|trillion|crore|lakh)\b/i],
 ['H 방법·설명',       /^\s*(how|what|why)\b|\bexplained\b|\bin \d+ sec/i],
];
const rows=[];
for(const [lab,re] of FAM){
 const A=HIT.filter(x=>re.test(x.t));
 const base=S.filter(x=>re.test(x.t));
 if(!base.length) continue;
 rows.push({lab, hit:A.length, share:A.length/HIT.length*100,
   baseShare:base.length/S.length*100, medMult:med(A.map(x=>x.rel)),
   medSec:med(A.map(x=>x.sec)), ex:[...A].sort((a,b)=>b.v-a.v).slice(0,3)});
}
rows.sort((a,b)=>b.hit-a.hit);
console.log('  ══ 유형별 폭발작 구성 ══');
console.log('   유형                    폭발작   폭발비중  전체비중  배수중앙  길이중앙');
rows.forEach(r=>console.log('   '+r.lab.padEnd(22)+String(r.hit).padStart(5)+'편  '
 +r.share.toFixed(1).padStart(7)+'%'+r.baseShare.toFixed(1).padStart(9)+'%'
 +String(Math.round(r.medMult)).padStart(9)+'배'+String(r.medSec).padStart(8)+'초'
 +(r.share>r.baseShare*1.25?'  ⇧ 과대표집':'')));
console.log('\n  ══ 유형별 대표작 ══');
for(const r of rows.slice(0,6)){
 console.log('\n   ── '+r.lab+' ──');
 r.ex.forEach(x=>console.log('      '+x.id+'  '+(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)
  +'  '+String(x.sec).padStart(2)+'초  '+x.t.slice(0,58)));
}
writeFileSync('.agent/_families.json',JSON.stringify(rows,null,1));
