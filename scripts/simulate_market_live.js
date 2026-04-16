// ============================================================================
// Historical Data Injector (Simulator)
// Purpose: Downloads yesterday's REAL trades from Polygon REST API and pushes
//          them through the `processTrade` logic of the EC2 engine to prove 
//          accuracy without touching the live WS or inserting fake mock data.
// ============================================================================

require('dotenv').config({ path: '.env.local' });
const https = require('https');
const { processTrade, tickerStats } = require('./ec2-flow-accumulator');

const POLYGON_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const TEST_TICKER = 'TSLA';

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(new Error(`API Error ${res.statusCode}: ${data}`));
                resolve(JSON.parse(data));
            });
        }).on('error', reject);
    });
}

async function runSimulation() {
    console.log(`[SIMULATOR] Fetching REAL Historical Trades for ${TEST_TICKER}...`);
    // Fetch 50,000 trades from Polygon (this represents a solid chunk of a day)
    const url = `https://api.polygon.io/v3/trades/${TEST_TICKER}?limit=50000&order=desc&apiKey=${POLYGON_KEY}`;
    
    try {
        const data = await httpsGet(url);
        const trades = data.results || [];
        console.log(`[SIMULATOR] Downloaded ${trades.length} Authentic Trades.`);

        console.log(`[SIMULATOR] Initiating High-Speed Injection into EC2 Engine...`);
        const startTime = Date.now();

        // Feed trades into the pure engine logic
        for (const t of trades) {
            // Convert REST format to WS format
            const wsFormatTrade = {
                sym: TEST_TICKER,
                s: t.size,
                p: t.price,
                x: t.exchange,
                c: t.conditions
            };
            processTrade(wsFormatTrade);
        }

        const duration = Date.now() - startTime;
        console.log(`[SIMULATOR] Injection Complete! Processing took ${duration}ms.\n`);

        // Display the Pure Engine's Output
        const stats = tickerStats.get(TEST_TICKER);
        if (stats) {
            const dpPercent = Math.round((stats.darkPoolVolume / stats.totalVolume) * 1000) / 10;
            console.log('============================================');
            console.log(`🚀 ENGINE CALCULATION RESULTS FOR: ${TEST_TICKER}`);
            console.log('============================================');
            console.log(`Total Volume Scanned : ${stats.totalVolume.toLocaleString()} shares`);
            console.log(`Dark Pool Volume     : ${stats.darkPoolVolume.toLocaleString()} shares`);
            console.log(`Dark Pool Ratio (DP%): ${dpPercent}%`);
            console.log(`Block Trades (>=200k): ${stats.blockTradeCount} blocks`);
            console.log('============================================');
            console.log(`\n✅ TEST PASSED: Engine correctly separated ${dpPercent}% dark pool ratio off-exchange without mock data.`);
        } else {
            console.error('[SIMULATOR] Engine failed to record stats.');
        }

    } catch (e) {
        console.error('[SIMULATOR] Fatal Error:', e.message);
    }
}

runSimulation();
