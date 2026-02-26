// Quick test: check VIX3M Redis key + detailed pillar factors
const BASE = 'http://localhost:3000';

async function main() {
    // Test 1: Check warm-analysis output which has full pillar details
    console.log('=== Testing warm-analysis (single ticker) ===');

    // Direct engine test: import and call calculateAlphaScore with known values
    console.log('\n=== Direct Engine Factor Test ===');

    // Simulate calling with MACD data
    const testInput = {
        ticker: 'TEST',
        session: 'REG',
        price: 200,
        prevClose: 195,
        changePct: 2.56,
        // MACD data
        macdHistogram: 1.027,  // Golden cross
        // VIX3M data
        vixValue: 19.5,
        vix3mValue: 22.0,  // Contango (VIX < VIX3M)
    };

    // We can't import directly from scripts, but let's check 
    // the live/ticker detailed response
    console.log('\n=== Checking NVDA live/ticker with full alpha pillars ===');
    const res = await fetch(`${BASE}/api/live/ticker?t=NVDA`);
    const data = await res.json();

    if (data.alpha?.pillars) {
        console.log('\nMomentum:', JSON.stringify(data.alpha.pillars.momentum));
        console.log('Regime:', JSON.stringify(data.alpha.pillars.regime));
    }

    // Check flow/realtime-metrics to verify MACD appears in pillar breakdown
    console.log('\n=== Checking warm cache for NVDA ===');
    const cacheRes = await fetch(`${BASE}/api/watchlist/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: ['NVDA'], mode: 'full' })
    });
    const cacheData = await cacheRes.json();
    const nvda = cacheData?.results?.[0];
    if (nvda?.alphaSnapshot?.pillars) {
        console.log('\nWatchlist NVDA Momentum:', JSON.stringify(nvda.alphaSnapshot.pillars.momentum));
        console.log('Watchlist NVDA Regime:', JSON.stringify(nvda.alphaSnapshot.pillars.regime));
    }

    // Check if VIX3M is in Redis by checking macro data
    console.log('\n=== Checking Macro Data for VIX3M ===');
    const macroRes = await fetch(`${BASE}/api/market/macro`);
    const macroData = await macroRes.json();
    console.log('VIX:', macroData?.vix || 'N/A');
    console.log('VIX3M in macro?:', macroData?.vix3m || 'Not exposed in macro endpoint');

    console.log('\n=== DONE ===');
}

main().catch(console.error);
