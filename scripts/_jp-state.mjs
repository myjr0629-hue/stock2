// 일본 채널 현황 — 만들기 전에 «지금 어디에 있는지» 부터 본다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_JP_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
if(!AT){console.log('JP 토큰 갱신 실패');process.exit(1);}
const H={headers:{authorization:`Bearer ${AT}`}};
const c=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,brandingSettings&mine=true',H)).json()).items?.[0];
if(!c){console.log('채널 조회 실패');process.exit(1);}
console.log('\n  ══ '+c.snippet.title+' ══');
console.log('   구독 '+c.statistics.subscriberCount+' · 총조회 '+c.statistics.viewCount+' · 영상 '+c.statistics.videoCount);
console.log('   개설 '+c.snippet.publishedAt.slice(0,10)+' · 국가 '+(c.snippet.country||'미설정'));
console.log('   키워드 '+((c.brandingSettings?.channel?.keywords)||'없음').slice(0,90));
const pl=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${c.contentDetails.relatedPlaylists.uploads}&maxResults=50`,H)).json();
const ids=(pl.items||[]).map(i=>i.contentDetails.videoId);
if(!ids.length){console.log('\n   업로드 없음');process.exit(0);}
const v=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.join(',')}`,H)).json();
const iso=s=>{const m=(s||'').match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);return m?(+(m[1]||0))*60+ +(m[2]||0):0;};
console.log('\n   공개  조회  길이  카테고리 태그  제목');
for(const x of (v.items||[]).sort((a,b)=>Date.parse(b.snippet.publishedAt)-Date.parse(a.snippet.publishedAt))){
 console.log('   '+(x.status.privacyStatus==='public'?'공개':x.status.privacyStatus==='private'?'비공개':'일부').padEnd(5)
  +String(x.statistics.viewCount||0).padStart(4)+'  '+String(Math.round(iso(x.contentDetails.duration))).padStart(3)+'s  '
  +String(x.snippet.categoryId).padStart(4)+'  '+String((x.snippet.tags||[]).length).padStart(3)+'개  '+x.snippet.title.slice(0,40));
}
