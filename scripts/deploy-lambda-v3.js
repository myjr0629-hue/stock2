/**
 * Deploy Lambda v3.0 — 300-ticker universe + 50 GEX deep analysis
 * Usage: node scripts/deploy-lambda-v3.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');

// Load 300 tickers
const universe = JSON.parse(fs.readFileSync('data/stock_universe_us300.json', 'utf-8')).symbols;
console.log('Universe:', universe.length, 'tickers');

const GEX_TICKERS = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  'AMD','AVGO','PLTR','SMCI','ARM','COIN','AI','MRVL','MU',
  'CRWD','PANW','CRM','SNOW','UBER','ABNB','SHOP','SQ','PYPL',
  'JPM','BAC','GS','WFC','V','MA',
  'XOM','CVX','LLY','UNH','JNJ','MRK',
  'HD','COST','WMT','DIS','NFLX',
  'BA','LMT','RTX','CAT','GE',
  'MSTR','MARA','RIOT',
];

// Build handler code
const handlerCode = `
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/3.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
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

async function harvestPrices() {
  console.log('Step 1: Price snapshot for ' + UNIVERSE.length + ' tickers...');
  const ts = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + POLYGON_KEY);
  const allTickers = snap && snap.tickers ? snap.tickers : [];
  const items = [];
  const priceMap = {};
  const universeSet = new Set(UNIVERSE);
  for (const t of allTickers) {
    if (!universeSet.has(t.ticker)) continue;
    const price = (t.lastTrade && t.lastTrade.p) || (t.day && t.day.c) || (t.prevDay && t.prevDay.c) || 0;
    const changePct = t.todaysChangePerc || 0;
    priceMap[t.ticker] = price;
    items.push({
      ticker: t.ticker, date: today, alphaScore: 0, qualityTier: 'LIVE',
      changePct: Math.round(changePct * 100) / 100,
      open: (t.day && t.day.o) || 0, high: (t.day && t.day.h) || 0,
      low: (t.day && t.day.l) || 0, close: (t.day && t.day.c) || price,
      volume: (t.day && t.day.v) || 0, vwap: (t.day && t.day.vw) || 0,
      gex: 0, pcr: 0,
    });
  }
  if (items.length > 0) await batchWrite('signum-alpha-history', items);
  console.log('Prices: ' + items.length + '/' + UNIVERSE.length + ' saved');
  return { count: items.length, priceMap };
}

async function harvestGex(priceMap) {
  console.log('Step 2: GEX harvest for ' + GEX_TICKERS.length + ' tickers...');
  const ts = Date.now();
  const results = [];
  for (let i = 0; i < GEX_TICKERS.length; i += 3) {
    const batch = GEX_TICKERS.slice(i, i + 3);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker] || 0;
        if (!price) { results.push(ticker + ':NO_PRICE'); return; }
        const allOptions = await getAllOptions(ticker);
        if (allOptions.length === 0) { results.push(ticker + ':NO_OPT'); return; }
        let gex = 0, callWall = null, putFloor = null;
        let maxCallOI = 0, maxPutOI = 0, totalCallOI = 0, totalPutOI = 0;
        for (const opt of allOptions) {
          const strike = opt.details && opt.details.strike_price;
          if (!strike) continue;
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
        const flipLevel = callWall && putFloor ? (callWall + putFloor) / 2 : null;
        const gammaRegime = gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL';
        const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
        await client.send(new PutCommand({
          TableName: 'signum-gex-history',
          Item: { ticker, timestamp: ts, gex: Math.round(gex), flipLevel, callWall, putFloor, maxPain: null, price, gammaRegime, totalContracts: allOptions.length, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        }));
        await client.send(new PutCommand({
          TableName: 'signum-flow-history',
          Item: { ticker, timestamp: ts, compositeScore: 0, opi: totalCallOI - totalPutOI, whaleScore: 0, dex: 0, ivSkew: 0, squeezeProbability: 0, smartMoneyScore: 0, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        })).catch(() => {});
        results.push(ticker + ':' + allOptions.length + 'c');
      } catch (e) { results.push(ticker + ':ERR'); }
    }));
  }
  console.log('GEX: ' + results.join(', '));
  return results;
}

async function harvestRlsi() {
  try {
    const siteUrl = process.env.SITE_URL || 'https://www.signumhq.com';
    const data = await httpsGet(siteUrl + '/api/guardian');
    if (data && data.rlsi !== undefined) {
      await client.send(new PutCommand({
        TableName: 'signum-rlsi-history',
        Item: {
          pk: 'MARKET', timestamp: Date.now(),
          rlsi: data.rlsi || 0,
          momentum: (data.subScores && data.subScores.momentum) || 0,
          participation: (data.subScores && data.subScores.participation) || 0,
          priceTrend: (data.subScores && data.subScores.priceTrend) || 0,
          rotation: (data.subScores && data.subScores.rotation) || 0,
          sentiment: (data.subScores && data.subScores.sentiment) || 0,
          regime: data.regime || 'NEUTRAL',
        }
      }));
      return 'RLSI:' + data.rlsi;
    }
    return 'RLSI:NO_DATA';
  } catch (e) { return 'RLSI:ERR:' + e.message; }
}

exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v3.0 — ' + new Date().toISOString());
  console.log('Universe: ' + UNIVERSE.length + ' price + ' + GEX_TICKERS.length + ' GEX');
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour * 60 + minute;
  const isExtendedHours = (utcMin >= 8*60) || (utcMin <= 1*60);
  const isRegularHours = (utcMin >= 13*60+30 && utcMin <= 21*60);
  if (!isExtendedHours) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Markets closed', utcHour: hour }) };
  }
  const results = {};
  const { count, priceMap } = await harvestPrices();
  results.prices = count;
  if (isRegularHours) { results.gex = await harvestGex(priceMap); }
  else { results.gex = 'SKIPPED:extended_hours'; }
  results.rlsi = await harvestRlsi();
  const duration = Math.round((Date.now() - start) / 1000);
  console.log('Done in ' + duration + 's');
  return { statusCode: 200, body: JSON.stringify({ success: true, version: '3.0', timestamp: new Date().toISOString(), duration, results }) };
};
`;

// Write handler
const lambdaDir = path.join(__dirname, 'lambda-harvest');
if (!fs.existsSync(lambdaDir)) fs.mkdirSync(lambdaDir, { recursive: true });
fs.writeFileSync(path.join(lambdaDir, 'index.js'), handlerCode);
fs.writeFileSync(path.join(lambdaDir, 'package.json'), JSON.stringify({
  name: 'signum-harvest-lambda', version: '3.0.0',
  dependencies: { '@aws-sdk/client-dynamodb': '^3.0.0', '@aws-sdk/lib-dynamodb': '^3.0.0' }
}, null, 2));

console.log('Installing deps...');
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
  console.log('✅ Lambda code updated: signum-harvest v3.0');

  // Wait for update to propagate
  await new Promise(r => setTimeout(r, 5000));

  await lambda.send(new UpdateFunctionConfigurationCommand({
    FunctionName: 'signum-harvest',
    Environment: { Variables: { SITE_URL: 'https://www.signumhq.com', NODE_ENV: 'production' } },
  }));
  console.log('✅ Lambda config updated (SITE_URL: www.signumhq.com)');
  console.log('✅ Done — 300 tickers + 50 GEX + RLSI');
}

deploy().catch(e => console.error('Deploy error:', e.message));
