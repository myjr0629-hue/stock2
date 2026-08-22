import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',H)).json()).items[0];
const up=ch.contentDetails.relatedPlaylists.uploads;
let ids=[],page='';
for(let k=0;k<2;k++){const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
 ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
const NOW=Date.parse('2026-08-22T13:40:00Z');
const rows=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])){
  if(v.status.privacyStatus!=='public') continue;
  const h=(NOW-Date.parse(v.snippet.publishedAt))/3600e3; if(h<12) continue;
  rows.push({id:v.id,t:v.snippet.title,v:+(v.statistics.viewCount||0),h,r:+(v.statistics.viewCount||0)/h});
 }}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
// 만-휘트니 U (양측 근사)
const mw=(A,B)=>{const all=[...A.map(v=>({v,g:0})),...B.map(v=>({v,g:1}))].sort((a,b)=>a.v-b.v);
 all.forEach((x,i)=>x.rank=i+1);
 const R1=all.filter(x=>x.g===0).reduce((s,x)=>s+x.rank,0);
 const n1=A.length,n2=B.length,U=R1-n1*(n1+1)/2;
 const mu=n1*n2/2, sd=Math.sqrt(n1*n2*(n1+n2+1)/12);
 return {U,z:(U-mu)/sd};};
const T=[
 ['「Why」로 시작', x=>/^Why\b/i.test(x.t)],
 ['유명 종목·자산 이름', x=>/\b(AMD|Nvidia|Micron|SanDisk|Walmart|Gold|Bitcoin|Broadcom|Apple|Tesla|chip|Nasdaq|S&P)\b/i.test(x.t)],
 ['제목에 % 기호', x=>/%/.test(x.t)],
 ['제목에 우리 용어(index·squeeze·volume·flow)', x=>/\b(index|squeeze|volume|flow|rotation|pressure)\b/i.test(x.t)],
 ['숫자로 시작', x=>/^[0-9]/.test(x.t)],
];
console.log('\n  ══ 제목 장치 검정 (n='+rows.length+') ══');
for(const [lab,f] of T){
 const A=rows.filter(f), B=rows.filter(x=>!f(x));
 if(A.length<3||B.length<3) { console.log('   '+lab.padEnd(38)+'표본 부족 ('+A.length+')'); continue; }
 const {z}=mw(A.map(x=>x.r),B.map(x=>x.r));
 console.log('   '+lab.padEnd(38)+A.length+'편 vs '+B.length+'편   시간당 '+med(A.map(x=>x.r)).toFixed(2)+' vs '+med(B.map(x=>x.r)).toFixed(2)+'   z='+z.toFixed(2)+'  '+(Math.abs(z)>1.96?'⇒ 유의':''));
}
