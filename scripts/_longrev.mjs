// 최대 수익이라면 «쇼츠 vs 롱폼» 을 먼저 갈라야 한다.
//   쇼츠 RPM 은 바닥이고, 고CPM 주제 롱폼은 그보다 100~1,000배다 (외부 통념, 실측 불가).
//   내가 잴 수 있는 것: «고CPM 주제 롱폼 채널이 실제로 몇 회를 내는가».
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.YOUTUBE_API_KEY;
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
// 고CPM 주제 = 광고주가 비싸게 사는 분야
const Q=['credit card review','life insurance explained','mortgage refinance','personal finance',
 'index fund investing','tax strategy','business software review','CRM software',
 'real estate investing','llc formation','web hosting review','VPN review'];
const cm=new Map();
for(const q of Q){
 const u=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=medium`
  +`&order=viewCount&publishedAfter=2026-02-01T00:00:00Z&relevanceLanguage=en&regionCode=US&maxResults=50&q=${encodeURIComponent(q)}&key=${K}`;
 const j=await (await fetch(u)).json();
 if(j.error){console.log('  '+j.error.message.slice(0,50));break;}
 (j.items||[]).forEach(i=>cm.set(i.snippet.channelId,1));
}
console.log('  고CPM 주제 채널 후보 '+cm.size+'개');
const ids=[...cm.keys()], news=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}&key=${K}`)).json();
 for(const c of (j.items||[])){
  const ageM=(Date.parse('2026-08-23')-Date.parse(c.snippet.publishedAt))/(30.4*864e5);
  const vids=+(c.statistics.videoCount||0);
  if(ageM<=30 && vids>=10 && vids<=600)
   news.push({id:c.id,t:c.snippet.title,subs:+(c.statistics.subscriberCount||0),ageM,vids,
     views:+(c.statistics.viewCount||0),cty:c.snippet.country||'?',up:c.contentDetails.relatedPlaylists.uploads});
 }}
news.sort((a,b)=>b.views/Math.max(1,b.ageM)-a.views/Math.max(1,a.ageM));
console.log('  30개월 이내 채널 '+news.length+'개\n');
console.log('  ══ 고CPM 주제 · 월 조회량 상위 ══');
console.log('   월조회     총조회    구독    개월  편수  국가  채널');
news.slice(0,16).forEach(c=>console.log('   '+Math.round(c.views/Math.max(1,c.ageM)/1000).toLocaleString().padStart(6)+'k'
 +Math.round(c.views/1e6).toLocaleString().padStart(9)+'M'+Math.round(c.subs/1000).toLocaleString().padStart(8)+'k'
 +c.ageM.toFixed(0).padStart(6)+String(c.vids).padStart(6)+'  '+String(c.cty).padEnd(4)+'  '+c.t.slice(0,26)));
const mo=news.map(c=>c.views/Math.max(1,c.ageM));
console.log('\n   월 조회 중앙 '+Math.round(med(mo)).toLocaleString()+'회 · 상위25% '+Math.round(med(mo.filter(x=>x>med(mo)))).toLocaleString()+'회');
console.log('\n  ── 산술 비교 (RPM 은 외부 통념 · 실측 아님) ──');
const shorts=92.5e6/6.7;   // カマちゃんねる 월 조회
console.log('   쇼츠 공장 (カマちゃんねる)  월 '+Math.round(shorts).toLocaleString()+'회');
console.log('   고CPM 롱폼 상위권         월 '+Math.round(med(mo.filter(x=>x>med(mo)))).toLocaleString()+'회');
for(const [sr,lr] of [[0.02,5],[0.05,15],[0.10,30]]){
 const a=shorts/1000*sr, b=med(mo.filter(x=>x>med(mo)))/1000*lr;
 console.log('   RPM 쇼츠$'+sr.toFixed(2)+' / 롱폼$'+lr+'  →  쇼츠 $'+Math.round(a).toLocaleString()+'/월  vs  롱폼 $'+Math.round(b).toLocaleString()+'/월');
}
