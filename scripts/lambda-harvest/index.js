
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

// HTTP POST helper (for EC2 Redis Proxy)
function httpPost(url, data, headers = {}) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 3000,
    };
    const mod = urlObj.protocol === 'https:' ? https : require('http');
    const req = mod.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ ok: res.statusCode < 300, body }));
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    req.write(JSON.stringify(data));
    req.end();
  });
}

// EC2 Redis Proxy config
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://3.236.193.97:8081';
const EC2_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

async function pushToWebSocket(channel, data) {
  try {
    await httpPost(`${EC2_PROXY_URL}/publish`, { channel, data },
      { 'Authorization': `Bearer ${EC2_PROXY_KEY}` });
  } catch { /* fire-and-forget */ }
}

const POLYGON_KEY = process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

// ====== Full Universe (300+ tickers) ======
// Site sectors (70) + S&P 500 majors + warm-analysis tickers
const UNIVERSE = [
  // ── M7 ──
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA',
  // ── Physical AI ──
  'PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG',
  // ── Silicon Core ──
  'AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL',
  // ── Power Matrix ──
  'CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN',
  // ── Bio Pulse ──
  'LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD',
  // ── Cyber Shield ──
  'CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET',
  // ── Orbit Defense ──
  'LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR',
  // ── Quantum Edge ──
  'IBM', 'IONQ', 'RGTI', 'QUBT', 'QBTS', 'FORM', 'ARQQ',
  // ── Fintech Pulse ──
  'V', 'MA', 'SQ', 'PYPL', 'COIN', 'AFRM', 'HOOD',
  // ── Cloud Fortress ──
  'CRM', 'NOW', 'SNOW', 'WDAY', 'DDOG', 'MDB', 'TEAM',
  // ── Mega Cap Tech ──
  'ADBE', 'ORCL', 'INTU', 'SNPS', 'CDNS', 'PANW', 'NFLX',
  // ── Semis Extended ──
  'QCOM', 'LRCX', 'AMAT', 'KLAC', 'ON', 'INTC', 'TXN', 'MCHP', 'ADI', 'NXPI', 'SWKS',
  // ── Finance ──
  'JPM', 'BAC', 'GS', 'WFC', 'C', 'MS', 'BLK', 'SCHW', 'AXP', 'USB', 'PNC', 'TFC',
  // ── Healthcare ──
  'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'BIIB', 'ISRG', 'MDT',
  // ── Energy ──
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'DVN', 'HES', 'HAL',
  // ── Consumer ──
  'HD', 'COST', 'WMT', 'TGT', 'LOW', 'PG', 'KO', 'PEP', 'MCD', 'SBUX', 'NKE', 'EL',
  // ── Media/Entertainment ──
  'DIS', 'CMCSA', 'NFLX', 'WBD', 'PARA', 'ROKU', 'SPOT', 'TTD',
  // ── Industrial ──
  'CAT', 'GE', 'HON', 'UPS', 'DE', 'MMM', 'RTX', 'BA', 'WM', 'EMR', 'ITW', 'FDX',
  // ── REITs ──
  'PLD', 'O', 'VICI', 'AMT', 'CCI', 'SBAC', 'EQIX', 'DLR', 'PSA', 'SPG', 'WELL',
  // ── Utilities ──
  'NEE', 'DUK', 'SO', 'AEP', 'D', 'SRE', 'EXC', 'XEL', 'WEC', 'ED',
  // ── Materials ──
  'FCX', 'NEM', 'LIN', 'SHW', 'APD', 'ECL', 'DD', 'NUE', 'CF', 'MOS',
  // ── Momentum/Growth ──
  'UBER', 'ABNB', 'DASH', 'SHOP', 'SE', 'AI', 'SMCI', 'DELL', 'DKNG', 'RBLX', 'SNAP', 'PINS',
  // ── China/ADR ──
  'BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV', 'LI', 'BILI',
  // ── EV/Auto ──
  'RIVN', 'LCID', 'F', 'GM', 'STLA', 'TM',
  // ── Space/Defense Extended ──
  'NOC', 'GD', 'HII', 'LHX', 'BAH',
  // ── Biotech Extended ──
  'MRNA', 'DXCM', 'ILMN', 'ZTS', 'IDXX', 'ALGN',
  // ── Indexes/ETFs (for market breadth) ──
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLP',
  // ── Crypto-related ──
  'MSTR', 'MARA', 'RIOT', 'CLSK', 'BITF',
  // ── Additional S&P 500 ──
  'ACN', 'CL', 'CME', 'CTAS', 'CSX', 'DXCM', 'FAST', 'FISV', 'GEHC', 'GIS',
  'ICE', 'IDXX', 'KDP', 'KHC', 'KLAC', 'MDLZ', 'MNST', 'ODFL', 'PAYX', 'ROST',
  'SYK', 'TRGP', 'VRSK', 'VRSN', 'YUM', 'ZBH', 'ZTS',
  // ── More S&P 500 / Large Cap ──
  'LULU', 'CPRT', 'CSGP', 'FANG', 'MSCI', 'CHTR', 'ADP', 'REGN', 'EW', 'ORLY',
  'A', 'ANSS', 'BKR', 'CDW', 'CTSH', 'DOV', 'EFX', 'GRMN', 'HUBB', 'IQV',
  'JCI', 'KMB', 'LNT', 'MAA', 'NTRS', 'OKE', 'POOL', 'RCL', 'SBNY', 'TEL',
  'TDG', 'TROW', 'TYL', 'URI', 'WAB', 'WRB', 'WST', 'ZBRA',
  // ── VRT and other site tickers ──
  'VRT', 'ROK', 'MBLY', 'PONY',
];
const UNIQUE_UNIVERSE = [...new Set(UNIVERSE)];

