// Cross-verify AAPL volume with Polygon daily aggregate
require('dotenv').config({ path: '.env.local' });
const POLY_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY;

async function main() {
    console.log('\n═══ AAPL VOLUME CROSS-CHECK ═══\n');

    // 1. Daily aggregate (official volume)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    try {
        const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/${yesterday}/${today}?adjusted=true&sort=desc&limit=2&apiKey=${POLY_KEY}`);
        const data = await res.json();
        if (data.results?.length > 0) {
            data.results.forEach(bar => {
                const date = new Date(bar.t).toISOString().split('T')[0];
                console.log(`  ${date}: Volume = ${bar.v?.toLocaleString()}, Close = $${bar.c}`);
            });
        }
    } catch (e) { console.log(`  ❌ ${e.message}`); }

    // 2. Snapshot (current state)
    try {
        const res = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apiKey=${POLY_KEY}`);
        const data = await res.json();
        const t = data?.ticker;
        console.log(`\n  Snapshot day.v: ${t?.day?.v?.toLocaleString()}`);
        console.log(`  Snapshot prevDay.v: ${t?.prevDay?.v?.toLocaleString()}`);
        console.log(`  Snapshot todaysChange: ${t?.todaysChange}`);
        console.log(`  Snapshot todaysChangePerc: ${t?.todaysChangePerc}`);
    } catch (e) { console.log(`  ❌ ${e.message}`); }

    // 3. Trade count sample 
    console.log('\n  Our DP data:');
    console.log(`  totalVolume in rt-metrics: 5,736,671`);
    console.log(`  dpVolume: 5,466,774`);
    console.log(`  DP%: 95.3%`);
    console.log('\n  Note: POST session → most trades are off-exchange (FINRA TRF)');
    console.log('  This is expected behavior for after-hours trading.');
}

main().catch(e => console.error(e));
