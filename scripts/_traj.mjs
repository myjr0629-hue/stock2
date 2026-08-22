// 신규 채널의 «돌파 지점» 을 찾는다 — 업로드를 발행순으로 세우고 조회수를 그대로 본다.
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const R=JSON.parse(readFileSync('.agent/_rivals.json','utf8'));
const PICK=['Jeremy Cermak','Tyler Hill Stocks','JULIUS EMPIRE','Patrick- Financial Education',
 'Daily Dose of Stock','The Money Gramps','EricsFinanceTips','Austin Hankwitz AH','StockNEWS'];
const iso=s=>{const m=s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);return (+(m[1]||0))*3600+(+(m[2]||0))*60+ +(m[3]||0);};
const store={};
for(const name of PICK){
 const c=R.find(x=>x.t===name); if(!c){console.log('  없음: '+name);continue;}
 let ids=[],page='';
 for(let k=0;k<9;k++){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${c.up}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
  ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
 const vids=[];
 for(let i=0;i<ids.length;i+=50){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
  for(const v of (j.items||[])) vids.push({t:v.snippet.title,pub:v.snippet.publishedAt,
    v:+(v.statistics.viewCount||0),like:+(v.statistics.likeCount||0),cmt:+(v.statistics.commentCount||0),
    sec:iso(v.contentDetails.duration)});
 }
 vids.sort((a,b)=>Date.parse(a.pub)-Date.parse(b.pub));
 store[name]={subs:c.subs,ageM:c.ageM,vids};
 const med=(a)=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
 const early=vids.slice(0,10).map(x=>x.v);
 console.log('\n  ═══ '+name+'  ('+c.subs+'구독 · '+vids.length+'편 · '+c.ageM.toFixed(1)+'개월) ═══');
 console.log('   첫 10편 조회: '+early.join(', '));
 // 첫 «중앙값 10배» 지점 = 돌파
 let base=med(vids.slice(0,Math.min(10,vids.length)).map(x=>x.v)), bi=-1;
 for(let i=0;i<vids.length;i++){ if(vids[i].v>=Math.max(1000,base*10)){bi=i;break;} }
 if(bi>=0) console.log('   ▶ 돌파 = '+(bi+1)+'번째 영상 ('+vids[bi].v.toLocaleString()+'회, '
   +vids[bi].pub.slice(0,10)+', '+vids[bi].sec+'초)\n      "'+vids[bi].t.slice(0,64)+'"');
 else console.log('   ▶ 돌파 지점 없음 (완만)');
 const top=[...vids].sort((a,b)=>b.v-a.v).slice(0,3);
 console.log('   상위 3편:');
 top.forEach(x=>console.log('      '+String(x.v).padStart(8)+'회  '+String(x.sec).padStart(3)+'초  좋아요'
   +String(x.like).padStart(6)+'  '+x.t.slice(0,58)));
 console.log('   길이 중앙 '+med(vids.map(x=>x.sec))+'초 · 조회 중앙 '+med(vids.map(x=>x.v)).toLocaleString()
   +'회 · 좋아요율 중앙 '+(med(vids.filter(x=>x.v>50).map(x=>x.like/x.v*100))||0).toFixed(2)+'%');
}
writeFileSync('.agent/_rival_traj.json',JSON.stringify(store,null,1));
