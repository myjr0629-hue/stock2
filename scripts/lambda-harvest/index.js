
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SIGNUM-HQ/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

// ====== Full Universe (150+ tickers) ======
const UNIVERSE = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  'AMD','AVGO','QCOM','MU','LRCX','AMAT','KLAC','MRVL','ASML',
  'CRWD','PANW','ZS','FTNT','OKTA',
  'AMGN','GILD','REGN','VRTX','BIIB',
  'ISRG','TER','ROK','MBLY','PONY',
  'VST','CEG','VRT','ETN','PWR',
  'RTX','LMT','GD','NOC','BA',
  'IBM','IONQ','RGTI','QUBT',
  'V','MA','SQ','PYPL','COIN',
  'CRM','NOW','SNOW',
  'EQIX','DLR','AMT','CCI','SBAC',
  'JPM','BAC','GS','WFC','C',
  'JNJ','UNH','LLY','PFE','ABBV','MRK','TMO',
  'XOM','CVX','COP','SLB',
  'HD','COST','WMT','TGT','LOW',
  'PG','KO','PEP','MCD','SBUX','NKE',
  'DIS','NFLX','CMCSA',
  'CAT','GE','HON','UPS','DE',
  'NEE','DUK','SO',
  'PLD','O','VICI',
  'TXN','ON','INTC',
  'UBER','ABNB','DASH','SHOP','SE',
  'AI','PLTR','SMCI','ARM','DELL',
  'FCX','NEM','LIN','SHW',
  'BLK','SCHW','AXP',
  'CRM','ADBE','TSM','HOOD','DKNG','NET',
];
const UNIQUE_UNIVERSE = [...new Set(UNIVERSE)];

// GEX deep analysis tickers (get FULL options chain with pagination)
const GEX_TICKERS = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  'AMD','PLTR','SMCI','ARM','COIN','CRWD','AI','MRVL','AVGO','MU',
  'UBER','ABNB','SHOP','SQ','PYPL',
  'JPM','BAC','GS',
  'XOM','CVX','LLY','UNH'
];

// ====== Paginated Options Fetch ======
async function getAllOptions(ticker) {
  let allResults = [];
  let url = \"https://api.polygon.io/v3/snapshot/options/\" + ticker + \"?limit=250&apiKey=\" + POLYGON_KEY;
  let pages = 0;
  while (url && pages < 20) {
    const data = await httpsGet(url);
    if (data?.results) allResults = allResults.concat(data.results);
    url = data?.next_url ? data.next_url + \"&apiKey=\" + POLYGON_KEY : null;
    pages++;
  }
  return allResults;
}

// ====== Batch DynamoDB Write ======
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

// ====== Step 1: Price Snapshot for ALL tickers ======
async function harvestPrices() {
  console.log('Step 1: Price snapshot for ' + UNIQUE_UNIVERSE.length + ' tickers...');
  const ts = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  
  // Use Polygon full snapshot API (single call, all US stocks)
  const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=' + POLYGON_KEY);
  const allTickers = snap?.tickers || [];
  
  const items = [];
  const priceMap = {};
  
  for (const t of allTickers) {
    if (!UNIQUE_UNIVERSE.includes(t.ticker)) continue;
    const price = t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0;
    const changePct = t.todaysChangePerc || 0;
    priceMap[t.ticker] = price;
    
    items.push({
      ticker: t.ticker,
      date: today,
      alphaScore: 0,
      qualityTier: 'LIVE',
      changePct: Math.round(changePct * 100) / 100,
      open: t.day?.o || 0,
      high: t.day?.h || 0,
      low: t.day?.l || 0,
      close: t.day?.c || price,
      volume: t.day?.v || 0,
      vwap: t.day?.vw || 0,
      gex: 0,
      pcr: 0,
    });
  }
  
  if (items.length > 0) {
    await batchWrite('signum-alpha-history', items);
  }
  
  console.log('Prices: ' + items.length + '/' + UNIQUE_UNIVERSE.length + ' tickers saved');
  return { count: items.length, priceMap };
}

