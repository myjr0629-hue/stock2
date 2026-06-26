/**
 * V8 SIMULATION BACKTEST
 * Tests what happens when we:
 * A) Remove Empirical Calibrator
 * B) Increase Catalyst weight
 * C) Invert Regime direction
 * D) Combined V8 proposal
 * 
 * Uses DynamoDB pillar-level data to re-score and compare
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAll() {
  let items = [], lastKey, c = 0;
  console.log('Scanning...');
  do {
    const r = await client.send(new ScanCommand({ TableName: 'signum-alpha-history', ExclusiveStartKey: lastKey, Limit: 5000 }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
    c++;
    if (c % 5 === 0) console.log(`  ${items.length}...`);
  } while (lastKey);
  return items;
}

function pearsonR(xs, ys) {
  const n = xs.length; if (n < 10) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
  return (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : 0;
}

// V7 Calibrator (current)
function calibrateV7(s) {
  if (s >= 80) return 80 + (s - 80) * 1.05;
  if (s >= 65) return 65 + (s - 65) * 1.1;
  if (s >= 40) return 40 + (s - 40) * 0.9;
  return s * 0.85;
}

// Score simulation configs
const CONFIGS = {
  'V7_Current': {
    desc: 'Current V7 (M25+S25+F25+R15+C10, Calibrator ON)',
    weight: { momentum: 1, structure: 1, flow: 1, regime: 1, catalyst: 1 },
    maxScore: 100,
    calibrate: true,
    invertRegime: false,
  },
  'V8a_NoCal': {
    desc: 'Remove Calibrator only',
    weight: { momentum: 1, structure: 1, flow: 1, regime: 1, catalyst: 1 },
    maxScore: 100,
    calibrate: false,
    invertRegime: false,
  },
  'V8b_CatalystUp': {
    desc: 'Catalyst 10→20, Regime 15→5 (Calibrator OFF)',
    weight: { momentum: 1, structure: 1, flow: 1, regime: 0.333, catalyst: 2 },
    maxScore: 100,
    calibrate: false,
    invertRegime: false,
  },
  'V8c_RegimeInvert': {
    desc: 'Invert Regime (15-regime), Calibrator OFF',
    weight: { momentum: 1, structure: 1, flow: 1, regime: 1, catalyst: 1 },
    maxScore: 100,
    calibrate: false,
    invertRegime: true,
  },
  'V8d_Combined': {
    desc: 'Catalyst 2x + Regime Inverted + Calibrator OFF',
    weight: { momentum: 1, structure: 1, flow: 1, regime: 0.333, catalyst: 2 },
    maxScore: 100,
    calibrate: false,
    invertRegime: true,
  },
  'V8e_CatalystMax': {
    desc: 'Catalyst 10→25 (equal to M/S/F), Regime 15→5, Calibrator OFF',
    weight: { momentum: 1, structure: 1, flow: 1, regime: 0.333, catalyst: 2.5 },
    maxScore: 100,
    calibrate: false,
    invertRegime: false,
  },
  'V8f_AllEqual': {
    desc: 'All pillars equal 20pts each, Calibrator OFF',
    weight: { momentum: 0.8, structure: 0.8, flow: 0.8, regime: 1.333, catalyst: 2 },
    maxScore: 100,
    calibrate: false,
    invertRegime: false,
  },
};

function simulateScore(rec, config) {
  const m = rec.momentum ?? null;
  const s = rec.structure ?? null;
  const f = rec.flow ?? null;
  const r = rec.regime ?? null;
  const c = rec.catalyst ?? null;
  
  if (m === null || s === null || f === null || r === null || c === null) return null;
  
  const w = config.weight;
  const regimeVal = config.invertRegime ? (15 - r) : r;
  
  let raw = m * w.momentum + s * w.structure + f * w.flow + regimeVal * w.regime + c * w.catalyst;
  raw = Math.max(0, Math.min(100, raw));
  
  if (config.calibrate) {
    raw = calibrateV7(raw);
  }
  
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function analyze(pairs, label) {
  if (pairs.length < 50) return null;
  
  const scores = pairs.map(p => p.simScore);
  const returns = pairs.map(p => p.ret3d);
  const r = pearsonR(scores, returns);
  
  // Quintile
  const sorted = [...pairs].sort((a, b) => a.simScore - b.simScore);
  const qSize = Math.floor(sorted.length / 5);
  const qs = [
    sorted.slice(0, qSize),
    sorted.slice(qSize, qSize * 2),
    sorted.slice(qSize * 2, qSize * 3),
    sorted.slice(qSize * 3, qSize * 4),
    sorted.slice(qSize * 4),
  ];
  const qNames = ['Q1(Worst)', 'Q2', 'Q3(Mid)', 'Q4', 'Q5(Best)'];
  const qStats = qs.map((q, i) => {
    const rets = q.map(p => p.ret3d);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    const sMin = Math.min(...q.map(p => p.simScore));
    const sMax = Math.max(...q.map(p => p.simScore));
    return { name: qNames[i], count: q.length, range: `${sMin}-${sMax}`, avg, win };
  });

  let mono = true;
  for (let i = 1; i < qStats.length; i++) if (qStats[i].avg < qStats[i-1].avg) mono = false;
  
  const lsSpread = qStats[4].avg - qStats[0].avg;
  const overallWin = pairs.filter(p => p.ret3d > 0).length / pairs.length * 100;
  
  // BUY/AVOID
  const buyPairs = pairs.filter(p => p.simScore >= 65);
  const buyAvg = buyPairs.length > 0 ? buyPairs.reduce((a, p) => a + p.ret3d, 0) / buyPairs.length : 0;
  const buyWin = buyPairs.length > 0 ? buyPairs.filter(p => p.ret3d > 0).length / buyPairs.length * 100 : 0;
  
  const avoidPairs = pairs.filter(p => p.simScore < 35);
  const avoidAvg = avoidPairs.length > 0 ? avoidPairs.reduce((a, p) => a + p.ret3d, 0) / avoidPairs.length : 0;
  const avoidWin = avoidPairs.length > 0 ? avoidPairs.filter(p => p.ret3d > 0).length / avoidPairs.length * 100 : 0;
  
  // Score distribution
  const std = Math.sqrt(scores.reduce((s, x) => s + (x - scores.reduce((a,b)=>a+b,0)/scores.length) ** 2, 0) / scores.length);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  return { label, n: pairs.length, r, mono, lsSpread, overallWin, qStats, scoreAvg: avg, scoreStd: std,
    buy: { n: buyPairs.length, avg: buyAvg, win: buyWin },
    avoid: { n: avoidPairs.length, avg: avoidAvg, win: avoidWin }
  };
}

async function main() {
  const allRecords = await scanAll();
  console.log(`Total: ${allRecords.length}`);

  // Build pairs with pillar data
  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    const existing = tickerMap[r.ticker][r.date];
    if (!existing || (r.timestamp || 0) > (existing.timestamp || 0)) tickerMap[r.ticker][r.date] = r;
  });

  const rawPairs = [];
  for (const ticker of Object.keys(tickerMap)) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore ?? rec.contextScore ?? null;
      const close = rec.close ?? rec.price ?? null;
      if (score == null || !close || close <= 0) continue;
      if (rec.momentum == null || rec.structure == null || rec.flow == null || rec.regime == null || rec.catalyst == null) continue;
      
      let futureClose = null;
      for (let j = i + 3; j <= Math.min(i + 5, dates.length - 1); j++) {
        const fRec = dateMap[dates[j]];
        const fClose = fRec ? (fRec.close ?? fRec.price ?? null) : null;
        if (fRec && fClose > 0) { futureClose = fClose; break; }
      }
      if (futureClose !== null) {
        rawPairs.push({
          ticker, date: dates[i],
          originalScore: score,
          momentum: rec.momentum, structure: rec.structure, flow: rec.flow,
          regime: rec.regime, catalyst: rec.catalyst,
          close, futureClose,
          ret3d: Math.round(((futureClose - close) / close) * 10000) / 100,
        });
      }
    }
  }

  console.log(`Pairs with pillar data: ${rawPairs.length}`);

  // Filter to post-V7 era
  const v7Pairs = rawPairs.filter(p => p.date >= '2026-05-21');
  const allEras = rawPairs;
  
  console.log(`Post-V7 pairs with pillars: ${v7Pairs.length}`);
  console.log(`All-era pairs with pillars: ${allEras.length}`);

  // Run each config
  console.log('\n' + '='.repeat(80));
  console.log('SIMULATION RESULTS — POST-V7 ERA (>= 2026-05-21)');
  console.log('='.repeat(80));

  const allResults = {};
  
  for (const [name, config] of Object.entries(CONFIGS)) {
    const simPairs = v7Pairs.map(p => ({
      ...p,
      simScore: simulateScore(p, config),
    })).filter(p => p.simScore !== null);

    const result = analyze(simPairs, `${name}: ${config.desc}`);
    if (!result) { console.log(`${name}: insufficient data`); continue; }
    allResults[name] = result;
    
    console.log(`\n--- ${name}: ${config.desc} ---`);
    console.log(`  N=${result.n}, r=${result.r?.toFixed(4)}, mono=${result.mono}`);
    console.log(`  Score: avg=${result.scoreAvg.toFixed(1)}, std=${result.scoreStd.toFixed(1)}`);
    console.log(`  LS-Spread: ${result.lsSpread >= 0 ? '+' : ''}${result.lsSpread.toFixed(3)}%`);
    console.log(`  Overall Win: ${result.overallWin.toFixed(1)}%`);
    console.log(`  BUY(>=65): N=${result.buy.n}, avg=${result.buy.avg.toFixed(3)}%, win=${result.buy.win.toFixed(1)}%`);
    console.log(`  AVOID(<35): N=${result.avoid.n}, avg=${result.avoid.avg.toFixed(3)}%, win=${result.avoid.win.toFixed(1)}%`);
    result.qStats.forEach(q => console.log(`    ${q.name}: ${q.range} | avg=${q.avg.toFixed(3)}% | win=${q.win.toFixed(1)}%`));
  }

  // Also run on ALL eras for comparison
  console.log('\n' + '='.repeat(80));
  console.log('SIMULATION RESULTS — ALL ERAS (2026-02-03 ~ present)');
  console.log('='.repeat(80));

  for (const [name, config] of Object.entries(CONFIGS)) {
    const simPairs = allEras.map(p => ({
      ...p,
      simScore: simulateScore(p, config),
    })).filter(p => p.simScore !== null);

    const result = analyze(simPairs, name);
    if (!result) continue;
    
    console.log(`\n--- ${name} (ALL) ---`);
    console.log(`  N=${result.n}, r=${result.r?.toFixed(4)}, mono=${result.mono}`);
    console.log(`  Score: avg=${result.scoreAvg.toFixed(1)}, std=${result.scoreStd.toFixed(1)}`);
    console.log(`  LS-Spread: ${result.lsSpread >= 0 ? '+' : ''}${result.lsSpread.toFixed(3)}%`);
    console.log(`  BUY(>=65): N=${result.buy.n}, avg=${result.buy.avg.toFixed(3)}%, win=${result.buy.win.toFixed(1)}%`);
    console.log(`  AVOID(<35): N=${result.avoid.n}, avg=${result.avoid.avg.toFixed(3)}%, win=${result.avoid.win.toFixed(1)}%`);
  }

  // COMPARISON TABLE
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON TABLE (Post-V7)');
  console.log('='.repeat(80));
  console.log('Config | r | Mono | LS-Spread | ScoreStd | BUY avg | AVOID avg');
  for (const [name, result] of Object.entries(allResults)) {
    console.log(`${name} | ${result.r?.toFixed(4)} | ${result.mono} | ${result.lsSpread >= 0 ? '+' : ''}${result.lsSpread.toFixed(3)}% | ${result.scoreStd.toFixed(1)} | ${result.buy.avg >= 0 ? '+' : ''}${result.buy.avg.toFixed(3)}% | ${result.avoid.avg >= 0 ? '+' : ''}${result.avoid.avg.toFixed(3)}%`);
  }
}

main().catch(console.error);
