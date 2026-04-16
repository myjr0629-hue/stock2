const https = require('https');
require('dotenv').config({ path: '.env.local' });

const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY;
const TICKER = 'TSLA';

// Calculate time 5 minutes ago
const now = new Date();
const fiveMinAgo = new Date(now.getTime() - 5 * 60000);
// Format as nanosecond unix timestamp for Polygon V3 Trades API
const timestamp = fiveMinAgo.getTime() * 1000000; 

const url = `https://api.polygon.io/v3/trades/${TICKER}?timestamp.gte=${timestamp}&limit=10&apiKey=${POLYGON_KEY}`;

console.log(`Testing Polygon API for Blue Ocean ATS / Overnight Session...`);
console.log(`Current Time (NY): ${new Date().toLocaleString("en-US", {timeZone: "America/New_York"})}`);
console.log(`Fetching trades since 5 minutes ago...`);

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`API Error: ${res.statusCode}`);
            console.error(data);
            return;
        }
        const json = JSON.parse(data);
        if (json.results && json.results.length > 0) {
            console.log(`✅ SUCCESS: Polygon RETURNED ${json.results.length} trades in the overnight session!`);
            console.log(`Sample Trade 1: Price $${json.results[0].price}, Size: ${json.results[0].size}, Exchange: ${json.results[0].exchange}`);
            
            // Check if it's Blue Ocean (Exchange 41 = Blue Ocean?)
            const exchanges = new Set(json.results.map(t => t.exchange));
            console.log(`Exchanges seen: ${Array.from(exchanges).join(', ')}`);
        } else {
            console.log(`❌ NO DATA: Polygon returned ZERO trades for the last 5 minutes.`);
            console.log(`This confirms the API tier/key does NOT provide Overnight (Blue Ocean) feeds.`);
            console.log(JSON.stringify(json, null, 2));
        }
    });
}).on('error', (err) => {
    console.error('Network error:', err.message);
});
