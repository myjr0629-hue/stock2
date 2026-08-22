// «하루에 몇 편 올렸는가» 가 성과를 가르는가.
//   눈으로 보니 1~2편 올린 날은 전부 155회 이상, 3편 이상 올린 날은 대부분 60회 미만이었다.
//   교란 후보: 그날의 소재가 좋았을 뿐일 수도 있다 → 나이·발행순도 같이 본다.
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
const NOW=Date.parse('2026-08-22T13:40:00Z');
const rows=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public'){
  const age=(NOW-Date.parse(v.snippet.publishedAt))/864e5; if(age<2.6) continue;
  rows.push({t:v.snippet.title,pub:v.snippet.publishedAt,d:v.snippet.publishedAt.slice(0,10),
    age,v:+(v.statistics.viewCount||0)});
 }}
const byDay={}; rows.forEach(r=>(byDay[r.d]??=[]).push(r));
Object.values(byDay).forEach(a=>a.sort((x,y)=>Date.parse(x.pub)-Date.parse(y.pub)));
console.log('\n  ══ 발행일별 (그날 몇 번째로 올렸는지 포함) ══');
for(const d of Object.keys(byDay).sort()){
 const a=byDay[d];
 console.log('   '+d+'  '+a.length+'편');
 a.forEach((r,i)=>console.log('        '+(i+1)+'번째  '+String(r.v).padStart(4)+'회  '
   +r.pub.slice(11,16)+'Z  '+r.t.slice(0,44)));
}
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const few=rows.filter(r=>byDay[r.d].length<=2), many=rows.filter(r=>byDay[r.d].length>=3);
const mw=(A,B)=>{const all=[...A.map(v=>({v,g:0})),...B.map(v=>({v,g:1}))].sort((a,b)=>a.v-b.v);
 all.forEach((x,i)=>x.rank=i+1);const R1=all.filter(x=>x.g===0).reduce((s,x)=>s+x.rank,0);
 const n1=A.length,n2=B.length,U=R1-n1*(n1+1)/2,mu=n1*n2/2,sd=Math.sqrt(n1*n2*(n1+n2+1)/12);return (U-mu)/sd;};
console.log('\n  ══ 하루 편수 × 성과 ══');
console.log('   1~2편 올린 날   '+few.length+'편   조회 중앙 '+med(few.map(x=>x.v))+'   평균나이 '+(few.reduce((s,x)=>s+x.age,0)/few.length).toFixed(1)+'일');
console.log('   3편 이상 올린 날 '+many.length+'편   조회 중앙 '+med(many.map(x=>x.v))+'   평균나이 '+(many.reduce((s,x)=>s+x.age,0)/many.length).toFixed(1)+'일');
console.log('   z = '+mw(few.map(x=>x.v),many.map(x=>x.v)).toFixed(2));
console.log('\n  ══ 같은 날 «몇 번째» 인가 ══');
for(const n of [1,2,3,4]){
 const g=rows.filter(r=>byDay[r.d].indexOf(r)===n-1&&byDay[r.d].length>=3);
 if(g.length) console.log('   3편 이상인 날의 '+n+'번째   '+g.length+'편  조회 중앙 '+med(g.map(x=>x.v))
   +'   ('+g.map(x=>x.v).join(', ')+')');
}
