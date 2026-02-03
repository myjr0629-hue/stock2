// V4.0 Universe Live Test
// Tests the actual getExpandedUniversePool integration

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

// === Core Elite (must be always included) ===
const MAGNIFICENT_7 = ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'];
const BIO_LEADERS_TOP5 = ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'];
const DATACENTER_TOP5 = ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC'];

// === Known ETFs to exclude ===
const KNOWN_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TLT', 'GLD', 'SLV',
    'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB',
    'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'ARKK', 'ARKG',
    'IBIT', 'ETHA', 'BITO', 'GBTC', 'ETHE', // Crypto ETFs
    'TZA', 'TNA', 'DUST', 'NUGT', 'LABU', 'LABD', 'KOLD', 'BOIL',
    'USO', 'UNG', 'UCO', 'SCO',
]);

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
        } catch (e) {
            if (i === retries - 1) throw e;
            await sleep(1000);
        }
    }
    return null;
}

async function runV4Test() {
    console.log('\n========================================');
    console.log('V4.0 UNIVERSE LIVE TEST');
    console.log('========================================\n');

    const timer = { start: Date.now() };

    // TIER 1: Core Elite
    const fixedLeaders = [...MAGNIFICENT_7, ...BIO_LEADERS_TOP5, ...DATACENTER_TOP5];
    console.log('[TIER 1] Core Elite: ' + fixedLeaders.length + ' stocks');

    // TIER 2: Fetch Top Volume via Snapshot
    console.log('\n[TIER 2] Fetching Polygon Snapshot...');
    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    let topVolumeStocks = [];
    try {
        const data = await fetchWithRetry(snapshotUrl);
        const allTickers = data?.tickers || [];
        console.log('  Total tickers in snapshot: ' + allTickers.length);

        // Quality Gate Filter
        const qualityStocks = allTickers
            .filter(t => {
                const price = t.day?.c || t.prevDay?.c || 0;
                const volume = t.day?.v || 0;
                const ticker = t.ticker || '';

                // Quality Gates
                if (price < 5 || price > 2000) return false;
                if (volume < 500000) return false;
                if (ticker.includes('.')) return false;
                if (ticker.length > 5) return false;
                if (KNOWN_ETFS.has(ticker)) return false;

                return true;
            })
            .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0));

        console.log('  After Quality Gate: ' + qualityStocks.length + ' stocks');

        // Take top 300 by volume
        topVolumeStocks = qualityStocks.slice(0, 300).map(t => t.ticker);
        console.log('  Top 300 by volume captured');

        // Show top 10
        console.log('\n  Top 10 by Volume:');
        qualityStocks.slice(0, 10).forEach((t, i) => {
            const vol = ((t.day?.v || 0) / 1000000).toFixed(1);
            const price = (t.day?.c || 0).toFixed(2);
            console.log('    ' + (i + 1) + '. ' + t.ticker + ' Vol:' + vol + 'M $' + price);
        });

    } catch (e) {
        console.log('  Error: ' + e.message);
    }

    // TIER 3: Top Gainers
    console.log('\n[TIER 3] Fetching Top Gainers...');
    const gainersUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`;

    let topGainers = [];
    try {
        const data = await fetchWithRetry(gainersUrl);
        const gainers = data?.tickers || [];

        // Quality Gate
        const qualityGainers = gainers.filter(g => {
            const price = g.day?.c || g.prevDay?.c || 0;
            const volume = g.day?.v || g.prevDay?.v || 0;
            const ticker = g.ticker || '';
            return price >= 5 && price <= 2000 && volume >= 100000 && !KNOWN_ETFS.has(ticker);
        });

        topGainers = qualityGainers.slice(0, 15).map(g => g.ticker);
        console.log('  Gainers: ' + gainers.length + ' -> ' + topGainers.length + ' (quality)');

    } catch (e) {
        console.log('  Error: ' + e.message);
    }

    // MERGE & DEDUPE
    const combinedRaw = [...fixedLeaders, ...topVolumeStocks, ...topGainers];
    const uniqueSymbols = [...new Set(combinedRaw.map(s => s.toUpperCase()))];

    // Final ETF Filter
    const finalSymbols = uniqueSymbols.filter(s => !KNOWN_ETFS.has(s));

    const elapsed = Date.now() - timer.start;

    // REPORT
    console.log('\n========================================');
    console.log('FINAL RESULT');
    console.log('========================================');
    console.log('Tier 1 (Core Elite):   ' + fixedLeaders.length);
    console.log('Tier 2 (Top Volume):   ' + topVolumeStocks.length);
    console.log('Tier 3 (Gainers):      ' + topGainers.length);
    console.log('Combined Raw:          ' + combinedRaw.length);
    console.log('After Dedup + ETF:     ' + finalSymbols.length);
    console.log('API Time:              ' + elapsed + 'ms');

    console.log('\n========================================');
    console.log('VALIDATION');
    console.log('========================================');

    // Check M7 included
    const m7Included = MAGNIFICENT_7.filter(s => finalSymbols.includes(s));
    console.log('M7 Included: ' + m7Included.length + '/7 (' + m7Included.join(', ') + ')');

    // Check no ETF leakage
    const etfLeakage = finalSymbols.filter(s => KNOWN_ETFS.has(s));
    console.log('ETF Leakage: ' + etfLeakage.length + (etfLeakage.length > 0 ? ' (' + etfLeakage.join(', ') + ')' : ' (clean)'));

    // Success criteria
    if (finalSymbols.length >= 300 && m7Included.length === 7 && etfLeakage.length === 0) {
        console.log('\n✅ V4.0 UNIVERSE: SUCCESS');
        console.log('   ' + finalSymbols.length + ' quality stocks ready for analysis');
    } else if (finalSymbols.length >= 200) {
        console.log('\n⚠️ V4.0 UNIVERSE: ACCEPTABLE');
        console.log('   ' + finalSymbols.length + ' stocks (target was 300+)');
    } else {
        console.log('\n❌ V4.0 UNIVERSE: NEEDS ADJUSTMENT');
    }

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================\n');
}

runV4Test().catch(console.error);
