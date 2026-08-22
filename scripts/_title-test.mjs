// 레퍼런스 문서의 주장을 «우리 데이터»로 검정한다.
//   주장: 쇼츠 제목은 4~6단어 · 20~40자가 최적, 40자 넘으면 피드에서 잘린다
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',H)).json()).items[0];
const up=ch.contentDetails.relatedPlaylists.uploads;
let ids=[],page='';
for(let k=0;k<2;k++){const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
 ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
const NOW=Date.parse('2026-08-22T13:40:00Z');
const rows=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])){
  if(v.status.privacyStatus!=='public') continue;
  const h=(NOW-Date.parse(v.snippet.publishedAt))/3600e3; if(h<12) continue;   // 12시간 미만은 제외
  rows.push({t:v.snippet.title, chars:v.snippet.title.length, words:v.snippet.title.trim().split(/\s+/).length,
    v:+(v.statistics.viewCount||0), h, r:+(v.statistics.viewCount||0)/h});
 }}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
console.log('\n  ══ 제목 길이 × 성과 (n='+rows.length+' · 12시간 이상 경과분) ══');
for(const [lo,hi,lab] of [[0,40,'40자 이하 (문서 권장)'],[40,55,'40~55자'],[55,999,'55자 초과']]){
 const g=rows.filter(x=>x.chars>=lo&&x.chars<hi); if(!g.length) continue;
 console.log('   '+lab.padEnd(22)+String(g.length).padStart(3)+'편   조회중앙 '+String(med(g.map(x=>x.v))).padStart(5)+'   시간당 '+med(g.map(x=>x.r)).toFixed(2));
}
const rk=v=>{const i=v.map((x,j)=>[x,j]).sort((a,b)=>a[0]-b[0]);const r=new Array(v.length);i.forEach(([,j],k)=>r[j]=k+1);return r;};
const sp=(A,B)=>{const X=rk(A),Y=rk(B),n=A.length,m=(n+1)/2;let nu=0,dx=0,dy=0;
 for(let i=0;i<n;i++){nu+=(X[i]-m)*(Y[i]-m);dx+=(X[i]-m)**2;dy+=(Y[i]-m)**2;}
 const rho=nu/Math.sqrt(dx*dy);return {rho,t:rho*Math.sqrt((n-2)/(1-rho*rho))};};
const a=sp(rows.map(x=>x.chars),rows.map(x=>x.r));
console.log('\n   제목 글자수 vs 시간당조회   rho='+a.rho.toFixed(3)+'  t='+a.t.toFixed(2)+'  '+(Math.abs(a.t)>1.96?'⇒ 유의':'⇒ 유의하지 않다'));
const b=sp(rows.map(x=>x.words),rows.map(x=>x.r));
console.log('   제목 단어수 vs 시간당조회   rho='+b.rho.toFixed(3)+'  t='+b.t.toFixed(2)+'  '+(Math.abs(b.t)>1.96?'⇒ 유의':'⇒ 유의하지 않다'));
console.log('\n  ── 상위 6편 제목 ──');
[...rows].sort((x,y)=>y.r-x.r).slice(0,6).forEach(x=>console.log('   '+x.r.toFixed(2)+'/h  '+String(x.chars).padStart(3)+'자 '+String(x.words).padStart(2)+'단어  '+x.t.slice(0,52)));
console.log('\n  ── 하위 6편 제목 ──');
[...rows].sort((x,y)=>x.r-y.r).slice(0,6).forEach(x=>console.log('   '+x.r.toFixed(2)+'/h  '+String(x.chars).padStart(3)+'자 '+String(x.words).padStart(2)+'단어  '+x.t.slice(0,52)));
