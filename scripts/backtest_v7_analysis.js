/**
 * Alpha Engine V7.0.0 — DEEP BACKTEST & COMPARATIVE ANALYSIS
 * 
 * Compares V7.0.0 with prior engine versions (V5/V6) using DynamoDB signum-alpha-history data.
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAll(tableName) {
  let items = [];
  let lastKey = undefined;
  console.log(`Scanning table: ${tableName}...`);
  let count = 0;
  do {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      Limit: 5000,
    }));
    items = items.concat(result.Items || []);
    lastKey = result.LastEvaluatedKey;
    count++;
    if (count % 5 === 0) {
      console.log(`  scanned ${items.length} items so far...`);
    }
  } while (lastKey);
  return items;
}

function runStats(pairs, versionLabel) {
  if (pairs.length < 10) {
    return { error: 'Insufficient data points', count: pairs.length };
  }

  // Quintiles
  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  const qSize = Math.floor(sorted.length / 5);
  const quintiles = [
    { name: 'Q1 (Worst)', data: sorted.slice(0, qSize) },
    { name: 'Q2', data: sorted.slice(qSize, qSize * 2) },
    { name: 'Q3 (Mid)', data: sorted.slice(qSize * 2, qSize * 3) },
    { name: 'Q4', data: sorted.slice(qSize * 3, qSize * 4) },
    { name: 'Q5 (Best)', data: sorted.slice(qSize * 4) },
  ];

  const qStats = quintiles.map(q => {
    const rets = q.data.map(d => d.return3d).sort((a, b) => a - b);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const med = rets[Math.floor(rets.length / 2)];
    const win = (rets.filter(r => r > 0).length / rets.length * 100);
    const sMin = Math.min(...q.data.map(d => d.score));
    const sMax = Math.max(...q.data.map(d => d.score));
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    const sharpe = std > 0 ? avg / std : 0;
    return { name: q.name, count: q.data.length, range: `${sMin}-${sMax}`, avg, med, win, sharpe };
  });

  // Monotonicity
  let monotonic = true;
  for (let i = 1; i < qStats.length; i++) {
    if (qStats[i].avg < qStats[i-1].avg) monotonic = false;
  }

  // Correlation
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

  // Grade stats
  const grades = {};
  pairs.forEach(d => {
    const g = d.grade || 'N/A';
    if (!grades[g]) grades[g] = [];
    grades[g].push(d);
  });

  const gradeStats = Object.keys(grades).map(g => {
    const items = grades[g];
    const rets = items.map(d => d.return3d).sort((a, b) => a - b);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = (rets.filter(r => r > 0).length / rets.length * 100);
    return { grade: g, count: items.length, avg, win };
  }).sort((a, b) => b.avg - a.avg);

  // Action stats
  const actions = {};
  pairs.forEach(d => {
    const a = d.action || 'N/A';
    if (!actions[a]) actions[a] = [];
    actions[a].push(d);
  });

  const actionStats = Object.keys(actions).map(a => {
    const items = actions[a];
    const rets = items.map(d => d.return3d);
    const avg = rets.reduce((x, y) => x + y, 0) / rets.length;
    const win = (rets.filter(r => r > 0).length / rets.length * 100);
    return { action: a, count: items.length, avg, win };
  });

  // Final summary stats
  const buyPairs = pairs.filter(d => d.score >= 65);
  const buyWin = buyPairs.length > 0 ? buyPairs.filter(d => d.return3d > 0).length / buyPairs.length * 100 : 0;
  const buyAvg = buyPairs.length > 0 ? buyPairs.reduce((a, d) => a + d.return3d, 0) / buyPairs.length : 0;
  
  const avoidPairs = pairs.filter(d => d.score < 40);
  const avoidWin = avoidPairs.length > 0 ? avoidPairs.filter(d => d.return3d > 0).length / avoidPairs.length * 100 : 0;
  const avoidAvg = avoidPairs.length > 0 ? avoidPairs.reduce((a, d) => a + d.return3d, 0) / avoidPairs.length : 0;

  const overallWin = pairs.filter(d => d.return3d > 0).length / pairs.length * 100;
  const edgeBuy = buyWin - overallWin;
  const edgeAvoid = overallWin - avoidWin;

  return {
    label: versionLabel,
    count: pairs.length,
    qStats,
    monotonic,
    correlation: r,
    gradeStats,
    actionStats,
    overallWin,
    buyStats: { count: buyPairs.length, avg: buyAvg, win: buyWin, edge: edgeBuy },
    avoidStats: { count: avoidPairs.length, avg: avoidAvg, win: avoidWin, edge: edgeAvoid }
  };
}

async function main() {
  const allRecords = await scanAll('signum-alpha-history');
  console.log(`Total raw records scanned: ${allRecords.length}`);

  // Build ticker→date→record map
  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    const existing = tickerMap[r.ticker][r.date];
    if (!existing || (r.timestamp || 0) > (existing.timestamp || 0)) {
      tickerMap[r.ticker][r.date] = r;
    }
  });

  const tickers = Object.keys(tickerMap);
  const allDatesSet = new Set();
  allRecords.forEach(r => r.date && allDatesSet.add(r.date));
  const allDates = [...allDatesSet].sort();
  
  // Build analysis pairs: (ticker, date, alphaScore, return_3d, engineVersion)
  const allPairs = [];
  for (const ticker of tickers) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore ?? rec.contextScore ?? null;
      const close = rec.close ?? rec.price ?? null;
      
      if (score === null || score === undefined || !close || close <= 0) continue;
      
      // Find close price 3 trading days later (allow 3 to 5 range)
      let futureClose = null;
      let futureDate = null;
      for (let j = i + 3; j <= Math.min(i + 5, dates.length - 1); j++) {
        const fRec = dateMap[dates[j]];
        const fClose = fRec ? (fRec.close ?? fRec.price ?? null) : null;
        if (fRec && fClose > 0) {
          futureClose = fClose;
          futureDate = dates[j];
          break;
        }
      }
      
      if (futureClose !== null) {
        const return3d = ((futureClose - close) / close) * 100;
        allPairs.push({
          ticker,
          date: dates[i],
          score,
          grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
          action: rec.alphaAction || rec.action || 'N/A',
          close,
          futureClose,
          futureDate,
          return3d: Math.round(return3d * 100) / 100,
          engineVersion: rec.engineVersion || 'PRE_V6',
        });
      }
    }
  }

  console.log(`Total computed pairs (Score + Return): ${allPairs.length}`);

  // Split pairs by Engine Version
  const v7Pairs = allPairs.filter(p => p.engineVersion && p.engineVersion.startsWith('7.'));
  const legacyPairs = allPairs.filter(p => !p.engineVersion || !p.engineVersion.startsWith('7.'));

  console.log(`V7 Engine (7.x.x) pairs: ${v7Pairs.length}`);
  console.log(`Legacy Engines (<7.0.0) pairs: ${legacyPairs.length}`);

  const v7Results = runStats(v7Pairs, 'Alpha Engine V7.0.0 (Tuned)');
  const legacyResults = runStats(legacyPairs, 'Legacy Engines (V5/V6)');

  // Generate Markdown report content
  let md = `# Alpha Score Backtest Deep Report (V7.0.0 vs Legacy)

Generated at: ${new Date().toISOString()}  
Data source: \`signum-alpha-history\` Table  
Total Scanned Records: **${allRecords.length}**  
Date Range: **${allDates[0]}** to **${allDates[allDates.length - 1]}** (${allDates.length} trading sessions)  
Total Valid Data Pairs: **${allPairs.length}**

---

## 📊 Summary Comparison

| Metric | Legacy Engines (V5/V6) | Alpha Engine V7.0.0 | Delta |
|---|---|---|---|
| **Data Pairs (N)** | ${legacyResults.count} | ${v7Results.count} | - |
| **Pearson Correlation (r)** | ${legacyResults.correlation ? legacyResults.correlation.toFixed(4) : 'N/A'} | ${v7Results.correlation ? v7Results.correlation.toFixed(4) : 'N/A'} | ${legacyResults.correlation && v7Results.correlation ? (v7Results.correlation - legacyResults.correlation).toFixed(4) : '-'} |
| **Monotonicity (Q1 < ... < Q5)** | ${legacyResults.monotonic ? '✅ YES' : '❌ NO'} | ${v7Results.monotonic ? '✅ YES' : '❌ NO'} | - |
| **Overall Market Win%** | ${legacyResults.overallWin ? legacyResults.overallWin.toFixed(1) + '%' : 'N/A'} | ${v7Results.overallWin ? v7Results.overallWin.toFixed(1) + '%' : 'N/A'} | - |
| **BUY (Score ≥65) Avg Ret** | ${legacyResults.buyStats ? (legacyResults.buyStats.avg >= 0 ? '+' : '') + legacyResults.buyStats.avg.toFixed(2) + '%' : 'N/A'} | ${v7Results.buyStats ? (v7Results.buyStats.avg >= 0 ? '+' : '') + v7Results.buyStats.avg.toFixed(2) + '%' : 'N/A'} | - |
| **BUY (Score ≥65) Win%** | ${legacyResults.buyStats ? legacyResults.buyStats.win.toFixed(1) + '%' : 'N/A'} | ${v7Results.buyStats ? v7Results.buyStats.win.toFixed(1) + '%' : 'N/A'} | - |
| **BUY Edge over Market** | ${legacyResults.buyStats ? (legacyResults.buyStats.edge >= 0 ? '+' : '') + legacyResults.buyStats.edge.toFixed(1) + 'pp' : 'N/A'} | ${v7Results.buyStats ? (v7Results.buyStats.edge >= 0 ? '+' : '') + v7Results.buyStats.edge.toFixed(1) + 'pp' : 'N/A'} | - |
| **AVOID (Score <40) Avg Ret** | ${legacyResults.avoidStats ? (legacyResults.avoidStats.avg >= 0 ? '+' : '') + legacyResults.avoidStats.avg.toFixed(2) + '%' : 'N/A'} | ${v7Results.avoidStats ? (v7Results.avoidStats.avg >= 0 ? '+' : '') + v7Results.avoidStats.avg.toFixed(2) + '%' : 'N/A'} | - |
| **AVOID (Score <40) Win%** | ${legacyResults.avoidStats ? legacyResults.avoidStats.win.toFixed(1) + '%' : 'N/A'} | ${v7Results.avoidStats ? v7Results.avoidStats.win.toFixed(1) + '%' : 'N/A'} | - |

---

## 📈 Detailed Breakdown: Alpha Engine V7.0.0 (Tuned)

### Quintile Analysis
| Quintile | N | Score Range | Avg Return (3D) | Med Return (3D) | Win% | Sharpe |
|---|---|---|---|---|---|---|
${v7Results.qStats && Array.isArray(v7Results.qStats) ? v7Results.qStats.map(q => `| **${q.name}** | ${q.count} | ${q.range} | ${(q.avg >= 0 ? '+' : '') + q.avg.toFixed(2)}% | ${(q.med >= 0 ? '+' : '') + q.med.toFixed(2)}% | ${q.win.toFixed(1)}% | ${q.sharpe.toFixed(3)} |`).join('\n') : '| No Data |'}

### Grade Analysis
| Grade | N | Avg Return (3D) | Win% |
|---|---|---|---|
${v7Results.gradeStats && Array.isArray(v7Results.gradeStats) ? v7Results.gradeStats.map(g => `| **${g.grade}** | ${g.count} | ${(g.avg >= 0 ? '+' : '') + g.avg.toFixed(2)}% | ${g.win.toFixed(1)}% |`).join('\n') : '| No Data |'}

### Action Analysis
| Action | N | Avg Return (3D) | Win% | Verdict |
|---|---|---|---|---|
${v7Results.actionStats && Array.isArray(v7Results.actionStats) ? v7Results.actionStats.map(a => {
  let verdict = 'NEUTRAL';
  if (a.action.includes('BUY')) verdict = a.avg > 0 && a.win > 53 ? '✅ VALID' : '⚠️ WEAK';
  else if (a.action.includes('SELL') || a.action.includes('AVOID')) verdict = a.avg < 0 ? '✅ CORRECT' : '❌ INVERTED';
  return `| **${a.action}** | ${a.count} | ${(a.avg >= 0 ? '+' : '') + a.avg.toFixed(2)}% | ${a.win.toFixed(1)}% | ${verdict} |`;
}).join('\n') : '| No Data |'}

---

## 📉 Detailed Breakdown: Legacy Engines (V5/V6)

### Quintile Analysis
| Quintile | N | Score Range | Avg Return (3D) | Med Return (3D) | Win% | Sharpe |
|---|---|---|---|---|---|---|
${legacyResults.qStats && Array.isArray(legacyResults.qStats) ? legacyResults.qStats.map(q => `| **${q.name}** | ${q.count} | ${q.range} | ${(q.avg >= 0 ? '+' : '') + q.avg.toFixed(2)}% | ${(q.med >= 0 ? '+' : '') + q.med.toFixed(2)}% | ${q.win.toFixed(1)}% | ${q.sharpe.toFixed(3)} |`).join('\n') : '| No Data |'}

### Grade Analysis
| Grade | N | Avg Return (3D) | Win% |
|---|---|---|---|
${legacyResults.gradeStats && Array.isArray(legacyResults.gradeStats) ? legacyResults.gradeStats.map(g => `| **${g.grade}** | ${g.count} | ${(g.avg >= 0 ? '+' : '') + g.avg.toFixed(2)}% | ${g.win.toFixed(1)}% |`).join('\n') : '| No Data |'}

### Action Analysis
| Action | N | Avg Return (3D) | Win% | Verdict |
|---|---|---|---|---|
${legacyResults.actionStats && Array.isArray(legacyResults.actionStats) ? legacyResults.actionStats.map(a => {
  let verdict = 'NEUTRAL';
  if (a.action.includes('BUY')) verdict = a.avg > 0 && a.win > 53 ? '✅ VALID' : '⚠️ WEAK';
  else if (a.action.includes('SELL') || a.action.includes('AVOID')) verdict = a.avg < 0 ? '✅ CORRECT' : '❌ INVERTED';
  return `| **${a.action}** | ${a.count} | ${(a.avg >= 0 ? '+' : '') + a.avg.toFixed(2)}% | ${a.win.toFixed(1)}% | ${verdict} |`;
}).join('\n') : '| No Data |'}

---

## 🔬 Core Insights & Diagnostic

### V7.0.0 Evaluation
* **Monotonicity**: ${v7Results.monotonic ? '✅ Validated. Higher score bands consistently lead to higher returns.' : '❌ Inverted / Non-monotonic. The absolute score size does not linearly align with returns.'}
* **Pearson r**: **${v7Results.correlation ? v7Results.correlation.toFixed(4) : 'N/A'}** (${Math.abs(v7Results.correlation) < 0.05 ? 'No correlation' : Math.abs(v7Results.correlation) < 0.15 ? 'Weak correlation' : 'Moderate correlation'}).
* **Edge Comparison**: BUY edge is **${v7Results.buyStats ? (v7Results.buyStats.edge >= 0 ? '+' : '') + v7Results.buyStats.edge.toFixed(2) + 'pp' : 'N/A'}** over the market. AVOID edge is **${v7Results.avoidStats ? (v7Results.avoidStats.edge >= 0 ? '+' : '') + v7Results.avoidStats.edge.toFixed(2) + 'pp' : 'N/A'}**.

### Comparison & Calibration
V7.0.0 was designed to resolve the "inverted edge" trap (where Q1/Worst outperformed Q5/Best due to market regime shifts). 
${v7Results.monotonic && !legacyResults.monotonic ? '* **Success**: V7.0.0 successfully restored linear monotonicity that was broken in Legacy versions.' : ''}
${v7Results.correlation > legacyResults.correlation ? `* **Improvement**: Pearson r increased from ${legacyResults.correlation.toFixed(4)} to ${v7Results.correlation.toFixed(4)}, showcasing better predictability.` : ''}

`;

  const reportPath = path.join('C:\\Users\\seamo\\.gemini\\antigravity\\brain\\9ef182fe-5653-4bb6-8519-3649d835d263', 'backtest_analysis_results.md');
  fs.writeFileSync(reportPath, md);
  console.log(`\n✅ Report successfully written to: ${reportPath}`);
}

main().catch(console.error);
