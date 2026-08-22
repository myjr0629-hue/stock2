// «신규 채널이 어디서 뚫었나» — 감이 아니라 업로드 순서대로 조회수를 늘어놓고 찾는다.
//   방법: 최근 주식/옵션 쇼츠를 훑어 채널을 모으고 → 구독 2만 미만 · 개설 15개월 이내만 남기고
//        → 각 채널의 전체 업로드를 «발행순»으로 세워 «첫 폭발 지점»을 찾는다.
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const Q=['stock market explained','options trading','why stocks','earnings explained',
 'nvidia stock','fed rate cut','investing basics','stock market today'];
const chans=new Set();
for(const q of Q){
 const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short`
  +`&order=viewCount&publishedAfter=2026-06-01T00:00:00Z&maxResults=50&q=${encodeURIComponent(q)}`;
 const j=await (await fetch(u,H)).json();
 if(j.error){console.log('  search 오류:',j.error.message);break;}
 (j.items||[]).forEach(i=>chans.add(i.snippet.channelId));
}
console.log('  후보 채널 '+chans.size+'개 수집');
const list=[...chans];
const keep=[];
for(let i=0;i<list.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${list.slice(i,i+50).join(',')}`,H)).json();
 for(const c of (j.items||[])){
  const subs=+(c.statistics.subscriberCount||0), vids=+(c.statistics.videoCount||0);
  const ageM=(Date.parse('2026-08-22')-Date.parse(c.snippet.publishedAt))/(30.4*864e5);
  if(subs<=20000 && ageM<=15 && vids>=8 && vids<=400)
    keep.push({id:c.id,t:c.snippet.title,subs,vids,ageM,up:c.contentDetails.relatedPlaylists.uploads,
      tot:+(c.statistics.viewCount||0)});
 }}
keep.sort((a,b)=>b.subs-a.subs);
console.log('  조건 통과 (구독<=2만 · 개설<=15개월 · 영상 8~400) : '+keep.length+'개\n');
writeFileSync('.agent/_rivals.json',JSON.stringify(keep,null,1));
keep.forEach(c=>console.log('   '+String(c.subs).padStart(6)+'구독  '+String(c.vids).padStart(3)+'편  '
 +c.ageM.toFixed(1).padStart(5)+'개월  누적'+String(Math.round(c.tot/1000)).padStart(6)+'k  '+c.t.slice(0,38)));
