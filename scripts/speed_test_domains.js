// Speed comparison: api.polygon.io vs api.massive.com
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const https = require('https');
const API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ ms: Date.now() - start, status: res.statusCode, size: data.length });
            });
        }).on('error', e => reject(e));
    });
}

const ENDPOINTS = [
    `/v2/snapshot/locale/us/markets/stocks/tickers/NVDA?apiKey=${API_KEY}`,
    `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=NVDA,TSLA,AAPL&apiKey=${API_KEY}`,
    `/v2/aggs/ticker/NVDA/prev?adjusted=true&apiKey=${API_KEY}`,
    `/v3/reference/tickers/NVDA?apiKey=${API_KEY}`,
];

const DOMAINS = [
    { name: 'api.polygon.io', base: 'https://api.polygon.io' },
    { name: 'api.massive.com', base: 'https://api.massive.com' },
];

async function runTest() {
    console.log('=== API Speed Test: Polygon vs Massive ===\n');
    console.log(`API Key: ${API_KEY?.slice(0,8)}...`);
    
    const ROUNDS = 3;
    const results = {};
    
    for (const domain of DOMAINS) {
        results[domain.name] = { total: 0, count: 0, times: [] };
    }
    
    for (let round = 1; round <= ROUNDS; round++) {
        console.log(`\n--- Round ${round}/${ROUNDS} ---`);
        
        for (const ep of ENDPOINTS) {
            const epShort = ep.split('?')[0].replace(/\/v[23]\//, '/');
            
            for (const domain of DOMAINS) {
                try {
                    const url = domain.base + ep;
                    const r = await httpGet(url);
                    results[domain.name].total += r.ms;
                    results[domain.name].count++;
                    results[domain.name].times.push(r.ms);
                    console.log(`  ${domain.name.padEnd(18)} ${epShort.padEnd(55)} ${r.ms}ms  (${r.status}, ${(r.size/1024).toFixed(1)}KB)`);
                } catch (e) {
                    console.log(`  ${domain.name.padEnd(18)} ${epShort.padEnd(55)} ERROR: ${e.message}`);
                }
            }
        }
    }
    
    console.log('\n=== SUMMARY ===');
    for (const domain of DOMAINS) {
        const r = results[domain.name];
        const avg = r.count > 0 ? Math.round(r.total / r.count) : 0;
        const min = Math.min(...r.times);
        const max = Math.max(...r.times);
        console.log(`${domain.name}: avg ${avg}ms, min ${min}ms, max ${max}ms (${r.count} calls)`);
    }
    
    const polyAvg = results['api.polygon.io'].total / results['api.polygon.io'].count;
    const massAvg = results['api.massive.com'].total / results['api.massive.com'].count;
    const diff = Math.abs(polyAvg - massAvg);
    const winner = polyAvg < massAvg ? 'api.polygon.io' : 'api.massive.com';
    console.log(`\n🏆 Winner: ${winner} (${Math.round(diff)}ms faster on average)`);
}

runTest().catch(console.error);
