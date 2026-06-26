/**
 * Alpha Engine — PRECISION VERSION-BY-VERSION BACKTEST
 * Multi-period (T+1, T+3, T+5, T+10), version-split, factor-level analysis
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

// Version date boundaries
const VERSION_CUTS = [
  { label: 'V4.6 Era', from: '2026-02-03', to: '2026-03-20' },
  { label: 'V5/V6 Transition', from: '2026-03-21', to: '2026-05-20' },
  { label: 'V7 Era', from: '2026-05-21', to: '2026-06-30' },
];

const HORIZONS = [1, 3, 5, 10]; // T+N days

async function scanAll() {
  let items = [], lastKey, c = 0;
  console.log('Scanning signum-alpha-history...');
  do {
    const r = await client.send(new ScanCommand({ TableName: 'signum-alpha-history', ExclusiveStartKey: lastKey, Limit: 5000 }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
    c++;
    if (c % 5 === 0) console.log(`  ${items.length} items...`);
  } while (lastKey);
  return items;
}

function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 10) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : 0;
}

function quintileAnalysis(pairs, returnKey) {
  if (pairs.length < 50) return null;
  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  const qSize = Math.floor(sorted.length / 5);
  const quintiles = [
    { name: 'Q1(Worst)', data: sorted.slice(0, qSize) },
    { name: 'Q2', data: sorted.slice(qSize, qSize * 2) },
    { name: 'Q3(Mid)', data: sorted.slice(qSize * 2, qSize * 3) },
    { name: 'Q4', data: sorted.slice(qSize * 3, qSize * 4) },
    { name: 'Q5(Best)', data: sorted.slice(qSize * 4) },
  ];

  return quintiles.map(q => {
    const rets = q.data.map(d => d[returnKey]).filter(r => r != null);
    if (rets.length === 0) return { name: q.name, count: 0, avg: 0, med: 0, win: 0, sharpe: 0, range: '' };
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    rets.sort((a, b) => a - b);
    const med = rets[Math.floor(rets.length / 2)];
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    const sMin = Math.min(...q.data.map(d => d.score));
    const sMax = Math.max(...q.data.map(d => d.score));
    return { name: q.name, count: rets.length, range: `${sMin}-${sMax}`, avg, med, win, sharpe: std > 0 ? avg / std : 0 };
  });
}

function decileAnalysis(pairs, returnKey) {
  if (pairs.length < 100) return null;
  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  const dSize = Math.floor(sorted.length / 10);
  const deciles = [];
  for (let i = 0; i < 10; i++) {
    const data = i < 9 ? sorted.slice(dSize * i, dSize * (i + 1)) : sorted.slice(dSize * 9);
    const rets = data.map(d => d[returnKey]).filter(r => r != null);
    if (rets.length === 0) { deciles.push({ name: `D${i+1}`, count: 0, avg: 0, win: 0, range: '' }); continue; }
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    const sMin = Math.min(...data.map(d => d.score));
    const sMax = Math.max(...data.map(d => d.score));
    deciles.push({ name: `D${i+1}`, count: rets.length, range: `${sMin}-${sMax}`, avg, win });
  }
  return deciles;
}

function gradeAnalysis(pairs, returnKey) {
  const grades = {};
  pairs.forEach(d => {
    const g = d.grade || 'N/A';
    if (!grades[g]) grades[g] = [];
    grades[g].push(d);
  });
  return Object.keys(grades).map(g => {
    const items = grades[g];
    const rets = items.map(d => d[returnKey]).filter(r => r != null);
    if (rets.length === 0) return { grade: g, count: 0, avg: 0, win: 0 };
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    return { grade: g, count: rets.length, avg, win };
  }).sort((a, b) => b.avg - a.avg);
}

function scoreRangeAnalysis(pairs, returnKey) {
  const ranges = [
    { name: '0-25 (F)', min: 0, max: 25 },
    { name: '25-40 (D)', min: 25, max: 40 },
    { name: '40-55 (C)', min: 40, max: 55 },
    { name: '55-70 (B)', min: 55, max: 70 },
    { name: '70-85 (A)', min: 70, max: 85 },
    { name: '85-100 (S)', min: 85, max: 100 },
  ];
  return ranges.map(r => {
    const items = pairs.filter(d => d.score >= r.min && d.score < r.max);
    const rets = items.map(d => d[returnKey]).filter(v => v != null);
    if (rets.length === 0) return { ...r, count: 0, avg: 0, win: 0 };
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = rets.filter(v => v > 0).length / rets.length * 100;
    return { ...r, count: rets.length, avg, win };
  });
}

// Analyze factor-level predictiveness
function factorAnalysis(pairs, returnKey) {
  const factors = ['rsi14', 'darkPoolPct', 'whaleIndex', 'squeezeScore', 'shortVolPct', 'relVol'];
  const results = [];
  for (const f of factors) {
    const valid = pairs.filter(d => d[f] != null && d[returnKey] != null);
    if (valid.length < 50) continue;
    const r = pearsonR(valid.map(d => d[f]), valid.map(d => d[returnKey]));
    results.push({ factor: f, n: valid.length, r });
  }
  return results;
}

// Long-short spread: Q5 avg - Q1 avg
function longShortSpread(qStats) {
  if (!qStats || qStats.length < 5) return null;
  return qStats[4].avg - qStats[0].avg;
}

async function main() {
  const allRecords = await scanAll();
  console.log(`Total records: ${allRecords.length}`);

  // Build ticker→date→record map (dedup)
  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    const existing = tickerMap[r.ticker][r.date];
    if (!existing || (r.timestamp || 0) > (existing.timestamp || 0)) tickerMap[r.ticker][r.date] = r;
  });

  // Build multi-horizon pairs
  const allPairs = [];
  for (const ticker of Object.keys(tickerMap)) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore ?? rec.contextScore ?? null;
      const close = rec.close ?? rec.price ?? null;
      if (score == null || !close || close <= 0) continue;

      const pair = {
        ticker, date: dates[i], score,
        grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
        close,
        rsi14: rec.rsi14 ?? null,
        darkPoolPct: rec.darkPoolPct ?? null,
        whaleIndex: rec.whaleIndex ?? null,
        squeezeScore: rec.squeezeScore ?? null,
        shortVolPct: rec.shortVolPct ?? null,
        relVol: rec.relVol ?? null,
        momentum: rec.momentum ?? null,
        structure: rec.structure ?? null,
        flow: rec.flow ?? null,
        regime: rec.regime ?? null,
        catalyst: rec.catalyst ?? null,
      };

      // Calculate returns for each horizon
      for (const h of HORIZONS) {
        let futureClose = null;
        // Allow range [h, h+2] for trading day gaps
        for (let j = i + h; j <= Math.min(i + h + 2, dates.length - 1); j++) {
          const fRec = dateMap[dates[j]];
          const fClose = fRec ? (fRec.close ?? fRec.price ?? null) : null;
          if (fRec && fClose > 0) { futureClose = fClose; break; }
        }
        pair[`ret${h}d`] = futureClose !== null ? Math.round(((futureClose - close) / close) * 10000) / 100 : null;
      }

      if (pair.ret3d !== null) allPairs.push(pair);
    }
  }

  console.log(`Total pairs with T+3: ${allPairs.length}`);

  // Score distribution by version era
  console.log('\n=== SCORE DISTRIBUTIONS ===');
  for (const v of VERSION_CUTS) {
    const vPairs = allPairs.filter(p => p.date >= v.from && p.date <= v.to);
    const scores = vPairs.map(p => p.score);
    if (scores.length === 0) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((s, x) => s + (x - avg) ** 2, 0) / scores.length);
    const bins = {};
    for (let b = 0; b < 100; b += 10) bins[`${b}-${b+10}`] = scores.filter(s => s >= b && s < b + 10).length;
    console.log(`\n${v.label} (${v.from}~${v.to}): N=${scores.length}, avg=${avg.toFixed(1)}, std=${std.toFixed(1)}, min=${Math.min(...scores)}, max=${Math.max(...scores)}`);
    Object.entries(bins).forEach(([k, c]) => {
      if (c > 0) console.log(`  ${k}: ${c} (${(c/scores.length*100).toFixed(1)}%)`);
    });
  }

  // Main analysis per version era × horizon
  const results = {};
  for (const v of VERSION_CUTS) {
    const vPairs = allPairs.filter(p => p.date >= v.from && p.date <= v.to);
    console.log(`\n========== ${v.label} (N=${vPairs.length}) ==========`);
    
    results[v.label] = {};
    
    for (const h of HORIZONS) {
      const key = `ret${h}d`;
      const validPairs = vPairs.filter(p => p[key] != null);
      if (validPairs.length < 50) {
        console.log(`  T+${h}: N=${validPairs.length} (insufficient)`);
        continue;
      }
      
      const r = pearsonR(validPairs.map(p => p.score), validPairs.map(p => p[key]));
      const qStats = quintileAnalysis(validPairs, key);
      const dStats = decileAnalysis(validPairs, key);
      const gStats = gradeAnalysis(validPairs, key);
      const sRange = scoreRangeAnalysis(validPairs, key);
      const lsSpread = longShortSpread(qStats);
      
      const overallRets = validPairs.map(p => p[key]);
      const overallAvg = overallRets.reduce((a, b) => a + b, 0) / overallRets.length;
      const overallWin = overallRets.filter(r => r > 0).length / overallRets.length * 100;

      let mono = true;
      if (qStats) for (let i = 1; i < qStats.length; i++) if (qStats[i].avg < qStats[i-1].avg) mono = false;
      
      results[v.label][`T+${h}`] = { n: validPairs.length, r, mono, lsSpread, overallAvg, overallWin, qStats, dStats, gStats, sRange };
      
      console.log(`  T+${h}: N=${validPairs.length}, r=${r?.toFixed(4)}, mono=${mono}, LS-spread=${lsSpread?.toFixed(3)}%, mktAvg=${overallAvg.toFixed(3)}%, mktWin=${overallWin.toFixed(1)}%`);
      if (qStats) qStats.forEach(q => console.log(`    ${q.name}: ${q.range} | avg=${q.avg.toFixed(3)}% | win=${q.win.toFixed(1)}% | sharpe=${q.sharpe.toFixed(3)}`));
    }
    
    // Factor analysis for T+3
    const factorResult = factorAnalysis(vPairs, 'ret3d');
    if (factorResult.length > 0) {
      console.log('  Factor correlations (T+3):');
      factorResult.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).forEach(f => {
        console.log(`    ${f.factor}: r=${f.r?.toFixed(4)} (N=${f.n})`);
      });
      results[v.label].factors = factorResult;
    }

    // Pillar analysis for T+3 (momentum, structure, flow, regime, catalyst)
    const pillars = ['momentum', 'structure', 'flow', 'regime', 'catalyst'];
    const pillarResults = [];
    for (const p of pillars) {
      const valid = vPairs.filter(d => d[p] != null && d.ret3d != null);
      if (valid.length < 50) continue;
      const r = pearsonR(valid.map(d => d[p]), valid.map(d => d.ret3d));
      pillarResults.push({ pillar: p, n: valid.length, r });
    }
    if (pillarResults.length > 0) {
      console.log('  Pillar correlations (T+3):');
      pillarResults.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).forEach(f => {
        console.log(`    ${f.pillar}: r=${f.r?.toFixed(4)} (N=${f.n})`);
      });
      results[v.label].pillars = pillarResults;
    }
  }

  // Monthly breakdown for V7 era
  console.log('\n========== V7 ERA MONTHLY BREAKDOWN ==========');
  const v7Pairs = allPairs.filter(p => p.date >= '2026-05-21');
  const months = {};
  v7Pairs.forEach(p => {
    const m = p.date.slice(0, 7);
    if (!months[m]) months[m] = [];
    months[m].push(p);
  });
  for (const [m, mPairs] of Object.entries(months).sort()) {
    const valid = mPairs.filter(p => p.ret3d != null);
    if (valid.length < 30) { console.log(`${m}: N=${valid.length} (insufficient)`); continue; }
    const r = pearsonR(valid.map(p => p.score), valid.map(p => p.ret3d));
    const qStats = quintileAnalysis(valid, 'ret3d');
    const ls = longShortSpread(qStats);
    const avg = valid.map(p => p.ret3d).reduce((a, b) => a + b, 0) / valid.length;
    console.log(`${m}: N=${valid.length}, r=${r?.toFixed(4)}, LS=${ls?.toFixed(3)}%, mktAvg=${avg.toFixed(3)}%`);
    if (qStats) qStats.forEach(q => console.log(`  ${q.name}: avg=${q.avg.toFixed(3)}%, win=${q.win.toFixed(1)}%`));
  }

  // === COMPARATIVE SUMMARY ===
  console.log('\n========== COMPARATIVE SUMMARY ==========');
  console.log('Version | Horizon | N | Pearson r | Mono | LS-Spread | MktWin%');
  for (const v of VERSION_CUTS) {
    for (const h of HORIZONS) {
      const d = results[v.label]?.[`T+${h}`];
      if (!d) continue;
      console.log(`${v.label} | T+${h} | ${d.n} | ${d.r?.toFixed(4)} | ${d.mono} | ${d.lsSpread?.toFixed(3)}% | ${d.overallWin?.toFixed(1)}%`);
    }
  }

  // Write JSON results for further analysis
  const outPath = 'C:\\Users\\seamo\\.gemini\\antigravity\\brain\\59556e1d-65b3-42f3-9761-66893d1fae0a\\scratch\\backtest_precision_results.json';
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nJSON results saved to ${outPath}`);
}

main().catch(console.error);
