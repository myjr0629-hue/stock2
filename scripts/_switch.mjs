// «태워진 6편» vs «안 태워진 16편» — 무엇이 스위치인가.
//   후보: 시청유지율 · 영상길이 · 재생목록/피드 유입 · 좋아요율 · 댓글
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
const iso=s=>{const m=s.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);return (+(m[1]||0))*60+ +(m[2]||0);};
const meta={};
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public')
   meta[v.id]={t:v.snippet.title,pub:v.snippet.publishedAt,tot:+(v.statistics.viewCount||0),
     like:+(v.statistics.likeCount||0),cmt:+(v.statistics.commentCount||0),sec:iso(v.contentDetails.duration)};
}
const NOW=Date.parse('2026-08-22T13:40:00Z');
const out=[];
for(const [id,m] of Object.entries(meta)){
 const age=(NOW-Date.parse(m.pub))/864e5; if(age<2.6) continue;
 const d0=m.pub.slice(0,10), end=new Date(Date.parse(d0)+3*864e5).toISOString().slice(0,10);
 const q=(mx,dim)=>`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${d0}&endDate=${end}&metrics=${mx}&filters=video==${id}`+(dim?`&dimensions=${dim}`:'');
 const a=await (await fetch(q('views,averageViewPercentage,averageViewDuration'),H)).json();
 const r=a.rows?.[0]||[];
 const s=await (await fetch(q('views','insightTrafficSourceType'),H)).json();
 const src=Object.fromEntries((s.rows||[]).map(x=>[x[0],x[1]]));
 const tot=Object.values(src).reduce((p,c)=>p+c,0)||1;
 out.push({id,t:m.t,pub:d0,sec:m.sec,like:m.like,cmt:m.cmt,tot48:r[0]||0,
   avp:r[1]??null,avd:r[2]??null,feed:(src.SHORTS||0)/tot,srch:(src.YT_SEARCH||0)/tot});
}
out.sort((a,b)=>b.tot48-a.tot48);
const BIG=out.filter(x=>x.tot48>=100), SML=out.filter(x=>x.tot48<100);
console.log('\n  ══ 전체 (48h 조회 내림차순) ══');
console.log('   48h  유지%  시청초  길이  좋아요  댓글  피드%  검색%  제목');
out.forEach(x=>console.log('   '+String(x.tot48).padStart(4)+'  '+(x.avp?.toFixed(1)??'  - ').padStart(5)
 +'  '+(x.avd??'-').toString().padStart(5)+'  '+x.sec.toFixed(0).padStart(3)+'s  '
 +String(x.like).padStart(5)+'  '+String(x.cmt).padStart(4)+'  '
 +(x.feed*100).toFixed(0).padStart(4)+'  '+(x.srch*100).toFixed(0).padStart(4)+'   '+x.t.slice(0,40)));
const avg=(a,f)=>a.map(f).filter(v=>v!=null).reduce((p,c,_,r)=>p+c/r.length,0);
console.log('\n  ══ 태워진 것 vs 아닌 것 ══');
console.log('                       태워짐('+BIG.length+')   안태워짐('+SML.length+')');
const cmp=(lab,f,d=1)=>console.log('   '+lab.padEnd(18)+avg(BIG,f).toFixed(d).padStart(8)+avg(SML,f).toFixed(d).padStart(11));
cmp('시청유지율 %',x=>x.avp);
cmp('평균 시청 초',x=>x.avd);
cmp('영상 길이 초',x=>x.sec);
cmp('좋아요',x=>x.like);
cmp('댓글',x=>x.cmt);
cmp('쇼츠피드 유입 %',x=>x.feed*100);
cmp('검색 유입 %',x=>x.srch*100);
cmp('좋아요/조회 %',x=>x.tot48?x.like/x.tot48*100:null,2);
