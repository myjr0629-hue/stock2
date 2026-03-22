require('dotenv').config({ path: '.env.local' });
const K = process.env.FMP_API_KEY;
console.log('FMP Key:', K ? K.substring(0,8) + '...' : 'MISSING');

async function test(name, url) {
    const r = await fetch(url);
    const text = await r.text();
    console.log(`\n[${r.status}] ${name}`);
    if (r.status === 200) {
        try {
            const d = JSON.parse(text);
            if (Array.isArray(d)) {
                console.log(`Array(${d.length})`);
                if (d[0]) console.log(JSON.stringify(d[0], null, 2).substring(0, 600));
            } else {
                console.log(JSON.stringify(d, null, 2).substring(0, 600));
            }
        } catch {
            console.log(text.substring(0, 200));
        }
    } else {
        console.log(text.substring(0, 200));
    }
}

async function main() {
    // Test which FMP endpoints work with our plan
    await test('stable/profile', `https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${K}`);
    await test('stable/grades-consensus', `https://financialmodelingprep.com/stable/grades-consensus?symbol=AAPL&apikey=${K}`);
    await test('stable/price-target-consensus', `https://financialmodelingprep.com/stable/price-target-consensus?symbol=AAPL&apikey=${K}`);
    await test('stable/analyst-estimates', `https://financialmodelingprep.com/stable/analyst-estimates?symbol=AAPL&period=annual&apikey=${K}`);
    await test('stable/earning-calendar-confirmed', `https://financialmodelingprep.com/stable/earning-calendar-confirmed?symbol=AAPL&apikey=${K}`);
    await test('stable/earnings-surprises', `https://financialmodelingprep.com/stable/earnings-surprises?symbol=AAPL&apikey=${K}`);
}

main();
