const fs = require('fs');
const MASSIVE_API_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const ticker = "TSLA";
const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${MASSIVE_API_KEY}`;

fetch(url)
    .then(res => res.json())
    .then(data => {
        fs.writeFileSync('raw_snapshot_utf8.json', JSON.stringify(data, null, 2), 'utf8');
        console.log("Done");
    })
    .catch(err => console.error(err));
