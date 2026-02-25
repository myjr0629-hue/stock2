const https = require('https');

// Test overnight hours for AMD using Polygon Aggregates
// Date: Feb 24 (Yesterday) at 21:00 ET (9:00 PM - which is middle of overnight trading)
// Timestamp for 2026-02-24 21:00:00 ET is 1772071200000 ms

const url = "https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/1772064000000/1772074800000?adjusted=true&sort=asc&limit=120&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log("Error parsing:", data);
        }
    });
}).on('error', (err) => console.log('HTTPS Error:', err));
