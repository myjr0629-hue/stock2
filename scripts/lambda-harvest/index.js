
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
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
const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];

// ====== GEX Harvest ======
async function harvestGex() {
  const results = [];
  const ts = Date.now();
  
  for (const ticker of M7_TICKERS) {
    try {
      // Get current price from Polygon
      const snap = await httpsGet(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`
      );
      const price = snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || 0;
      
      // Get options chain for GEX calculation
      const chain = await httpsGet(
        `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=50&apiKey=${POLYGON_KEY}`
      );
      
      let gex = 0, callWall = null, putFloor = null, maxPain = null, flipLevel = null;
      
      if (chain?.results) {
        const strikes = {};
        for (const opt of chain.results) {
          const strike = opt.details?.strike_price;
          if (!strike) continue;
          if (!strikes[strike]) strikes[strike] = { callGex: 0, putGex: 0, callOI: 0, putOI: 0 };
          
          const gamma = opt.greeks?.gamma || 0;
          const oi = opt.open_interest || 0;
          
          if (opt.details?.contract_type === 'call') {
            strikes[strike].callGex += gamma * oi * 100 * price;
            strikes[strike].callOI += oi;
          } else {
            strikes[strike].putGex -= gamma * oi * 100 * price;
            strikes[strike].putOI += oi;
          }
        }
        
        // Calculate total GEX, call wall, put floor
        let maxCallOI = 0, maxPutOI = 0;
        for (const [strike, data] of Object.entries(strikes)) {
          gex += data.callGex + data.putGex;
          if (data.callOI > maxCallOI) { maxCallOI = data.callOI; callWall = parseFloat(strike); }
          if (data.putOI > maxPutOI) { maxPutOI = data.putOI; putFloor = parseFloat(strike); }
        }
        
        // Simplified flip level
        flipLevel = callWall && putFloor ? (callWall + putFloor) / 2 : null;
      }
      
      const gammaRegime = gex > 0 ? 'POSITIVE' : gex < 0 ? 'NEGATIVE' : 'NEUTRAL';
      
      await client.send(new PutCommand({
        TableName: 'signum-gex-history',
        Item: { ticker, timestamp: ts, gex: Math.round(gex), flipLevel, callWall, putFloor, maxPain, price, gammaRegime }
      }));
      
      results.push(ticker + ':OK');
    } catch (e) {
      results.push(ticker + ':ERR');
    }
  }
  return results;
}

// ====== RLSI Harvest (from site API) ======
async function harvestRlsi() {
  try {
    const siteUrl = process.env.SITE_URL || 'https://signumhq.com';
    const data = await httpsGet(siteUrl + '/api/guardian');
    
    if (data?.rlsi !== undefined) {
      await client.send(new PutCommand({
        TableName: 'signum-rlsi-history',
        Item: {
          pk: 'MARKET',
          timestamp: Date.now(),
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
  } catch (e) {
    return 'RLSI:ERR:' + e.message;
  }
}

// ====== Main Handler ======
exports.handler = async (event) => {
  console.log('SIGNUM Harvest Lambda triggered:', new Date().toISOString());
  
  const results = {};
  
  // Check if US market is open (rough check: UTC 13:30-20:00 = EDT 9:30-16:00)
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const utcMinutes = hour * 60 + minute;
  const marketOpen = 13 * 60 + 30;  // 13:30 UTC = 9:30 EDT
  const marketClose = 20 * 60;       // 20:00 UTC = 16:00 EDT
  
  if (utcMinutes < marketOpen || utcMinutes > marketClose) {
    // Check for EST (non-DST): market 14:30-21:00 UTC
    const estMarketOpen = 14 * 60 + 30;
    const estMarketClose = 21 * 60;
    if (utcMinutes < estMarketOpen || utcMinutes > estMarketClose) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Market closed', utcHour: hour }) };
    }
  }
  
  // Harvest GEX
  results.gex = await harvestGex();
  
  // Harvest RLSI
  results.rlsi = await harvestRlsi();
  
  console.log('Harvest results:', JSON.stringify(results));
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, timestamp: new Date().toISOString(), results })
  };
};
