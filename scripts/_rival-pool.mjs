// 라이벌 30개 채널의 «전체 영상» 을 모아 제목 패턴을 검정한다.
// ⛔ 채널 크기 교란을 막기 위해 각 영상을 «그 채널 자신의 중앙값» 으로 나눈다 (배수).
//    (앞서 두 번 이 교란에 당했다 — 정규화 없이 비교하면 큰 채널이 이긴 것처럼 보인다)
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const R=JSON.parse(readFileSync('.agent/_rivals.json','utf8'));
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);if(!m)return 0;return (+(m[1]||0))*3600+(+(m[2]||0))*60+ +(m[3]||0);};
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const pool=[];
for(const c of R){
 let ids=[],page='';
 for(let k=0;k<9;k++){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${c.up}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
  if(j.error) break;
  ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page)break;}
 const vs=[];
 for(let i=0;i<ids.length;i+=50){
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
  for(const v of (j.items||[])) vs.push({ch:c.t,t:v.snippet.title,v:+(v.statistics.viewCount||0),
    like:+(v.statistics.likeCount||0),sec:iso(v.contentDetails.duration)});
 }
 const m=med(vs.map(x=>x.v))||1;
 vs.forEach(x=>{x.rel=x.v/m;}); pool.push(...vs);
 process.stdout.write('.');
}
console.log('\n  라이벌 영상 총 '+pool.length+'편 수집 (채널 '+R.length+'개 · 각 채널 중앙값으로 정규화)');
writeFileSync('.agent/_rival_pool.json',JSON.stringify(pool));
// 쇼츠만 (<=90초) — 우리와 같은 포맷끼리 비교
const S=pool.filter(x=>x.sec>0&&x.sec<=90);
console.log('  그 중 쇼츠(90초 이하) '+S.length+'편으로 검정\n');
const mw=(A,B)=>{const all=[...A.map(v=>({v,g:0})),...B.map(v=>({v,g:1}))].sort((a,b)=>a.v-b.v);
 all.forEach((x,i)=>x.rank=i+1);
 const R1=all.filter(x=>x.g===0).reduce((s,x)=>s+x.rank,0);
 const n1=A.length,n2=B.length,U=R1-n1*(n1+1)/2,mu=n1*n2/2,sd=Math.sqrt(n1*n2*(n1+n2+1)/12);
 return (U-mu)/sd;};
const T=[
 ['A vs B (두 종목 비교)', x=>/\bvs\.?\b/i.test(x.t)],
 ['미래 예측 (will·can·2026·reach)', x=>/\b(will|can|could|2026|2027|reach|next week|next month)\b/i.test(x.t)],
 ['질문형 (? 포함)', x=>/\?/.test(x.t)],
 ['「Why」로 시작', x=>/^\s*why\b/i.test(x.t)],
 ['「You/Your」 포함', x=>/\byou(r)?\b/i.test(x.t)],
 ['유명 티커 이름', x=>/\b(NVDA|Nvidia|AMD|Apple|AAPL|Tesla|TSLA|Microsoft|MSFT|Amazon|Google|Meta|Intel|Micron|Palantir|SoFi)\b/i.test(x.t)],
 ['숫자 + % 또는 $', x=>/(\$[\d,]|\d+\s*%)/.test(x.t)],
 ['감정어 (crazy·shocking·insane·huge)', x=>/\b(crazy|shocking|insane|huge|massive|worst|best|biggest|never|nobody)\b/i.test(x.t)],
];
console.log('  ══ 라이벌 쇼츠 제목 패턴 (배수 = 그 채널 중앙값 대비) ══');
for(const [lab,f] of T){
 const A=S.filter(f),B=S.filter(x=>!f(x));
 if(A.length<8){console.log('   '+lab.padEnd(34)+'표본 부족('+A.length+')');continue;}
 const z=mw(A.map(x=>x.rel),B.map(x=>x.rel));
 console.log('   '+lab.padEnd(34)+String(A.length).padStart(4)+'편  배수중앙 '
  +med(A.map(x=>x.rel)).toFixed(2)+' vs '+med(B.map(x=>x.rel)).toFixed(2)
  +'   z='+z.toFixed(2)+'  '+(Math.abs(z)>1.96?(z>0?'⇒ 유의 (좋음)':'⇒ 유의 (나쁨)'):''));
}
