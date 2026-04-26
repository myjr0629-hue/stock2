/**
 * Alpha Engine V5.0 — CLEAN BACKTEST (score=0 레코드 제외)
 * 
 * Q1/Q2가 score=0인 문제 해결:
 * - V5.0 이전 레코드는 alphaScore=0 → 노이즈
 * - score > 0 AND score != null 인 레코드만 분석
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
  console.log('  ALPHA ENGINE V5.0 — CLEAN BACKTEST (score>0 only)');
  console.log('  Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  const allRecords = await scanAll('signum-alpha-history');
  console.log(`Total records: ${allRecords.length}`);

  // Filter: only records with actual score > 0
  const scored = allRecords.filter(r => r.alphaScore && r.alphaScore > 0 && r.close > 0);
  console.log(`Records with score > 0: ${scored.length}`);

  // Check date distribution of scored records
  const scoreDates = {};
  scored.forEach(r => {
    if (!scoreDates[r.date]) scoreDates[r.date] = 0;
    scoreDates[r.date]++;
  });
  const sortedScoreDates = Object.entries(scoreDates).sort(([a], [b]) => a.localeCompare(b));
  console.log(`\nScored record date distribution:`);
  for (const [date, count] of sortedScoreDates) {
    console.log(`  ${date}: ${count} tickers`);
  }

  // Build ticker→date→record
  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date || !r.close || r.close <= 0) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    const existing = tickerMap[r.ticker][r.date];
    if (!existing || (r.timestamp || 0) > (existing.timestamp || 0)) {
      tickerMap[r.ticker][r.date] = r;
    }
  });

  // Compute pairs (score > 0 only)
  const pairs = [];
  for (const [ticker, dateMap] of Object.entries(tickerMap)) {
    const dates = Object.keys(dateMap).sort();
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore;
      if (!score || score <= 0 || !rec.close || rec.close <= 0) continue;
      
      // Find close 3 trading days later
      for (let j = i + 3; j <= Math.min(i + 5, dates.length - 1); j++) {
        const fRec = dateMap[dates[j]];
        if (fRec && fRec.close > 0) {
          const ret3d = ((fRec.close - rec.close) / rec.close) * 100;
          pairs.push({
            ticker, date: dates[i],
            score, grade: rec.alphaGrade || rec.grade || 'N/A',
            action: rec.alphaAction || 'N/A',
            close: rec.close, futureClose: fRec.close,
            return3d: Math.round(ret3d * 100) / 100,
          });
          break;
        }
      }
    }
  }

  console.log(`\nClean pairs (score>0 + 3d return): ${pairs.length}`);
  if (pairs.length < 30) {
    console.log('❌ Insufficient data');
    return;
  }

  // ═══ A. Score Decile Analysis (10 buckets for finer granularity) ═══
  console.log('\n══════════════════════════════════════════════');
  console.log('A. SCORE DECILE → 3-DAY FORWARD RETURN');
  console.log('══════════════════════════════════════════════');
  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  const dSize = Math.floor(sorted.length / 10);
  
  console.log('Decile  | N    | Score Range | Avg Ret  | Med Ret  | Win%   | Sharpe');
  console.log('--------|------|------------|----------|----------|--------|-------');
  
  const decileAvgs = [];
  for (let d = 0; d < 10; d++) {
    const start = d * dSize;
    const end = d === 9 ? sorted.length : (d + 1) * dSize;
    const slice = sorted.slice(start, end);
    const rets = slice.map(s => s.return3d);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const med = [...rets].sort((a, b) => a - b)[Math.floor(rets.length / 2)];
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    const sMin = Math.min(...slice.map(s => s.score));
    const sMax = Math.max(...slice.map(s => s.score));
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    const sharpe = std > 0 ? avg / std : 0;
    decileAvgs.push(avg);
    
    const label = d === 0 ? 'D1 (Low)' : d === 9 ? 'D10(High)' : `D${d + 1}`;
    console.log(`  ${label.padEnd(7)} | ${String(slice.length).padEnd(4)} | ${sMin}-${String(sMax).padEnd(7)} | ${(avg >= 0 ? '+' : '') + avg.toFixed(2) + '%'}`.padEnd(52) + 
      ` | ${(med >= 0 ? '+' : '') + med.toFixed(2) + '%'}`.padEnd(11) +
      `| ${win.toFixed(1)}%`.padEnd(8) + `| ${sharpe.toFixed(3)}`);
  }

  // B. Quintile (cleaner)
  console.log('\n══════════════════════════════════════════════');
  console.log('B. SCORE QUINTILE → 3-DAY FORWARD RETURN');
  console.log('══════════════════════════════════════════════');
  const qSize = Math.floor(sorted.length / 5);
  const quintiles = [
    { name: 'Q1 (Worst)', data: sorted.slice(0, qSize) },
    { name: 'Q2', data: sorted.slice(qSize, qSize * 2) },
    { name: 'Q3 (Mid)', data: sorted.slice(qSize * 2, qSize * 3) },
    { name: 'Q4', data: sorted.slice(qSize * 3, qSize * 4) },
    { name: 'Q5 (Best)', data: sorted.slice(qSize * 4) },
  ];

  console.log('Quintile     | N    | Score Range | Avg Ret  | Win%   | Spread vs Q1');
  console.log('-------------|------|------------|----------|--------|-------------');
  
  const qAvgs = [];
  for (const q of quintiles) {
    const rets = q.data.map(d => d.return3d);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    const sMin = Math.min(...q.data.map(d => d.score));
    const sMax = Math.max(...q.data.map(d => d.score));
    qAvgs.push(avg);
    const spread = qAvgs.length > 1 ? `${(avg - qAvgs[0] >= 0 ? '+' : '')}${(avg - qAvgs[0]).toFixed(2)}pp` : '—';
    
    console.log(`  ${q.name.padEnd(11)} | ${String(q.data.length).padEnd(4)} | ${sMin}-${String(sMax).padEnd(7)} | ${(avg >= 0 ? '+' : '') + avg.toFixed(2) + '%'}`.padEnd(52) + 
      `| ${win.toFixed(1)}%`.padEnd(8) + `| ${spread}`);
  }

  // C. Grade Analysis
  console.log('\n══════════════════════════════════════════════');
  console.log('C. GRADE → 3-DAY FORWARD RETURN');
  console.log('══════════════════════════════════════════════');
  const grades = {};
  pairs.forEach(d => {
    const g = d.grade || 'N/A';
    if (!grades[g]) grades[g] = [];
    grades[g].push(d);
  });

  console.log('Grade | N     | Avg Ret  | Med Ret  | Win%   | Avg Score');
  console.log('------|-------|----------|----------|--------|----------');
  
  for (const g of ['S', 'A', 'B', 'C', 'D', 'F', 'N/A']) {
    if (!grades[g] || grades[g].length < 5) continue;
    const items = grades[g];
    const rets = items.map(d => d.return3d).sort((a, b) => a - b);
    const avg = rets.reduce((a, b) => a + b, 0) / items.length;
    const med = rets[Math.floor(rets.length / 2)];
    const win = rets.filter(r => r > 0).length / items.length * 100;
    const avgScore = items.reduce((a, d) => a + d.score, 0) / items.length;
    
    console.log(`  ${g.padEnd(3)}  | ${String(items.length).padEnd(5)} | ${(avg >= 0 ? '+' : '') + avg.toFixed(2) + '%'}`.padEnd(30) +
      ` | ${(med >= 0 ? '+' : '') + med.toFixed(2) + '%'}`.padEnd(11) +
      `| ${win.toFixed(1)}%`.padEnd(8) + `| ${avgScore.toFixed(0)}`);
  }

  // D. Correlation
  console.log('\n══════════════════════════════════════════════');
  console.log('D. STATISTICAL CORRELATION (score>0 ONLY)');
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
  console.log(`  Avg Score: ${avgS.toFixed(1)}`);
  console.log(`  Avg Return: ${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}%`);
  console.log(`  Pearson r: ${r.toFixed(4)}`);
  console.log(`  R²: ${(r * r).toFixed(4)} (${(r * r * 100).toFixed(2)}% variance explained)`);
  console.log(`  Direction: ${r > 0 ? 'POSITIVE ✅' : 'NEGATIVE ❌'}`);
  console.log(`  Strength: ${Math.abs(r) < 0.05 ? 'NONE' : Math.abs(r) < 0.15 ? 'WEAK' : Math.abs(r) < 0.3 ? 'MODERATE' : 'STRONG'}`);

  // E. Long/Short spread (core philosophy test)
  console.log('\n══════════════════════════════════════════════');
  console.log('E. LONG/SHORT SPREAD (Core Philosophy Test)');
  console.log('══════════════════════════════════════════════');
  const top20 = sorted.slice(-Math.floor(n * 0.2));
  const bot20 = sorted.slice(0, Math.floor(n * 0.2));
  const topAvg = top20.reduce((a, d) => a + d.return3d, 0) / top20.length;
  const botAvg = bot20.reduce((a, d) => a + d.return3d, 0) / bot20.length;
  const spread = topAvg - botAvg;
  
  console.log(`  Top 20% (Long): ${topAvg >= 0 ? '+' : ''}${topAvg.toFixed(2)}% (N=${top20.length}, score ${Math.min(...top20.map(d => d.score))}-${Math.max(...top20.map(d => d.score))})`);
  console.log(`  Bottom 20% (Short): ${botAvg >= 0 ? '+' : ''}${botAvg.toFixed(2)}% (N=${bot20.length}, score ${Math.min(...bot20.map(d => d.score))}-${Math.max(...bot20.map(d => d.score))})`);
  console.log(`  L/S Spread: ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}pp`);
  console.log(`  Interpretation: ${spread > 1 ? '✅ STRONG alpha signal' : spread > 0 ? '🟡 Weak but positive' : '❌ Inverted signal'}`);

  // F. Philosophy check — Mean Reversion vs Momentum
  console.log('\n══════════════════════════════════════════════');
  console.log('F. PHILOSOPHY CHECK — Score Behavior Pattern');
  console.log('══════════════════════════════════════════════');
  
  // Check if low scores (oversold) tend to bounce (mean reversion)
  const lowScore = pairs.filter(d => d.score < 40);
  const midScore = pairs.filter(d => d.score >= 40 && d.score < 60);
  const highScore = pairs.filter(d => d.score >= 60);
  
  const lowAvg = lowScore.length > 0 ? lowScore.reduce((a, d) => a + d.return3d, 0) / lowScore.length : 0;
  const midAvg = midScore.length > 0 ? midScore.reduce((a, d) => a + d.return3d, 0) / midScore.length : 0;
  const highAvg = highScore.length > 0 ? highScore.reduce((a, d) => a + d.return3d, 0) / highScore.length : 0;
  
  console.log(`  Low (<40):  avg=${lowAvg >= 0 ? '+' : ''}${lowAvg.toFixed(2)}% N=${lowScore.length}`);
  console.log(`  Mid (40-60): avg=${midAvg >= 0 ? '+' : ''}${midAvg.toFixed(2)}% N=${midScore.length}`);
  console.log(`  High (≥60): avg=${highAvg >= 0 ? '+' : ''}${highAvg.toFixed(2)}% N=${highScore.length}`);
  
  if (lowAvg > highAvg) {
    console.log('  ⚠️ MEAN REVERSION pattern detected — low scores bounce more than high scores');
    console.log('  → Engine may be chasing momentum while market is reverting');
  } else if (highAvg > lowAvg && highAvg > midAvg) {
    console.log('  ✅ MOMENTUM pattern confirmed — high scores continue to outperform');
  } else {
    console.log('  🟡 Mixed pattern — no clear momentum or reversion dominance');
  }

  // G. FINAL VERDICT
  const overallWin = pairs.filter(d => d.return3d > 0).length / n * 100;
  const topWin = top20.filter(d => d.return3d > 0).length / top20.length * 100;
  const botWin = bot20.filter(d => d.return3d > 0).length / bot20.length * 100;
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FINAL VERDICT — ALPHA ENGINE V5.0 (CLEAN DATA)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Data: ${n} pairs | Score range: ${Math.min(...scores)}-${Math.max(...scores)}`);
  console.log(`  Overall: ${overallWin.toFixed(1)}% win | avg ${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}%`);
  console.log(`  Top 20%: ${topWin.toFixed(1)}% win | avg ${topAvg >= 0 ? '+' : ''}${topAvg.toFixed(2)}%`);
  console.log(`  Bot 20%: ${botWin.toFixed(1)}% win | avg ${botAvg >= 0 ? '+' : ''}${botAvg.toFixed(2)}%`);
  console.log(`  L/S Spread: ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}pp`);
  console.log(`  Pearson r: ${r.toFixed(4)}`);
  
  if (spread > 1 && r > 0.05) {
    console.log('\n  🟢 ENGINE VALIDATED — Statistically significant alpha generation');
  } else if (spread > 0 && r > 0) {
    console.log('\n  🟡 MARGINAL — Directionally correct but edge is thin');
  } else {
    console.log('\n  🔴 NEEDS RECALIBRATION — Engine does not separate winners from losers');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
