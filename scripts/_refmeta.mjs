// 레퍼런스의 «등록 방식» 을 그대로 본다 — 제목·설명·태그·카테고리.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.YOUTUBE_API_KEY;
const IDS={
 'Jeremy 166만 (NVDA vs INTL)':'9kCsG9zth-s',
 'Rolex 8145배 (Rolex vs SPY)':'zQb74OSDpjw',
 'AssetVsTime 271배':'nTQsGsNfamY',
 'ValueSignals 2377만':'v4SH6pWj2ZM',
 'LifeInFocus 1620만':'yoWqUxAIcvg',
 'Finvesto 980만':'TqWvOy84moQ',
};
const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${Object.values(IDS).join(',')}&key=${K}`)).json();
if(j.error){console.log(j.error.message);process.exit(1);}
const byId=Object.fromEntries(j.items.map(v=>[v.id,v]));
for(const [lab,id] of Object.entries(IDS)){
 const v=byId[id]; if(!v){console.log('\n═══ '+lab+' — 못 가져옴');continue;}
 const s=v.snippet;
 console.log('\n═══ '+lab);
 console.log('  제목  ('+s.title.length+'자)  '+s.title);
 console.log('  카테고리 '+s.categoryId+' · 언어 '+(s.defaultLanguage||'-')+'/'+(s.defaultAudioLanguage||'-'));
 console.log('  태그 ('+((s.tags||[]).length)+'개) '+JSON.stringify((s.tags||[]).slice(0,12)));
 const d=(s.description||'').trim();
 console.log('  설명 ('+d.length+'자):');
 d.split('\n').slice(0,8).forEach(l=>console.log('    | '+l.slice(0,96)));
 const tagsInTitle=(s.title.match(/#\w+/g)||[]);
 const tagsInDesc=(d.match(/#\w+/g)||[]);
 console.log('  해시태그: 제목 '+tagsInTitle.length+'개 '+JSON.stringify(tagsInTitle)+' · 설명 '+tagsInDesc.length+'개');
}
