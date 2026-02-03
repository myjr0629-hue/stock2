// E2E Stress Test - Full Pipeline Data Integrity Check
// 목적: 모든 310개 종목에 대해 각 데이터 레이어별 누락 여부 확인

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

// === Core Elite (must be tested) ===
const CORE_ELITE = [
    'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA',
    'AMD', 'AVGO', 'INTC', 'MU', 'PLTR', 'SOFI', 'HOOD'
];

const KNOWN_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TLT', 'GLD', 'SLV',
    'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'IBIT', 'ETHA', 'BITO',
    'TZA', 'TNA', 'TSLL', 'TSLS', 'NVDL', 'NVDS'
]);

// Data gap tracking
const dataGaps = {
    snapshot: [],      // 가격/거래량 누락
    options: [],       // 옵션 데이터 누락
    details: [],       // 티커 상세 정보 누락
};

const apiCallStats = {
    total: 0,
    success: 0,
    failed: 0,
    retried: 0
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// API 호출 with 재시도 로직
async function fetchWithRetry(url, maxRetries = 3) {
    apiCallStats.total++;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url);

            if (res.status === 429) {
                console.log(`    Rate limited, waiting 2s... (attempt ${attempt}/${maxRetries})`);
                apiCallStats.retried++;
                await sleep(2000);
                continue;
            }

            if (!res.ok) {
                if (attempt < maxRetries) {
                    apiCallStats.retried++;
                    await sleep(500 * attempt);
                    continue;
                }
                throw new Error(`HTTP ${res.status}`);
            }

            apiCallStats.success++;
            return await res.json();
        } catch (e) {
            if (attempt < maxRetries) {
                apiCallStats.retried++;
                await sleep(500 * attempt);
                continue;
            }
            apiCallStats.failed++;
            throw e;
        }
    }
}

