// 새 편의 «초반 궤적» 을 기록한다. 3분에 7회 같은 작은 수로 결론내지 않기 위해서다.
//   비교 기준: 우리 기존 편들의 «같은 경과 시간» 수치가 필요한데, 분 단위 이력은 아무도 안 남겼다.
//   ⇒ 지금부터 남긴다. 그리고 오늘 «이미 올라간» 편들의 현재 시각 수치도 같이 찍어 대조군을 만든다.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ID='wfO7CbK8-xQ';
const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ID}`,H)).json();
const v=j.items[0];
const pub=Date.parse(v.snippet.publishedAt);
const mins=(Date.now()-pub)/60000;
const line=`${new Date().toISOString()}\t${mins.toFixed(1)}분\t${v.statistics.viewCount}회\t좋아요${v.statistics.likeCount||0}\t댓글${v.statistics.commentCount||0}`;
appendFileSync('.agent/_race_track.tsv', line+'\n');
console.log('\n  ══ race 1편 궤적 ══');
console.log('   발행  '+v.snippet.publishedAt);
console.log('   경과  '+mins.toFixed(1)+'분');
console.log('   조회  '+v.statistics.viewCount+'회   좋아요 '+(v.statistics.likeCount||0)+'   댓글 '+(v.statistics.commentCount||0));
if(existsSync('.agent/_race_track.tsv')){
 const rows=readFileSync('.agent/_race_track.tsv','utf8').trim().split('\n');
 if(rows.length>1){console.log('\n   기록된 궤적:');rows.forEach(r=>console.log('     '+r.split('\t').slice(1).join('  ')));}
}
// 유입 경로 — 이게 「왜 빠른가」의 유일한 실마리다
const d0=v.snippet.publishedAt.slice(0,10);
const end=new Date(Date.parse(d0)+864e5).toISOString().slice(0,10);
const q=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${d0}&endDate=${end}&metrics=views&dimensions=insightTrafficSourceType&filters=video==${ID}`;
const a=await (await fetch(q,H)).json();
console.log('\n   유입 경로: '+(a.error? '아직 없음 ('+a.error.message.slice(0,40)+')'
  : (a.rows||[]).length? (a.rows||[]).map(r=>r[0]+' '+r[1]).join(' · ') : '아직 집계 전 (애널리틱스는 수 시간 지연)'));
