import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const ch=(await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true',H)).json()).items[0];
console.log('채널:',ch.snippet.title);
const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${ch.contentDetails.relatedPlaylists.uploads}&maxResults=3`,H)).json();
const ids=j.items.map(i=>i.contentDetails.videoId).join(',');
const v=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${ids}`,H)).json();
for(const x of v.items){
 console.log('\n─',x.snippet.title.slice(0,50));
 console.log('  카테고리',x.snippet.categoryId,'· 언어',x.snippet.defaultLanguage||'-','/',x.snippet.defaultAudioLanguage||'-');
 console.log('  태그',JSON.stringify((x.snippet.tags||[]).slice(0,8)));
 console.log('  키즈',x.status.madeForKids,'· 라이선스',x.status.license,'· embed',x.status.embeddable);
 console.log('  설명 첫3줄:'); console.log((x.snippet.description||'').split('\n').slice(0,3).map(l=>'    '+l).join('\n'));
}
