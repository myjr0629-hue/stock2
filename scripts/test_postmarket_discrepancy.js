const https = require('https');

// We want to find where $214.40 came from in the post-market data.
// 16:00 ET (1772053200000) to 20:00 ET (1772067600000)
const url = `https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/1772053200000/1772067600000?adjusted=true&sort=desc&limit=500&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF`;

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.results) {
                const match = parsed.results.find(r => r.c === 214.40 || Math.abs(r.c - 214.40) < 0.05);
                console.log("Last candle:", parsed.results[0]);
                console.log("Match for 214.40:", match);
                if (match) {
                    console.log("Time of 214.40:", new Date(match.t).toLocaleString("en-US", { timeZone: "America/New_York" }));
                }
            } else {
                console.log("No results");
            }
        } catch (e) {
            console.log("Error parsing:", data);
        }
    });
}).on('error', (err) => console.log('HTTPS Error:', err));
