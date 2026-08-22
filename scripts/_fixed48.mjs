// ⛔ views/hour 는 쓰지 않는다 — 나이에 따라 «기계적으로» 낮아진다 (2026-08-22 확인).
//   올바른 비교: 모든 영상을 «발행 후 48시간» 이라는 같은 창에서 잰다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,id&mine=true',H)).json()).items[0];
let ids=[],page='';
for(let k=0;k<2;k++){const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
 ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
const meta={};
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public')
   meta[v.id]={t:v.snippet.title,pub:v.snippet.publishedAt,tot:+(v.statistics.viewCount||0)};
}
// 영상별 일자별 조회 — 발행일 D0, D1 의 합 = «첫 48시간»
const out=[];
for(const [id,m] of Object.entries(meta)){
 const d0=m.pub.slice(0,10);
 const end=new Date(Date.parse(d0)+3*864e5).toISOString().slice(0,10);
 const u=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${d0}&endDate=${end}`
  +`&metrics=views,estimatedMinutesWatched,averageViewPercentage&dimensions=day&filters=video==${id}`;
 const j=await (await fetch(u,H)).json();
 const byDay=Object.fromEntries((j.rows||[]).map(r=>[r[0],r]));
 const days=Object.keys(byDay).sort();
 const d1=days[0], d2=days[1];
 const v48=(byDay[d1]?.[1]||0)+(byDay[d2]?.[1]||0);
 const age=(Date.parse('2026-08-22T13:40:00Z')-Date.parse(m.pub))/864e5;
 out.push({id,t:m.t,pub:m.pub.slice(0,10),age,tot:m.tot,v48,
   avp:byDay[d1]?.[3]??null, mature:age>=2.6});
}
out.sort((a,b)=>Date.parse(a.pub)-Date.parse(b.pub));
const M=out.filter(x=>x.mature);
console.log('\n  ══ 첫 48시간 조회 (같은 창에서 비교 · n='+M.length+') ══\n');
M.forEach((x,i)=>console.log('   '+String(i+1).padStart(2)+'  '+x.pub+'  48h '+String(x.v48).padStart(4)
 +'  누적 '+String(x.tot).padStart(4)+'  '+(/^Why\b/i.test(x.t)?'[WHY] ':'      ')+x.t.slice(0,44)));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const half=Math.floor(M.length/2);
console.log('\n   전반기('+half+'편) 48h 중앙 '+med(M.slice(0,half).map(x=>x.v48))
 +'   후반기('+(M.length-half)+'편) 48h 중앙 '+med(M.slice(half).map(x=>x.v48)));
const W=M.filter(x=>/^Why\b/i.test(x.t)), N=M.filter(x=>!/^Why\b/i.test(x.t));
console.log('   Why '+W.length+'편 48h 중앙 '+med(W.map(x=>x.v48))+'   나머지 '+N.length+'편 '+med(N.map(x=>x.v48)));
