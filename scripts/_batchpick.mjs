import { readFileSync, writeFileSync } from 'node:fs';
const P=JSON.parse(readFileSync('.agent/_newpool.json','utf8'));
const med=a=>{const s=[...a].sort((p,q)=>p-q);return s.length?s[Math.floor(s.length/2)]:0;};
const byCh={}; P.forEach(v=>(byCh[v.ch]??=[]).push(v));
const S=[];
for(const [ch,vs] of Object.entries(byCh)){
 if(vs.length<10) continue;
 const na=vs.filter(x=>/[^\x00-\x7F]/.test(x.t.replace(/[\p{Emoji}\u2000-\u3300\uFE0F]/gu,''))).length;
 if(na>vs.length*0.35) continue;
 const m=med(vs.map(x=>x.v))||1;
 vs.filter(x=>x.sec>=5&&x.sec<=80).forEach(x=>S.push({...x,rel:x.v/m}));
}
// 금융·비즈니스·돈 소재로 한정하고, 자기채널 대비 폭발한 것만
const FIN=/\b(stock|invest|market|money|rich|wealth|billion|million|dollar|\$|profit|revenue|earning|business|ceo|company|price|fund|dividend|trade|trading|economy|bank|debt|salary|income|worth|cost|buy|sell|nvidia|tesla|apple|amazon|s&p|spy|bitcoin|gold)\b/i;
const cand=S.filter(x=>FIN.test(x.t)&&x.rel>=8&&x.v>=300000);
// 채널당 최대 1편 — 다양하게
const seen=new Set(), out=[];
cand.sort((a,b)=>b.rel-a.rel);
for(const x of cand){ if(seen.has(x.ch))continue; seen.add(x.ch); out.push(x); if(out.length>=14)break; }
writeFileSync('.agent/_batch.json',JSON.stringify(out,null,1));
out.forEach((x,i)=>console.log(String(i+1).padStart(2)+' '+x.id+'  '
 +(x.v>=1e6?(x.v/1e6).toFixed(1)+'M':Math.round(x.v/1000)+'k').padStart(6)+'  '+String(x.sec).padStart(2)+'초  '
 +String(Math.round(x.rel)).padStart(4)+'배  '+x.ch.slice(0,17).padEnd(18)+x.t.slice(0,46)));
