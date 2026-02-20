// Check ATM IV from today's expiry (2026-02-20)
const https = require('https');
const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
    });
}

async function main() {
    const price = 186.68;

    // Try multiple expiry dates
    const dates = ['2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28'];

    for (const exp of dates) {
        const url = 'https://api.polygon.io/v3/snapshot/options/NVDA?expiration_date=' + exp + '&limit=250&apiKey=' + KEY;
        const data = await get(url);
        const count = (data.results || []).length;
        if (count > 0) {
            console.log(exp + ': ' + count + ' contracts');

            // Find ATM contracts
            const nearAtm = data.results
                .filter(c => Math.abs((c.details?.strike_price || 0) - price) < 5)
                .sort((a, b) => Math.abs(a.details.strike_price - price) - Math.abs(b.details.strike_price - price));

            if (nearAtm.length > 0) {
                console.log('  Near-ATM:');
                nearAtm.slice(0, 6).forEach(c => {
                    const s = c.details?.strike_price;
                    const type = c.details?.contract_type;
                    const gIv = c.greeks?.implied_volatility;
                    const topIv = c.implied_volatility;
                    const bestIv = gIv || topIv;
                    const pct = bestIv ? (bestIv > 1 ? bestIv.toFixed(1) : (bestIv * 100).toFixed(1)) : 'N/A';
                    console.log('    $' + s + ' ' + type + ' -> greeks.iv=' + (gIv ? gIv.toFixed(4) : '-') + ' / top.iv=' + (topIv ? topIv.toFixed(4) : '-') + ' => ' + pct + '%');
                });
            } else {
                // Show first few to understand strike range
                const sorted = data.results.sort((a, b) => (a.details?.strike_price || 0) - (b.details?.strike_price || 0));
                const strikes = sorted.map(c => c.details?.strike_price);
                console.log('  Strike range: $' + strikes[0] + ' - $' + strikes[strikes.length - 1]);
                console.log('  (Price $' + price + ' not in range? or no near-ATM)');
            }
        }
    }
}

main().catch(console.error);
