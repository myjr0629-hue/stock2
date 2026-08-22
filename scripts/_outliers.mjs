// «신규인데 터진 것» 만 골라낸다 — 이것이 핵심이다.
//   조건: 채널 개설 15개월 이내 + 그 영상이 자기 채널 중앙값의 5배 이상 + 절대 5만회 이상
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
// 훨씬 넓게 훑는다 — 신규 채널을 최대한 많이 잡아야 «터진 신규» 표본이 나온다
const Q=['stock market explained','investing for beginners','stock analysis','nvidia stock',
 'options trading','dividend investing','sp500','fed rate','earnings report','tesla stock',
 'palantir stock','stock comparison','stock vs stock','invested 10 years ago','compound interest',
 'wall street','day trading','penny stocks','warren buffett','how rich people invest',
 'stock market crash','recession 2026','gold price','bitcoin vs stocks','apple vs microsoft'];
const cm=new Map();
for(const q of Q){
 for(const order of ['viewCount','relevance']){
  const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short`
   +`&order=${order}&publishedAfter=2026-03-01T00:00:00Z&relevanceLanguage=en&maxResults=50&q=${encodeURIComponent(q)}`;
  const j=await (await fetch(u,H)).json();
  if(j.error){console.log('  '+j.error.message);break;}
  (j.items||[]).forEach(i=>cm.set(i.snippet.channelId,1));
 }}
console.log('  후보 채널 '+cm.size+'개');
const ids=[...cm.keys()], news=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const c of (j.items||[])){
  const ageM=(Date.parse('2026-08-22')-Date.parse(c.snippet.publishedAt))/(30.4*864e5);
  const vids=+(c.statistics.videoCount||0);
  if(ageM<=15 && vids>=5 && vids<=500)
   news.push({id:c.id,t:c.snippet.title,subs:+(c.statistics.subscriberCount||0),ageM,vids,
     cty:c.snippet.country||'',up:c.contentDetails.relatedPlaylists.uploads,tot:+(c.statistics.viewCount||0)});
 }}
console.log('  15개월 이내 신규 채널 '+news.length+'개 — 전체 업로드 조회 중...');
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);if(!m)return 0;
 return (+(m[1]||0))*3600+(+(m[2]||0))*60+ +(m[3]||0);};
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const hits=[]; const allpool=[];
for(const c of news){
 let vids=[],page='';
 for(let k=0;k<11;k++){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${c.up}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
  if(j.error) break;
  vids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
 const V=[];
 for(let i=0;i<vids.length;i+=50){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${vids.slice(i,i+50).join(',')}`,H)).json();
  for(const v of (j.items||[])) V.push({id:v.id,t:v.snippet.title,v:+(v.statistics.viewCount||0),
    like:+(v.statistics.likeCount||0),cmt:+(v.statistics.commentCount||0),sec:iso(v.contentDetails.duration),
    pub:v.snippet.publishedAt.slice(0,10),desc:(v.snippet.description||'').slice(0,300)});
 }
 if(V.length<5) continue;
 V.sort((a,b)=>Date.parse(a.pub)-Date.parse(b.pub));
 const m=med(V.map(x=>x.v))||1;
 V.forEach((x,i)=>{allpool.push({...x,ch:c.t,chSubs:c.subs,chAgeM:c.ageM,idx:i+1,n:V.length,chMed:m,mult:x.v/m});});
 for(let i=0;i<V.length;i++){
  const x=V[i];
  if(x.v>=50000 && x.v>=m*5 && x.sec<=90)
   hits.push({ch:c.t,subs:c.subs,ageM:c.ageM,chMed:m,idx:i+1,n:V.length,...x,mult:x.v/m});
 }
 process.stdout.write('.');
}
hits.sort((a,b)=>b.v-a.v);
writeFileSync('.agent/_outliers.json',JSON.stringify(hits,null,1));
writeFileSync('.agent/_newpool.json',JSON.stringify(allpool));
console.log('\n\n  ══ 신규 채널 폭발작 '+hits.length+'편 (5만회 이상 · 자기 중앙값 5배 이상) ══\n');
hits.slice(0,30).forEach(x=>{
 console.log('  '+(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)
  +'  '+String(Math.round(x.mult)).padStart(4)+'배  '+String(x.sec).padStart(2)+'초  '
  +String(x.idx).padStart(3)+'/'+String(x.n).padEnd(4)+'  '+String(x.subs).padStart(6)+'구독  '+x.ch.slice(0,18));
 console.log('          "'+x.t.slice(0,76)+'"');
});
