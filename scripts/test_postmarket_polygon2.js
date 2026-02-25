const https = require('https');

// Calculate 16:00 ET to 20:00 ET for previous trading day (Feb 24, 2026)
// Using Date objects to be safe
const d = new Date("2026-02-24T16:00:00-05:00");
const d2 = new Date("2026-02-24T20:00:00-05:00");

const url = `https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/${d.getTime()}/${d2.getTime()}?adjusted=true&sort=desc&limit=1&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF`;

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
