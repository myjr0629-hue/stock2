// Smart Universe Selection Test Script
// Tests Polygon APIs and creates optimal stock selection logic

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
            if (res.status === 429) {
                console.log('Rate limited, waiting...');
                await sleep(2000);
                continue;
            }
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            if (i === retries - 1) throw e;
            await sleep(1000);
        }
    }
}

async function testUniverseSelection() {
    console.log('\n========================================');
    console.log('SMART UNIVERSE SELECTION TEST');
    console.log('========================================\n');

    const results = {
        tier1_core: [],
        tier2_screener: [],
        tier3_discovery: [],
        stats: {}
    };

    // ============ TIER 1: Core Elite (Static) ============
    console.log('[TIER 1] Core Elite (Static List)');
    const CORE_ELITE = [
        // Magnificent 7
        'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA',
        // Semis
        'AMD', 'AVGO', 'QCOM', 'TSM', 'INTC', 'MU', 'TXN', 'MRVL',
        // Growth Tech
        'NFLX', 'CRM', 'ADBE', 'ORCL', 'NOW', 'PANW', 'SNOW', 'PLTR',
        // Healthcare
        'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'AMGN', 'GILD', 'VRTX',
        // Finance
        'JPM', 'V', 'MA', 'BAC', 'GS', 'MS', 'BLK',
        // Industrial
        'CAT', 'DE', 'HON', 'GE', 'BA', 'LMT', 'RTX',
        // Consumer
        'COST', 'WMT', 'HD', 'MCD', 'SBUX', 'NKE',
        // Energy
        'XOM', 'CVX', 'SLB',
        // Emerging
        'COIN', 'HOOD', 'SQ', 'UBER', 'ABNB'
    ];
    results.tier1_core = CORE_ELITE;
    console.log('  Count: ' + CORE_ELITE.length);

    // ============ TIER 2: Market Screener (API) ============
    console.log('\n[TIER 2] Market Screener via Polygon API');

    // Test 1: Get stock tickers sorted by market cap
    console.log('  Fetching S&P 500 level stocks...');
    const tickersUrl = `${BASE_URL}/v3/reference/tickers?market=stocks&active=true&type=CS&limit=500&sort=ticker&order=asc&apiKey=${POLYGON_API_KEY}`;

    try {
        const tickersData = await fetchWithRetry(tickersUrl);
        console.log('  Raw tickers fetched: ' + (tickersData.results?.length || 0));

        // We can't filter by market cap directly in free tier
        // So we use a known list approach + gainers/active
        results.stats.rawTickers = tickersData.results?.length || 0;
    } catch (e) {
        console.log('  Error fetching tickers: ' + e.message);
    }

    // ============ TIER 3: Discovery (Real-time Movers) ============
    console.log('\n[TIER 3] Discovery - Real-time Movers');

    // Test: Top Gainers
    console.log('  Fetching Top Gainers...');
    const gainersUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`;

    try {
        const gainersData = await fetchWithRetry(gainersUrl);
        const gainers = gainersData.tickers || [];

        // Apply Quality Gate
        const qualityGainers = gainers.filter(g => {
            const price = g.day?.c || g.prevDay?.c || 0;
            const volume = g.day?.v || g.prevDay?.v || 0;
            return price >= 5 && price <= 2000 && volume >= 100000;
        });

        console.log('  Raw Gainers: ' + gainers.length);
        console.log('  After Quality Gate: ' + qualityGainers.length);

        // Show top 10
        console.log('  Top 10 Quality Gainers:');
        qualityGainers.slice(0, 10).forEach((g, i) => {
            const price = g.day?.c || g.prevDay?.c || 0;
            const change = g.todaysChangePerc || 0;
            console.log('    ' + (i + 1) + '. ' + g.ticker + ' $' + price.toFixed(2) + ' (+' + change.toFixed(1) + '%)');
        });

        results.tier3_discovery.push(...qualityGainers.slice(0, 15).map(g => g.ticker));
        results.stats.gainersRaw = gainers.length;
        results.stats.gainersQuality = qualityGainers.length;
    } catch (e) {
        console.log('  Error fetching gainers: ' + e.message);
    }

    // Test: Most Active
    console.log('\n  Fetching Most Active...');
    const activeUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    try {
        const activeData = await fetchWithRetry(activeUrl);
        const allTickers = activeData.tickers || [];

        // Sort by volume
        const sortedByVolume = allTickers
            .filter(t => {
                const price = t.day?.c || t.prevDay?.c || 0;
                const volume = t.day?.v || 0;
                return price >= 5 && price <= 2000 && volume >= 500000;
            })
            .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0));

        console.log('  Total Tickers in Snapshot: ' + allTickers.length);
        console.log('  After Quality Gate: ' + sortedByVolume.length);

        // Show top 10 by volume
        console.log('  Top 10 Most Active:');
        sortedByVolume.slice(0, 10).forEach((t, i) => {
            const price = t.day?.c || t.prevDay?.c || 0;
            const vol = ((t.day?.v || 0) / 1000000).toFixed(1);
            console.log('    ' + (i + 1) + '. ' + t.ticker + ' $' + price.toFixed(2) + ' Vol:' + vol + 'M');
        });

        results.stats.snapshotTotal = allTickers.length;
        results.stats.snapshotQuality = sortedByVolume.length;

        // Add to tier2 (large universe from snapshot)
        results.tier2_screener = sortedByVolume.slice(0, 300).map(t => t.ticker);

    } catch (e) {
        console.log('  Error fetching active: ' + e.message);
    }

    // ============ FINAL SUMMARY ============
    console.log('\n========================================');
    console.log('FINAL SUMMARY');
    console.log('========================================');

    // Merge all tiers (unique)
    const allTickers = new Set([
        ...results.tier1_core,
        ...results.tier2_screener,
        ...results.tier3_discovery
    ]);

    console.log('\nTier Breakdown:');
    console.log('  Tier 1 (Core Elite):    ' + results.tier1_core.length);
    console.log('  Tier 2 (Screener):      ' + results.tier2_screener.length);
    console.log('  Tier 3 (Discovery):     ' + results.tier3_discovery.length);
    console.log('  ─────────────────────────');
    console.log('  TOTAL UNIQUE:           ' + allTickers.size);

    console.log('\nQuality Gate Stats:');
    console.log('  Gainers: ' + results.stats.gainersRaw + ' -> ' + results.stats.gainersQuality + ' (quality)');
    console.log('  Snapshot: ' + results.stats.snapshotTotal + ' -> ' + results.stats.snapshotQuality + ' (quality)');

    console.log('\n========================================');
    console.log('RECOMMENDATION');
    console.log('========================================');

    if (allTickers.size >= 300) {
        console.log('SUCCESS: Universe size is adequate (' + allTickers.size + ')');
    } else if (allTickers.size >= 200) {
        console.log('ACCEPTABLE: Universe size is moderate (' + allTickers.size + ')');
    } else {
        console.log('WARNING: Universe size may be too small (' + allTickers.size + ')');
    }

    console.log('\nOptimal Selection Strategy:');
    console.log('1. Use Polygon Snapshot API for ~300 quality stocks');
    console.log('2. Add Core Elite (always included)');
    console.log('3. Add Gainers for discovery');
    console.log('4. Apply Quality Gate: $5+, Vol 500K+');

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================\n');
}

testUniverseSelection().catch(console.error);
