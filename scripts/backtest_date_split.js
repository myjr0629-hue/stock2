/**
 * Alpha Engine V7 Backtest — Date-Based Version Split
 * Treats all records after 2026-05-21 as V7 (regardless of engineVersion tag)
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

const V7_DEPLOY_DATE = '2026-05-21';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAll(tableName) {
  let items = [], lastKey, c = 0;
  console.log(`Scanning ${tableName}...`);
  do {
    const r = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey, Limit: 5000 }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
    c++;
    if (c % 5 === 0) console.log(`  ${items.length} items...`);
  } while (lastKey);
  return items;
}

function stats(pairs, label) {
  if (pairs.length < 10) return { error: 'N<10', count: pairs.length, label };
  
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
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    const sMin = Math.min(...q.data.map(d => d.score));
    const sMax = Math.max(...q.data.map(d => d.score));
    const std = Math.sqrt(rets.reduce((s, r) => s + (r - avg) ** 2, 0) / rets.length);
    return { name: q.name, count: q.data.length, range: `${sMin}-${sMax}`, avg, med, win, sharpe: std > 0 ? avg / std : 0 };
  });

  let monotonic = true;
  for (let i = 1; i < qStats.length; i++) if (qStats[i].avg < qStats[i - 1].avg) monotonic = false;

  const n = pairs.length;
  const scores = pairs.map(d => d.score), returns = pairs.map(d => d.return3d);
  const avgS = scores.reduce((a, b) => a + b, 0) / n, avgR = returns.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vX = 0, vY = 0;
  for (let i = 0; i < n; i++) { cov += (scores[i] - avgS) * (returns[i] - avgR); vX += (scores[i] - avgS) ** 2; vY += (returns[i] - avgR) ** 2; }
  const r = (vX > 0 && vY > 0) ? cov / Math.sqrt(vX * vY) : 0;

  const grades = {};
  pairs.forEach(d => { const g = d.grade || 'N/A'; if (!grades[g]) grades[g] = []; grades[g].push(d); });
  const gradeStats = Object.keys(grades).map(g => {
    const items = grades[g];
    const rets = items.map(d => d.return3d);
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const win = rets.filter(r => r > 0).length / rets.length * 100;
    return { grade: g, count: items.length, avg, win };
  }).sort((a, b) => b.avg - a.avg);

  const buyPairs = pairs.filter(d => d.score >= 65);
  const buyWin = buyPairs.length > 0 ? buyPairs.filter(d => d.return3d > 0).length / buyPairs.length * 100 : 0;
  const buyAvg = buyPairs.length > 0 ? buyPairs.reduce((a, d) => a + d.return3d, 0) / buyPairs.length : 0;
  const avoidPairs = pairs.filter(d => d.score < 40);
  const avoidWin = avoidPairs.length > 0 ? avoidPairs.filter(d => d.return3d > 0).length / avoidPairs.length * 100 : 0;
  const avoidAvg = avoidPairs.length > 0 ? avoidPairs.reduce((a, d) => a + d.return3d, 0) / avoidPairs.length : 0;
  const overallWin = pairs.filter(d => d.return3d > 0).length / pairs.length * 100;

  return { label, count: pairs.length, qStats, monotonic, correlation: r, gradeStats, overallWin,
    buyStats: { count: buyPairs.length, avg: buyAvg, win: buyWin, edge: buyWin - overallWin },
    avoidStats: { count: avoidPairs.length, avg: avoidAvg, win: avoidWin, edge: overallWin - avoidWin }
  };
}

async function main() {
  const allRecords = await scanAll('signum-alpha-history');
  console.log(`Total: ${allRecords.length}`);

  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    const existing = tickerMap[r.ticker][r.date];
    if (!existing || (r.timestamp || 0) > (existing.timestamp || 0)) tickerMap[r.ticker][r.date] = r;
  });

  const allPairs = [];
  for (const ticker of Object.keys(tickerMap)) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore ?? rec.contextScore ?? null;
      const close = rec.close ?? rec.price ?? null;
      if (score == null || !close || close <= 0) continue;
      let futureClose = null;
      for (let j = i + 3; j <= Math.min(i + 5, dates.length - 1); j++) {
        const fRec = dateMap[dates[j]];
        const fClose = fRec ? (fRec.close ?? fRec.price ?? null) : null;
        if (fRec && fClose > 0) { futureClose = fClose; break; }
      }
      if (futureClose !== null) {
        allPairs.push({
          ticker, date: dates[i], score,
          grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
          close, futureClose,
          return3d: Math.round(((futureClose - close) / close) * 10000) / 100,
          isPostV7: dates[i] >= V7_DEPLOY_DATE,
        });
      }
    }
  }

  console.log(`Total pairs: ${allPairs.length}`);
  const v7Pairs = allPairs.filter(p => p.isPostV7);
  const prePairs = allPairs.filter(p => !p.isPostV7);
  console.log(`Post-V7 (>=${V7_DEPLOY_DATE}): ${v7Pairs.length}`);
  console.log(`Pre-V7  (<${V7_DEPLOY_DATE}): ${prePairs.length}`);

  const v7R = stats(v7Pairs, 'Post-V7');
  const preR = stats(prePairs, 'Pre-V7');

  console.log('\n=== POST-V7 RESULTS ===');
  console.log(`N=${v7R.count}, r=${v7R.correlation?.toFixed(4)}, mono=${v7R.monotonic}, overallWin=${v7R.overallWin?.toFixed(1)}%`);
  console.log(`BUY(>=65): N=${v7R.buyStats?.count}, avg=${v7R.buyStats?.avg?.toFixed(2)}%, win=${v7R.buyStats?.win?.toFixed(1)}%`);
  console.log(`AVOID(<40): N=${v7R.avoidStats?.count}, avg=${v7R.avoidStats?.avg?.toFixed(2)}%, win=${v7R.avoidStats?.win?.toFixed(1)}%`);
  if (v7R.qStats) v7R.qStats.forEach(q => console.log(`  ${q.name}: ${q.range} | avg=${q.avg.toFixed(2)}% | win=${q.win.toFixed(1)}% | sharpe=${q.sharpe.toFixed(3)}`));
  if (v7R.gradeStats) { console.log('Grade:'); v7R.gradeStats.forEach(g => console.log(`  ${g.grade}: N=${g.count}, avg=${g.avg.toFixed(2)}%, win=${g.win.toFixed(1)}%`)); }

  console.log('\n=== PRE-V7 RESULTS ===');
  console.log(`N=${preR.count}, r=${preR.correlation?.toFixed(4)}, mono=${preR.monotonic}, overallWin=${preR.overallWin?.toFixed(1)}%`);
  console.log(`BUY(>=65): N=${preR.buyStats?.count}, avg=${preR.buyStats?.avg?.toFixed(2)}%, win=${preR.buyStats?.win?.toFixed(1)}%`);
  if (preR.qStats) preR.qStats.forEach(q => console.log(`  ${q.name}: ${q.range} | avg=${q.avg.toFixed(2)}% | win=${q.win.toFixed(1)}% | sharpe=${q.sharpe.toFixed(3)}`));
  if (preR.gradeStats) { console.log('Grade:'); preR.gradeStats.forEach(g => console.log(`  ${g.grade}: N=${g.count}, avg=${g.avg.toFixed(2)}%, win=${g.win.toFixed(1)}%`)); }

  console.log('\nDone.');
}

main().catch(console.error);
