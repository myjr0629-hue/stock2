// 영상 ID 목록 → 실제 조회·길이·게시일·원문 제목 (yt-dlp 의 자동번역 제목을 믿지 않는다)
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const src=JSON.parse(readFileSync(process.argv[2],'utf8'));
const ids=(src.rows||src).map(r=>r.id);
const out=[];
for(let i=0;i<ids.length;i+=50){
  const chunk=ids.slice(i,i+50).join(',');
  const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${chunk}`,
    {headers:{authorization:`Bearer ${AT}`}})).json();
  for(const v of (j.items||[])){
    const m=v.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    out.push({id:v.id, title:v.snippet.title, pub:v.snippet.publishedAt,
      dur:(+(m[1]||0))*3600+(+(m[2]||0))*60+(+(m[3]||0)),
      views:+(v.statistics.viewCount||0), likes:+(v.statistics.likeCount||0), comments:+(v.statistics.commentCount||0)});
  }
}
writeFileSync(process.argv[3], JSON.stringify(out,null,1));
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
const L=out.filter(x=>x.dur>=300), S=out.filter(x=>x.dur<300);
console.log(`\n  ══ ${out.length}편 실측 ══`);
console.log(`  롱폼(5분+) ${L.length}편 — 길이 중앙 ${(med(L.map(x=>x.dur))/60).toFixed(1)}분 · 조회 중앙 ${med(L.map(x=>x.views)).toLocaleString()}`);
if(S.length) console.log(`  쇼츠(5분미만) ${S.length}편 — 길이 중앙 ${med(S.map(x=>x.dur))}초 · 조회 중앙 ${med(S.map(x=>x.views)).toLocaleString()}`);
console.log('\n  ── 조회 상위 12 ──');
[...out].sort((a,b)=>b.views-a.views).slice(0,12).forEach((x,i)=>{
  const lr=x.views?(x.likes/x.views*100).toFixed(2):'-';
  console.log(`  ${String(i+1).padStart(2)}. ${String(Math.round(x.dur/60)).padStart(3)}분 ${String(x.views).padStart(8)}회 좋아요${String(lr).padStart(5)}% 댓글${String(x.comments).padStart(5)}  ${x.title.slice(0,44)}`);
});
