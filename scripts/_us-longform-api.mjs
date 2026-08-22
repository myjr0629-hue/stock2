// 미국 롱폼 정찰 — YouTube Data API 검색. 최근 90일 · 4~20분 · 조회순
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const QUERIES=['stock market explained','why stocks fell','nvidia earnings','ai bubble',
  'fed rate cut','options market makers','market structure','wall street explained',
  'sp500 outlook','what the data actually says stocks'];
const since=new Date(Date.parse('2026-08-22T00:00:00Z')-90*86400e3).toISOString();
const ids=new Set(); const meta={};
for(const q of QUERIES){
  for(const dur of ['medium','long']){
    const u='https://www.googleapis.com/youtube/v3/search?'+new URLSearchParams({
      part:'snippet',type:'video',maxResults:'25',order:'viewCount',
      q, videoDuration:dur, publishedAfter:since, relevanceLanguage:'en', regionCode:'US'});
    const j=await (await fetch(u,H)).json();
    if(j.error){console.log('  ✗',q,j.error.message.slice(0,80));continue;}
    for(const it of (j.items||[])){ ids.add(it.id.videoId); meta[it.id.videoId]={q,dur}; }
  }
  process.stdout.write(`  ${q} 누적 ${ids.size}\n`);
}
const all=[...ids], out=[];
for(let i=0;i<all.length;i+=50){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${all.slice(i,i+50).join(',')}`,H)).json();
  for(const v of (j.items||[])){
    if(!v.contentDetails?.duration||!v.snippet) continue;   // 라이브·삭제된 항목은 건너뛴다
    const m=v.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    out.push({id:v.id,ch:v.snippet.channelTitle,chId:v.snippet.channelId,title:v.snippet.title,
      pub:v.snippet.publishedAt,dur:(+(m[1]||0))*3600+(+(m[2]||0))*60+(+(m[3]||0)),
      views:+(v.statistics.viewCount||0),likes:+(v.statistics.likeCount||0),comments:+(v.statistics.commentCount||0),q:meta[v.id]?.q});
  }
}
writeFileSync('.agent/_us_longform.json',JSON.stringify(out,null,1));
console.log(`\n  수집 ${out.length}편`);