// ====== Step 2: GEX + IV for key tickers ======
async function harvestGex(priceMap) {
  console.log('Step 2: GEX harvest for ' + GEX_TICKERS.length + ' tickers (full chain)...');
  const ts = Date.now();
  const results = [];
  
  // Process 3 at a time
  for (let i = 0; i < GEX_TICKERS.length; i += 3) {
    const batch = GEX_TICKERS.slice(i, i + 3);
    
    await Promise.all(batch.map(async (ticker) => {
      try {
        const price = priceMap[ticker] || 0;
        if (!price) { results.push(ticker + ':NO_PRICE'); return; }
        
        const allOptions = await getAllOptions(ticker);
        if (allOptions.length === 0) { results.push(ticker + ':NO_OPT'); return; }
        
        let gex = 0, callWall = null, putFloor = null;
        let maxCallOI = 0, maxPutOI = 0;
        let totalCallOI = 0, totalPutOI = 0;
        
        for (const opt of allOptions) {
          const strike = opt.details?.strike_price;
          if (!strike) continue;
          const gamma = opt.greeks?.gamma || 0;
          const oi = opt.open_interest || 0;
          const type = opt.details?.contract_type;
          
          if (type === 'call') {
            gex += gamma * oi * 100 * price;
            totalCallOI += oi;
            if (oi > maxCallOI) { maxCallOI = oi; callWall = strike; }
          } else {
            gex -= gamma * oi * 100 * price;
            totalPutOI += oi;
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
        
        // Flow history
        await client.send(new PutCommand({
          TableName: 'signum-flow-history',
          Item: { ticker, timestamp: ts, compositeScore: 0, opi: totalCallOI - totalPutOI, whaleScore: 0, dex: 0, ivSkew: 0, squeezeProbability: 0, smartMoneyScore: 0, totalCallOI, totalPutOI, pcr: Math.round(pcr * 100) / 100 }
        })).catch(() => {});
        
        results.push(ticker + ':' + allOptions.length + 'c');
      } catch (e) {
        results.push(ticker + ':ERR');
      }
    }));
  }
  
  console.log('GEX: ' + results.join(', '));
  return results;
}

// ====== Step 3: RLSI from site ======
async function harvestRlsi() {
  try {
    const siteUrl = process.env.SITE_URL || 'https://signumhq.com';
    const data = await httpsGet(siteUrl + '/api/guardian');
    if (data?.rlsi !== undefined) {
      await client.send(new PutCommand({
        TableName: 'signum-rlsi-history',
        Item: {
          pk: 'MARKET', timestamp: Date.now(),
          rlsi: data.rlsi || 0,
          momentum: data.subScores?.momentum || 0,
          participation: data.subScores?.participation || 0,
          priceTrend: data.subScores?.priceTrend || 0,
          rotation: data.subScores?.rotation || 0,
          sentiment: data.subScores?.sentiment || 0,
          regime: data.regime || 'NEUTRAL',
        }
      }));
      return 'RLSI:' + data.rlsi;
    }
    return 'RLSI:NO_DATA';
  } catch (e) { return 'RLSI:ERR:' + e.message; }
}

// ====== Main Handler ======
exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v2 — ' + new Date().toISOString());
  console.log('Universe: ' + UNIQUE_UNIVERSE.length + ' price + ' + GEX_TICKERS.length + ' GEX');
  
  // Market hours check (UTC)
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour * 60 + minute;
  // EDT: 13:30-20:00 UTC | EST: 14:30-21:00 UTC
  const isMarketOpen = (utcMin >= 13*60+30 && utcMin <= 21*60);
  
  if (!isMarketOpen) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Market closed', utcHour: hour }) };
  }
  
  const results = {};
  
  // Step 1: Price snapshot (all universe)
  const { count, priceMap } = await harvestPrices();
  results.prices = count;
  
  // Step 2: GEX harvest (key tickers, full options chain)
  results.gex = await harvestGex(priceMap);
  
  // Step 3: RLSI
  results.rlsi = await harvestRlsi();
  
  const duration = Math.round((Date.now() - start) / 1000);
  console.log('Done in ' + duration + 's — Prices:' + count + ' GEX:' + results.gex.length);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, timestamp: new Date().toISOString(), duration, results })
  };
};
