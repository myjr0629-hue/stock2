require('dotenv').config({ path: '.env.local' });
const https = require('https');
const url = 'https://api.polygon.io/stocks/v1/short-volume?ticker=NVDA&limit=1&apiKey=' + process.env.POLYGON_API_KEY;

https.get(url, res => {
    let d = ''; res.on('data', c=>d+=c);
    res.on('end', () => console.log('Polygon SV NVDA:', d));
});
