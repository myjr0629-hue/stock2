// 「게시 시각이 성과를 가르는가」 — 우리 데이터로 검정한다. 감으로 정하지 않는다.
//   ⛔ 게이트에 KST 22~01 금지 규칙이 있는데, 그건 ET 09~12 다.
//     그 시간대가 실제로 나쁜지도 같이 본다.
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
const NOW=Date.now();
const R=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public'){
  const age=(NOW-Date.parse(v.snippet.publishedAt))/864e5; if(age<1) continue;   // 하루는 지나야
  const et=+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hour12:false}).format(new Date(v.snippet.publishedAt));
  R.push({et,v:+(v.statistics.viewCount||0),t:v.snippet.title});
 }}
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const mw=(A,B)=>{const all=[...A.map(v=>({v,g:0})),...B.map(v=>({v,g:1}))].sort((a,b)=>a.v-b.v);
 all.forEach((x,i)=>x.rank=i+1);const R1=all.filter(x=>x.g===0).reduce((s,x)=>s+x.rank,0);
 const n1=A.length,n2=B.length,U=R1-n1*(n1+1)/2,mu=n1*n2/2,sd=Math.sqrt(n1*n2*(n1+n2+1)/12);return (U-mu)/sd;};
console.log('\n  ══ 게시 시각(미국 동부) × 조회 (n='+R.length+') ══');
for(const [lo,hi,lab] of [[0,6,'새벽 0~6시'],[6,12,'오전 6~12시'],[12,18,'오후 12~18시'],[18,24,'저녁 18~24시']]){
 const g=R.filter(x=>x.et>=lo&&x.et<hi);
 if(!g.length) continue;
 console.log('   '+lab.padEnd(14)+String(g.length).padStart(2)+'편  조회 중앙 '+String(med(g.map(x=>x.v))).padStart(4)
  +'   ('+g.map(x=>x.v).sort((a,b)=>a-b).join(', ')+')');
}
const night=R.filter(x=>x.et<6), day=R.filter(x=>x.et>=6);
if(night.length>=3&&day.length>=3)
 console.log('\n   새벽(0~6시) vs 그 외   z='+mw(night.map(x=>x.v),day.map(x=>x.v)).toFixed(2)
  +'  '+(Math.abs(mw(night.map(x=>x.v),day.map(x=>x.v)))>1.96?'⇒ 유의':'⇒ 유의하지 않다 (표본 부족)'));
console.log('\n   ⛔ 우리 표본은 '+R.length+'편뿐이다. 시간대별로 나누면 칸당 1~7편이라');
console.log('     이 표로 «시각이 원인이다» 를 증명할 수 없다. 방향만 참고한다.');
