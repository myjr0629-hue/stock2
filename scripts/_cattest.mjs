// 카테고리가 성과를 가르는가 — 신규채널 폭발작 전수로 잰다. 단정 금지.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.YOUTUBE_API_KEY;
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
// 표본이 크니 폭발작 + 무작위 대조군만 조회한다 (쿼터 절약)
const hits=S.filter(x=>x.rel>=15&&x.v>=100000);
const ctrl=S.filter(x=>x.rel<2).filter((_,i)=>i%9===0);
console.log('  폭발작 '+hits.length+'편 · 대조군 '+ctrl.length+'편 조회 중...');
const NAME={1:'Film',2:'Autos',10:'Music',15:'Pets',17:'Sports',19:'Travel',20:'Gaming',
 22:'People&Blogs',23:'Comedy',24:'Entertainment',25:'News&Politics',26:'HowTo&Style',
 27:'Education',28:'Sci&Tech',29:'Nonprofit'};
const fetchCats=async(list)=>{
 const out={};
 for(let i=0;i<list.length;i+=50){
  const ids=list.slice(i,i+50).map(x=>x.id).join(',');
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${K}`)).json();
  if(j.error){console.log('  '+j.error.message);break;}
  for(const v of (j.items||[])) out[v.id]={cat:v.snippet.categoryId,tags:(v.snippet.tags||[]).length};
 } return out;};
const [hc,cc]=[await fetchCats(hits),await fetchCats(ctrl)];
const dist=(list,map)=>{const d={},t=[];list.forEach(x=>{const m=map[x.id];if(!m)return;
  d[m.cat]=(d[m.cat]||0)+1;t.push(m.tags);});return {d,tags:t};};
const A=dist(hits,hc), B=dist(ctrl,cc);
const nA=Object.values(A.d).reduce((p,c)=>p+c,0), nB=Object.values(B.d).reduce((p,c)=>p+c,0);
console.log('\n  ══ 카테고리 분포 ══');
console.log('   카테고리            폭발작('+nA+')   대조군('+nB+')');
const cats=[...new Set([...Object.keys(A.d),...Object.keys(B.d)])].sort((x,y)=>(A.d[y]||0)-(A.d[x]||0));
for(const c of cats){
 const a=A.d[c]||0,b=B.d[c]||0;
 if(a+b<4) continue;
 console.log('   '+(c+' '+(NAME[c]||'')).padEnd(22)+((a/nA*100).toFixed(1)+'%').padStart(8)
  +'  '+((b/nB*100).toFixed(1)+'%').padStart(8)+(c==='25'?'   ← 우리가 쓰는 것':''));
}
console.log('\n  ══ 태그 개수 ══');
console.log('   폭발작  중앙 '+med(A.tags)+'개 · 0개인 비율 '+(A.tags.filter(t=>t===0).length/A.tags.length*100).toFixed(0)+'%');
console.log('   대조군  중앙 '+med(B.tags)+'개 · 0개인 비율 '+(B.tags.filter(t=>t===0).length/B.tags.length*100).toFixed(0)+'%');
console.log('   우리    중앙 60개 이상 (알파벳순 나열)');
