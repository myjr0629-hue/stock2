// 대표 질문: «지역적인 문제인가, 아예 어디에도 노출이 안 되는가»
//   → 시청자 국가 분포 + 노출 대비 유입 경로를 직접 조회한다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const A=async(m,d,f)=>{const u=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE`
 +`&startDate=2026-08-01&endDate=2026-08-22&metrics=${m}`+(d?`&dimensions=${d}`:'')+(f?`&filters=${f}`:'')
 +`&sort=-views&maxResults=25`;
 const j=await (await fetch(u,H)).json(); if(j.error) return {err:j.error.message}; return j;};
console.log('\n  ══ 시청자 국가 (최근 3주) ══');
const g=await A('views,averageViewPercentage','country');
if(g.err) console.log('   오류: '+g.err);
else {const tot=(g.rows||[]).reduce((s,r)=>s+r[1],0);
 (g.rows||[]).forEach(r=>console.log('   '+r[0]+'  '+String(r[1]).padStart(5)+'회  '
  +(r[1]/tot*100).toFixed(1).padStart(5)+'%   유지율 '+(r[2]??0).toFixed(1)+'%'));
 console.log('   ─ 합계 '+tot+'회');}
console.log('\n  ══ 유입 경로 ══');
const s=await A('views','insightTrafficSourceType');
if(s.err) console.log('   오류: '+s.err); else {
 const tot=(s.rows||[]).reduce((p,r)=>p+r[1],0);
 (s.rows||[]).forEach(r=>console.log('   '+r[0].padEnd(24)+String(r[1]).padStart(5)+'회  '+(r[1]/tot*100).toFixed(1)+'%'));}
console.log('\n  ══ 기기 ══');
const d=await A('views','deviceType');
if(d.err) console.log('   오류: '+d.err); else (d.rows||[]).forEach(r=>console.log('   '+r[0].padEnd(12)+r[1]+'회'));
console.log('\n  ══ 구독자 vs 비구독자 ══');
const sb=await A('views','subscribedStatus');
if(sb.err) console.log('   오류: '+sb.err); else (sb.rows||[]).forEach(r=>console.log('   '+r[0].padEnd(16)+r[1]+'회'));
console.log('\n  ══ 노출수·클릭률 (있으면) ══');
for(const m of ['impressions,impressionClickThroughRate','annotationImpressions','views,estimatedMinutesWatched,subscribersGained']){
 const j=await A(m); console.log('   '+m.padEnd(46)+(j.err? '✗ '+j.err.slice(0,44) : JSON.stringify(j.rows)));
}
