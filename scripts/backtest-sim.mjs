#!/usr/bin/env node
// ============================================================================
// ALPHA ENGINE HISTORICAL SIMULATION — 2년치 Polygon 데이터 기반
// Node.js 18+ (fetch 내장) 로컬 실행 전용
// Usage: node scripts/backtest-sim.mjs
// ============================================================================

const API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE = 'https://api.polygon.io';

// 50 tickers across sectors
const TICKERS = [
  // M7
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA',
  // Semis
  'AMD','INTC','AVGO','QCOM','MU','MRVL',
  // Fintech/Finance
  'JPM','GS','V','MA','COIN','SQ','PYPL',
  // Healthcare
  'UNH','JNJ','LLY','MRNA','ABBV',
  // Consumer
  'DIS','NFLX','SHOP','UBER','RIVN',
  // Industrial/Energy
  'BA','LMT','XOM','CVX','CAT',
  // Tech
  'CRM','ORCL','ADBE','NOW','SNOW',
  // Retail
  'WMT','COST','TGT','HD',
  // Other
  'KO','PEP','NKE','MCD','PG','ABNB'
];

// Regime tickers
const REGIME_TICKERS = ['QQQ','VIXY','TLT','GLD'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await sleep(2000 * (i+1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { await sleep(1000); }
  }
  return null;
}

// Fetch 2 years of daily bars
async function getDailyBars(ticker, from, to) {
  const url = `${BASE}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=600&apiKey=${API_KEY}`;
  const data = await fetchJSON(url);
  return data?.results || [];
}

// Fetch RSI
async function getRSI(ticker, limit=600) {
  const url = `${BASE}/v1/indicators/rsi/${ticker}?timespan=day&window=14&series_type=close&limit=${limit}&order=asc&apiKey=${API_KEY}`;
  const all = [];
  let nextUrl = url;
  while (nextUrl) {
    const data = await fetchJSON(nextUrl);
    if (!data?.results?.values) break;
    all.push(...data.results.values);
    nextUrl = data.next_url ? `${data.next_url}&apiKey=${API_KEY}` : null;
    if (nextUrl) await sleep(100);
  }
  return all;
}

// Fetch MACD
async function getMACD(ticker, limit=600) {
  const url = `${BASE}/v1/indicators/macd/${ticker}?timespan=day&short_window=12&long_window=26&signal_window=9&series_type=close&limit=${limit}&order=asc&apiKey=${API_KEY}`;
  const all = [];
  let nextUrl = url;
  while (nextUrl) {
    const data = await fetchJSON(nextUrl);
    if (!data?.results?.values) break;
    all.push(...data.results.values);
    nextUrl = data.next_url ? `${data.next_url}&apiKey=${API_KEY}` : null;
    if (nextUrl) await sleep(100);
  }
  return all;
}

function tsToDate(ts) { return new Date(ts).toISOString().split('T')[0]; }

function pearson(x, y) {
  const n = x.length;
  if (n < 5) return 0;
  const mx = x.reduce((a,b)=>a+b,0)/n, my = y.reduce((a,b)=>a+b,0)/n;
  let num=0, dx2=0, dy2=0;
  for (let i=0;i<n;i++) { const a=x[i]-mx, b=y[i]-my; num+=a*b; dx2+=a*a; dy2+=b*b; }
  const den = Math.sqrt(dx2*dy2);
  return den===0 ? 0 : Math.round(num/den*10000)/10000;
}

function bucketAnalysis(pairs, factorKey, buckets) {
  return buckets.map(b => {
    const inBucket = pairs.filter(p => p[factorKey] >= b.min && p[factorKey] < b.max);
    if (!inBucket.length) return { ...b, count: 0, avgReturn: 0, hitRate: 0 };
    const rets = inBucket.map(p => p.fwdReturn);
    const pos = rets.filter(r => r > 0.25).length;
    return {
      ...b,
      count: inBucket.length,
      avgReturn: Math.round(rets.reduce((a,b)=>a+b,0)/rets.length * 100)/100,
      hitRate: Math.round(pos/inBucket.length*1000)/10,
    };
  });
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const FROM = '2024-01-01';
  const TO = '2026-05-08';
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ALPHA ENGINE HISTORICAL SIMULATION`);
  console.log(`  Period: ${FROM} → ${TO} | Tickers: ${TICKERS.length}`);
  console.log(`${'='.repeat(70)}\n`);

  // Phase 1: Fetch regime data
  console.log('[Phase 1] Fetching regime data...');
  const regimeData = {};
  for (const rt of REGIME_TICKERS) {
    const bars = await getDailyBars(rt, FROM, TO);
    regimeData[rt] = {};
    for (let i=1; i<bars.length; i++) {
      const date = tsToDate(bars[i].t);
      regimeData[rt][date] = {
        close: bars[i].c,
        changePct: ((bars[i].c - bars[i-1].c) / bars[i-1].c) * 100,
      };
    }
    console.log(`  ${rt}: ${Object.keys(regimeData[rt]).length} days`);
    await sleep(200);
  }

  // Phase 2: Fetch ticker data
  console.log('\n[Phase 2] Fetching ticker data...');
  const allPairs = [];
  let tickersDone = 0;

  for (const ticker of TICKERS) {
    tickersDone++;
    process.stdout.write(`  [${tickersDone}/${TICKERS.length}] ${ticker}...`);

    const bars = await getDailyBars(ticker, FROM, TO);
    if (bars.length < 30) { console.log(' skip (insufficient data)'); await sleep(100); continue; }

    await sleep(150);
    const rsiData = await getRSI(ticker);
    await sleep(150);
    const macdData = await getMACD(ticker);
    await sleep(150);

    // Index by date
    const barsByDate = {};
    bars.forEach((b, i) => {
      const d = tsToDate(b.t);
      barsByDate[d] = { ...b, idx: i };
    });

    const rsiByDate = {};
    rsiData.forEach(r => { rsiByDate[tsToDate(r.timestamp)] = r.value; });
    const macdByDate = {};
    macdData.forEach(m => { macdByDate[tsToDate(m.timestamp)] = m; });

    // Build factor rows + T+3 forward return
    let pairsForTicker = 0;
    for (let i = 4; i < bars.length - 3; i++) {
      const today = bars[i];
      const prev = bars[i-1];
      const d3ago = bars[i-3];
      const d3fwd = bars[i+3];
      const date = tsToDate(today.t);

      if (!prev || !d3ago || !d3fwd || prev.c <= 0 || d3ago.c <= 0 || d3fwd.c <= 0 || today.c <= 0) continue;

      const changePct = ((today.c - prev.c) / prev.c) * 100;
      const return3D = ((today.c - d3ago.c) / d3ago.c) * 100;
      const fwdReturn = ((d3fwd.c - today.c) / today.c) * 100;
      if (Math.abs(fwdReturn) > 30) continue; // outlier filter

      const vwapDist = today.vw > 0 ? ((today.c - today.vw) / today.vw) * 100 : 0;
      const rsi = rsiByDate[date] ?? null;
      const macd = macdByDate[date] ?? null;
      const macdHist = macd?.histogram ?? null;

      // Regime
      const qqq = regimeData['QQQ']?.[date];
      const vixy = regimeData['VIXY']?.[date];
      const tlt = regimeData['TLT']?.[date];
      const gld = regimeData['GLD']?.[date];

      allPairs.push({
        ticker, date, changePct, return3D, fwdReturn,
        vwapDist, rsi, macdHist,
        qqq: qqq?.changePct ?? 0,
        vixy: vixy?.changePct ?? 0,
        tlt: tlt?.changePct ?? 0,
        gld: gld?.changePct ?? 0,
        price: today.c,
        volume: today.v,
      });
      pairsForTicker++;
    }
    console.log(` ${pairsForTicker} pairs`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Total T+3 pairs: ${allPairs.length}`);
  console.log(`${'='.repeat(70)}\n`);

  // Phase 3: Statistical Analysis
  console.log('[Phase 3] Factor Analysis\n');

  const factors = [
    { key: 'changePct', label: '당일변동률(%)' },
    { key: 'return3D', label: '3일수익률(%)' },
    { key: 'vwapDist', label: 'VWAP거리(%)' },
    { key: 'rsi', label: 'RSI(14)' },
    { key: 'macdHist', label: 'MACD Histogram' },
    { key: 'qqq', label: 'QQQ변동률(%)' },
    { key: 'vixy', label: 'VIXY변동률(%)' },
    { key: 'tlt', label: 'TLT변동률(%)' },
    { key: 'gld', label: 'GLD변동률(%)' },
  ];

  const factorResults = {};
  for (const f of factors) {
    const valid = allPairs.filter(p => p[f.key] !== null && p[f.key] !== undefined);
    const xs = valid.map(p => p[f.key]);
    const ys = valid.map(p => p.fwdReturn);
    const r = pearson(xs, ys);
    factorResults[f.key] = { label: f.label, r, n: valid.length };
    console.log(`  ${f.label.padEnd(20)} r=${(r>=0?'+':'')+r.toFixed(4).padStart(7)}  (n=${valid.length})`);
  }

  // Phase 4: Bucketed Analysis — the key insight
  console.log('\n[Phase 4] Bucketed Factor Analysis\n');

  // changePct buckets
  console.log('--- changePct vs T+3 Return ---');
  const chgBuckets = bucketAnalysis(allPairs, 'changePct', [
    { label: '<-5%', min: -999, max: -5 },
    { label: '-5~-3%', min: -5, max: -3 },
    { label: '-3~-1%', min: -3, max: -1 },
    { label: '-1~0%', min: -1, max: 0 },
    { label: '0~+1%', min: 0, max: 1 },
    { label: '+1~+3%', min: 1, max: 3 },
    { label: '+3~+5%', min: 3, max: 5 },
    { label: '>+5%', min: 5, max: 999 },
  ]);
  chgBuckets.forEach(b => console.log(`  ${b.label.padEnd(10)} n=${String(b.count).padStart(5)}  avg=${(b.avgReturn>=0?'+':'')+b.avgReturn.toFixed(2).padStart(6)}%  hit=${String(b.hitRate).padStart(5)}%`));

  // RSI buckets
  console.log('\n--- RSI vs T+3 Return ---');
  const rsiValid = allPairs.filter(p => p.rsi !== null);
  const rsiBuckets = bucketAnalysis(rsiValid, 'rsi', [
    { label: '<25', min: 0, max: 25 },
    { label: '25-35', min: 25, max: 35 },
    { label: '35-45', min: 35, max: 45 },
    { label: '45-55', min: 45, max: 55 },
    { label: '55-65', min: 55, max: 65 },
    { label: '65-75', min: 65, max: 75 },
    { label: '>75', min: 75, max: 100 },
  ]);
  rsiBuckets.forEach(b => console.log(`  ${b.label.padEnd(10)} n=${String(b.count).padStart(5)}  avg=${(b.avgReturn>=0?'+':'')+b.avgReturn.toFixed(2).padStart(6)}%  hit=${String(b.hitRate).padStart(5)}%`));

  // return3D buckets
  console.log('\n--- return3D vs T+3 Return ---');
  const r3dBuckets = bucketAnalysis(allPairs, 'return3D', [
    { label: '<-5%', min: -999, max: -5 },
    { label: '-5~-3%', min: -5, max: -3 },
    { label: '-3~-1%', min: -3, max: -1 },
    { label: '-1~0%', min: -1, max: 0 },
    { label: '0~+1%', min: 0, max: 1 },
    { label: '+1~+3%', min: 1, max: 3 },
    { label: '+3~+5%', min: 3, max: 5 },
    { label: '>+5%', min: 5, max: 999 },
  ]);
  r3dBuckets.forEach(b => console.log(`  ${b.label.padEnd(10)} n=${String(b.count).padStart(5)}  avg=${(b.avgReturn>=0?'+':'')+b.avgReturn.toFixed(2).padStart(6)}%  hit=${String(b.hitRate).padStart(5)}%`));

  // MACD histogram buckets
  console.log('\n--- MACD Histogram vs T+3 Return ---');
  const macdValid = allPairs.filter(p => p.macdHist !== null);
  const macdBuckets = bucketAnalysis(macdValid, 'macdHist', [
    { label: '<-2', min: -999, max: -2 },
    { label: '-2~-1', min: -2, max: -1 },
    { label: '-1~0', min: -1, max: 0 },
    { label: '0~+1', min: 0, max: 1 },
    { label: '+1~+2', min: 1, max: 2 },
    { label: '>+2', min: 2, max: 999 },
  ]);
  macdBuckets.forEach(b => console.log(`  ${b.label.padEnd(10)} n=${String(b.count).padStart(5)}  avg=${(b.avgReturn>=0?'+':'')+b.avgReturn.toFixed(2).padStart(6)}%  hit=${String(b.hitRate).padStart(5)}%`));

  // Phase 5: Interaction Effects — the spider web
  console.log('\n[Phase 5] Interaction Effects (Spider Web)\n');

  const interactions = [
    { label: 'RSI<30 + changePct<-2%', filter: p => p.rsi!==null && p.rsi<30 && p.changePct<-2 },
    { label: 'RSI<30 + changePct>0%', filter: p => p.rsi!==null && p.rsi<30 && p.changePct>0 },
    { label: 'RSI>70 + changePct>+2%', filter: p => p.rsi!==null && p.rsi>70 && p.changePct>2 },
    { label: 'RSI>70 + changePct<0%', filter: p => p.rsi!==null && p.rsi>70 && p.changePct<0 },
    { label: 'MACD>0 + RSI<40 (reversal)', filter: p => p.macdHist!==null && p.macdHist>0 && p.rsi!==null && p.rsi<40 },
    { label: 'MACD<0 + RSI>60 (exhaust)', filter: p => p.macdHist!==null && p.macdHist<0 && p.rsi!==null && p.rsi>60 },
    { label: 'Dip(-3%) + VIXY↓(fear easing)', filter: p => p.changePct<-3 && p.vixy<0 },
    { label: 'Surge(+3%) + VIXY↑(fear rising)', filter: p => p.changePct>3 && p.vixy>0 },
    { label: 'return3D<-5% + QQQ>0% (sector rot)', filter: p => p.return3D<-5 && p.qqq>0 },
    { label: 'return3D>+5% + QQQ<0% (divergence)', filter: p => p.return3D>5 && p.qqq<0 },
    { label: 'VWAP>+2% + RSI>65 (overextended)', filter: p => p.vwapDist>2 && p.rsi!==null && p.rsi>65 },
    { label: 'VWAP<-2% + RSI<35 (oversold)', filter: p => p.vwapDist<-2 && p.rsi!==null && p.rsi<35 },
  ];

  for (const ix of interactions) {
    const matched = allPairs.filter(ix.filter);
    if (matched.length < 10) { console.log(`  ${ix.label}: n=${matched.length} (insufficient)`); continue; }
    const rets = matched.map(p => p.fwdReturn);
    const avg = rets.reduce((a,b)=>a+b,0)/rets.length;
    const hit = rets.filter(r=>r>0.25).length/rets.length*100;
    console.log(`  ${ix.label.padEnd(45)} n=${String(matched.length).padStart(5)}  avg=${(avg>=0?'+':'')+avg.toFixed(2).padStart(6)}%  hit=${hit.toFixed(1).padStart(5)}%`);
  }

  // Phase 6: Regime Conditioning
  console.log('\n[Phase 6] Regime Conditioning\n');
  const bullDays = allPairs.filter(p => p.qqq > 0.5);
  const bearDays = allPairs.filter(p => p.qqq < -0.5);
  const flatDays = allPairs.filter(p => p.qqq >= -0.5 && p.qqq <= 0.5);
  console.log(`  Bull(QQQ>+0.5%): n=${bullDays.length} avg=${(bullDays.reduce((a,p)=>a+p.fwdReturn,0)/bullDays.length).toFixed(3)}%`);
  console.log(`  Bear(QQQ<-0.5%): n=${bearDays.length} avg=${(bearDays.reduce((a,p)=>a+p.fwdReturn,0)/bearDays.length).toFixed(3)}%`);
  console.log(`  Flat(±0.5%):     n=${flatDays.length} avg=${(flatDays.reduce((a,p)=>a+p.fwdReturn,0)/flatDays.length).toFixed(3)}%`);

  // changePct effect in each regime
  for (const [label, subset] of [['BULL', bullDays], ['BEAR', bearDays]]) {
    console.log(`\n  --- changePct in ${label} regime ---`);
    const sub = bucketAnalysis(subset, 'changePct', [
      { label: '<-3%', min: -999, max: -3 },
      { label: '-3~0%', min: -3, max: 0 },
      { label: '0~+3%', min: 0, max: 3 },
      { label: '>+3%', min: 3, max: 999 },
    ]);
    sub.forEach(b => console.log(`    ${b.label.padEnd(10)} n=${String(b.count).padStart(5)}  avg=${(b.avgReturn>=0?'+':'')+b.avgReturn.toFixed(2).padStart(6)}%  hit=${String(b.hitRate).padStart(5)}%`));
  }

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    totalPairs: allPairs.length,
    period: { from: FROM, to: TO },
    tickers: TICKERS.length,
    factorCorrelations: factorResults,
    changePctBuckets: chgBuckets,
    rsiBuckets,
    return3DBuckets: r3dBuckets,
    macdBuckets,
  };

  const fs = await import('fs');
  fs.writeFileSync('scripts/backtest-sim-results.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Results saved to scripts/backtest-sim-results.json');
  console.log(`\n${'='.repeat(70)}`);
  console.log('  SIMULATION COMPLETE');
  console.log(`${'='.repeat(70)}\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
