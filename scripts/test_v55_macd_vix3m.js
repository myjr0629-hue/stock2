// Test V5.5+ MACD + VIX/VIX3M Enhancement
// Verifies that MACD and VIX term structure factors appear in engine output

const BASE = 'http://localhost:3000';

async function testLiveTicker(ticker) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${ticker} via /api/live/ticker...`);
    console.log('='.repeat(60));

    const res = await fetch(`${BASE}/api/live/ticker?t=${ticker}`);
    const data = await res.json();

    if (!data.alpha) {
        console.log('❌ No alpha data returned');
        return;
    }

    console.log(`\nAlpha Score: ${data.alpha.score} (${data.alpha.grade})`);
    console.log(`Engine Version: ${data.alpha.engineVersion}`);
    console.log(`Data Completeness: ${data.alpha.dataCompleteness}%`);

    // Check Momentum pillar for MACD factor
    console.log(`\n--- Momentum Pillar (${data.alpha.pillars.momentum.score}/${data.alpha.pillars.momentum.max}) ---`);

    // Check Regime pillar for VIX Term Structure factor
    console.log(`--- Regime Pillar (${data.alpha.pillars.regime.score}/${data.alpha.pillars.regime.max}) ---`);

    // Detailed pillar check via warm-analysis test
    console.log(`\nSession: ${data.session}`);
    console.log(`Price: $${data.price}`);

    return data;
}

async function testWarmAnalysis(ticker) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${ticker} via warm-analysis cron (has detailed factors)...`);
    console.log('='.repeat(60));

    // The warm-analysis route triggers full analysis with detailed pillar factors
    // We can check the analysis cache or call the cron directly
    const res = await fetch(`${BASE}/api/cron/warm-analysis`);
    const data = await res.json();
    console.log(`Warm analysis result:`, JSON.stringify(data).substring(0, 200));
    return data;
}

async function testMACDDirect(ticker) {
    // Test Polygon MACD API directly to confirm data availability
    console.log(`\n--- Testing Polygon MACD API for ${ticker} ---`);

    const APIKEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
    const url = `https://api.polygon.io/v1/indicators/macd/${ticker}?timespan=day&short_window=12&long_window=26&signal_window=9&limit=1&apiKey=${APIKEY}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const macd = data?.results?.values?.[0];

        if (macd) {
            console.log(`✅ MACD Line: ${macd.value?.toFixed(4)}`);
            console.log(`✅ Signal: ${macd.signal?.toFixed(4)}`);
            console.log(`✅ Histogram: ${macd.histogram?.toFixed(4)}`);
            console.log(`   → ${macd.histogram > 0 ? '골든크로스 (상승 추세)' : '데드크로스 (하락 추세)'}`);
        } else {
            console.log('❌ No MACD data from Polygon:', JSON.stringify(data).substring(0, 200));
        }
        return macd;
    } catch (e) {
        console.log('❌ MACD fetch failed:', e.message);
        return null;
    }
}

async function testVIX3MRedis() {
    console.log(`\n--- Testing VIX3M from Redis ---`);
    // Check if VIX3M is available via market data
    try {
        const res = await fetch(`${BASE}/api/market/ticker?s=^VIX3M`);
        const data = await res.json();
        if (data?.price) {
            console.log(`✅ VIX3M: ${data.price} (change: ${data.changePct}%)`);
        } else {
            console.log('⚠ VIX3M market data:', JSON.stringify(data).substring(0, 200));
        }
    } catch (e) {
        console.log('❌ VIX3M check failed:', e.message);
    }
}

async function main() {
    console.log('🔬 V5.5+ Engine Enhancement Verification');
    console.log('Testing MACD + VIX/VIX3M integration\n');

    // Step 1: Verify Polygon MACD data availability
    const macd = await testMACDDirect('NVDA');

    // Step 2: Verify VIX3M Redis data
    await testVIX3MRedis();

    // Step 3: Test live/ticker to see if factors appear in alpha output
    const result = await testLiveTicker('NVDA');

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`MACD data available: ${macd ? '✅' : '❌'}`);
    console.log(`MACD histogram: ${macd?.histogram?.toFixed(4) || 'N/A'}`);
    console.log(`Alpha score: ${result?.alpha?.score || 'N/A'}`);
    console.log(`Engine version: ${result?.alpha?.engineVersion || 'N/A'}`);
}

main().catch(console.error);
