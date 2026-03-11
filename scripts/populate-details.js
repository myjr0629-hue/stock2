// Populate analyst/earnings/fundamentals/related in DynamoDB
// Run locally — no Lambda dependency
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const POLYGON_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const today = new Date().toISOString().slice(0, 10);

console.log('Finnhub key:', FINNHUB_KEY ? FINNHUB_KEY.slice(0, 6) + '...' : 'EMPTY');
console.log('Polygon key:', POLYGON_KEY.slice(0, 6) + '...');

const TICKERS = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','TSLA',
  'AMD','AVGO','PLTR','SMCI','ARM','COIN','AI','MRVL','MU',
  'CEG','VST','GEV','PWR','CCJ','SMR','ETN',
  'LLY','NVO','VRTX','REGN','VKTX','AMGN','GILD',
  'CRWD','PANW','FTNT','ZS','OKTA','NET',
  'LMT','RTX','AXON','KTOS','LDOS','ASTS',
  'SNOW','IONQ','DELL','PATH','TWLO',
  'XYZ','PYPL','SOFI','AFRM','HOOD','UPST',
  'CRM','NOW','DDOG','WDAY','MDB','TEAM','HUBS',
  'JPM','BAC','GS','WFC','V','MA',
  'XOM','CVX','UNH','JNJ','MRK',
  'HD','COST','WMT','DIS','NFLX',
  'BA','CAT','GE','MSTR','MARA','RIOT',
  'SPY','QQQ','IWM','UBER','ABNB','SHOP','BABA',
  'ISRG','TSM','ASML','SERV','RKLB',
];

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'SIGNUM/1.0' } });
  return r.json();
}

async function main() {
  let analystOk = 0, earningsOk = 0, fundOk = 0, relOk = 0;

  for (let i = 0; i < TICKERS.length; i++) {
    const ticker = TICKERS[i];
    
    // Analyst
    try {
      const recs = await fetchJson(`https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${FINNHUB_KEY}`);
      if (Array.isArray(recs) && recs.length > 0) {
        const latest = recs[0];
        const total = (latest.strongBuy||0)+(latest.buy||0)+(latest.hold||0)+(latest.sell||0)+(latest.strongSell||0);
        const bullishPct = total > 0 ? Math.round(((latest.strongBuy||0)+(latest.buy||0))/total*100) : 0;
        let consensus = 'N/A';
        if (total > 0) {
          const ws = ((latest.strongBuy||0)*5+(latest.buy||0)*4+(latest.hold||0)*3+(latest.sell||0)*2+(latest.strongSell||0))/total;
          consensus = ws>=4.3?'STRONG BUY':ws>=3.5?'BUY':ws>=2.5?'HOLD':ws>=1.7?'SELL':'STRONG SELL';
        }
        await doc.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'ANALYST:'+ticker, timestamp:Date.now(), consensus, totalAnalysts:total, bullishPct, breakdown:latest, period:latest.period||null }}));
        analystOk++;
      }
    } catch (e) { if (i < 3) console.log('Analyst err:', ticker, e.message?.slice(0,60)); }

    // Earnings
    try {
      const toDate = new Date(Date.now()+180*86400000).toISOString().slice(0,10);
      const eData = await fetchJson(`https://finnhub.io/api/v1/calendar/earnings?symbol=${ticker}&from=${today}&to=${toDate}&token=${FINNHUB_KEY}`);
      const events = eData?.earningsCalendar || [];
      if (events.length > 0) {
        const next = events.sort((a,b) => new Date(a.date)-new Date(b.date))[0];
        const daysUntil = Math.ceil((new Date(next.date).getTime()-new Date(today).getTime())/(86400000));
        await doc.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'EARNINGS:'+ticker, timestamp:Date.now(), nextDate:next.date, daysUntil, epsEstimate:next.epsEstimate||null, quarter:next.quarter||null, year:next.year||null, hour:next.hour||null }}));
        earningsOk++;
      }
    } catch {}

    // Fundamentals from Polygon
    try {
      const data = await fetchJson(`https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_KEY}`);
      const r = data?.results;
      if (r) {
        await doc.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'FUND:'+ticker, timestamp:Date.now(), name:r.name||ticker, marketCap:r.market_cap||null, shareCount:r.share_class_shares_outstanding||null, description:r.description?.slice(0,500)||null, sector:r.sic_description||null, exchange:r.primary_exchange||null }}));
        fundOk++;
      }
    } catch {}

    // Related
    try {
      const data = await fetchJson(`https://api.polygon.io/v1/related-companies/${ticker}?apiKey=${POLYGON_KEY}`);
      const rels = data?.results || [];
      if (rels.length > 0) {
        await doc.send(new PutCommand({ TableName:'signum-pattern-db', Item:{ pattern:'RELATED:'+ticker, timestamp:Date.now(), tickers: rels.slice(0,10).map(r => r.ticker) }}));
        relOk++;
      }
    } catch {}

    // Rate limit (Finnhub: 60/min)
    if (i > 0 && i % 5 === 0) {
      process.stdout.write(`\r${i}/${TICKERS.length} — analyst:${analystOk} earn:${earningsOk} fund:${fundOk} rel:${relOk}`);
      await new Promise(r => setTimeout(r, 5500));
    }
  }

  console.log(`\nDone: analyst=${analystOk} earnings=${earningsOk} fund=${fundOk} related=${relOk}`);
}

main().catch(e => console.error(e));
