// 고정 댓글이 «실제로 고정돼 있는가» — 앱 링크의 주력 경로다.
//   업로드 스크립트가 매번 "고정은 스튜디오에서 수동" 이라 안내했다.
//   한 번도 안 눌렀다면 링크는 «있어도 없는 것» 이다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,id&mine=true',H)).json()).items[0];
const MYID=ch.id;
const pl=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=12`,H)).json();
const ids=(pl.items||[]).map(i=>i.contentDetails.videoId);
const vs=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${ids.join(',')}`,H)).json();
console.log('\n  ══ 고정 댓글 확인 (최근 12편) ══');
console.log('   조회  댓글  우리댓글  앱링크  제목');
for(const v of (vs.items||[])){
 if(v.status.privacyStatus!=='public') continue;
 const ct=await (await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${v.id}&maxResults=20&order=relevance`,H)).json();
 const items=ct.items||[];
 const mine=items.filter(t=>t.snippet.topLevelComment.snippet.authorChannelId?.value===MYID);
 const hasLink=mine.some(t=>/signumhq\.com/i.test(t.snippet.topLevelComment.snippet.textOriginal||''));
 // order=relevance 에서 «첫 번째» 가 우리 것이면 고정됐을 가능성이 높다 (API 로 고정여부를 직접 못 읽는다)
 const firstIsMine=items.length? items[0].snippet.topLevelComment.snippet.authorChannelId?.value===MYID : false;
 console.log('   '+String(v.statistics.viewCount||0).padStart(4)+String(items.length).padStart(6)
  +'  '+(mine.length?'있음('+mine.length+')':'없음').padEnd(8)
  +'  '+(hasLink?'있음':'없음').padEnd(6)
  +'  '+(firstIsMine?'[최상단] ':'         ')+v.snippet.title.slice(0,38));
}
console.log('\n  ⛔ API 로는 «고정 여부» 를 직접 읽을 수 없다. 최상단 표시는 추정이다.');
console.log('     확실한 확인은 스튜디오에서 눈으로 봐야 한다.');
