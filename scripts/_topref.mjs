// 터진 미국 금융 쇼츠를 «있는 그대로» 모은다. 만들 것을 정하기 전에 «무엇이 터졌는지» 부터 본다.
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const Q=['stock market','investing','nvidia','options trading','stocks explained','money',
 'wall street','earnings','fed','tesla stock','sp500','how to invest'];
const seen=new Map();
for(const q of Q){
 const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short`
  +`&order=viewCount&publishedAfter=2026-05-25T00:00:00Z&relevanceLanguage=en&regionCode=US`
  +`&maxResults=50&q=${encodeURIComponent(q)}`;
 const j=await (await fetch(u,H)).json();
 if(j.error){console.log('오류 '+j.error.message);break;}
 (j.items||[]).forEach(i=>seen.set(i.id.videoId,i.snippet));
}
const ids=[...seen.keys()];
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);if(!m)return 0;
 return (+(m[1]||0))*3600+(+(m[2]||0))*60+ +(m[3]||0);};
const vids=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])){
  const sec=iso(v.contentDetails.duration);
  if(sec<5||sec>90) continue;
  if(v.snippet.defaultAudioLanguage && !/^en/i.test(v.snippet.defaultAudioLanguage)) continue;
  vids.push({id:v.id,t:v.snippet.title,ch:v.snippet.channelTitle,chId:v.snippet.channelId,
   v:+(v.statistics.viewCount||0),like:+(v.statistics.likeCount||0),cmt:+(v.statistics.commentCount||0),
   sec,pub:v.snippet.publishedAt.slice(0,10),desc:(v.snippet.description||'').slice(0,200)});
 }}
vids.sort((a,b)=>b.v-a.v);
writeFileSync('.agent/_topref.json',JSON.stringify(vids,null,1));
console.log('\n  ══ 최근 3개월 영어 금융 쇼츠 상위 (n='+vids.length+' 중 25) ══\n');
vids.slice(0,25).forEach((x,i)=>console.log('  '+String(i+1).padStart(2)+'. '
 +(x.v/1e6>=1?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)
 +'  '+String(x.sec).padStart(3)+'초  좋아요'+(x.like/x.v*100).toFixed(1)+'%  '+x.ch.slice(0,20).padEnd(21)+x.t.slice(0,54)));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s[Math.floor(s.length/2)];};
const T=vids.slice(0,60);
console.log('\n  상위 60편 —  길이 중앙 '+med(T.map(x=>x.sec))+'초   좋아요율 중앙 '
 +med(T.map(x=>x.like/x.v*100)).toFixed(2)+'%   댓글율 중앙 '+med(T.map(x=>x.cmt/x.v*100)).toFixed(3)+'%');
