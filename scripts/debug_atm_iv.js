// Debug: Check what 02/27 contracts look like from Polygon
const http = require('http');

const POLYGON_KEY = process.env.POLYGON_API_KEY || (() => {
    const fs = require('fs');
    const env = fs.readFileSync('.env.local', 'utf8');
    const match = env.match(/POLYGON_API_KEY=(.+)/);
    return match ? match[1].trim() : '';
})();

const ticker = 'NVDA';
const expiry = '2026-02-27';

const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiry}&limit=50&apiKey=${POLYGON_KEY}`;

console.log(`Fetching ${ticker} options for ${expiry}...`);

const https = require('https');
https.get(url, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const j = JSON.parse(data);
        if (!j.results) {
            console.log('No results:', JSON.stringify(j).substring(0, 300));
            return;
        }

        console.log(`Total contracts returned: ${j.results.length}`);
        console.log('');

        // Find ATM strike near $187.90
        const price = 187.90;
        const contracts = j.results.map(c => ({
            strike: c.details?.strike_price,
            type: c.details?.contract_type,
            iv_top: c.implied_volatility,
            iv_greeks: c.greeks?.implied_volatility,
            oi: c.open_interest,
        }));

        // Sort by distance from price
        contracts.sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));

        console.log('=== Nearest ATM contracts ===');
        contracts.slice(0, 10).forEach(c => {
            console.log(`  Strike $${c.strike} ${c.type.toUpperCase()} | iv_top=${c.iv_top} iv_greeks=${c.iv_greeks} | OI=${c.oi}`);
        });

        // Bloomberg calc
        const atmStrike = contracts[0].strike;
        const callAtm = contracts.find(c => c.strike === atmStrike && c.type === 'call');
        const putAtm = contracts.find(c => c.strike === atmStrike && c.type === 'put');

        console.log('');
        console.log('=== Bloomberg ATM IV calc ===');
        console.log(`ATM Strike: $${atmStrike}`);
        if (callAtm) console.log(`  Call IV: top=${callAtm.iv_top} greeks=${callAtm.iv_greeks}`);
        if (putAtm) console.log(`  Put IV: top=${putAtm.iv_top} greeks=${putAtm.iv_greeks}`);

        const callIv = callAtm?.iv_top || callAtm?.iv_greeks;
        const putIv = putAtm?.iv_top || putAtm?.iv_greeks;

        if (callIv && putIv) {
            // Check if values are decimal (0.6) or percentage (60)
            const cIv = callIv > 1 ? callIv : callIv * 100;
            const pIv = putIv > 1 ? putIv : putIv * 100;
            console.log(`  Call IV (%) = ${cIv.toFixed(1)}%`);
            console.log(`  Put IV (%)  = ${pIv.toFixed(1)}%`);
            console.log(`  ATM IV = ${((cIv + pIv) / 2).toFixed(1)}%`);
        }
    });
}).on('error', e => console.error(e));
