import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
for (const [tag,rtk] of [['🇺🇸 SIGNUM HQ','YT_REFRESH_TOKEN'],['🇯🇵 SIGNUM JP','YT_JP_REFRESH_TOKEN'],['🇰🇷 시그넘 KR','YT_KR_REFRESH_TOKEN']]){
 const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,refresh_token:env[rtk],grant_type:'refresh_token'})})).json();
 const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&mine=true',{headers:{authorization:`Bearer ${AT}`}})).json()).items[0];
 const up=ch.contentDetails.relatedPlaylists.uploads;
 const pl=(await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=15`,{headers:{authorization:`Bearer ${AT}`}})).json()).items||[];
 const ids=pl.map(i=>i.contentDetails.videoId).join(',');
 const vs=ids?(await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${ids}`,{headers:{authorization:`Bearer ${AT}`}})).json()).items:[];
 console.log(`\n  ══ ${tag}  구독 ${ch.statistics.subscriberCount} · 영상 ${ch.statistics.videoCount} · 총조회 ${ch.statistics.viewCount} ══`);
 vs.sort((a,b)=>Date.parse(b.snippet.publishedAt)-Date.parse(a.snippet.publishedAt));
 for(const v of vs){
  const at=v.status.publishAt||v.snippet.publishedAt;
  const kst=new Date(Date.parse(at)+9*3600e3).toISOString().replace('T',' ').slice(0,16);
  console.log(`   ${v.id}  ${String(v.status.privacyStatus).padEnd(7)} ${v.status.publishAt?'예약':'게시'} ${kst} KST  조회 ${String(v.statistics?.viewCount??'-').padStart(5)}  ${v.snippet.title.slice(0,42)}`);
 }
}
