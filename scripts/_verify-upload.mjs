import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const {access_token:AT}=await (await fetch('https://oauth2.googleapis.com/token',{method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,
   refresh_token:(String(process.env.SIGNUM_YT||'hq').toLowerCase()==='jp'?env.YT_JP_REFRESH_TOKEN:env.YT_REFRESH_TOKEN),grant_type:'refresh_token'})})).json();
const H={headers:{authorization:`Bearer ${AT}`}};
const id=process.argv[2];
const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails,processingDetails&id=${id}`,H)).json();
const v=j.items?.[0];
if(!v){console.log('없음');process.exit(1);}
console.log('\n  ══ 업로드 확인 ══');
console.log('   제목      '+v.snippet.title);
console.log('   공개상태  '+v.status.privacyStatus+(v.status.privacyStatus==='public'?'  ← 전 세계에 보임':''));
console.log('   업로드    '+v.status.uploadStatus+' · 처리 '+(v.processingDetails?.processingStatus||'-'));
console.log('   카테고리  '+v.snippet.categoryId);
console.log('   태그      '+((v.snippet.tags||[]).length)+'개');
console.log('   길이      '+v.contentDetails.duration);
console.log('   키즈      '+v.status.madeForKids);
console.log('   언어      '+(v.snippet.defaultLanguage||'-')+' / '+(v.snippet.defaultAudioLanguage||'-'));
// 쇼츠로 분류됐는지
const r=await fetch(`https://www.youtube.com/shorts/${id}`,{redirect:'manual',
  headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}});
console.log('   쇼츠분류  '+((r.status>=300&&r.status<400)?('아니오 → '+(r.headers.get('location')||'').slice(0,40)):'예'));
console.log('\n   https://youtube.com/shorts/'+id+'\n');
