// 잘 되는 롱폼 채널들이 «실제로 무슨 소재»를 다루는가 — 채널별 최근 업로드 전수
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:env.YT_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const scan=JSON.parse(readFileSync('.agent/_us_longform.json','utf8'));
const want=['Think School','The Infographics Show','MonkeyExplains','Patrick Boyle',
            'Andrei Jikh','ColdFusion','The Tech Report','More Perfect Union'];
const chIds={}; for(const v of scan) if(want.includes(v.ch)) chIds[v.ch]=v.chId;
const out=[];
for(const [name,id] of Object.entries(chIds)){
  const c=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&id=${id}`,H)).json();
  const up=c.items?.[0]?.contentDetails?.relatedPlaylists?.uploads; if(!up) continue;
  const subs=+(c.items[0].statistics.subscriberCount||0);
  let page='', ids=[];
  for(let k=0;k<2;k++){
    const j=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50${page?`&pageToken=${page}`:''}`,H)).json();
    ids.push(...(j.items||[]).map(i=>i.contentDetails.videoId)); page=j.nextPageToken; if(!page) break;
  }
  for(let i=0;i<ids.length;i+=50){
    const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i,i+50).join(',')}`,H)).json();
    for(const v of (j.items||[])){
      if(!v.contentDetails?.duration) continue;
      const m=v.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const dur=(+(m[1]||0))*3600+(+(m[2]||0))*60+(+(m[3]||0));
      out.push({ch:name,subs,id:v.id,title:v.snippet.title,pub:v.snippet.publishedAt,dur,
        views:+(v.statistics.viewCount||0),likes:+(v.statistics.likeCount||0)});
    }
  }
  const mine=out.filter(x=>x.ch===name&&x.dur>=300);
  const med=v=>{const s=[...v].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
  console.log(`  ${name.padEnd(24)} 구독 ${String(subs.toLocaleString()).padStart(11)}  롱폼 ${String(mine.length).padStart(3)}편  조회중앙 ${med(mine.map(x=>x.views)).toLocaleString()}`);
}
writeFileSync('.agent/_ref_topics.json',JSON.stringify(out,null,1));
console.log(`\n  수집 ${out.length}편`);
