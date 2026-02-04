// Test: Multi-Expiration Gamma Flip Calculation
// Compare single vs multiple expirations for NVDA

require('dotenv').config({ path: '.env.local' });

const POLYGON_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
const BASE_URL = 'https://api.polygon.io';

async function fetchOptions(ticker, expirationGte, expirationLte) {
    const url = `${BASE_URL}/v3/snapshot/options/${ticker}?expiration_date.gte=${expirationGte}&expiration_date.lte=${expirationLte}&limit=250&apiKey=${POLYGON_API_KEY}`;

    console.log(`   Fetching options...`);

    let allContracts = [];
    let nextUrl = url;
    let pages = 0;

    while (nextUrl && pages < 10) {
        const res = await fetch(nextUrl);
        const data = await res.json();

        if (pages === 0) {
            console.log(`   Status: ${data.status}, Results: ${data.results?.length || 0}`);
            if (data.error) console.log(`   Error: ${data.error}`);
        }

        if (data.results) {
            allContracts = allContracts.concat(data.results);
        }

        nextUrl = data.next_url ? `${data.next_url}&apiKey=${POLYGON_API_KEY}` : null;
        pages++;
    }

    return allContracts;
}

function calculateGammaFlip(contracts, underlyingPrice) {
    const gexByStrike = new Map();

    contracts.forEach(c => {
        const strike = c.details?.strike_price;
        const gamma = c.greeks?.gamma;
        const oi = c.open_interest || 0;
        const type = c.details?.contract_type;

        if (strike && gamma && oi > 0) {
            const dir = type === 'call' ? 1 : -1;
            const gex = gamma * oi * 100 * dir;
            gexByStrike.set(strike, (gexByStrike.get(strike) || 0) + gex);
        }
    });

    const sortedStrikes = Array.from(gexByStrike.entries()).sort((a, b) => a[0] - b[0]);

    let cumGex = 0;
    const crossings = [];

    for (let i = 0; i < sortedStrikes.length; i++) {
        const [strike, gex] = sortedStrikes[i];
        const prevCum = cumGex;
        cumGex += gex;

        if (i > 0 && ((prevCum < 0 && cumGex >= 0) || (prevCum > 0 && cumGex <= 0))) {
            crossings.push(strike);
        }
    }

    // Find closest to current price
    let gammaFlip = null;
    if (crossings.length > 0) {
        gammaFlip = crossings.reduce((closest, strike) =>
            Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
        );
    }

    return { gammaFlip, crossings, totalStrikes: sortedStrikes.length };
}

async function main() {
    const ticker = 'NVDA';

    // Get current price
    const quoteRes = await fetch(`${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`);
    const quoteData = await quoteRes.json();
    const underlyingPrice = quoteData.ticker?.lastTrade?.p || quoteData.ticker?.prevDay?.c || 180;

    console.log(`\n=== NVDA Multi-Expiration Gamma Flip Test ===`);
    console.log(`Current Price: $${underlyingPrice.toFixed(2)}`);
    console.log(`SpotGamma Reference: $115`);
    console.log(`\n`);

    // Today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Test 1: Single week (current)
    const oneWeek = new Date(today);
    oneWeek.setDate(oneWeek.getDate() + 7);
    const oneWeekStr = oneWeek.toISOString().split('T')[0];

    console.log(`[1] Single Week: ${todayStr} to ${oneWeekStr}`);
    const singleWeek = await fetchOptions(ticker, todayStr, oneWeekStr);
    const result1 = calculateGammaFlip(singleWeek, underlyingPrice);
    console.log(`   Contracts: ${singleWeek.length}`);
    console.log(`   Crossings: [${result1.crossings.join(', ')}]`);
    console.log(`   Gamma Flip: $${result1.gammaFlip}`);
    console.log();

    // Test 2: 30 days
    const thirtyDays = new Date(today);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const thirtyDaysStr = thirtyDays.toISOString().split('T')[0];

    console.log(`[2] 30 Days: ${todayStr} to ${thirtyDaysStr}`);
    const monthly = await fetchOptions(ticker, todayStr, thirtyDaysStr);
    const result2 = calculateGammaFlip(monthly, underlyingPrice);
    console.log(`   Contracts: ${monthly.length}`);
    console.log(`   Crossings: [${result2.crossings.join(', ')}]`);
    console.log(`   Gamma Flip: $${result2.gammaFlip}`);
    console.log();

    // Test 3: 60 days (like SpotGamma typically uses)
    const sixtyDays = new Date(today);
    sixtyDays.setDate(sixtyDays.getDate() + 60);
    const sixtyDaysStr = sixtyDays.toISOString().split('T')[0];

    console.log(`[3] 60 Days: ${todayStr} to ${sixtyDaysStr}`);
    const biMonthly = await fetchOptions(ticker, todayStr, sixtyDaysStr);
    const result3 = calculateGammaFlip(biMonthly, underlyingPrice);
    console.log(`   Contracts: ${biMonthly.length}`);
    console.log(`   Crossings: [${result3.crossings.join(', ')}]`);
    console.log(`   Gamma Flip: $${result3.gammaFlip}`);
    console.log();

    console.log(`=== Summary ===`);
    console.log(`Single Week: $${result1.gammaFlip}`);
    console.log(`30 Days:     $${result2.gammaFlip}`);
    console.log(`60 Days:     $${result3.gammaFlip}`);
    console.log(`SpotGamma:   $115 (reference)`);
}

main().catch(console.error);
