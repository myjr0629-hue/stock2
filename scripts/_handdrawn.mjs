// 손그림·손글씨(화이트보드) 스타일이 실제로 먹히는가 — 그리고 뼈대가 같은가.
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const Q=['whiteboard animation explained','doodle explainer finance','hand drawn explainer money',
 'sketch animation business','drawn explainer economics','napkin math money','stick figure finance',
 'handwritten notes explained','whiteboard finance shorts','drawing explains stock market'];
const seen=new Map();
for(const q of Q){
 const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short`
  +`&order=viewCount&publishedAfter=2026-02-01T00:00:00Z&relevanceLanguage=en&maxResults=50&q=${encodeURIComponent(q)}`;
 const j=await (await fetch(u,H)).json(); if(j.error){console.log(j.error.message);break;}
 (j.items||[]).forEach(i=>seen.set(i.id.videoId,i.snippet));
}
const ids=[...seen.keys()];
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);if(!m)return 0;
 return (+(m[1]||0))*3600+(+(m[2]||0))*60+ +(m[3]||0);};
const V=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])){const sec=iso(v.contentDetails.duration);
  if(sec<5||sec>90)continue;
  V.push({id:v.id,t:v.snippet.title,ch:v.snippet.channelTitle,chId:v.snippet.channelId,
   v:+(v.statistics.viewCount||0),like:+(v.statistics.likeCount||0),sec,pub:v.snippet.publishedAt.slice(0,10)});}}
V.sort((a,b)=>b.v-a.v);
writeFileSync('.agent/_handdrawn.json',JSON.stringify(V,null,1));
console.log('\n  ══ 손그림·화이트보드 계열 쇼츠 상위 (n='+V.length+') ══\n');
V.slice(0,18).forEach((x,i)=>console.log('  '+String(i+1).padStart(2)+'. '+x.id+'  '
 +(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)+'  '+String(x.sec).padStart(2)+'초  '
 +x.ch.slice(0,20).padEnd(21)+x.t.slice(0,46)));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
console.log('\n   조회 중앙 '+med(V.map(x=>x.v)).toLocaleString()+'회 · 길이 중앙 '+med(V.map(x=>x.sec))+'초');
console.log('   (비교) 일반 신규채널 금융쇼츠 전체 조회 중앙 — 앞서 측정한 채널별 기저는 26~18,505회');
