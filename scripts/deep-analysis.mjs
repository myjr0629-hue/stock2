#!/usr/bin/env node
// N-DIMENSIONAL COMBINATION ANALYSIS — 조합의 조합의 조합
// 28,802+ pairs × T+1/3/5/10/20 × up to 5D conditions
const API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE = 'https://api.polygon.io';
const fs = await import('fs');

const TICKERS = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA',
  'AMD','INTC','AVGO','QCOM','MU','MRVL',
  'JPM','GS','V','MA','COIN','SQ','PYPL',
  'UNH','JNJ','LLY','MRNA','ABBV',
  'DIS','NFLX','SHOP','UBER','RIVN',
  'BA','LMT','XOM','CVX','CAT',
  'CRM','ORCL','ADBE','NOW','SNOW',
  'WMT','COST','TGT','HD',
  'KO','PEP','NKE','MCD','PG','ABNB'
];
const REGIME_TICKERS = ['QQQ','VIXY','TLT','GLD'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await sleep(2000*(i+1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { await sleep(1000); }
  }
  return null;
}

async function getDailyBars(ticker, from, to) {
  const url = `${BASE}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=600&apiKey=${API_KEY}`;
  return (await fetchJSON(url))?.results || [];
}

async function getRSI(ticker) {
  const url = `${BASE}/v1/indicators/rsi/${ticker}?timespan=day&window=14&series_type=close&limit=600&order=asc&apiKey=${API_KEY}`;
  const all = []; let next = url;
  while (next) {
    const d = await fetchJSON(next);
    if (!d?.results?.values) break;
    all.push(...d.results.values);
    next = d.next_url ? `${d.next_url}&apiKey=${API_KEY}` : null;
    if (next) await sleep(100);
  }
  return all;
}

async function getMACD(ticker) {
  const url = `${BASE}/v1/indicators/macd/${ticker}?timespan=day&short_window=12&long_window=26&signal_window=9&series_type=close&limit=600&order=asc&apiKey=${API_KEY}`;
  const all = []; let next = url;
  while (next) {
    const d = await fetchJSON(next);
    if (!d?.results?.values) break;
    all.push(...d.results.values);
    next = d.next_url ? `${d.next_url}&apiKey=${API_KEY}` : null;
    if (next) await sleep(100);
  }
  return all;
}

function tsToDate(ts) { return new Date(ts).toISOString().split('T')[0]; }

// ================================================================
// PHASE 1: DATA COLLECTION (with extended forward returns)
// ================================================================
async function collectData() {
  const FROM='2024-01-01', TO='2026-05-08';
  console.log(`\n${'='.repeat(70)}\n  DEEP N-DIMENSIONAL ANALYSIS\n  ${FROM} → ${TO} | ${TICKERS.length} tickers\n${'='.repeat(70)}\n`);

  // Regime data
  console.log('[Phase 1] Regime data...');
  const regime = {};
  for (const rt of REGIME_TICKERS) {
    const bars = await getDailyBars(rt, FROM, TO);
    regime[rt] = {};
    for (let i=1;i<bars.length;i++) {
      regime[rt][tsToDate(bars[i].t)] = { c: bars[i].c, chg: ((bars[i].c-bars[i-1].c)/bars[i-1].c)*100 };
    }
    console.log(`  ${rt}: ${Object.keys(regime[rt]).length} days`);
    await sleep(200);
  }

  // Ticker data
  console.log('\n[Phase 2] Ticker data...');
  const allPairs = [];
  let done = 0;

  for (const ticker of TICKERS) {
    done++;
    process.stdout.write(`  [${done}/${TICKERS.length}] ${ticker}...`);
    const bars = await getDailyBars(ticker, FROM, TO);
    if (bars.length < 30) { console.log(' skip'); await sleep(100); continue; }
    await sleep(150);
    const rsiData = await getRSI(ticker);
    await sleep(150);
    const macdData = await getMACD(ticker);
    await sleep(150);

    const rsiByDate = {}, macdByDate = {};
    rsiData.forEach(r => { rsiByDate[tsToDate(r.timestamp)] = r.value; });
    macdData.forEach(m => { macdByDate[tsToDate(m.timestamp)] = m; });

    // Compute 20-day avg volume
    const volAvg = {};
    for (let i=20; i<bars.length; i++) {
      let sum = 0;
      for (let j=i-20;j<i;j++) sum += bars[j].v;
      volAvg[tsToDate(bars[i].t)] = sum / 20;
    }

    let count = 0;
    for (let i = 5; i < bars.length - 20; i++) { // need T+20 forward
      const today = bars[i], prev = bars[i-1], d3ago = bars[i-3];
      const d = tsToDate(today.t);
      if (!prev || prev.c <= 0 || today.c <= 0) continue;

      const chg = ((today.c - prev.c) / prev.c) * 100;
      const r3d = d3ago && d3ago.c > 0 ? ((today.c - d3ago.c) / d3ago.c) * 100 : null;
      const vwapDist = today.vw > 0 ? ((today.c - today.vw) / today.vw) * 100 : 0;
      const rsi = rsiByDate[d] ?? null;
      const macd = macdByDate[d] ?? null;
      const macdHist = macd?.histogram ?? null;

      // RSI velocity (3-day change)
      const rsi3ago = bars[i-3] ? rsiByDate[tsToDate(bars[i-3].t)] : null;
      const rsiVel = (rsi !== null && rsi3ago !== null) ? rsi - rsi3ago : null;

      // MACD direction change
      const macd1ago = bars[i-1] ? macdByDate[tsToDate(bars[i-1].t)] : null;
      const macdTurning = (macdHist !== null && macd1ago?.histogram !== null)
        ? (macd1ago.histogram < 0 && macdHist >= 0 ? 'BULL_CROSS' :
           macd1ago.histogram > 0 && macdHist <= 0 ? 'BEAR_CROSS' : 'NONE')
        : 'UNKNOWN';

      // Volume ratio
      const volRatio = volAvg[d] && volAvg[d] > 0 ? today.v / volAvg[d] : 1;

      // Forward returns: T+1, T+3, T+5, T+10, T+20
      const fwd = {};
      for (const [label, offset] of [['t1',1],['t3',3],['t5',5],['t10',10],['t20',20]]) {
        if (i+offset < bars.length && bars[i+offset].c > 0) {
          fwd[label] = ((bars[i+offset].c - today.c) / today.c) * 100;
        }
      }
      if (!fwd.t3 || Math.abs(fwd.t3) > 30) continue;

      allPairs.push({
        ticker, date: d, chg, r3d, vwapDist, rsi, macdHist,
        rsiVel, macdTurning, volRatio,
        qqq: regime.QQQ?.[d]?.chg ?? 0,
        vixy: regime.VIXY?.[d]?.chg ?? 0,
        ...fwd
      });
      count++;
    }
    console.log(` ${count} pairs`);
  }

  // Save raw
  fs.writeFileSync('scripts/deep-raw.json', JSON.stringify(allPairs));
  console.log(`\n  Total pairs: ${allPairs.length} → saved to deep-raw.json`);
  return allPairs;
}

// ================================================================
// PHASE 2: N-DIMENSIONAL COMBINATION SEARCH
// ================================================================
function analyze(pairs) {
  console.log(`\n${'='.repeat(70)}\n  N-DIMENSIONAL COMBINATION SEARCH (${pairs.length} pairs)\n${'='.repeat(70)}\n`);

  // Define atomic conditions
  const CONDITIONS = [
    { id:'RSI<20', fn: p => p.rsi!==null && p.rsi<20 },
    { id:'RSI<25', fn: p => p.rsi!==null && p.rsi<25 },
    { id:'RSI<30', fn: p => p.rsi!==null && p.rsi<30 },
    { id:'RSI<35', fn: p => p.rsi!==null && p.rsi<35 },
    { id:'RSI<40', fn: p => p.rsi!==null && p.rsi<40 },
    { id:'RSI>60', fn: p => p.rsi!==null && p.rsi>60 },
    { id:'RSI>65', fn: p => p.rsi!==null && p.rsi>65 },
    { id:'RSI>70', fn: p => p.rsi!==null && p.rsi>70 },
    { id:'chg<-5%', fn: p => p.chg<-5 },
    { id:'chg<-3%', fn: p => p.chg<-3 },
    { id:'chg<-1%', fn: p => p.chg<-1 },
    { id:'chg>+1%', fn: p => p.chg>1 },
    { id:'chg>+3%', fn: p => p.chg>3 },
    { id:'chg>+5%', fn: p => p.chg>5 },
    { id:'VWAP<-2%', fn: p => p.vwapDist<-2 },
    { id:'VWAP<-1%', fn: p => p.vwapDist<-1 },
    { id:'VWAP>+1%', fn: p => p.vwapDist>1 },
    { id:'VWAP>+2%', fn: p => p.vwapDist>2 },
    { id:'MACD>0', fn: p => p.macdHist!==null && p.macdHist>0 },
    { id:'MACD<0', fn: p => p.macdHist!==null && p.macdHist<0 },
    { id:'MACD_BULL_X', fn: p => p.macdTurning==='BULL_CROSS' },
    { id:'r3d<-5%', fn: p => p.r3d!==null && p.r3d<-5 },
    { id:'r3d<-3%', fn: p => p.r3d!==null && p.r3d<-3 },
    { id:'r3d>+3%', fn: p => p.r3d!==null && p.r3d>3 },
    { id:'r3d>+5%', fn: p => p.r3d!==null && p.r3d>5 },
    { id:'QQQ<-0.5%', fn: p => p.qqq<-0.5 },
    { id:'QQQ>+0.5%', fn: p => p.qqq>0.5 },
    { id:'VIXY>+2%', fn: p => p.vixy>2 },
    { id:'VIXY<-2%', fn: p => p.vixy<-2 },
    { id:'Vol>1.5x', fn: p => p.volRatio>1.5 },
    { id:'Vol>2x', fn: p => p.volRatio>2 },
    { id:'RSIvel<-15', fn: p => p.rsiVel!==null && p.rsiVel<-15 },
    { id:'RSIvel<-10', fn: p => p.rsiVel!==null && p.rsiVel<-10 },
  ];

  const HORIZONS = ['t1','t3','t5','t10','t20'];

  function evalCombo(indices) {
    const matched = pairs.filter(p => indices.every(i => CONDITIONS[i].fn(p)));
    if (matched.length < 15) return null;

    const result = { n: matched.length, label: indices.map(i=>CONDITIONS[i].id).join(' + ') };
    for (const h of HORIZONS) {
      const valid = matched.filter(p => p[h] !== undefined);
      if (valid.length < 10) continue;
      const rets = valid.map(p => p[h]);
      const avg = rets.reduce((a,b)=>a+b,0)/rets.length;
      const hit = rets.filter(r=>r>0.25).length/rets.length*100;
      result[h] = { avg: Math.round(avg*100)/100, hit: Math.round(hit*10)/10, n: valid.length };
    }
    return result;
  }

  // Systematic search: 2D, 3D, 4D, 5D
  const allResults = [];
  const N = CONDITIONS.length;

  console.log(`[2D] Testing ${N*(N-1)/2} combinations...`);
  for (let a=0;a<N;a++) for (let b=a+1;b<N;b++) {
    const r = evalCombo([a,b]);
    if (r && r.t3) allResults.push({dim:2,...r});
  }

  console.log(`[3D] Testing top 2D base + extensions...`);
  const top2D = allResults.filter(r=>r.t3&&r.t3.hit>55).sort((a,b)=>b.t3.hit-a.t3.hit).slice(0,30);
  for (const base of top2D) {
    const baseIdx = base.label.split(' + ').map(id => CONDITIONS.findIndex(c=>c.id===id));
    for (let c=0;c<N;c++) {
      if (baseIdx.includes(c)) continue;
      const r = evalCombo([...baseIdx,c]);
      if (r && r.t3) allResults.push({dim:3,...r});
    }
  }

  console.log(`[4D] Testing top 3D base + extensions...`);
  const top3D = allResults.filter(r=>r.dim===3&&r.t3&&r.t3.hit>58).sort((a,b)=>b.t3.hit-a.t3.hit).slice(0,20);
  for (const base of top3D) {
    const baseIdx = base.label.split(' + ').map(id => CONDITIONS.findIndex(c=>c.id===id));
    for (let c=0;c<N;c++) {
      if (baseIdx.includes(c)) continue;
      const r = evalCombo([...baseIdx,c]);
      if (r && r.t3) allResults.push({dim:4,...r});
    }
  }

  console.log(`[5D] Testing top 4D base + extensions...`);
  const top4D = allResults.filter(r=>r.dim===4&&r.t3&&r.t3.hit>60).sort((a,b)=>b.t3.hit-a.t3.hit).slice(0,15);
  for (const base of top4D) {
    const baseIdx = base.label.split(' + ').map(id => CONDITIONS.findIndex(c=>c.id===id));
    for (let c=0;c<N;c++) {
      if (baseIdx.includes(c)) continue;
      const r = evalCombo([...baseIdx,c]);
      if (r && r.t3) allResults.push({dim:5,...r});
    }
  }

  // REPORT
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULTS: ${allResults.length} combinations tested`);
  console.log(`${'='.repeat(70)}\n`);

  for (const dim of [2,3,4,5]) {
    const dimResults = allResults.filter(r=>r.dim===dim&&r.t3).sort((a,b)=>b.t3.hit-a.t3.hit);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  TOP ${dim}D COMBINATIONS (best T+3 hit rate)`);
    console.log(`${'─'.repeat(70)}`);

    for (const r of dimResults.slice(0,10)) {
      const horizons = HORIZONS.map(h => r[h] ? `${h}:${r[h].avg>=0?'+':''}${r[h].avg}%/${r[h].hit}%` : '').filter(Boolean).join(' | ');
      console.log(`  [n=${String(r.n).padStart(4)}] ${r.label}`);
      console.log(`         ${horizons}`);
    }
  }

  // Find THE BEST across all dimensions
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  🏆 ABSOLUTE TOP 15 — ALL DIMENSIONS`);
  console.log(`${'='.repeat(70)}`);
  const best = allResults.filter(r=>r.t3&&r.n>=15).sort((a,b)=>b.t3.hit-a.t3.hit).slice(0,15);
  for (const r of best) {
    const horizons = HORIZONS.map(h => r[h] ? `${h}:${r[h].avg>=0?'+':''}${r[h].avg}%/${r[h].hit}%` : '').filter(Boolean).join(' | ');
    console.log(`  [${r.dim}D n=${String(r.n).padStart(4)}] ${r.label}`);
    console.log(`              ${horizons}`);
  }

  // TEMPORAL OPTIMAL HORIZON
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ⏱️ OPTIMAL TIME HORIZON PER SIGNAL`);
  console.log(`${'='.repeat(70)}`);
  const topSignals = allResults.filter(r=>r.t3&&r.t3.hit>55&&r.n>=20).sort((a,b)=>b.t3.hit-a.t3.hit).slice(0,10);
  for (const r of topSignals) {
    console.log(`\n  ${r.label} (n=${r.n}):`);
    for (const h of HORIZONS) {
      if (!r[h]) continue;
      const bar = '█'.repeat(Math.round(r[h].hit/2));
      console.log(`    ${h.padEnd(4)} avg=${(r[h].avg>=0?'+':'')+r[h].avg.toFixed(2).padStart(6)}%  hit=${String(r[h].hit).padStart(5)}%  ${bar}`);
    }
  }

  // Save
  const output = { timestamp: new Date().toISOString(), totalPairs: pairs.length, totalCombos: allResults.length, top15: best };
  fs.writeFileSync('scripts/deep-analysis-results.json', JSON.stringify(output, null, 2));
  console.log(`\n✅ Results saved. ${allResults.length} combinations analyzed.`);
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  let pairs;
  if (fs.existsSync('scripts/deep-raw.json')) {
    console.log('Loading cached raw data...');
    pairs = JSON.parse(fs.readFileSync('scripts/deep-raw.json', 'utf8'));
    console.log(`Loaded ${pairs.length} pairs from cache.`);
  } else {
    pairs = await collectData();
  }
  analyze(pairs);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
