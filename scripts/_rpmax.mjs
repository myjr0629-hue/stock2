// 「최대 수익」 = 조회수 × RPM. 지금까지 조회수만 봤다. RPM 쪽 변수를 갈라 본다.
//   ⛔ RPM 자체는 못 잰다(우리가 YPP 밖). 대신 «RPM 을 가르는 것» 들의 분포를 잰다:
//      ① 채널 국가 (미국·일본 = 높음 / 인도·동남아 = 낮음)
//      ② 주제 (금융·보험·부동산·소프트웨어 = 높음 / 밈·감동 = 낮음)
//   그 둘이 «조회량» 과 어떻게 맞물리는지가 답의 뼈대다.
import { readFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.YOUTUBE_API_KEY;
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
// 수익화 문턱 넘은 채널들의 «국가» 를 실제로 조회한다
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const cands=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<8) continue;
 const pubs=vs.map(x=>Date.parse(x.pub)).filter(Boolean).sort((a,b)=>a-b);
 if(pubs.length<8) continue;
 const days=(pubs[pubs.length-1]-pubs[0])/864e5||1;
 const per90=vs.reduce((s,x)=>s+x.v,0)/days*90;
 if(per90<5e6) continue;
 cands.push({ch,per90,perVid:med(vs.map(x=>x.v)),id:vs[0].id,subs:vs[0].chSubs,
   sample:[...vs].sort((a,b)=>b.v-a.v).slice(0,2).map(x=>x.t)});
}
// 영상ID → 채널ID → 국가
const vids=cands.map(c=>c.id);
const cidOf={};
for(let i=0;i<vids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vids.slice(i,i+50).join(',')}&key=${K}`)).json();
 (j.items||[]).forEach(v=>cidOf[v.id]=v.snippet.channelId);}
const cids=[...new Set(Object.values(cidOf))];
const info={};
for(let i=0;i<cids.length;i+=50){
 const j=await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${cids.slice(i,i+50).join(',')}&key=${K}`)).json();
 (j.items||[]).forEach(c=>info[c.id]={cty:c.snippet.country||'?',t:c.snippet.title,
   views:+(c.statistics.viewCount||0),subs:+(c.statistics.subscriberCount||0)});}
cands.forEach(c=>{const x=info[cidOf[c.id]]; c.cty=x?x.cty:'?'; c.totalViews=x?x.views:0;});
// RPM 등급 (외부 통념 — 실측 아님)
const TIER={US:'상',GB:'상',CA:'상',AU:'상',DE:'상',JP:'상',KR:'중',FR:'중',IT:'중',ES:'중',
 IN:'하',ID:'하',BR:'하',PH:'하',VN:'하',PK:'하',BD:'하',NG:'하',EG:'하',TR:'하',MX:'하',TH:'하'};
cands.sort((a,b)=>b.per90-a.per90);
console.log('\n  ══ 90일 500만회 이상 신규채널 '+cands.length+'곳 · 국가별 ══');
console.log('   90일    편당중앙   국가  RPM등급  채널 / 대표작');
for(const c of cands.slice(0,22)){
 console.log('   '+(c.per90/1e6).toFixed(0).padStart(4)+'M'+String(Math.round(c.perVid)).padStart(10)
  +'   '+String(c.cty).padEnd(4)+' '+(TIER[c.cty]||'?').padEnd(4)+'  '+c.ch.slice(0,22));
 console.log('                                   └ '+(c.sample[0]||'').slice(0,54));
}
const g={}; cands.forEach(c=>{const t=TIER[c.cty]||'미상'; (g[t]??=[]).push(c);});
console.log('\n  ══ RPM 등급별 «달성 조회량» ══');
for(const t of ['상','중','하','미상']){
 const a=g[t]||[]; if(!a.length) continue;
 console.log('   '+t.padEnd(4)+String(a.length).padStart(3)+'곳  90일 중앙 '+(med(a.map(x=>x.per90))/1e6).toFixed(0)+'M  편당 중앙 '+Math.round(med(a.map(x=>x.perVid))).toLocaleString()+'회');
}
console.log('\n  ⛔ RPM 등급은 «외부 통념» 이지 내가 잰 값이 아니다. 국가별 광고단가는 우리가 측정 불가.');
