// ⛔ 「레퍼런스 태그 0개」가 진짜인지, API 가 남의 태그를 «안 돌려주는» 것인지 가른다.
//   방법: «우리 영상» 을 두 방식으로 조회한다.
//     ① OAuth(소유자 권한)  ② API 키(제3자와 동일 권한)
//   ①에는 태그가 나오는데 ②에서 사라지면 → 남의 영상 태그는 원래 안 보이는 것이고
//     내가 앞서 낸 「폭발작 태그 중앙 0개」는 무효다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',H)).json()).items[0];
const pl=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=2`,H)).json();
const ids=pl.items.map(i=>i.contentDetails.videoId);
console.log('\n  ══ 같은 «우리» 영상을 두 방식으로 조회 ══');
const a=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.join(',')}`,H)).json();
const b=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.join(',')}&key=${env.YOUTUBE_API_KEY}`)).json();
for(let i=0;i<ids.length;i++){
 const A=a.items?.find(v=>v.id===ids[i]), B=b.items?.find(v=>v.id===ids[i]);
 console.log('\n   '+(A?.snippet.title||ids[i]).slice(0,46));
 console.log('     ① OAuth(소유자)  태그 '+((A?.snippet.tags||[]).length)+'개  '+JSON.stringify((A?.snippet.tags||[]).slice(0,5)));
 console.log('     ② API키(제3자)   태그 '+((B?.snippet.tags||[]).length)+'개  '+JSON.stringify((B?.snippet.tags||[]).slice(0,5)));
}
