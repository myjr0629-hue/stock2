// 레퍼런스·폭발 채널은 «하루 몇 편» 올리는가 — 그리고 «간격» 은 얼마인가.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.YOUTUBE_API_KEY;
const CH={
 'Jeremy Cermak':'@jeremycermak', 'Value Signals':null, 'TheWealthrive':null,
 'Life in Focus':null, 'Asset vs. Time':null, 'Finvesto':null,
};
// 채널ID 는 폭발작 영상에서 역으로 얻는다
const VID={'Jeremy Cermak':'9kCsG9zth-s','Value Signals':'v4SH6pWj2ZM','TheWealthrive':'qg1Chq4KL3U',
 'Life in Focus':'yoWqUxAIcvg','Asset vs. Time':'nTQsGsNfamY','Finvesto':'TqWvOy84moQ',
 'Brian.invests':'zQb74OSDpjw','the bald trader':'dIRUhXL5oys'};
const j0=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${Object.values(VID).join(',')}&key=${K}`)).json();
const cid={}; (j0.items||[]).forEach(v=>{const n=Object.keys(VID).find(k=>VID[k]===v.id); if(n)cid[n]=v.snippet.channelId;});
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
console.log('\n  ══ 폭발 채널의 업로드 리듬 ══');
console.log('   채널                편수  기간(일)  하루평균  하루최대  중앙간격(시간)  3편+인 날');
for(const [name,id] of Object.entries(cid)){
 const c=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${id}&key=${K}`)).json();
 const up=c.items?.[0]?.contentDetails?.relatedPlaylists?.uploads; if(!up) continue;
 let ids=[],page='';
 for(let k=0;k<6;k++){
  const p=await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${up}&maxResults=50${page?`&pageToken=${page}`:''}&key=${K}`)).json();
  if(p.error)break; ids.push(...(p.items||[]).map(i=>i.contentDetails.videoId)); page=p.nextPageToken; if(!page)break;}
 const pubs=[];
 for(let i=0;i<ids.length;i+=50){
  const v=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.slice(i,i+50).join(',')}&key=${K}`)).json();
  (v.items||[]).forEach(x=>pubs.push(Date.parse(x.snippet.publishedAt)));}
 if(pubs.length<8) continue;
 pubs.sort((a,b)=>a-b);
 const days=(pubs[pubs.length-1]-pubs[0])/864e5||1;
 const byDay={}; pubs.forEach(t=>{const d=new Date(t).toISOString().slice(0,10); byDay[d]=(byDay[d]||0)+1;});
 const counts=Object.values(byDay);
 const gaps=[]; for(let i=1;i<pubs.length;i++) gaps.push((pubs[i]-pubs[i-1])/3600e3);
 const sameDayGaps=gaps.filter(g=>g<24);
 console.log('   '+name.padEnd(18)+String(pubs.length).padStart(4)
  +String(Math.round(days)).padStart(9)+(pubs.length/days).toFixed(2).padStart(10)
  +String(Math.max(...counts)).padStart(9)+med(gaps).toFixed(1).padStart(14)
  +'    '+counts.filter(c=>c>=3).length+'/'+counts.length+'일');
 if(sameDayGaps.length) console.log('        └ 같은 날 연속 업로드 '+sameDayGaps.length+'건 · 그 간격 중앙 '+med(sameDayGaps).toFixed(1)+'시간 · 최단 '+Math.min(...sameDayGaps).toFixed(1)+'시간');
}
console.log('\n   ── 우리 ──');
console.log('   SIGNUM HQ          28       11      2.55        4           7.0    5/9일');
console.log('        └ 같은 날 연속 업로드 다수 · 최단 1.2시간 (오늘 테스트2 는 0.5시간)');
