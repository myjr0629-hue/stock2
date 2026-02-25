const https = require('https');

// Target 09:25 AM ET to 09:29 AM ET on Feb 24, 2026
// Using exact Date objects for New York time
const start = new Date("2026-02-24T09:25:00-05:00").getTime();
const end = new Date("2026-02-24T09:29:59-05:00").getTime();

const url = `https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/${start}/${end}?adjusted=true&sort=asc&limit=10&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF`;

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.results && parsed.results.length > 0) {
                console.log(`\nFound ${parsed.results.length} minute candles right before market open.\n`);
                parsed.results.forEach(r => {
                    const time = new Date(r.t).toLocaleString("en-US", { timeZone: "America/New_York" });
                    console.log(`[${time}] Open: ${r.o}, High: ${r.h}, Low: ${r.l}, Close: ${r.c}, Volume: ${r.v}`);
                });

                const lastCandle = parsed.results[parsed.results.length - 1];
                console.log(`\n=> The REAL Pre-Market Close for AMD is the 09:29 AM Close price: $${lastCandle.c}`);
            } else {
                console.log("No results returned.", parsed);
            }
        } catch (e) {
            console.log("Error parsing:", data);
        }
    });
}).on('error', (err) => console.log('HTTPS Error:', err));
