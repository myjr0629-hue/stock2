/**
 * Alpha Engine V5.0 Backtest Forensic Analysis
 * 
 * Tables:
 *   - signum-alpha-history: daily snapshots with alphaScore, close, close_3d, return_3d
 *   - signum-backtest: dedicated backtest records (if used)
 * 
 * Verification Goals:
 *   1. Data volume — enough records with return_3d backfilled?
 *   2. Score-return correlation — do higher scores predict positive returns?
 *   3. Grade distribution — are BUY/HOLD/WATCH/AVOID grades meaningful?
 *   4. Sector/regime analysis
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAll(tableName, filterExpression, expressionValues, expressionNames) {
  let items = [];
  let lastKey = undefined;
  do {
    const params = {
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      Limit: 5000,
    };
    if (filterExpression) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeValues = expressionValues;
      if (expressionNames) params.ExpressionAttributeNames = expressionNames;
    }
    const result = await client.send(new ScanCommand(params));
    items = items.concat(result.Items || []);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ALPHA ENGINE V5.0 — BACKTEST FORENSIC ANALYSIS');
  console.log('  Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Scan signum-alpha-history for records with return_3d ──
  console.log('Phase 1: Scanning signum-alpha-history for backfilled records...');
  const allRecords = await scanAll('signum-alpha-history');
  console.log(`  Total records: ${allRecords.length}`);

  const withReturn3d = allRecords.filter(r => r.return_3d !== undefined && r.return_3d !== null);
  const withAlpha = allRecords.filter(r => r.alphaScore !== undefined && r.alphaScore !== null);
  const withBoth = allRecords.filter(r => 
    r.return_3d !== undefined && r.return_3d !== null && 
    r.alphaScore !== undefined && r.alphaScore !== null
  );
  const withClose = allRecords.filter(r => r.close > 0);
  const withClose3d = allRecords.filter(r => r.close_3d > 0);

  console.log(`  With close price: ${withClose.length}`);
  console.log(`  With close_3d: ${withClose3d.length}`);
  console.log(`  With return_3d: ${withReturn3d.length}`);
  console.log(`  With alphaScore: ${withAlpha.length}`);
  console.log(`  With BOTH (alpha + return_3d): ${withBoth.length}`);

  // Date range
  const dates = allRecords.map(r => r.date).filter(Boolean).sort();
  const uniqueDates = [...new Set(dates)];
  console.log(`  Date range: ${uniqueDates[0]} → ${uniqueDates[uniqueDates.length - 1]} (${uniqueDates.length} trading days)`);

  if (withBoth.length < 10) {
    console.log('\n⚠️ NOT ENOUGH DATA for meaningful analysis.');
    console.log('Need alphaScore + return_3d pairs. Checking alternative fields...');
    
    // Check what fields exist
    const sampleRecord = allRecords[allRecords.length - 1];
    console.log('\nSample record fields:', Object.keys(sampleRecord || {}).join(', '));
    if (sampleRecord) {
      console.log('Sample values:');
      for (const [k, v] of Object.entries(sampleRecord)) {
        if (typeof v === 'object') continue;
        console.log(`  ${k}: ${v}`);
      }
    }

    // Check if there's a different score field name
    const scoreFields = new Set();
    allRecords.slice(0, 100).forEach(r => {
      Object.keys(r).forEach(k => {
        if (k.toLowerCase().includes('score') || k.toLowerCase().includes('alpha') || k.toLowerCase().includes('grade')) {
          scoreFields.add(k);
        }
      });
    });
    console.log('\nScore-related fields found:', [...scoreFields].join(', '));
    
    // Try computing return_3d manually from close prices
    console.log('\n── Manual Return Calculation ──');
    const tickerDates = {};
    allRecords.forEach(r => {
      if (!r.ticker || !r.date || !r.close || r.close <= 0) return;
      if (!tickerDates[r.ticker]) tickerDates[r.ticker] = {};
      tickerDates[r.ticker][r.date] = r;
    });
    
    let manualPairs = 0;
    const manualResults = [];
    for (const [ticker, dateMap] of Object.entries(tickerDates)) {
      const sortedDates = Object.keys(dateMap).sort();
      for (let i = 0; i < sortedDates.length - 3; i++) {
        const rec = dateMap[sortedDates[i]];
        const futureRec = dateMap[sortedDates[i + 3]];
        if (rec && futureRec && rec.close > 0 && futureRec.close > 0) {
          const ret3d = ((futureRec.close - rec.close) / rec.close) * 100;
          const score = rec.alphaScore || rec.contextScore || rec.score || null;
          if (score !== null) {
            manualResults.push({
              ticker, date: sortedDates[i], score, return3d: Math.round(ret3d * 100) / 100,
              grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
              close: rec.close, close3d: futureRec.close
            });
            manualPairs++;
          }
        }
      }
    }
    console.log(`  Manual pairs computed: ${manualPairs}`);
    
    if (manualPairs > 0) {
      analyzeResults(manualResults);
    }
    return;
  }

  // ── 2. Build analysis dataset ──
  const dataset = withBoth.map(r => ({
    ticker: r.ticker,
    date: r.date,
    score: r.alphaScore,
    grade: r.alphaGrade || r.grade || 'N/A',
    action: r.alphaAction || r.action || 'N/A',
    return3d: r.return_3d,
    close: r.close,
    close3d: r.close_3d,
  }));

  analyzeResults(dataset);
}

function analyzeResults(dataset) {
  console.log(`\n═══ ANALYSIS (${dataset.length} data points) ═══\n`);

  // ── A. Score Quintile Analysis ──
  console.log('── A. SCORE QUINTILE → 3-DAY RETURN ──');
  const sorted = [...dataset].sort((a, b) => a.score - b.score);
  const quintileSize = Math.floor(sorted.length / 5);
  
  const quintiles = [
    { name: 'Q1 (Lowest)', data: sorted.slice(0, quintileSize) },
    { name: 'Q2', data: sorted.slice(quintileSize, quintileSize * 2) },
    { name: 'Q3 (Middle)', data: sorted.slice(quintileSize * 2, quintileSize * 3) },
    { name: 'Q4', data: sorted.slice(quintileSize * 3, quintileSize * 4) },
    { name: 'Q5 (Highest)', data: sorted.slice(quintileSize * 4) },
  ];

  console.log('Quintile      | Count | Score Range    | Avg Return | Win Rate | Sharpe-like');
  console.log('--------------|-------|---------------|------------|----------|------------');
  
  for (const q of quintiles) {
    const returns = q.data.map(d => d.return3d);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const winRate = (returns.filter(r => r > 0).length / returns.length * 100);
    const scoreMin = Math.min(...q.data.map(d => d.score));
    const scoreMax = Math.max(...q.data.map(d => d.score));
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / returns.length);
    const sharpe = stdDev > 0 ? (avg / stdDev) : 0;
    
    console.log(`  ${q.name.padEnd(12)} | ${String(q.data.length).padEnd(5)} | ${scoreMin.toFixed(0)}-${scoreMax.toFixed(0)}`.padEnd(50) + 
      ` | ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`.padEnd(13) + 
      `| ${winRate.toFixed(1)}%`.padEnd(10) + 
      `| ${sharpe.toFixed(3)}`);
  }

  // ── B. Grade Analysis ──
  console.log('\n── B. GRADE → 3-DAY RETURN ──');
  const grades = {};
  dataset.forEach(d => {
    const g = d.grade || 'N/A';
    if (!grades[g]) grades[g] = [];
    grades[g].push(d.return3d);
  });

  console.log('Grade  | Count | Avg Return | Win Rate | Consistency');
  console.log('-------|-------|------------|----------|------------');
  
  const gradeOrder = ['S', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'F', 'N/A'];
  for (const g of gradeOrder) {
    if (!grades[g] || grades[g].length < 3) continue;
    const returns = grades[g];
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const winRate = (returns.filter(r => r > 0).length / returns.length * 100);
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / returns.length);
    const label = stdDev < 2 ? 'STABLE' : stdDev < 5 ? 'MODERATE' : 'VOLATILE';
    
    console.log(`  ${g.padEnd(4)}  | ${String(returns.length).padEnd(5)} | ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`.padEnd(38) + 
      `| ${winRate.toFixed(1)}%`.padEnd(10) +
      `| ${label} (σ=${stdDev.toFixed(1)})`);
  }

  // ── C. Score Threshold Analysis (Trading Signal Quality) ──
  console.log('\n── C. SCORE THRESHOLD → SIGNAL QUALITY ──');
  const thresholds = [
    { name: 'BUY (≥65)', filter: d => d.score >= 65 },
    { name: 'HOLD (50-64)', filter: d => d.score >= 50 && d.score < 65 },
    { name: 'WATCH (35-49)', filter: d => d.score >= 35 && d.score < 50 },
    { name: 'AVOID (<35)', filter: d => d.score < 35 },
  ];

  console.log('Signal        | Count | Avg Return | Win Rate | Avg Score | Philosophy Verdict');
  console.log('--------------|-------|------------|----------|-----------|-------------------');
  
  for (const t of thresholds) {
    const subset = dataset.filter(t.filter);
    if (subset.length === 0) continue;
    const returns = subset.map(d => d.return3d);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const winRate = (returns.filter(r => r > 0).length / returns.length * 100);
    const avgScore = subset.reduce((a, b) => a + b.score, 0) / subset.length;
    
    let verdict = '';
    if (t.name.startsWith('BUY') && avg > 0 && winRate > 55) verdict = '✅ VALID';
    else if (t.name.startsWith('BUY') && avg <= 0) verdict = '❌ INVERTED';
    else if (t.name.startsWith('AVOID') && avg < 0) verdict = '✅ CORRECT AVOIDANCE';
    else if (t.name.startsWith('AVOID') && avg > 0 && winRate > 55) verdict = '⚠️ MISSED OPPORTUNITY';
    else verdict = '⚡ NEUTRAL';
    
    console.log(`  ${t.name.padEnd(12)} | ${String(subset.length).padEnd(5)} | ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`.padEnd(44) + 
      `| ${winRate.toFixed(1)}%`.padEnd(10) +
      `| ${avgScore.toFixed(0)}`.padEnd(11) +
      `| ${verdict}`);
  }

  // ── D. Correlation ──
  console.log('\n── D. STATISTICAL CORRELATION ──');
  const n = dataset.length;
  const scores = dataset.map(d => d.score);
  const returns = dataset.map(d => d.return3d);
  const avgScore = scores.reduce((a, b) => a + b, 0) / n;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / n;
  
  let covXY = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    covXY += (scores[i] - avgScore) * (returns[i] - avgReturn);
    varX += (scores[i] - avgScore) ** 2;
    varY += (returns[i] - avgReturn) ** 2;
  }
  const correlation = (varX > 0 && varY > 0) ? covXY / Math.sqrt(varX * varY) : 0;
  
  console.log(`  Pearson r (score vs return_3d): ${correlation.toFixed(4)}`);
  console.log(`  Interpretation: ${Math.abs(correlation) < 0.05 ? 'NO correlation' : Math.abs(correlation) < 0.15 ? 'WEAK correlation' : Math.abs(correlation) < 0.3 ? 'MODERATE correlation' : 'STRONG correlation'}`);
  console.log(`  Direction: ${correlation > 0 ? 'POSITIVE (higher score → higher return) ✅' : 'NEGATIVE (higher score → lower return) ❌'}`);

  // ── E. Top/Bottom Picks ──
  console.log('\n── E. TOP & BOTTOM PICKS (SAMPLE) ──');
  const topPicks = [...dataset].sort((a, b) => b.score - a.score).slice(0, 10);
  const bottomPicks = [...dataset].sort((a, b) => a.score - b.score).slice(0, 10);
  
  console.log('\nTop 10 Scores:');
  console.log('  Ticker  | Date       | Score | Return 3D | Win?');
  for (const p of topPicks) {
    console.log(`  ${p.ticker.padEnd(7)} | ${p.date} | ${String(p.score).padEnd(5)} | ${p.return3d >= 0 ? '+' : ''}${p.return3d.toFixed(2)}%`.padEnd(48) + `| ${p.return3d > 0 ? '✅' : '❌'}`);
  }
  
  console.log('\nBottom 10 Scores:');
  console.log('  Ticker  | Date       | Score | Return 3D | Avoided Loss?');
  for (const p of bottomPicks) {
    console.log(`  ${p.ticker.padEnd(7)} | ${p.date} | ${String(p.score).padEnd(5)} | ${p.return3d >= 0 ? '+' : ''}${p.return3d.toFixed(2)}%`.padEnd(48) + `| ${p.return3d < 0 ? '✅ CORRECT' : '⚠️ MISSED'}`);
  }

  // ── F. Summary Verdict ──
  const overallWinRate = (dataset.filter(d => d.return3d > 0).length / dataset.length * 100);
  const buySubset = dataset.filter(d => d.score >= 65);
  const buyWinRate = buySubset.length > 0 ? (buySubset.filter(d => d.return3d > 0).length / buySubset.length * 100) : 0;
  const avoidSubset = dataset.filter(d => d.score < 35);
  const avoidAvg = avoidSubset.length > 0 ? avoidSubset.reduce((a, d) => a + d.return3d, 0) / avoidSubset.length : 0;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  VERDICT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total data points: ${dataset.length}`);
  console.log(`  Overall market win rate: ${overallWinRate.toFixed(1)}%`);
  console.log(`  BUY (≥65) win rate: ${buyWinRate.toFixed(1)}% (vs market ${overallWinRate.toFixed(1)}%)`);
  console.log(`  AVOID (<35) avg return: ${avoidAvg >= 0 ? '+' : ''}${avoidAvg.toFixed(2)}%`);
  console.log(`  Score-Return correlation: ${correlation.toFixed(4)}`);
  
  if (buyWinRate > overallWinRate + 5 && correlation > 0.05) {
    console.log('  🟢 PHILOSOPHY ALIGNED — Score adds predictive value');
  } else if (correlation > 0 && buyWinRate > overallWinRate) {
    console.log('  🟡 MARGINAL — Positive signal but weak edge');
  } else {
    console.log('  🔴 NEEDS TUNING — Score does not predict returns meaningfully');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
