// 「연달아 올리면 손해인가」 — 직전 편과의 «간격» 이 성과를 가르는지 우리 데이터로 본다.
//   ⛔ 앞서 잰 z=3.02 는 «하루 편수» 였다. 간격은 따로 재야 한다 — 다른 변수다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',H)).json()).items[0];
let ids=[],page='';
for(let k=0;k<2;k++){const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
 ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
const V=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public')
  V.push({id:v.id,t:v.snippet.title,pub:Date.parse(v.snippet.publishedAt),v:+(v.statistics.viewCount||0)});}
V.sort((a,b)=>a.pub-b.pub);
const NOW=Date.parse('2026-08-23T01:10:00Z');
const rows=[];
for(let i=1;i<V.length;i++){
 const age=(NOW-V[i].pub)/864e5; if(age<4) continue;    // 최종이라 부를 만큼 지난 것만
 rows.push({...V[i], gapH:(V[i].pub-V[i-1].pub)/3600e3});
}
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
console.log('\n  ══ 직전 편과의 간격 × 최종 조회 (n='+rows.length+') ══');
for(const [lo,hi,lab] of [[0,3,'3시간 미만'],[3,8,'3~8시간'],[8,20,'8~20시간'],[20,999,'20시간 이상']]){
 const g=rows.filter(r=>r.gapH>=lo&&r.gapH<hi);
 if(!g.length){console.log('   '+lab.padEnd(12)+'표본 없음');continue;}
 console.log('   '+lab.padEnd(12)+String(g.length).padStart(2)+'편  조회 중앙 '+String(med(g.map(r=>r.v))).padStart(4)
  +'   ('+g.map(r=>r.v).sort((a,b)=>a-b).join(', ')+')');
}
const rk=v=>{const i=v.map((x,j)=>[x,j]).sort((a,b)=>a[0]-b[0]);const r=new Array(v.length);i.forEach(([,j],k)=>r[j]=k+1);return r;};
const sp=(A,B)=>{const X=rk(A),Y=rk(B),n=A.length,m=(n+1)/2;let nu=0,dx=0,dy=0;
 for(let i=0;i<n;i++){nu+=(X[i]-m)*(Y[i]-m);dx+=(X[i]-m)**2;dy+=(Y[i]-m)**2;}
 const rho=nu/Math.sqrt(dx*dy);return {rho,t:rho*Math.sqrt((n-2)/(1-rho*rho))};};
const a=sp(rows.map(r=>r.gapH),rows.map(r=>r.v));
console.log('\n   간격(시간) vs 최종 조회   rho='+a.rho.toFixed(3)+'  t='+a.t.toFixed(2)
 +'  '+(Math.abs(a.t)>1.96?'⇒ 유의':'⇒ 유의하지 않다'));
console.log('\n   우리 기존 최단 간격  '+Math.min(...rows.map(r=>r.gapH)).toFixed(1)+'시간');
console.log('   이번 테스트2 간격   0.5시간  ← 전례 없음');
