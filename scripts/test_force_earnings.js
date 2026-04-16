require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const FMP_KEY = process.env.FMP_API_KEY;

async function run() {
  const tks = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD'];
  const FH_KEY = process.env.FINNHUB_KEY0 || process.env.FINNHUB_KEY1 || process.env.FINNHUB_API_KEY;
  const today = new Date().toISOString().slice(0,10);
  const toDate = new Date(Date.now()+180*86400000).toISOString().slice(0,10);
  
  for (const ticker of tks) {
    try {
      let date = '2026-05-21', epsEstimate = null;
      try {
        const evs = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${toDate}&symbol=${ticker}&token=${FH_KEY}`).then(r=>r.json());
        if (evs.earningsCalendar && evs.earningsCalendar.length > 0) {
          const next = evs.earningsCalendar.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())[0];
          date = next.date;
          epsEstimate = next.epsEstimate;
        }
      } catch(e) {}
      
      let fwEps = null, fwRev = null, fwYear = null;
      try {
        const fws = await fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${ticker}&period=annual&apikey=${FMP_KEY}`).then(r=>r.json());
        if (Array.isArray(fws)) {
          const currentYearStr = new Date().toISOString().slice(0,4);
          const next = [...fws].reverse().find(x => x.date && x.date.slice(0,4) > currentYearStr);
          if (next && next.epsAvg) {
            fwEps = next.epsAvg;
            fwRev = next.revenueAvg;
            fwYear = next.date.slice(0,4);
          }
        }
      } catch(e) {}
      
      const daysUntil = Math.max(0, Math.ceil((new Date(date).getTime()-Date.now())/86400000));
      const daysLabel = daysUntil <= 0 ? 'today' : 'D-'+daysUntil;
      
      await client.send(new PutCommand({ 
        TableName:'signum-pattern-db', 
        Item:{ 
          pattern:'EARNINGS:'+ticker, 
          timestamp:Date.now(), 
          nextDate:date, 
          daysUntil, 
          epsEstimate, 
          quarter:null, year:null, hour:null, 
          forwardEps:fwEps, forwardRevenue:fwRev, forwardYear:fwYear
        }
      }));
      console.log(`Updated EARNINGS for ${ticker}: date=${date}, epsExt=${epsEstimate}, forwardEps=${fwEps}`);
      
      try {
        const { Redis } = require('@upstash/redis');
        const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
        await redis.del(`cmd:data:${ticker}`);
        await redis.del(`swr:earnings:${ticker}`);
        console.log(` flushed redis cache for ${ticker}`);
      } catch(e) {}
      
    } catch(err) {
      console.error(err.message);
    }
  }
}
run();
