// A계열(두 대상 + 시간 누적) 용 «실측» 데이터. 추정·반올림 금지 — 화면에 나가는 숫자다.
import { readFileSync, writeFileSync } from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/)
 .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const K=env.FMP_API_KEY;
const PAIRS=[['NVDA','INTC'],['AMD','INTC'],['NVDA','AAPL'],['TSLA','F'],['AVGO','QCOM'],['MU','INTC']];
const syms=[...new Set(PAIRS.flat())];
const hist={};
for(const s of syms){
 const u=`https://financialmodelingprep.com/api/v3/historical-price-full/${s}?from=2015-08-01&to=2026-08-22&apikey=${K}`;
 const j=await (await fetch(u)).json();
 if(!j.historical){console.log(s+' 실패: '+JSON.stringify(j).slice(0,90));continue;}
 // 매년 8월 셋째주 근처 종가 하나씩
 const byYear={};
 for(const d of j.historical){ const y=d.date.slice(0,4), m=d.date.slice(5,7);
   if(m==='08'&&!byYear[y]) byYear[y]=d.close; }
 hist[s]=byYear;
 process.stdout.write(s+' ');
}
console.log('\n');
const out=[];
for(const [a,b] of PAIRS){
 if(!hist[a]||!hist[b]) continue;
 const years=Object.keys(hist[a]).filter(y=>hist[b][y]).sort();
 if(years.length<9) continue;
 const y0=years[0];
 const rows=years.map(y=>({y:+y,
   a:Math.round(10000*hist[a][y]/hist[a][y0]),
   b:Math.round(10000*hist[b][y]/hist[b][y0])}));
 const last=rows[rows.length-1];
 out.push({a,b,y0:+y0,rows,gapX:(last.a/last.b)});
 console.log('  '+a+' vs '+b+'  ('+y0+'~'+years[years.length-1]+')  최종 $'+last.a.toLocaleString()
  +' vs $'+last.b.toLocaleString()+'   격차 '+(last.a/last.b).toFixed(1)+'배');
 console.log('     '+rows.map(r=>r.y+':'+Math.round(r.a/1000)+'k/'+Math.round(r.b/1000)+'k').join('  '));
}
out.sort((x,y)=>y.gapX-x.gapX);
writeFileSync('.agent/_race.json',JSON.stringify(out,null,1));
console.log('\n  격차 큰 순: '+out.map(o=>o.a+'/'+o.b+' '+o.gapX.toFixed(1)+'배').join(' · '));
