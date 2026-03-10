
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
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

// ====== Sector Definitions ======
const SECTORS = {
  m7: { id: 'M7', tickers: ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'] },
  physicalai: { id: 'PHYSICALAI', tickers: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'] },
  siliconcore: { id: 'SILICONCORE', tickers: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'] },
  powermatrix: { id: 'POWERMATRIX', tickers: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'] },
  biopulse: { id: 'BIOPULSE', tickers: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'] },
  cybershield: { id: 'CYBERSHIELD', tickers: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'] },
  orbitdefense: { id: 'ORBITDEFENSE', tickers: ['LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR'] },
  quantumedge: { id: 'QUANTUMEDGE', tickers: ['IBM', 'IONQ', 'RGTI', 'QUBT', 'QBTS', 'FORM', 'ARQQ'] },
  fintechpulse: { id: 'FINTECHPULSE', tickers: ['V', 'MA', 'SQ', 'PYPL', 'COIN', 'AFRM', 'HOOD'] },
  cloudfortress: { id: 'CLOUDFORTRESS', tickers: ['CRM', 'NOW', 'SNOW', 'WDAY', 'DDOG', 'MDB', 'TEAM'] },
};

// ====== Step 5: Sector Daily Scores ======
async function harvestSector(priceMap, gexResults) {
  console.log('Step 5: Sector daily scores...');
  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  let rank = 0;

  const sectorScores = [];

  for (const [key, sector] of Object.entries(SECTORS)) {
    let changeSum = 0, changeCount = 0, gexSum = 0;
    let lead = { ticker: '', change: -Infinity };
    let lag = { ticker: '', change: Infinity };

    for (const ticker of sector.tickers) {
      const price = priceMap[ticker];
      if (!price) continue;
      // Get change from alpha-history items that were saved in harvestPrices
      changeCount++;
      // We don't have changePct in priceMap directly, calculate from snapshot
    }

    // Use Polygon snapshot for sector change data
    const snap = await httpsGet('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=' + sector.tickers.join(',') + '&apiKey=' + POLYGON_KEY);
    const tickers = snap?.tickers || [];

    for (const t of tickers) {
      const chg = t.todaysChangePerc || 0;
      changeSum += chg;
      changeCount++;
      if (chg > lead.change) lead = { ticker: t.ticker, change: chg };
      if (chg < lag.change) lag = { ticker: t.ticker, change: chg };
    }

    const avgChange = changeCount > 0 ? Math.round((changeSum / changeCount) * 100) / 100 : 0;
    sectorScores.push({ id: sector.id, avgChange });

    items.push({
      sectorId: sector.id,
      date: today,
      avgChange,
      gexSum: 0,
      avgPcr: 0,
      alphaScore: 0,
      ranking: 0,
      leadTicker: lead.ticker || '',
      lagTicker: lag.ticker || '',
      tickerCount: changeCount,
    });
  }

  // Calculate rankings by avgChange (best = 1)
  sectorScores.sort((a, b) => b.avgChange - a.avgChange);
  for (const item of items) {
    const idx = sectorScores.findIndex(s => s.id === item.sectorId);
    item.ranking = idx + 1;
  }

  if (items.length > 0) {
    await batchWrite('signum-sector-daily', items);
  }

  console.log('Sectors: ' + items.length + ' saved — top: ' + (sectorScores[0]?.id || 'N/A'));
  return items.length;
}

// ====== Step 6: IV Surface Snapshot ======
async function harvestIVSurface(priceMap) {
  console.log('Step 6: IV Surface snapshot for key tickers...');
  const IV_TICKERS = GEX_TICKERS.slice(0, 10); // Top 10 GEX tickers
  const ts = Date.now();
  let totalSaved = 0;

  for (const ticker of IV_TICKERS) {
    try {
      const price = priceMap[ticker];
      if (!price) continue;

      const allOptions = await getAllOptions(ticker);
      if (allOptions.length === 0) continue;

      // Group by DTE and extract IV surface data
      const surfaceItems = [];
      const seenStrikes = new Set();

      for (const opt of allOptions) {
        const strike = opt.details?.strike_price;
        const expDate = opt.details?.expiration_date;
        const iv = opt.implied_volatility;
        const delta = opt.greeks?.delta;
        const gamma = opt.greeks?.gamma;
        const type = opt.details?.contract_type;

        if (!strike || !expDate || iv === undefined) continue;

        // Only save options near ATM (±30%)
        if (strike < price * 0.7 || strike > price * 1.3) continue;

        const key = `${strike}-${expDate}-${type}`;
        if (seenStrikes.has(key)) continue;
        seenStrikes.add(key);

        // Calculate DTE
        const dte = Math.round((new Date(expDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (dte < 0 || dte > 90) continue; // Only 0-90 DTE

        surfaceItems.push({
          ticker,
          sk: `${ts}#${dte}#${strike}#${type}`,
          strike,
          iv: Math.round(iv * 10000) / 100, // Convert to percentage
          delta: Math.round((delta || 0) * 1000) / 1000,
          gamma: gamma || 0,
          dte,
          contractType: type,
          expDate,
          price,
        });
      }

      // Save in batches
      if (surfaceItems.length > 0) {
        await batchWrite('signum-iv-surface', surfaceItems);
        totalSaved += surfaceItems.length;
      }
    } catch (e) {
      console.log('IV Surface ERR ' + ticker + ': ' + e.message);
    }
  }

  console.log('IV Surface: ' + totalSaved + ' points saved');
  return totalSaved;
}

// ====== Main Handler ======
exports.handler = async (event) => {
  const start = Date.now();
  console.log('SIGNUM Harvest Lambda v3 — ' + new Date().toISOString());
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

  // Near close (for daily summaries): 20:00~21:00 UTC (4:00~5:00 PM ET)
  const isNearClose = (utcMin >= 20 * 60 && utcMin <= 21 * 60);

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

  // 4A: Price updates — all collected tickers
  const allCollectedTickers = Object.keys(priceMap);
  for (const ticker of allCollectedTickers) {
    const p = priceMap[ticker];
    if (p) {
      pushPromises.push(pushToWebSocket('signum:prices', {
        ticker, price: p, changePct: 0, volume: 0,
      }));
    }
  }

  // 4B: RLSI update — market-wide gauge
  if (typeof results.rlsi === 'string' && results.rlsi.startsWith('RLSI:') && !results.rlsi.includes('ERR') && !results.rlsi.includes('NO_DATA')) {
    const rlsiVal = parseFloat(results.rlsi.replace('RLSI:', ''));
    if (!isNaN(rlsiVal)) {
      pushPromises.push(pushToWebSocket('signum:rlsi', {
        rlsi: rlsiVal, ts: Date.now(),
      }));
    }
  }

  // 4C: GEX updates — key tickers with GEX data
  if (Array.isArray(results.gex)) {
    for (const r of results.gex) {
      if (typeof r === 'string' && r.includes(':') && !r.includes('ERR') && !r.includes('NO_')) {
        const [ticker] = r.split(':');
        pushPromises.push(pushToWebSocket('signum:gex', {
          ticker, ts: Date.now(),
        }));
      }
    }
  }

  // 4D: Alerts — GEX Break detection (negative → positive or vice versa)
  // This will be populated when we have historical comparison data

  await Promise.allSettled(pushPromises);
  results.pushed = pushPromises.length;

  // Step 5: Sector daily scores — every execution (5min, incremental update)
  try {
    results.sectors = await harvestSector(priceMap);
  } catch (e) {
    results.sectors = 'ERR:' + e.message;
  }

  // Step 6: IV Surface — ONLY during regular hours, every 3rd execution (~15min)
  if (isRegularHours && minute % 15 < 5) {
    try {
      results.ivSurface = await harvestIVSurface(priceMap);
    } catch (e) {
      results.ivSurface = 'ERR:' + e.message;
    }
  } else {
    results.ivSurface = 'SKIPPED';
  }

  // Step 7: Signal Detection — detect market structure changes → DynamoDB + WebSocket
  try {
    const signals = [];
    const now = Date.now();

    // 7A: GEX Flip Detection (from GEX results)
    if (Array.isArray(results.gex)) {
      for (const r of results.gex) {
        if (typeof r !== 'string') continue;
        const parts = r.split(':');
        if (parts.length < 2) continue;
        const ticker = parts[0];
        const gexVal = parseFloat(parts[1]);
        if (isNaN(gexVal)) continue;

        // Check previous GEX from DynamoDB to detect flip
        try {
          const prevData = await client.send(new QueryCommand({
            TableName: 'signum-gex-history',
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': ticker },
            ScanIndexForward: false, Limit: 1,
          }));
          if (prevData.Items && prevData.Items.length > 0) {
            const prevGex = prevData.Items[0].gex || 0;
            if (prevGex < 0 && gexVal >= 0) {
              signals.push({ ticker, type: 'GEX_FLIP_LONG', gex: gexVal, prevGex, ts: now });
            } else if (prevGex >= 0 && gexVal < 0) {
              signals.push({ ticker, type: 'GEX_FLIP_SHORT', gex: gexVal, prevGex, ts: now });
            }
          }
        } catch (e) { /* skip individual ticker errors */ }
      }
    }

    // Save signals to DynamoDB signum-pattern-db
    if (signals.length > 0) {
      const signalWrites = signals.map(s => ({
        PutRequest: {
          Item: {
            pk: 'SIGNAL',
            timestamp: s.ts,
            ticker: s.ticker,
            signalType: s.type,
            data: JSON.stringify(s),
            ttl: Math.floor(s.ts / 1000) + 86400, // 24h TTL
          }
        }
      }));

      // Batch write (max 25 per batch)
      for (let i = 0; i < signalWrites.length; i += 25) {
        const batch = signalWrites.slice(i, i + 25);
        try {
          await client.send(new BatchWriteCommand({
            RequestItems: { 'signum-pattern-db': batch }
          }));
        } catch (e) { console.log('Signal write error:', e.message); }
      }

      // Push signals to WebSocket
      for (const s of signals) {
        await pushToWebSocket('signum:alerts', {
          ticker: s.ticker, type: s.type, ts: s.ts,
        });
      }
    }

    results.signals = signals.length;
    console.log('Signals detected: ' + signals.length);
  } catch (e) {
    results.signals = 'ERR:' + e.message;
  }

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('Done in ' + duration + 's — Prices:' + count + ' GEX:' + (Array.isArray(results.gex) ? results.gex.length : results.gex) + ' Sectors:' + results.sectors + ' IV:' + results.ivSurface + ' Pushed:' + pushPromises.length);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, timestamp: new Date().toISOString(), duration, results })
  };
};
