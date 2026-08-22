// 대표 가설: 「초기에 탄력 안 받으면 최종 조회수도 안 나온다」
//   → 우리 28편으로 검정한다. 발행 후 48시간에 «최종의 몇 %» 가 이미 들어와 있었나.
//   48h/최종 이 1.0 에 가까우면 «초반에 다 정해진다» 는 뜻이고, 그러면 대표 가설이 맞다.
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
const meta={};
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public')
   meta[v.id]={t:v.snippet.title,pub:v.snippet.publishedAt,tot:+(v.statistics.viewCount||0)};
}
const NOW=Date.parse('2026-08-23T00:00:00Z');
const rows=[];
for(const [id,m] of Object.entries(meta)){
 const age=(NOW-Date.parse(m.pub))/864e5;
 if(age<4) continue;                          // 최종이라 부르려면 나흘은 지나야 한다
 const d0=m.pub.slice(0,10);
 const end=new Date(Date.parse(d0)+2*864e5).toISOString().slice(0,10);
 const u=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${d0}&endDate=${end}&metrics=views&dimensions=day&filters=video==${id}`;
 const j=await (await fetch(u,H)).json();
 const days=(j.rows||[]).sort((a,b)=>a[0]<b[0]?-1:1);
 const v48=(days[0]?.[1]||0)+(days[1]?.[1]||0);
 const d1=days[0]?.[1]||0;
 rows.push({id,t:m.t,tot:m.tot,v48,d1,age,frac48:m.tot? v48/m.tot:0, fracD1:m.tot? d1/m.tot:0});
}
rows.sort((a,b)=>b.tot-a.tot);
console.log('\n  ══ 최종 조회 중 «초반» 이 차지하는 비중 (n='+rows.length+') ══');
console.log('   최종   첫날   48시간  48h/최종  첫날/최종  제목');
rows.forEach(r=>console.log('  '+String(r.tot).padStart(5)+String(r.d1).padStart(7)+String(r.v48).padStart(8)
 +(r.frac48*100).toFixed(0).padStart(8)+'%'+(r.fracD1*100).toFixed(0).padStart(9)+'%  '+r.t.slice(0,38)));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
console.log('\n   48시간이 최종의  중앙 '+(med(rows.map(r=>r.frac48))*100).toFixed(0)+'%');
console.log('   첫날이  최종의  중앙 '+(med(rows.map(r=>r.fracD1))*100).toFixed(0)+'%');
// 첫날 성적이 최종을 예측하는가
const rk=v=>{const i=v.map((x,j)=>[x,j]).sort((a,b)=>a[0]-b[0]);const r=new Array(v.length);i.forEach(([,j],k)=>r[j]=k+1);return r;};
const sp=(A,B)=>{const X=rk(A),Y=rk(B),n=A.length,m=(n+1)/2;let nu=0,dx=0,dy=0;
 for(let i=0;i<n;i++){nu+=(X[i]-m)*(Y[i]-m);dx+=(X[i]-m)**2;dy+=(Y[i]-m)**2;}
 const rho=nu/Math.sqrt(dx*dy);return {rho,t:rho*Math.sqrt((n-2)/(1-rho*rho))};};
const a=sp(rows.map(r=>r.d1),rows.map(r=>r.tot));
console.log('\n   첫날 조회 vs 최종 조회   rho='+a.rho.toFixed(3)+'  t='+a.t.toFixed(2)
 +'  '+(Math.abs(a.t)>1.96?'⇒ 유의':'⇒ 유의하지 않다'));
const late=rows.filter(r=>r.fracD1<0.5);
console.log('\n   첫날에 절반도 못 채운 편: '+late.length+'/'+rows.length+'편');
late.forEach(r=>console.log('      최종 '+String(r.tot).padStart(4)+'회 (첫날 '+r.d1+'회 = '+(r.fracD1*100).toFixed(0)+'%)  '+r.t.slice(0,40)));
