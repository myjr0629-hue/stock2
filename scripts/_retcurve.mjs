// «첫 몇 초에서 스와이프되는가» — 시청 지속 곡선을 직접 뽑는다.
//   쇼츠는 이 앞부분이 배포량을 결정한다. 여기가 무너지면 뒤가 아무리 좋아도 안 퍼진다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',H)).json()).items[0];
let ids=[],page='';
for(let k=0;k<2;k++){const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
 ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);return m?(+(m[1]||0))*60+ +(m[2]||0):0;};
const V=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public')
  V.push({id:v.id,t:v.snippet.title,pub:v.snippet.publishedAt.slice(0,10),
    v:+(v.statistics.viewCount||0),sec:iso(v.contentDetails.duration)});
}
V.sort((a,b)=>b.v-a.v);
const pick=[...V.slice(0,4),...V.filter(x=>x.v>=8&&x.v<=60).slice(0,4)];
console.log('\n  ══ 시청 지속 곡선 — 앞부분 (100% = 시작 시점) ══');
for(const x of pick){
 const u=`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2026-08-01&endDate=2026-08-22`
  +`&metrics=audienceWatchRatio,relativeRetentionPerformance&dimensions=elapsedVideoTimeRatio&filters=video==${x.id};audienceType==ORGANIC`;
 const j=await (await fetch(u,H)).json();
 if(j.error){console.log('   '+x.t.slice(0,40)+'  ✗ '+j.error.message.slice(0,50));continue;}
 const rows=(j.rows||[]).sort((a,b)=>a[0]-b[0]);
 if(!rows.length){console.log('   '+String(x.v).padStart(4)+'회  '+x.t.slice(0,40)+'  (데이터 없음)');continue;}
 // 비율→초 환산해 0~5초 구간을 본다
 const at=r=>{const t=rows.find(z=>z[0]>=r);return t?t[1]:null;};
 const s1=1/x.sec, s2=2/x.sec, s3=3/x.sec, s5=5/x.sec;
 console.log('\n   '+String(x.v).padStart(4)+'회 · '+x.sec+'초 · '+x.t.slice(0,44));
 console.log('        1초 '+(at(s1)!=null?(at(s1)*100).toFixed(0)+'%':' -')
  +'   2초 '+(at(s2)!=null?(at(s2)*100).toFixed(0)+'%':' -')
  +'   3초 '+(at(s3)!=null?(at(s3)*100).toFixed(0)+'%':' -')
  +'   5초 '+(at(s5)!=null?(at(s5)*100).toFixed(0)+'%':' -')
  +'   끝 '+((rows[rows.length-1][1])*100).toFixed(0)+'%');
 const spark=rows.filter((_,i)=>i%Math.max(1,Math.ceil(rows.length/28))===0)
   .map(r=>'▁▂▃▄▅▆▇█'[Math.min(7,Math.floor(r[1]*4))]).join('');
 console.log('        '+spark);
}
