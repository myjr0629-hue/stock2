// 「수익성만 보고 쇼츠를 만들 수 있는가」 — 먼저 «우리가 아는 것과 모르는 것» 을 가른다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,status&mine=true',H)).json()).items[0];
console.log('\n  ══ 우리 채널 ══');
console.log('   구독 '+ch.statistics.subscriberCount+' · 총조회 '+ch.statistics.viewCount+' · 영상 '+ch.statistics.videoCount);
// 수익 지표를 실제로 읽을 수 있는지 시도한다 (YPP 아니면 403/에러)
for(const m of ['estimatedRevenue','estimatedAdRevenue,cpm','grossRevenue']){
 const u=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2026-07-01&endDate=2026-08-22&metrics=${m}`;
 const j=await (await fetch(u,H)).json();
 console.log('   '+m.padEnd(28)+(j.error? '✗ '+j.error.message.slice(0,52) : JSON.stringify(j.rows)));
}
// 시청자 지역 = RPM 을 가르는 가장 큰 변수
const g=await (await fetch('https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2026-08-01&endDate=2026-08-22&metrics=views,estimatedMinutesWatched&dimensions=country&sort=-views&maxResults=10',H)).json();
console.log('\n  ══ 시청자 국가 (RPM 을 가르는 최대 변수) ══');
if(g.error) console.log('   '+g.error.message.slice(0,60));
else {const tot=(g.rows||[]).reduce((s,r)=>s+r[1],0)||1;
 (g.rows||[]).forEach(r=>console.log('   '+r[0]+'  '+String(r[1]).padStart(5)+'회  '+(r[1]/tot*100).toFixed(1)+'%'));}
