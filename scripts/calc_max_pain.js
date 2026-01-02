
const fs = require('fs');

try {
    const raw = fs.readFileSync('scripts/nvda_data.json', 'utf8');
    const data = JSON.parse(raw);
    const chain = data.sample || []; // In previous step I updated endpoint to return full list in 'sample'

    console.log("Total Contracts:", chain.length);

    // 1. Filter Nearest
    const expirations = chain.map(c => c.details.expiration_date).sort();
    const nearest = expirations[0];
    console.log("Nearest Expiry:", nearest);

    const filtered = chain.filter(c => c.details.expiration_date === nearest);
    console.log("Nearest Count:", filtered.length);

    // 2. Calc Max Total OI (Pin Zone)
    const strikeMap = new Map();
    filtered.forEach(c => {
        const s = c.details.strike_price;
        const oi = c.open_interest || 0;
        strikeMap.set(s, (strikeMap.get(s) || 0) + oi);
    });

    let maxTotal = -1;
    let pinStrike = 0;
    strikeMap.forEach((val, key) => {
        if (val > maxTotal) {
            maxTotal = val;
            pinStrike = key;
        }
    });

    console.log(`Pin Zone (Max Total OI): ${pinStrike} (OI: ${maxTotal})`);

    // 3. Calc Max Pain (Total Loss Minimization)
    // Loss at Strike S = Sum( Abs(S - K) * OI_Put ) for K < S + Sum ( Abs(S - K) * OI_Call ) for K > S ?
    // Actually:
    // For a settlement price P:
    // Call writers lose: max(0, P - K) * OI_Call
    // Put writers lose: max(0, K - P) * OI_Put
    // Total Pain at P = Sum ( CallLoss + PutLoss )

    // We calculate this "Total Pain" for every Strike price available in the chain as a potential settlement price.

    let minPain = Infinity;
    let maxPainStrike = 0;

    const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);

    strikes.forEach(pricePoint => {
        let totalPain = 0;
        filtered.forEach(c => {
            const K = c.details.strike_price;
            const oi = c.open_interest || 0;
            const type = c.details.contract_type;

            if (type === 'call') {
                if (pricePoint > K) totalPain += (pricePoint - K) * oi;
            } else {
                if (pricePoint < K) totalPain += (K - pricePoint) * oi;
            }
        });

        if (totalPain < minPain) {
            minPain = totalPain;
            maxPainStrike = pricePoint;
        }
    });

    console.log(`Real Max Pain: ${maxPainStrike} (Pain: ${minPain})`);

} catch (e) {
    console.error(e);
}
