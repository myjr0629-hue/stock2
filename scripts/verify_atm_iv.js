// Verify ATM IV calculation - Bloomberg standard
const http = require('http');

function fetch(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    console.log('=== ATM IV Verification (NVDA) ===\n');

    // 1. Fetch ticker data (dashboard uses this)
    const tickerData = await fetch('http://localhost:3000/api/live/ticker?ticker=NVDA');

    console.log('Price:', tickerData.underlyingPrice);
    console.log('Expiry:', tickerData.expiration);
    console.log('ATM IV (dashboard):', tickerData.atmIv, '%');
    console.log('Squeeze Score:', tickerData.squeezeScore);
    console.log('Squeeze Risk:', tickerData.squeezeRisk);

    // 2. Find ATM contracts from raw chain
    const chain = tickerData.rawChain || [];
    const price = tickerData.underlyingPrice || 0;

    if (chain.length === 0) {
        console.log('\nNo rawChain available, checking structure data...');
        const strikes = tickerData.structure?.strikes || [];
        console.log('Strikes count:', strikes.length);
        if (strikes.length > 0 && price > 0) {
            const atmStrike = strikes.reduce((c, s) => Math.abs(s - price) < Math.abs(c - price) ? s : c);
            console.log('ATM Strike:', atmStrike, '(dist:', Math.abs(atmStrike - price).toFixed(2), ')');
        }
        return;
    }

    // Find nearest ATM contracts
    const withIv = chain.filter(c => {
        const iv = c.greeks?.implied_volatility || c.implied_volatility || c.iv;
        return iv && iv > 0;
    }).sort((a, b) => {
        const sA = a.details?.strike_price || 0;
        const sB = b.details?.strike_price || 0;
        return Math.abs(sA - price) - Math.abs(sB - price);
    });

    console.log('\n=== Top 8 Nearest ATM Contracts ===');
    withIv.slice(0, 8).forEach(c => {
        const strike = c.details?.strike_price;
        const type = c.details?.contract_type;
        const rawIv = c.greeks?.implied_volatility || c.implied_volatility || c.iv;
        const ivPct = rawIv > 1 ? rawIv : rawIv * 100;
        const dist = Math.abs(strike - price).toFixed(2);
        console.log(`  $${strike} ${type.toUpperCase().padEnd(4)} IV=${rawIv.toFixed(4)} (${ivPct.toFixed(1)}%)  dist=$${dist}`);
    });

    // 3. Bloomberg calculation: ATM Call + Put average
    const strikes = [...new Set(withIv.map(c => c.details?.strike_price))].sort((a, b) => Math.abs(a - price) - Math.abs(b - price));
    const atmStrike = strikes[0];

    const atmCall = withIv.find(c => c.details?.strike_price === atmStrike && c.details?.contract_type === 'call');
    const atmPut = withIv.find(c => c.details?.strike_price === atmStrike && c.details?.contract_type === 'put');

    const callIv = atmCall ? (atmCall.greeks?.implied_volatility || atmCall.implied_volatility || atmCall.iv) : null;
    const putIv = atmPut ? (atmPut.greeks?.implied_volatility || atmPut.implied_volatility || atmPut.iv) : null;

    const toPercent = (v) => v > 1 ? v : v * 100;

    console.log('\n=== Bloomberg ATM IV Calculation ===');
    console.log('ATM Strike:', atmStrike, '(nearest to $' + price + ')');
    console.log('Call IV:', callIv ? toPercent(callIv).toFixed(1) + '%' : 'N/A');
    console.log('Put IV:', putIv ? toPercent(putIv).toFixed(1) + '%' : 'N/A');

    if (callIv && putIv) {
        const avg = (toPercent(callIv) + toPercent(putIv)) / 2;
        console.log('Bloomberg ATM IV:', Math.round(avg) + '% (avg of call+put)');
    }

    console.log('\n=== Dashboard Value ===');
    console.log('Dashboard ATM IV:', tickerData.atmIv, '%');
    console.log('Match:', tickerData.atmIv === Math.round((toPercent(callIv) + toPercent(putIv)) / 2) ? '✅ YES' : '❌ NO');
}

main().catch(console.error);
