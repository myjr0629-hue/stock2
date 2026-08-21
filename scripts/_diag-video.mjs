// 영상 하나의 «배포 가능 상태»를 전부 뽑는다. 만듦새 이전에 이게 먼저다.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const JP = String(process.env.SIGNUM_YT||'jp').toLowerCase()==='jp';
const rt = JP ? env.YT_JP_REFRESH_TOKEN : env.YT_REFRESH_TOKEN;
const r = await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:env.YT_CLIENT_ID,client_secret:env.YT_CLIENT_SECRET,refresh_token:rt,grant_type:'refresh_token'})});
const {access_token:AT} = await r.json();
const id = process.argv[2];
const q = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,contentDetails,statistics,topicDetails,processingDetails&id=${id}`,
  {headers:{authorization:`Bearer ${AT}`}});
const v = (await q.json()).items?.[0];
if(!v){ console.log('  ✗ 못 찾음'); process.exit(1); }
const s=v.snippet, st=v.status, cd=v.contentDetails, pd=v.processingDetails;
console.log('\n  ══ 배포 가능 상태 ══');
console.log('   제목        ', s.title);
console.log('   공개         ', st.privacyStatus, '   업로드', st.uploadStatus, '   처리', pd?.processingStatus);
console.log('   ⛔ 아동용    ', st.madeForKids, '  (true 면 피드 배포가 사실상 죽는다)');
console.log('   자가선언     ', st.selfDeclaredMadeForKids);
console.log('   카테고리     ', s.categoryId);
console.log('   언어         audio=', s.defaultAudioLanguage, ' default=', s.defaultLanguage);
console.log('   임베드/통계  ', st.embeddable, '/', st.publicStatsViewable);
console.log('   라이선스     ', st.license, '  합성미디어', st.containsSyntheticMedia);
console.log('   지역제한     ', JSON.stringify(cd?.regionRestriction||'없음'));
console.log('   길이         ', cd?.duration);
console.log('   태그 수      ', (s.tags||[]).length, ' 총', (s.tags||[]).join('').length, '자');
console.log('   조회/좋아요  ', v.statistics?.viewCount, '/', v.statistics?.likeCount);
console.log('   게시시각     ', s.publishedAt);
