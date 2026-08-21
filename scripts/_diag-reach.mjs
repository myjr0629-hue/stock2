// 노출(impressions) vs 클릭 — 「안 만들어서 안 본다」와 「보여준 적이 없다」를 가른다
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const JP=String(process.env.SIGNUM_YT||'jp').toLowerCase()==='jp';
const rt=JP?env.YT_JP_REFRESH_TOKEN:env.YT_REFRESH_TOKEN;
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,refresh_token:rt,grant_type:'refresh_token'})})).json();
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,statistics&mine=true',{headers:{authorization:`Bearer ${AT}`}})).json()).items[0];
console.log('\n  채널', ch.id, ' 구독', ch.statistics.subscriberCount, ' 총조회', ch.statistics.viewCount, ' 영상', ch.statistics.videoCount);
const A=async(p)=>{const u='https://youtubeanalytics.googleapis.com/v2/reports?'+new URLSearchParams({ids:'channel=='+ch.id,...p});
 const j=await (await fetch(u,{headers:{authorization:`Bearer ${AT}`}})).json(); return j;};
for (const [label,metrics] of [['노출·클릭','impressions,impressionsClickThroughRate,views,estimatedMinutesWatched,averageViewPercentage'],
                               ['조회만','views,estimatedMinutesWatched']]){
  const j=await A({startDate:'2026-08-19',endDate:'2026-08-22',metrics,dimensions:'video',filters:'video=='+ (process.argv[2]||'pt9HSA9y82g')});
  if(j.error){ console.log('  ['+label+'] ✗', j.error.message.slice(0,120)); continue; }
  console.log('  ['+label+']', JSON.stringify(j.columnHeaders?.map(c=>c.name)), JSON.stringify(j.rows));
}
const t=await A({startDate:'2026-08-19',endDate:'2026-08-22',metrics:'views',dimensions:'insightTrafficSourceType'});
console.log('  [유입]', t.error? t.error.message.slice(0,100) : JSON.stringify(t.rows));
