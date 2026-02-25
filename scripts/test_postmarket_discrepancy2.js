const https = require('https');

// Target 16:00 ET to 20:00 ET on Feb 24
// 16:00 ET is 1771966800000 ms
// 20:00 ET is 1771981200000 ms

const url = `https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/1771966800000/1771981200000?adjusted=true&sort=desc&limit=1000&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF`;

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.results && parsed.results.length > 0) {
                const first = parsed.results[0]; // The latest one (sort=desc)
                const last = parsed.results[parsed.results.length - 1]; // The earliest one

                console.log("Latest (20:00):", new Date(first.t).toLocaleString("en-US", { timeZone: "America/New_York" }), "- Close:", first.c);
                console.log("Earliest (16:00):", new Date(last.t).toLocaleString("en-US", { timeZone: "America/New_York" }), "- Close:", last.c);

                const match = parsed.results.find(r => Math.abs(r.c - 214.40) < 0.05);
                if (match) {
                    console.log("\nFound $214.40 match at time:", new Date(match.t).toLocaleString("en-US", { timeZone: "America/New_York" }), "- Exact Close:", match.c);
                } else {
                    console.log("\nCould not find a $214.40 print in this 4-hour window.");
                }
            } else {
                console.log("No results returned.", parsed);
            }
        } catch (e) {
            console.log("Error parsing:", data);
        }
    });
}).on('error', (err) => console.log('HTTPS Error:', err));
