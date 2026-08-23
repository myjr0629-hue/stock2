// 「새 포맷의 조회가 앱으로 가는가」 — 처음으로 재는 전환율.
//   기준: 지난 3주 2,000회 → EXT_URL 2회 = 0.1%
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const T=[['테스트1','wfO7CbK8-xQ'],['테스트2','ht1IdXkWY8k']];
for(const [lab,id] of T){
 const v=(await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${id}`,H)).json()).items[0];
 const d0=v.snippet.publishedAt.slice(0,10);
 const end=new Date(Date.parse(d0)+2*864e5).toISOString().slice(0,10);
 console.log('\n  ══ '+lab+' ══  '+v.statistics.viewCount+'회');
 const q=(m,d)=>`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${d0}&endDate=${end}&metrics=${m}`+(d?`&dimensions=${d}`:'')+`&filters=video==${id}`;
 const s=await (await fetch(q('views','insightTrafficSourceType'),H)).json();
 if(s.error){console.log('   유입: 아직 집계 전 ('+s.error.message.slice(0,40)+')');continue;}
 const rows=(s.rows||[]).sort((a,b)=>b[1]-a[1]);
 const tot=rows.reduce((p,r)=>p+r[1],0)||1;
 rows.forEach(r=>console.log('   '+r[0].padEnd(22)+String(r[1]).padStart(5)+'회  '+(r[1]/tot*100).toFixed(1)+'%'));
 const ext=(rows.find(r=>r[0]==='EXT_URL')||[,0])[1];
 console.log('   ─ 앱 클릭(EXT_URL) '+ext+'회 = 조회 대비 '+(ext/tot*100).toFixed(2)+'%');
 const r2=await (await fetch(q('views,averageViewPercentage,averageViewDuration,subscribersGained,likes'),H)).json();
 if(!r2.error&&r2.rows?.[0]){const x=r2.rows[0];
  console.log('   유지율 '+(x[1]??0).toFixed(1)+'% · 평균시청 '+(x[2]??0)+'초 · 구독 +'+(x[3]??0)+' · 좋아요 '+(x[4]??0));}
}
console.log('\n  ── 대조: 기존 3주 ──\n   2,000회 → EXT_URL 2회 = 0.10%');
