/**
 * Alpha Engine V5.0 — DEEP BACKTEST (Manual 3-day return computation)
 * 
 * Problem: Only 75 records have pre-computed return_3d
 * Solution: Compute 3-day returns manually from close prices across dates
 * 
 * Logic: For each (ticker, date) with alphaScore, find the close price 3 trading days later
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAll(tableName) {
  let items = [];
  let lastKey = undefined;
  do {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      Limit: 5000,
    }));
    items = items.concat(result.Items || []);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ALPHA ENGINE V5.0 — DEEP BACKTEST ANALYSIS');
  console.log('  Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  const allRecords = await scanAll('signum-alpha-history');
  console.log(`Total records scanned: ${allRecords.length}`);

  // Build ticker→date→record map
  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    // Keep the latest version for each date
    const existing = tickerMap[r.ticker][r.date];
    if (!existing || (r.timestamp || 0) > (existing.timestamp || 0)) {
      tickerMap[r.ticker][r.date] = r;
    }
  });

  const tickers = Object.keys(tickerMap);
  console.log(`Unique tickers: ${tickers.length}`);
  
  // Get sorted unique dates per ticker
  const allDatesSet = new Set();
  allRecords.forEach(r => r.date && allDatesSet.add(r.date));
  const allDates = [...allDatesSet].sort();
  console.log(`Date range: ${allDates[0]} → ${allDates[allDates.length - 1]} (${allDates.length} unique dates)\n`);

  // Build analysis pairs: (ticker, date, alphaScore, return_3d)
  const pairs = [];
  for (const ticker of tickers) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore ?? rec.contextScore ?? null;
      const close = rec.close;
      
      if (score === null || score === undefined || !close || close <= 0) continue;
      
      // Find close price 3 trading days later
      let futureClose = null;
      let futureDate = null;
      for (let j = i + 3; j <= Math.min(i + 5, dates.length - 1); j++) {
        const fRec = dateMap[dates[j]];
        if (fRec && fRec.close > 0) {
          futureClose = fRec.close;
          futureDate = dates[j];
          break;
        }
      }
      
      if (futureClose !== null) {
        const return3d = ((futureClose - close) / close) * 100;
        pairs.push({
          ticker,
          date: dates[i],
          score,
          grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
          action: rec.alphaAction || rec.action || 'N/A',
          close,
          futureClose,
          futureDate,
          return3d: Math.round(return3d * 100) / 100,
        });
      }
    }
  }

  console.log(`Analysis pairs (score + 3d return): ${pairs.length}\n`);

  if (pairs.length < 30) {
    console.log('❌ Insufficient data for meaningful analysis.');
    return;
  }

  // ═══ ANALYSIS ═══

  // A. Score Quintile Analysis
  console.log('══════════════════════════════════════════════');
  console.log('A. SCORE QUINTILE → 3-DAY FORWARD RETURN');
  console.log('══════════════════════════════════════════════');
  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  const qSize = Math.floor(sorted.length / 5);
  
  const quintiles = [
    { name: 'Q1 (Worst)', data: sorted.slice(0, qSize) },
    { name: 'Q2', data: sorted.slice(qSize, qSize * 2) },
    { name: 'Q3 (Mid)', data: sorted.slice(qSize * 2, qSize * 3) },
    { name: 'Q4', data: sorted.slice(qSize * 3, qSize * 4) },
    { name: 'Q5 (Best)', data: sorted.slice(qSize * 4) },
  ];

  console.log('Quintile     | N    | Score Range | Avg Ret  | Med Ret  | Win%   | Sharpe');
  console.log('-------------|------|------------|----------|----------|--------|-------');
  
  for (const q of quintiles) {
    const rets = q.data.map(d => d.return3d).sort((a, b) => a - b);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const med = rets[Math.floor(rets.length / 2)];
    const win = (rets.filter(r => r > 0).length / rets.length * 100);
    const sMin = Math.min(...q.data.map(d => d.score));
    const sMax = Math.max(...q.data.map(d => d.score));
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    const sharpe = std > 0 ? avg / std : 0;
    
    console.log(`  ${q.name.padEnd(11)} | ${String(q.data.length).padEnd(4)} | ${sMin}-${String(sMax).padEnd(7)} | ${(avg >= 0 ? '+' : '') + avg.toFixed(2) + '%'}`.padEnd(52) + 
      ` | ${(med >= 0 ? '+' : '') + med.toFixed(2) + '%'}`.padEnd(11) +
      `| ${win.toFixed(1)}%`.padEnd(8) + `| ${sharpe.toFixed(3)}`);
  }

  // B. Grade Analysis
  console.log('\n══════════════════════════════════════════════');
  console.log('B. GRADE → 3-DAY FORWARD RETURN');
  console.log('══════════════════════════════════════════════');
  const grades = {};
  pairs.forEach(d => {
    const g = d.grade || 'N/A';
    if (!grades[g]) grades[g] = [];
    grades[g].push(d);
  });

  console.log('Grade | N     | Avg Return | Med Return | Win%   | Avg Score');
  console.log('------|-------|------------|------------|--------|----------');
  
  for (const g of ['S', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'C-', 'D', 'F', 'N/A']) {
    if (!grades[g] || grades[g].length < 5) continue;
    const items = grades[g];
    const rets = items.map(d => d.return3d).sort((a, b) => a - b);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const med = rets[Math.floor(rets.length / 2)];
    const win = (rets.filter(r => r > 0).length / rets.length * 100);
    const avgScore = items.reduce((a, d) => a + d.score, 0) / items.length;
    
    console.log(`  ${g.padEnd(3)}  | ${String(items.length).padEnd(5)} | ${(avg >= 0 ? '+' : '') + avg.toFixed(2) + '%'}`.padEnd(38) +
      ` | ${(med >= 0 ? '+' : '') + med.toFixed(2) + '%'}`.padEnd(13) +
      `| ${win.toFixed(1)}%`.padEnd(8) + `| ${avgScore.toFixed(0)}`);
  }

  // C. Action-based Analysis
  console.log('\n══════════════════════════════════════════════');
  console.log('C. ACTION → 3-DAY FORWARD RETURN');
  console.log('══════════════════════════════════════════════');
  const actions = {};
  pairs.forEach(d => {
    const a = d.action || 'N/A';
    if (!actions[a]) actions[a] = [];
    actions[a].push(d);
  });

  console.log('Action     | N     | Avg Return | Win%   | Verdict');
  console.log('-----------|-------|------------|--------|--------');
  
  for (const [action, items] of Object.entries(actions).sort((a, b) => b[1].length - a[1].length)) {
    if (items.length < 5) continue;
    const rets = items.map(d => d.return3d);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = (rets.filter(r => r > 0).length / rets.length * 100);
    
    let verdict = '';
    if (action === 'BUY' || action === 'STRONG_BUY') verdict = avg > 0 && win > 55 ? '✅ VALID' : '⚠️ WEAK';
    else if (action === 'SELL' || action === 'AVOID') verdict = avg < 0 ? '✅ CORRECT' : '❌ INVERTED';
    else verdict = '⚡ NEUTRAL';
    
    console.log(`  ${action.padEnd(9)} | ${String(items.length).padEnd(5)} | ${(avg >= 0 ? '+' : '') + avg.toFixed(2) + '%'}`.padEnd(38) +
      `| ${win.toFixed(1)}%`.padEnd(8) + `| ${verdict}`);
  }

  // D. Correlation
  console.log('\n══════════════════════════════════════════════');
  console.log('D. STATISTICAL CORRELATION');
  console.log('══════════════════════════════════════════════');
  const n = pairs.length;
  const scores = pairs.map(d => d.score);
  const returns = pairs.map(d => d.return3d);
  const avgS = scores.reduce((a, b) => a + b, 0) / n;
  const avgR = returns.reduce((a, b) => a + b, 0) / n;
  
  let cov = 0, vX = 0, vY = 0;
  for (let i = 0; i < n; i++) {
    cov += (scores[i] - avgS) * (returns[i] - avgR);
    vX += (scores[i] - avgS) ** 2;
    vY += (returns[i] - avgR) ** 2;
  }
  const r = (vX > 0 && vY > 0) ? cov / Math.sqrt(vX * vY) : 0;
  
  console.log(`  N: ${n}`);
  console.log(`  Pearson r: ${r.toFixed(4)}`);
  console.log(`  Interpretation: ${Math.abs(r) < 0.05 ? 'NONE' : Math.abs(r) < 0.15 ? 'WEAK' : Math.abs(r) < 0.3 ? 'MODERATE' : 'STRONG'}`);
  console.log(`  Direction: ${r > 0 ? 'POSITIVE ✅ (higher score → higher return)' : 'NEGATIVE ❌ (higher score → lower return)'}`);

  // E. Monotonicity Test (Is Q1 < Q2 < Q3 < Q4 < Q5?)
  console.log('\n══════════════════════════════════════════════');
  console.log('E. MONOTONICITY TEST');
  console.log('══════════════════════════════════════════════');
  const qAvgs = quintiles.map(q => q.data.map(d => d.return3d).reduce((a, b) => a + b, 0) / q.data.length);
  let monotonic = true;
  for (let i = 1; i < qAvgs.length; i++) {
    if (qAvgs[i] < qAvgs[i - 1]) monotonic = false;
  }
  console.log(`  Q1→Q5 avg returns: ${qAvgs.map(a => (a >= 0 ? '+' : '') + a.toFixed(2) + '%').join(' → ')}`);
  console.log(`  Monotonically increasing: ${monotonic ? '✅ YES' : '❌ NO'}`);

  // F. Per-ticker breakdown (top tickers by data volume)
  console.log('\n══════════════════════════════════════════════');
  console.log('F. PER-TICKER SCORE EFFECTIVENESS');
  console.log('══════════════════════════════════════════════');
  const tickerStats = {};
  pairs.forEach(d => {
    if (!tickerStats[d.ticker]) tickerStats[d.ticker] = [];
    tickerStats[d.ticker].push(d);
  });

  console.log('Ticker  | N    | Score→Return r | Avg Score | Avg Ret  | Win%');
  console.log('--------|------|---------------|-----------|----------|-----');
  
  for (const [ticker, items] of Object.entries(tickerStats).sort((a, b) => b[1].length - a[1].length).slice(0, 20)) {
    if (items.length < 5) continue;
    const ts = items.map(d => d.score);
    const tr = items.map(d => d.return3d);
    const tAvgS = ts.reduce((a, b) => a + b, 0) / items.length;
    const tAvgR = tr.reduce((a, b) => a + b, 0) / items.length;
    const win = (tr.filter(x => x > 0).length / items.length * 100);
    
    let tCov = 0, tVx = 0, tVy = 0;
    for (let i = 0; i < items.length; i++) {
      tCov += (ts[i] - tAvgS) * (tr[i] - tAvgR);
      tVx += (ts[i] - tAvgS) ** 2;
      tVy += (tr[i] - tAvgR) ** 2;
    }
    const tR = (tVx > 0 && tVy > 0) ? tCov / Math.sqrt(tVx * tVy) : 0;
    
    console.log(`  ${ticker.padEnd(6)} | ${String(items.length).padEnd(4)} | ${(tR >= 0 ? '+' : '') + tR.toFixed(3)}`.padEnd(35) +
      ` | ${tAvgS.toFixed(0)}`.padEnd(11) +
      `| ${(tAvgR >= 0 ? '+' : '') + tAvgR.toFixed(2) + '%'}`.padEnd(10) +
      `| ${win.toFixed(0)}%`);
  }

  // G. FINAL VERDICT
  const overallWin = pairs.filter(d => d.return3d > 0).length / pairs.length * 100;
  const buyPairs = pairs.filter(d => d.score >= 65);
  const buyWin = buyPairs.length > 0 ? buyPairs.filter(d => d.return3d > 0).length / buyPairs.length * 100 : 0;
  const buyAvg = buyPairs.length > 0 ? buyPairs.reduce((a, d) => a + d.return3d, 0) / buyPairs.length : 0;
  const avoidPairs = pairs.filter(d => d.score < 40);
  const avoidWin = avoidPairs.length > 0 ? avoidPairs.filter(d => d.return3d > 0).length / avoidPairs.length * 100 : 0;
  const avoidAvg = avoidPairs.length > 0 ? avoidPairs.reduce((a, d) => a + d.return3d, 0) / avoidPairs.length : 0;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FINAL VERDICT — ALPHA ENGINE V5.0');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Data points: ${pairs.length}`);
  console.log(`  Date range: ${allDates[0]} → ${allDates[allDates.length - 1]}`);
  console.log(`  Overall market win rate (3d): ${overallWin.toFixed(1)}%`);
  console.log(`  BUY (≥65) win rate: ${buyWin.toFixed(1)}% | avg: ${buyAvg >= 0 ? '+' : ''}${buyAvg.toFixed(2)}% | N=${buyPairs.length}`);
  console.log(`  AVOID (<40) win rate: ${avoidWin.toFixed(1)}% | avg: ${avoidAvg >= 0 ? '+' : ''}${avoidAvg.toFixed(2)}% | N=${avoidPairs.length}`);
  console.log(`  Correlation: ${r.toFixed(4)}`);
  console.log(`  Monotonicity: ${monotonic ? '✅' : '❌'}`);
  
  const edgeBuy = buyWin - overallWin;
  const edgeAvoid = overallWin - avoidWin;
  console.log(`  BUY edge over market: ${edgeBuy >= 0 ? '+' : ''}${edgeBuy.toFixed(1)}pp`);
  console.log(`  AVOID edge (avoided loss): ${edgeAvoid >= 0 ? '+' : ''}${edgeAvoid.toFixed(1)}pp`);

  if (r > 0.1 && monotonic && edgeBuy > 5) {
    console.log('\n  🟢 STRONG — Engine philosophy is validated by data');
  } else if (r > 0.05 && edgeBuy > 0) {
    console.log('\n  🟡 MARGINAL — Positive signal but not statistically significant');
  } else if (r > 0 || edgeBuy > 0) {
    console.log('\n  🟠 WEAK — Some positive signal, needs more data or tuning');
  } else {
    console.log('\n  🔴 NO SIGNAL — Score does not predict forward returns');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
