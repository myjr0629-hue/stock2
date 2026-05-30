/**
 * SIGNUM ML DATASET EXPORTER
 * 
 * Purpose: Extract the 54,850 backtest pairs from signum-alpha-history,
 *          compute T+3 returns, gather all available 5-pillar quantitative features,
 *          and export them to a clean local JSON file (`data/ml_dataset_54k.json`)
 *          for LightGBM/XGBoost training and SHAP analysis.
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
  let page = 1;
  console.log('Scanning DynamoDB table: ' + tableName);
  do {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      Limit: 5000,
    }));
    items = items.concat(result.Items || []);
    console.log(`  Fetched page ${page++}, total records so far: ${items.length}`);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SIGNUM QUANT RESEARCH — ML DATASET EXPORT DAEMON');
  console.log('  Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  const allRecords = await scanAll('signum-alpha-history');
  console.log(`\nTotal raw records scanned: ${allRecords.length}`);

  // Build ticker→date→record map for fast T+3 joining
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
  console.log(`Unique tickers found: ${tickers.length}`);
  
  const allDatesSet = new Set();
  allRecords.forEach(r => r.date && allDatesSet.add(r.date));
  const allDates = [...allDatesSet].sort();
  console.log(`Date range: ${allDates[0]} → ${allDates[allDates.length - 1]} (${allDates.length} unique trading days)\n`);

  console.log('Processing features and computing T+3 forward returns...');
  const dataset = [];
  let skippedNoClose3d = 0;

  for (const ticker of tickers) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const close = rec.close || rec.price || null;
      
      if (!close || close <= 0) continue;
      
      // Find close price exactly 3 trading days later
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
      
      if (futureClose === null) {
        skippedNoClose3d++;
        continue;
      }
      
      const return3d = ((futureClose - close) / close) * 100;
      
      // Extract comprehensive quantitative features for Machine Learning model
      dataset.push({
        // Target Variables
        ticker,
        date: dates[i],
        return3d_target: Math.round(return3d * 100) / 100,
        futureDate,
        
        // Metadata / Identity
        raw_score: rec.alphaScore ?? rec.contextScore ?? null,
        grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
        action: rec.alphaAction || rec.action || 'N/A',

        // 1. Price Momentum Features (MOMENTUM Pillar)
        close: Math.round(close * 100) / 100,
        changePct: rec.changePct ?? 0,
        vwap: rec.vwap ?? null,
        vwapDist: rec.vwapDist ?? ((rec.vwap && rec.vwap > 0) ? ((close - rec.vwap) / rec.vwap) * 100 : null),
        return3D_momentum: rec.return3D ?? rec.return3d ?? null,
        rsi14: rec.rsi14 ?? rec.rsi ?? null,
        macdValue: rec.macdValue ?? null,
        macdSignal: rec.macdSignal ?? null,
        macdHistogram: rec.macdHistogram ?? null,
        
        // 2. Options Structure Features (STRUCTURE Pillar)
        pcr: rec.pcr ?? null,
        gex: rec.gex ?? null,
        callWall: rec.callWall ?? null,
        putFloor: rec.putFloor ?? null,
        gammaFlipLevel: rec.gammaFlipLevel ?? null,
        squeezeScore: rec.squeezeScore ?? null,
        atmIv: rec.atmIv ?? rec.iv ?? null,
        ivSkew: rec.ivSkew ?? null,
        impliedMovePct: rec.impliedMovePct ?? null,
        maxPain: rec.maxPain ?? null,
        
        // 3. Volatility / Relative Flow Features (FLOW Pillar)
        volume: rec.volume ?? null,
        relVol: rec.relVol ?? null,
        darkPoolPct: rec.darkPoolPct ?? null,
        shortVolPct: rec.shortVolPct ?? null,
        whaleIndex: rec.whaleIndex ?? null,
        blockTrades: rec.blockTrades ?? null,
        netFlow: rec.netFlow ?? rec.netPremium ?? null,
        
        // 4. Volatility Indicator Features (V10 additions)
        ema9: rec.ema9 ?? null,
        ema21: rec.ema21 ?? null,
        hv20: rec.hv20 ?? null,
        volSpread: rec.volSpread ?? null,
        ivRank: rec.ivRank ?? null
      });
    }
  }

  console.log(`Processing complete!`);
  console.log(`  Exportable ML records: ${dataset.length}`);
  console.log(`  Skipped due to no T+3 target: ${skippedNoClose3d}`);

  // Create data directory if not exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  const outputPath = path.join(dataDir, 'ml_dataset_54k.json');
  console.log(`Writing ML dataset to: ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf8');
  console.log('🎉 Done! ML dataset successfully exported and ready for XGBoost / LightGBM analysis.');
}

main().catch(console.error);
