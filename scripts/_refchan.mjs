// «우리 분야에서 실제로 이기고 있는 채널» 을 먼저 잡고, 그 채널의 «터진 영상» 을 본다.
//   ⛔ 키워드로 영상을 검색하면 money·투자 같은 단어에 밈 영상이 딸려온다 (직전 실패).
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const Q=['stock market news','stock analysis','nvidia earnings','options trading explained',
 'stock market for beginners','wall street explained','investing shorts','finance explained',
 'sp500 today','fed interest rates explained','how the stock market works','value investing'];
const cm=new Map();
for(const q of Q){
 const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&regionCode=US`
  +`&relevanceLanguage=en&maxResults=30&q=${encodeURIComponent(q)}`;
 const j=await (await fetch(u,H)).json(); if(j.error){console.log(j.error.message);break;}
 (j.items||[]).forEach(i=>cm.set(i.snippet.channelId,i.snippet.title));
}
const ids=[...cm.keys()];
const chans=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const c of (j.items||[])){
  const subs=+(c.statistics.subscriberCount||0);
  const cty=c.snippet.country||'';
  if(subs<20000) continue;
  if(cty && cty!=='US' && cty!=='GB' && cty!=='CA') continue;
  chans.push({id:c.id,t:c.snippet.title,subs,cty,vids:+(c.statistics.videoCount||0),
    up:c.contentDetails.relatedPlaylists.uploads,tot:+(c.statistics.viewCount||0)});
 }}
chans.sort((a,b)=>b.subs-a.subs);
console.log('  미국·영어 금융 채널 '+chans.length+'개\n');
chans.slice(0,28).forEach(c=>console.log('   '+(c.subs>=1e6?(c.subs/1e6).toFixed(1)+'M':Math.round(c.subs/1000)+'k').padStart(6)
 +'구독  '+String(c.vids).padStart(4)+'편  '+(c.cty||'--')+'  '+c.t.slice(0,40)));
writeFileSync('.agent/_refchan.json',JSON.stringify(chans,null,1));
