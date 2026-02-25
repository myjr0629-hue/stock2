const https = require('https');

// Get AMD post market the previous trading day (Feb 24, from 4:00 PM to 8:00 PM ET)
// That's 16:00 to 20:00 ET. In epoch ms:
// Feb 24 16:00 ET = 1772053200000 
// Feb 24 20:00 ET = 1772067600000

const url = "https://api.polygon.io/v2/aggs/ticker/AMD/range/1/minute/1772053200000/1772067600000?adjusted=true&sort=desc&limit=1&apiKey=iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

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
