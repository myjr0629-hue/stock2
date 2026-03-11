/**
 * Deploy Lambda v4.0 — AWS-First Architecture
 * - 300 tickers price snapshots → signum-alpha-history
 * - 100 tickers GEX deep analysis → signum-gex-history + signum-flow-history  
 * - RLSI self-calculation (no Vercel dependency) → signum-rlsi-history
 * - Alpha Score calculation → signum-alpha-history (alpha field)
 * 
 * Usage: node scripts/deploy-lambda-v4.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');

// Load 300 tickers
const universe = JSON.parse(fs.readFileSync('data/stock_universe_us300.json', 'utf-8')).symbols;
console.log('Universe:', universe.length, 'tickers');

// Expanded GEX tickers: 100 (was 50 in v3)
const GEX_TICKERS = [
  // M7
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  // Silicon Core
  'AMD','AVGO','PLTR','SMCI','ARM','COIN','AI','MRVL','MU','TSM','ASML',
  // Physical AI
  'SERV','PL','TER','SYM','RKLB','ISRG',
  // Power Matrix
  'CEG','VST','GEV','PWR','CCJ','SMR','ETN',
  // Bio Pulse
  'LLY','NVO','VRTX','REGN','VKTX','AMGN','GILD',
  // Cyber Shield
  'CRWD','PANW','FTNT','ZS','S','OKTA','NET',
  // Orbit Defense
  'LMT','RTX','AXON','KTOS','LDOS','ASTS','LUNR',
  // Quantum Edge
  'SNOW','IONQ','DELL','PATH','TWLO',
  // FinTech
  'XYZ','PYPL','SOFI','AFRM','HOOD','UPST',
  // Cloud Fortress
  'CRM','NOW','DDOG','WDAY','MDB','TEAM','HUBS',
  // Finance
  'JPM','BAC','GS','WFC','V','MA',
  // Energy
  'XOM','CVX',
  // Healthcare
  'UNH','JNJ','MRK',
  // Consumer
  'HD','COST','WMT','DIS','NFLX',
  // Industrial
  'BA','CAT','GE',
  // Crypto
  'MSTR','MARA','RIOT',
  // ETFs (important for market gauging)
  'SPY','QQQ','IWM',
  // Others popular
  'UBER','ABNB','SHOP','BABA',
];

// Build handler code
const handlerCode = `
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('TIMEOUT')), 15000);
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/4.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', (e) => { clearTimeout(timeout); reject(e); });
  });
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const UNIVERSE = ${JSON.stringify(universe)};
const GEX_TICKERS = ${JSON.stringify(GEX_TICKERS)};

async function getAllOptions(ticker) {
  let allResults = [];
  let url = 'https://api.polygon.io/v3/snapshot/options/' + ticker + '?limit=250&apiKey=' + POLYGON_KEY;
  let pages = 0;
  while (url && pages < 20) {
    const data = await httpsGet(url);
    if (data && data.results) allResults = allResults.concat(data.results);
    url = data && data.next_url ? data.next_url + '&apiKey=' + POLYGON_KEY : null;
    pages++;
  }
  return allResults;
}

async function batchWrite(tableName, items) {
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    try {
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName]: batch.map(item => ({ PutRequest: { Item: item } })) }
      }));
    } catch (e) {
      for (const item of batch) {
        await client.send(new PutCommand({ TableName: tableName, Item: item })).catch(() => {});
      }
    }
  }
}

// ====== RLSI Self-Calculation (no Vercel dependency) ======
// RLSI = Risk Level Signal Index — computed from market-wide signals
function computeRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    avgGain = (avgGain * (period-1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period-1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function computeRlsi() {
  console.log('Step 3: RLSI self-calculation...');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    
    // Fetch market data for RLSI components
    const [spyAgg, qqqAgg, iwmAgg, vixSnap] = await Promise.all([
      httpsGet('https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/' + thirtyDaysAgo + '/' + today + '?adjusted=true&sort=asc&limit=30&apiKey=' + POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/aggs/ticker/QQQ/range/1/day/' + thirtyDaysAgo + '/' + today + '?adjusted=true&sort=asc&limit=30&apiKey=' + POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/aggs/ticker/IWM/range/1/day/' + thirtyDaysAgo + '/' + today + '?adjusted=true&sort=asc&limit=30&apiKey=' + POLYGON_KEY),
      httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/VIX?apiKey=' + POLYGON_KEY).catch(() => null),
    ]);
    
    const spyCloses = (spyAgg.results || []).map(r => r.c);
    const qqqCloses = (qqqAgg.results || []).map(r => r.c);
    const iwmCloses = (iwmAgg.results || []).map(r => r.c);
    
    // Sub-scores
    // 1. Momentum (SPY RSI14 normalized 0-100 → RLSI 0-25)
    const spyRsi = computeRSI(spyCloses, 14);
    const momentumScore = Math.round((spyRsi / 100) * 25);
    
    // 2. Participation (breadth proxy: IWM vs SPY relative strength)
    const spyReturn5d = spyCloses.length >= 5 ? (spyCloses[spyCloses.length-1] / spyCloses[spyCloses.length-6] - 1) * 100 : 0;
    const iwmReturn5d = iwmCloses.length >= 5 ? (iwmCloses[iwmCloses.length-1] / iwmCloses[iwmCloses.length-6] - 1) * 100 : 0;
    const breadthSpread = iwmReturn5d - spyReturn5d; // positive = healthy breadth
    const participationScore = Math.max(0, Math.min(25, Math.round(12.5 + breadthSpread * 2.5)));
    
    // 3. Price Trend (SPY above/below SMA20)
    const sma20 = spyCloses.length >= 20 ? spyCloses.slice(-20).reduce((a,b) => a+b, 0) / 20 : 0;
    const currentSpy = spyCloses[spyCloses.length-1] || 0;
    const trendPct = sma20 > 0 ? ((currentSpy - sma20) / sma20) * 100 : 0;
    const priceTrendScore = Math.max(0, Math.min(25, Math.round(12.5 + trendPct * 5)));
    
    // 4. Sentiment (VIX-based — lower VIX = higher score)
    let vixValue = 20;
    try {
      const vixData = vixSnap && vixSnap.ticker;
      vixValue = (vixData && vixData.lastTrade && vixData.lastTrade.p) || (vixData && vixData.day && vixData.day.c) || 20;
    } catch {} 
    // VIX 10→25, VIX 30→5, VIX 50→0
    const sentimentScore = Math.max(0, Math.min(25, Math.round(37.5 - vixValue * 0.75)));
    
    const rlsi = momentumScore + participationScore + priceTrendScore + sentimentScore;
    const regime = rlsi >= 70 ? 'BULLISH' : rlsi >= 45 ? 'NEUTRAL' : 'BEARISH';
    
    await client.send(new PutCommand({
      TableName: 'signum-rlsi-history',
      Item: {
        pk: 'MARKET', timestamp: Date.now(),
        rlsi, momentum: momentumScore, participation: participationScore,
        priceTrend: priceTrendScore, sentiment: sentimentScore,
        regime, vix: Math.round(vixValue * 100) / 100,
        spyRsi: Math.round(spyRsi * 100) / 100,
        spyPrice: currentSpy, sma20: Math.round(sma20 * 100) / 100,
      }
    }));
    
    console.log('RLSI: ' + rlsi + ' (' + regime + ') SPY RSI=' + Math.round(spyRsi) + ' VIX=' + Math.round(vixValue));
    return { rlsi, regime, components: { momentumScore, participationScore, priceTrendScore, sentimentScore } };
  } catch (e) {
    console.error('RLSI calc error:', e.message);
    return { error: e.message };
  }
}

// ====== Alpha Score — Simplified version for Lambda ======
function computeAlphaScore(ticker, priceData, gexData) {
  let score = 50; // baseline
  
  // Momentum (+/- 15 points)
  const changePct = priceData.changePct || 0;
  if (changePct > 3) score += 15;
  else if (changePct > 1) score += 10;
  else if (changePct > 0) score += 5;
  else if (changePct < -3) score -= 15;
  else if (changePct < -1) score -= 10;
  else if (changePct < 0) score -= 5;
  
  // Volume (relative to average, if available) (+/- 10 points)
  const vol = priceData.volume || 0;
  if (vol > 0) {
    // Approximate: high volume is bullish for momentum
    score += vol > 50000000 ? 5 : vol > 20000000 ? 3 : 0;
  }
  
  // GEX regime (+/- 10 points)
  if (gexData) {
    if (gexData.gammaRegime === 'POSITIVE') score += 5;
    else if (gexData.gammaRegime === 'NEGATIVE') score -= 5;
    
    // PCR: < 0.7 bullish, > 1.3 bearish
    if (gexData.pcr < 0.7) score += 5;
    else if (gexData.pcr > 1.3) score -= 5;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ====== Main Harvest Functions ======
async function harvestPrices() {
  console.log('Step 1: Price snapshot for ' + UNIVERSE.length + ' tickers...');
  const ts = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + POLYGON_KEY);
  const allTickers = snap && snap.tickers ? snap.tickers : [];
  const items = [];
  const priceMap = {};
  const snapshotMap = {};
  const universeSet = new Set(UNIVERSE);
  for (const t of allTickers) {
    if (!universeSet.has(t.ticker)) continue;
    const price = (t.lastTrade && t.lastTrade.p) || (t.day && t.day.c) || (t.prevDay && t.prevDay.c) || 0;
    const changePct = t.todaysChangePerc || 0;
    priceMap[t.ticker] = price;
    snapshotMap[t.ticker] = { changePct, volume: (t.day && t.day.v) || 0, price };
    items.push({
      ticker: t.ticker, date: today, qualityTier: 'LIVE',
      changePct: Math.round(changePct * 100) / 100,
      open: (t.day && t.day.o) || 0, high: (t.day && t.day.h) || 0,
      low: (t.day && t.day.l) || 0, close: (t.day && t.day.c) || price,
      volume: (t.day && t.day.v) || 0, vwap: (t.day && t.day.vw) || 0,
      gex: 0, pcr: 0, alphaScore: 0,
    });
  }
  if (items.length > 0) await batchWrite('signum-alpha-history', items);
  console.log('Prices: ' + items.length + '/' + UNIVERSE.length + ' saved');
  return { count: items.length, priceMap, snapshotMap };
}

async function harvestGex(priceMap) {
  console.log('Step 2: GEX harvest for ' + GEX_TICKERS.length + ' tickers...');
  const ts = Date.now();
  const results = [];
  const gexMap = {};
  // Process in batches of 5 for speed
  for (let i = 0; i < GEX_TICKERS.length; i += 5) {
    const batch = GEX_TICKERS.slice(i, i + 5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker] || 0;
        if (!price) { results.push(ticker + ':NO_PRICE'); return; }
        const allOptions = await getAllOptions(ticker);
        if (allOptions.length === 0) { results.push(ticker + ':NO_OPT'); return; }
        let gex = 0, callWall = null, putFloor = null, maxPain = null;
        let maxCallOI = 0, maxPutOI = 0, totalCallOI = 0, totalPutOI = 0;
        let maxPainMinCost = Infinity;
        const strikes = new Set();
        
        for (const opt of allOptions) {
          const strike = opt.details && opt.details.strike_price;
          if (!strike) continue;
          strikes.add(strike);
          const gamma = (opt.greeks && opt.greeks.gamma) || 0;
          const oi = opt.open_interest || 0;
          const type = opt.details && opt.details.contract_type;
          if (type === 'call') {
            gex += gamma * oi * 100 * price; totalCallOI += oi;
            if (oi > maxCallOI) { maxCallOI = oi; callWall = strike; }
          } else {
            gex -= gamma * oi * 100 * price; totalPutOI += oi;
            if (oi > maxPutOI) { maxPutOI = oi; putFloor = strike; }
          }
        }
        
        // Max Pain calculation (simplified)
        const uniqueStrikes = [...strikes].sort((a,b) => a-b);
        for (const testStrike of uniqueStrikes) {
          let cost = 0;
          for (const opt of allOptions) {
            const s = opt.details && opt.details.strike_price;
            const oi = opt.open_interest || 0;
            if (!s || !oi) continue;
            if (opt.details.contract_type === 'call') {
              cost += Math.max(0, testStrike - s) * oi;
            } else {
              cost += Math.max(0, s - testStrike) * oi;
            }
          }
          if (cost < maxPainMinCost) { maxPainMinCost = cost; maxPain = testStrike; }
        }
        
        const flipLevel = callWall && putFloor ? (callWall + putFloor) / 2 : null;
        const gammaRegime = gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL';
        const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
        
        gexMap[ticker] = { gex, pcr, gammaRegime };
        
        await client.send(new PutCommand({
          TableName: 'signum-gex-history',
          Item: { ticker, timestamp: ts, gex: Math.round(gex), flipLevel, callWall, putFloor, maxPain, price, gammaRegime, totalContracts: allOptions.length, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        }));
        await client.send(new PutCommand({
          TableName: 'signum-flow-history',
          Item: { ticker, timestamp: ts, compositeScore: 0, opi: totalCallOI - totalPutOI, whaleScore: 0, dex: 0, ivSkew: 0, squeezeProbability: 0, smartMoneyScore: 0, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        })).catch(() => {});
        results.push(ticker + ':' + allOptions.length + 'c');
      } catch (e) { results.push(ticker + ':ERR'); }
    }));
  }
  console.log('GEX: ' + results.filter(r => r.includes('c')).length + '/' + GEX_TICKERS.length + ' OK');
  return { results, gexMap };
}

// ====== Update Alpha Scores after GEX ======
async function updateAlphaScores(snapshotMap, gexMap) {
  console.log('Step 4: Alpha Scores for ' + Object.keys(snapshotMap).length + ' tickers...');
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  for (const [ticker, priceData] of Object.entries(snapshotMap)) {
    const alphaScore = computeAlphaScore(ticker, priceData, gexMap[ticker] || null);
    items.push({
      ticker, date: today,
      changePct: Math.round(priceData.changePct * 100) / 100,
      open: 0, high: 0, low: 0, close: priceData.price,
      volume: priceData.volume, vwap: 0,
      gex: gexMap[ticker] ? gexMap[ticker].gex : 0,
      pcr: gexMap[ticker] ? gexMap[ticker].pcr : 0,
      alphaScore, qualityTier: gexMap[ticker] ? 'FULL' : 'PRICE_ONLY',
    });
  }
  if (items.length > 0) await batchWrite('signum-alpha-history', items);
  console.log('Alpha: ' + items.length + ' scores updated');
  return items.length;
}

exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v4.0 — ' + new Date().toISOString());
  console.log('Universe: ' + UNIVERSE.length + ' price + ' + GEX_TICKERS.length + ' GEX');
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour * 60 + minute;
  // Extended hours: 8:00 UTC to 1:00 UTC (covers pre + regular + post US market)
  const isExtendedHours = (utcMin >= 8*60) || (utcMin <= 1*60);
  const isRegularHours = (utcMin >= 13*60+30 && utcMin <= 21*60);
  const forceRun = event && event.forceRun;
  if (!isExtendedHours && !forceRun) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Markets closed', utcHour: hour }) };
  }
  const results = {};
  const { count, priceMap, snapshotMap } = await harvestPrices();
  results.prices = count;
  if (isRegularHours) {
    const gexResult = await harvestGex(priceMap);
    results.gex = gexResult.results.length;
    results.alpha = await updateAlphaScores(snapshotMap, gexResult.gexMap);
  } else {
    results.gex = 'SKIPPED:extended_hours';
    results.alpha = 'SKIPPED:extended_hours';
  }
  // RLSI runs every cycle (less API intensive)
  results.rlsi = await computeRlsi();
  const duration = Math.round((Date.now() - start) / 1000);
  console.log('Done in ' + duration + 's');
  return { statusCode: 200, body: JSON.stringify({ success: true, version: '4.0', timestamp: new Date().toISOString(), duration, results }) };
};
`;

// Write handler
const lambdaDir = path.join(__dirname, 'lambda-harvest');
if (!fs.existsSync(lambdaDir)) fs.mkdirSync(lambdaDir, { recursive: true });
fs.writeFileSync(path.join(lambdaDir, 'index.js'), handlerCode);
fs.writeFileSync(path.join(lambdaDir, 'package.json'), JSON.stringify({
  name: 'signum-harvest-lambda', version: '4.0.0',
  dependencies: { '@aws-sdk/client-dynamodb': '^3.0.0', '@aws-sdk/lib-dynamodb': '^3.0.0' }
}, null, 2));

console.log('Installing Lambda deps...');
execSync('npm install --production', { cwd: lambdaDir, stdio: 'pipe' });

const zipPath = path.join(__dirname, 'lambda-harvest.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -command "Compress-Archive -Path '${lambdaDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
console.log('Zip:', Math.round(fs.statSync(zipPath).size / 1024 / 1024 * 10) / 10 + 'MB');

// Deploy to AWS
async function deploy() {
  const lambda = new LambdaClient({ region: 'us-east-1' });
  const zipBuffer = fs.readFileSync(zipPath);
  
  await lambda.send(new UpdateFunctionCodeCommand({
    FunctionName: 'signum-harvest',
    ZipFile: zipBuffer,
  }));
  console.log('✅ Lambda code updated: signum-harvest v4.0');

  // Wait for update to propagate
  await new Promise(r => setTimeout(r, 5000));

  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: 'signum-harvest',
    Timeout: 300,
    MemorySize: 512,
    Environment: { Variables: { NODE_ENV: 'production' } },
  }));
  console.log('✅ Lambda config updated (300s timeout, 512MB, no SITE_URL needed)');
  console.log('✅ Done — v4.0: 300 price + 100 GEX + RLSI self-calc + Alpha scores');
}

deploy().catch(e => console.error('Deploy error:', e.message));
