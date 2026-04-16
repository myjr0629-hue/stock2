require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const https = require('https');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const FMP_KEY = process.env.FMP_API_KEY;

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'SIGNUM/1.0' } }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function run() {
  const TICKERS = ['NVDA', 'META', 'AAPL', 'AMZN', 'MSFT', 'GOOGL', 'TSLA', 'AMD'];
  
  for (const ticker of TICKERS) {
    console.log(`Running harvest for ${ticker}...`);

    const [data, targetData] = await Promise.all([
      httpsGet('https://financialmodelingprep.com/stable/grades-consensus?symbol='+ticker+'&apikey='+FMP_KEY, 5000).catch(() => null),
      httpsGet('https://financialmodelingprep.com/stable/price-target-consensus?symbol='+ticker+'&apikey='+FMP_KEY, 5000).catch(() => null)
    ]);
    
    const grade = Array.isArray(data) ? data[0] : data;
    let priceTarget = null;
    if (Array.isArray(targetData) && targetData.length > 0) {
      const t = targetData[0];
      if (t.targetConsensus && t.targetHigh) {
        priceTarget = { targetHigh: t.targetHigh, targetLow: t.targetLow, targetConsensus: t.targetConsensus };
      }
    }

    if (grade && (grade.strongBuy || grade.buy || grade.hold)) {
      const total = (grade.strongBuy||0)+(grade.buy||0)+(grade.hold||0)+(grade.sell||0)+(grade.strongSell||0);
      const bullishPct = total > 0 ? Math.round(((grade.strongBuy||0)+(grade.buy||0))/total*100) : 0;
      let consensus = grade.consensus || 'N/A';
      if (consensus === 'N/A' && total > 0) {
        const ws = ((grade.strongBuy||0)*5+(grade.buy||0)*4+(grade.hold||0)*3+(grade.sell||0)*2+(grade.strongSell||0))/total;
        consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
      }
      
      const breakdown = { strongBuy:grade.strongBuy||0, buy:grade.buy||0, hold:grade.hold||0, sell:grade.sell||0, strongSell:grade.strongSell||0 };
      
      // Put to signum-pattern-db
      await client.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'ANALYST:'+ticker, timestamp:Date.now(), consensus, totalAnalysts:total, bullishPct, breakdown, priceTarget }}));
      console.log(`Successfully put FMP Analyst + Price Target to DynamoDB for ${ticker}`);
    } else {
        console.log(`Skipped ${ticker} due to missing data`);
    }
  }
}
run();
