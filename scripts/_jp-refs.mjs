// 일본 «신규채널 폭발작» 을 미국과 «같은 방법» 으로 모은다.
//   ⛔ 미국 결론을 그대로 쓰지 않는다. 시장이 다르면 답이 다를 수 있고, 그건 재봐야 안다.
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.YOUTUBE_API_KEY;
const Q=['株 初心者','米国株','投資 解説','新NISA','資産運用','日経平均','お金 の 話','株価',
 '投資信託','億り人','貯金','節約','経済 解説','エヌビディア 株','半導体 株','円安','配当'];
const cm=new Map();
for(const q of Q){
 for(const order of ['viewCount','relevance']){
  const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short`
   +`&order=${order}&publishedAfter=2026-03-01T00:00:00Z&relevanceLanguage=ja&regionCode=JP`
   +`&maxResults=50&q=${encodeURIComponent(q)}&key=${K}`;
  const j=await (await fetch(u)).json();
  if(j.error){console.log('  '+j.error.message.slice(0,60));break;}
  (j.items||[]).forEach(i=>cm.set(i.snippet.channelId,1));
 }}
console.log('  후보 채널 '+cm.size+'개');
const ids=[...cm.keys()], news=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}&key=${K}`)).json();
 for(const c of (j.items||[])){
  const ageM=(Date.parse('2026-08-23')-Date.parse(c.snippet.publishedAt))/(30.4*864e5);
  const vids=+(c.statistics.videoCount||0);
  if(ageM<=18 && vids>=5 && vids<=500)
   news.push({id:c.id,t:c.snippet.title,subs:+(c.statistics.subscriberCount||0),ageM,vids,
     up:c.contentDetails.relatedPlaylists.uploads});
 }}
console.log('  18개월 이내 신규 일본 채널 '+news.length+'개 — 업로드 조회 중...');
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);if(!m)return 0;
 return (+(m[1]||0))*3600+(+(m[2]||0))*60+ +(m[3]||0);};
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const pool=[];
for(const c of news){
 let vids=[],page='';
 for(let k=0;k<7;k++){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${c.up}&maxResults=50${page?`&pageToken=${page}`:''}&key=${K}`)).json();
  if(j.error)break; vids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
 const V=[];
 for(let i=0;i<vids.length;i+=50){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${vids.slice(i,i+50).join(',')}&key=${K}`)).json();
  for(const v of (j.items||[])) V.push({id:v.id,t:v.snippet.title,v:+(v.statistics.viewCount||0),
    like:+(v.statistics.likeCount||0),cmt:+(v.statistics.commentCount||0),sec:iso(v.contentDetails.duration),
    pub:v.snippet.publishedAt,cat:v.snippet.categoryId,tags:(v.snippet.tags||[]).length});
 }
 if(V.length<5) continue;
 const m=med(V.map(x=>x.v))||1;
 V.forEach((x,i)=>pool.push({...x,ch:c.t,chSubs:c.subs,chAgeM:c.ageM,chMed:m,rel:x.v/m}));
 process.stdout.write('.');
}
writeFileSync('.agent/_jp_pool.json',JSON.stringify(pool));
console.log('\n\n  일본 신규채널 영상 '+pool.length+'편 수집\n');
const S=pool.filter(x=>x.sec>=4&&x.sec<=95);
const HIT=S.filter(x=>x.rel>=10&&x.v>=100000).sort((a,b)=>b.v-a.v);
console.log('  ══ 일본 신규채널 폭발작 상위 20 ══');
HIT.slice(0,20).forEach(x=>console.log('  '+x.id+'  '
 +(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)+'  '+String(x.sec).padStart(2)+'초  '
 +String(Math.round(x.rel)).padStart(4)+'배  cat'+x.cat.padStart(2)+' 태그'+String(x.tags).padStart(2)+'  '
 +x.ch.slice(0,14).padEnd(15)+x.t.slice(0,34)));
console.log('\n  ── 일본 폭발작 특성 (n='+HIT.length+') ──');
console.log('   길이 중앙 '+med(HIT.map(x=>x.sec))+'초   (미국 폭발작 중앙 44~53초)');
console.log('   태그 중앙 '+med(HIT.map(x=>x.tags))+'개   (미국 폭발작 중앙 0개)');
const cats={}; HIT.forEach(x=>cats[x.cat]=(cats[x.cat]||0)+1);
console.log('   카테고리 '+Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+':'+v+'편').join(' · '));
console.log('   좋아요율 중앙 '+med(HIT.filter(x=>x.v>1000).map(x=>x.like/x.v*100)).toFixed(2)+'%');
