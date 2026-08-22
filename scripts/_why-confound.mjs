// 「Why」 효과가 진짜인가, 아니면 «다른 것»의 그림자인가.
//   의심 1: Why 편이 유독 최근/오래된 쪽에 몰려 있나 (나이 교란)
//   의심 2: Why 는 사실 «해설(evergreen)» 이고 나머지는 «그날 뉴스» 다 (유형 교란)
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
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])){
  if(v.status.privacyStatus!=='public') continue;
  const h=(NOW-Date.parse(v.snippet.publishedAt))/3600e3; if(h<12) continue;
  rows.push({id:v.id,t:v.snippet.title,d:v.snippet.publishedAt.slice(0,10),
    v:+(v.statistics.viewCount||0),h,r:+(v.statistics.viewCount||0)/h,
    why:/^Why\b/i.test(v.snippet.title)});
 }}
rows.sort((a,b)=>b.h-a.h);   // 오래된 것부터
console.log('\n  ══ 의심 1: 나이 교란 ══');
const W=rows.filter(x=>x.why),N=rows.filter(x=>!x.why);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
console.log('   Why 편 평균 나이  '+(mean(W.map(x=>x.h))/24).toFixed(1)+'일  (n='+W.length+')');
console.log('   나머지 평균 나이  '+(mean(N.map(x=>x.h))/24).toFixed(1)+'일  (n='+N.length+')');
console.log('\n  ══ 발행순 전체 목록 (오래된 것 → 최신) ══');
rows.forEach((x,i)=>console.log('   '+String(i+1).padStart(2)+'  '+x.d+'  '+(x.h/24).toFixed(0).padStart(2)+'일  '
 +String(x.v).padStart(4)+'회  '+x.r.toFixed(2).padStart(5)+'/h  '+(x.why?'[WHY] ':'      ')+x.t.slice(0,46)));