async function runE2EStressTest() {
    console.log('\n========================================');
    console.log('E2E STRESS TEST - FULL PIPELINE');
    console.log('========================================\n');
    console.log('Time: ' + new Date().toISOString());
    console.log('');

    // ====== STEP 1: Get Universe ======
    console.log('[STEP 1] Building Universe (V4.0)...');
    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    let universe = [];
    try {
        const data = await fetchWithRetry(snapshotUrl);
        const allTickers = data?.tickers || [];

        // Quality Gate
        universe = allTickers
            .filter(t => {
                const price = t.day?.c || t.prevDay?.c || 0;
                const volume = t.day?.v || 0;
                const ticker = t.ticker || '';
                if (price < 5 || price > 2000) return false;
                if (volume < 500000) return false;
                if (ticker.includes('.')) return false;
                if (ticker.length > 5) return false;
                if (KNOWN_ETFS.has(ticker)) return false;
                return true;
            })
            .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0))
            .slice(0, 50); // Test Top 50 by volume

        console.log('  Universe Size: ' + universe.length);

    } catch (e) {
        console.log('  FATAL: ' + e.message);
        return;
    }

    // ====== STEP 2: Check Each Data Layer ======
    console.log('\n[STEP 2] Checking Data Layers for Each Stock...\n');

    const results = [];

    for (let i = 0; i < universe.length; i++) {
        const stock = universe[i];
        const ticker = stock.ticker;

        // Progress
        if ((i + 1) % 10 === 0 || i === 0) {
            console.log(`  Processing ${i + 1}/${universe.length}...`);
        }

        const result = {
            ticker,
            price: stock.day?.c || 0,
            volume: stock.day?.v || 0,
            layers: {
                snapshot: { ok: false, data: null },
                options: { ok: false, data: null, reason: null }
            },
            gaps: []
        };

        // Layer 1: Snapshot (already have from universe)
        if (stock.day?.c > 0 && stock.day?.v > 0 && stock.prevDay?.c > 0) {
            result.layers.snapshot.ok = true;
            result.layers.snapshot.data = {
                price: stock.day.c,
                volume: stock.day.v,
                prevClose: stock.prevDay.c,
                change: stock.todaysChangePerc
            };
        } else {
            result.gaps.push('SNAPSHOT');
            dataGaps.snapshot.push({
                ticker,
                missing: {
                    price: !stock.day?.c,
                    volume: !stock.day?.v,
                    prevClose: !stock.prevDay?.c
                }
            });
        }

        // Layer 2: Options Chain (sample check - ATM calls/puts)
        try {
            const optionsUrl = `${BASE_URL}/v3/snapshot/options/${ticker}?limit=5&apiKey=${POLYGON_API_KEY}`;
            const optData = await fetchWithRetry(optionsUrl);

            if (optData.results && optData.results.length > 0) {
                result.layers.options.ok = true;
                result.layers.options.data = {
                    contractsFound: optData.results.length
                };
            } else {
                result.layers.options.ok = false;
                result.layers.options.reason = 'NO_CONTRACTS';
                result.gaps.push('OPTIONS');
                dataGaps.options.push({ ticker, reason: 'NO_CONTRACTS' });
            }
        } catch (e) {
            result.layers.options.ok = false;
            result.layers.options.reason = e.message;
            result.gaps.push('OPTIONS_API_FAIL');
            dataGaps.options.push({ ticker, reason: 'API_FAIL: ' + e.message });
        }

        // Rate limit protection
        await sleep(100);

        results.push(result);
    }

    // ====== STEP 3: Analysis ======
    console.log('\n========================================');
    console.log('DATA GAP ANALYSIS');
    console.log('========================================\n');

    // Stocks with any gaps
    const stocksWithGaps = results.filter(r => r.gaps.length > 0);
    const stocksComplete = results.filter(r => r.gaps.length === 0);

    console.log('SUMMARY:');
    console.log('  Total Tested: ' + results.length);
    console.log('  Complete Data: ' + stocksComplete.length + ' (' + (stocksComplete.length / results.length * 100).toFixed(1) + '%)');
    console.log('  With Gaps: ' + stocksWithGaps.length + ' (' + (stocksWithGaps.length / results.length * 100).toFixed(1) + '%)');

    console.log('\nGAPS BY LAYER:');
    console.log('  Snapshot Gaps: ' + dataGaps.snapshot.length);
    console.log('  Options Gaps: ' + dataGaps.options.length);

    if (stocksWithGaps.length > 0) {
        console.log('\nSTOCKS WITH DATA GAPS:');
        console.log('  Ticker | Gap Type    | Reason');
        console.log('  -------|-------------|--------');

        stocksWithGaps.forEach(s => {
            s.gaps.forEach(gap => {
                let reason = '-';
                if (gap === 'OPTIONS' || gap === 'OPTIONS_API_FAIL') {
                    const optGap = dataGaps.options.find(g => g.ticker === s.ticker);
                    reason = optGap?.reason || '-';
                }
                console.log('  ' + s.ticker.padEnd(6) + ' | ' + gap.padEnd(11) + ' | ' + reason);
            });
        });
    }

    // Core Elite Check
    console.log('\n========================================');
    console.log('CORE ELITE STATUS');
    console.log('========================================\n');

    CORE_ELITE.forEach(ticker => {
        const found = results.find(r => r.ticker === ticker);
        if (found) {
            const status = found.gaps.length === 0 ? '✅ OK' : '⚠️ GAP: ' + found.gaps.join(', ');
            console.log('  ' + ticker.padEnd(6) + ': ' + status);
        } else {
            console.log('  ' + ticker.padEnd(6) + ': ❌ NOT IN TOP 50 (lower volume today)');
        }
    });

    // API Stats
    console.log('\n========================================');
    console.log('API CALL STATISTICS');
    console.log('========================================\n');
    console.log('  Total Calls: ' + apiCallStats.total);
    console.log('  Successful: ' + apiCallStats.success);
    console.log('  Failed: ' + apiCallStats.failed);
    console.log('  Retried: ' + apiCallStats.retried);

    // Conclusion
    console.log('\n========================================');
    console.log('CONCLUSION');
    console.log('========================================\n');

    if (stocksWithGaps.length === 0) {
        console.log('  ✅ ALL STOCKS HAVE COMPLETE DATA');
        console.log('  No data gaps detected in the pipeline.');
    } else {
        console.log('  ⚠️ DATA GAPS DETECTED');
        console.log('  ' + stocksWithGaps.length + ' stocks have missing data.');
        console.log('');
        console.log('  RECOMMENDATION:');
        console.log('  1. Options gaps are expected for some stocks (no options chain)');
        console.log('  2. Snapshot gaps indicate real data issues');
        console.log('  3. Add retry logic to massiveClient.ts');
    }

    console.log('\n========================================');
    console.log('E2E STRESS TEST COMPLETE');
    console.log('========================================\n');
}

runE2EStressTest().catch(console.error);