// GEX deep analysis tickers (get FULL options chain with pagination)
const GEX_TICKERS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA',
  'AMD', 'PLTR', 'SMCI', 'ARM', 'COIN', 'CRWD', 'AI', 'MRVL', 'AVGO', 'MU',
  'UBER', 'ABNB', 'SHOP', 'SQ', 'PYPL',
  'JPM', 'BAC', 'GS',
  'XOM', 'CVX', 'LLY', 'UNH'
];

// ====== Paginated Options Fetch ======
async function getAllOptions(ticker) {
  let allResults = [];
  let url = "https://api.polygon.io/v3/snapshot/options/" + ticker + "?limit=250&apiKey=" + POLYGON_KEY;
  let pages = 0;
  while (url && pages < 20) {
    const data = await httpsGet(url);
    if (data?.results) allResults = allResults.concat(data.results);
    url = data?.next_url ? data.next_url + "&apiKey=" + POLYGON_KEY : null;
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
        await client.send(new PutCommand({ TableName: tableName, Item: item })).catch(() => { });
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
        })).catch(() => { });

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

  // Market hours check (UTC) — Extended hours included
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMin = hour * 60 + minute;

  // Pre-market: 4:00 ET = 08:00/09:00 UTC (EDT/EST)
  // Regular:    9:30 ET = 13:30/14:30 UTC
  // Close:     16:00 ET = 20:00/21:00 UTC
  // After:     20:00 ET = 00:00/01:00 UTC (next day)
  // Wide window: 08:00 UTC ~ 01:00 UTC (next day) covers all DST variations
  const isExtendedHours = (utcMin >= 8 * 60) || (utcMin <= 1 * 60);

  // Regular hours only (for options/GEX): 13:30~21:00 UTC
  const isRegularHours = (utcMin >= 13 * 60 + 30 && utcMin <= 21 * 60);

  if (!isExtendedHours) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'All markets closed', utcHour: hour }) };
  }

  const results = {};

  // Step 1: Price snapshot — ALWAYS during extended hours
  const { count, priceMap } = await harvestPrices();
  results.prices = count;

  // Step 2: GEX harvest — ONLY during regular hours (options don't trade pre/post)
  if (isRegularHours) {
    results.gex = await harvestGex(priceMap);
  } else {
    results.gex = 'SKIPPED:extended_hours';
    console.log('GEX skipped — extended hours (options closed)');
  }

  // Step 3: RLSI — ALWAYS during extended hours
  results.rlsi = await harvestRlsi();

  // Step 4: Push real-time data to EC2 WebSocket Hub (fire-and-forget)
  const pushPromises = [];
  // Push top 20 price updates for WebSocket subscribers
  const topTickers = Object.keys(priceMap).slice(0, 20);
  for (const ticker of topTickers) {
    const p = priceMap[ticker];
    if (p && p.price) {
      pushPromises.push(pushToWebSocket('signum:prices', {
        ticker, price: p.price, changePct: p.changePct || 0, volume: p.volume || 0,
      }));
    }
  }
  await Promise.allSettled(pushPromises);
  results.pushed = pushPromises.length;

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('Done in ' + duration + 's — Prices:' + count + ' GEX:' + results.gex.length + ' Pushed:' + pushPromises.length);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, timestamp: new Date().toISOString(), duration, results })
  };
};
