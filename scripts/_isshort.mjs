// «쇼츠로 인정받았는가» 를 직접 확인한다.
//   /shorts/<id> 가 그대로 열리면 쇼츠, /watch 로 튕기면 일반영상이다.
//   ⇒ 일반영상으로 분류되면 쇼츠 피드에 «구조적으로» 안 들어간다.
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
const iso=s=>{const m=s.match(/PT(?:(\d+)M)?(?:([\d.]+)S)?/);return (+(m[1]||0))*60+ +(m[2]||0);};
const rows=[];
for(let i=0;i<ids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
 for(const v of (j.items||[])) if(v.status.privacyStatus==='public')
  rows.push({id:v.id,t:v.snippet.title,pub:v.snippet.publishedAt.slice(0,10),sec:iso(v.contentDetails.duration),
    tags:(v.snippet.tags||[]).length, desc:v.snippet.description||'', v:+(v.statistics.viewCount||0),
    kids:v.status.madeForKids, lic:v.status.license});
}
console.log('\n  ══ 쇼츠 분류 확인 (n='+rows.length+') ══');
console.log('   조회  길이  쇼츠?  #Shorts  키즈  제목');
for(const r of rows){
 let cls='?';
 try{
  const res=await fetch(`https://www.youtube.com/shorts/${r.id}`,{redirect:'manual',
    headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}});
  cls = (res.status>=300&&res.status<400) ? '아니오→'+ (res.headers.get('location')||'').slice(0,28) : '예';
 }catch(e){ cls='조회실패'; }
 const hasTag=/#shorts?/i.test(r.t+' '+r.desc);
 console.log('   '+String(r.v).padStart(4)+'  '+String(r.sec.toFixed(0)).padStart(3)+'s  '+cls.padEnd(10)
  +'  '+(hasTag?'있음':'없음')+'  '+(r.kids?'예':'아니오').padEnd(5)+'  '+r.t.slice(0,40));
}
