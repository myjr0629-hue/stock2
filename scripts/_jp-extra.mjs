#!/usr/bin/env node
// _jp-extra — JPRATE·JPFX 에 «비트 하나»를 더 넣기 위한 추가 실측 (2026-08-24)
//   ⛔ 길이를 채우려고 «말»을 늘리지 않는다. 실제로 잰 값만 넣는다.
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const FMP = env.match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const FRED = env.match(/^FRED_API_KEY=(.+)$/m)[1].trim();
const eod = async (s, from) => (await (await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${from}&to=2026-08-22&apikey=${FMP}`)).json()).slice().sort((a,b)=>a.date.localeCompare(b.date));
const corr = (a, b) => { const n=a.length,ma=a.reduce((p,c)=>p+c,0)/n,mb=b.reduce((p,c)=>p+c,0)/n;let s=0,x2=0,y2=0;for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;s+=x*y;x2+=x*x;y2+=y*y;}return s/Math.sqrt(x2*y2);};
const out = {};

{ // A) 롤링 상관의 «최고» 시점과 구간별 분포
  const spy = await eod('SPY', '2006-01-01');
  const j = await (await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${FRED}&file_type=json&observation_start=2006-01-01`)).json();
  const y = new Map(); for (const x of j.observations) if (x.value !== '.') y.set(x.date, +x.value);
  const rows = [];
  for (let i = 1; i < spy.length; i++) {
    const d = spy[i].date, p = spy[i-1].date;
    if (y.has(d) && y.has(p)) rows.push({ d, r: spy[i].close/spy[i-1].close-1, dy: (y.get(d)-y.get(p))*100 });
  }
  const W = 252, roll = [];
  for (let i = W; i <= rows.length; i++) { const s = rows.slice(i-W, i); roll.push({ d: s[s.length-1].d, c: corr(s.map(x=>x.r), s.map(x=>x.dy)) }); }
  const mx = roll.reduce((a,b)=>b.c>a.c?b:a), mn = roll.reduce((a,b)=>b.c<a.c?b:a);
  out.A = { maxAt: mx.d, max: +mx.c.toFixed(3), minAt: mn.d, min: +mn.c.toFixed(3),
            over05: +(roll.filter(x=>x.c>0.5).length/roll.length*100).toFixed(1),
            windows: roll.length };
  console.log(`\n  A) 1년 롤링 상관`);
  console.log(`   최고 ${out.A.max} (${out.A.maxAt})  ·  최저 ${out.A.min} (${out.A.minAt})`);
  console.log(`   +0.5 를 넘었던 창 ${out.A.over05}%  (전체 ${out.A.windows}개)`);
}

{ // B) 円건 SPY 가 «내린 날» 은 며칠인가 — 변동성 말고 «횟수»
  const [spy, fx] = await Promise.all([eod('SPY','2016-08-01'), eod('USDJPY','2016-08-01')]);
  const m = new Map(fx.map(r=>[r.date,r.close]));
  const rows = spy.filter(r=>m.has(r.date)).map(r=>({u:r.close, j:r.close*m.get(r.date)}));
  let du=0, dj=0, big_u=0, big_j=0;
  for (let i=1;i<rows.length;i++){
    const a=rows[i].u/rows[i-1].u-1, b=rows[i].j/rows[i-1].j-1;
    if(a<0)du++; if(b<0)dj++;
    if(a<-0.02)big_u++; if(b<-0.02)big_j++;
  }
  const n = rows.length-1;
  out.B = { n, downUsd: du, downJpy: dj, big2Usd: big_u, big2Jpy: big_j,
            downUsdPct:+(du/n*100).toFixed(1), downJpyPct:+(dj/n*100).toFixed(1) };
  console.log(`\n  B) ${n}일 중 «내린 날»`);
  console.log(`   ドル건 ${du}일 (${out.B.downUsdPct}%)  ·  円건 ${dj}일 (${out.B.downJpyPct}%)`);
  console.log(`   -2% 이상 급락일  ドル건 ${big_u}일  ·  円건 ${big_j}일`);
}
writeFileSync('.agent/_jp_extra.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_jp_extra.json');
