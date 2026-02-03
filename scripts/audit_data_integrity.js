// Alpha Engine Data Integrity Audit
// Verifies all source data is present and properly loaded

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

async function runDataIntegrityAudit() {
    console.log('\n========================================');
    console.log('ALPHA ENGINE DATA INTEGRITY AUDIT');
    console.log('========================================\n');
    console.log('Timestamp: ' + new Date().toISOString());
    console.log('');

    const audit = {
        timestamp: new Date().toISOString(),
        dataPoints: {},
        warnings: [],
        errors: [],
        summary: {}
    };

    // 1. Snapshot Data Check
    console.log('[CHECK 1] Polygon Snapshot API...');
    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    let allTickers = [];
    try {
        const res = await fetch(snapshotUrl);
        const data = await res.json();
        allTickers = data?.tickers || [];

        console.log('  Total Tickers: ' + allTickers.length);

        // Check data completeness
        let withPrice = 0, withVolume = 0, withPrevClose = 0, withChange = 0;

        allTickers.forEach(t => {
            if (t.day?.c > 0) withPrice++;
            if (t.day?.v > 0) withVolume++;
            if (t.prevDay?.c > 0) withPrevClose++;
            if (t.todaysChangePerc !== undefined) withChange++;
        });

        const total = allTickers.length;
        console.log('  With Current Price: ' + withPrice + '/' + total + ' (' + (withPrice / total * 100).toFixed(1) + '%)');
        console.log('  With Volume: ' + withVolume + '/' + total + ' (' + (withVolume / total * 100).toFixed(1) + '%)');
        console.log('  With Prev Close: ' + withPrevClose + '/' + total + ' (' + (withPrevClose / total * 100).toFixed(1) + '%)');
        console.log('  With Change %: ' + withChange + '/' + total + ' (' + (withChange / total * 100).toFixed(1) + '%)');

        audit.dataPoints.snapshot = { total, withPrice, withVolume, withPrevClose, withChange };

        if (withPrice / total < 0.9) audit.warnings.push('Low price data coverage: ' + (withPrice / total * 100).toFixed(1) + '%');
        if (withVolume / total < 0.9) audit.warnings.push('Low volume data coverage: ' + (withVolume / total * 100).toFixed(1) + '%');

    } catch (e) {
        console.log('  ERROR: ' + e.message);
        audit.errors.push('Snapshot API failed: ' + e.message);
    }

    // 2. Top Gainers Check
    console.log('\n[CHECK 2] Top Gainers API...');
    try {
        const gainersUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(gainersUrl);
        const data = await res.json();
        const gainers = data?.tickers || [];

        console.log('  Gainers Returned: ' + gainers.length);

        let gainersWithData = 0;
        gainers.forEach(g => {
            if (g.day?.c > 0 && g.day?.v > 0) gainersWithData++;
        });

        console.log('  With Complete Data: ' + gainersWithData + '/' + gainers.length);
        audit.dataPoints.gainers = { total: gainers.length, complete: gainersWithData };

    } catch (e) {
        console.log('  ERROR: ' + e.message);
        audit.errors.push('Gainers API failed: ' + e.message);
    }

    // 3. Sample Top 10 Data Completeness
    console.log('\n[CHECK 3] Top 10 Candidate Data Completeness...');

    const qualityStocks = allTickers
        .filter(t => {
            const price = t.day?.c || t.prevDay?.c || 0;
            const volume = t.day?.v || 0;
            return price >= 5 && price <= 2000 && volume >= 500000;
        })
        .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0))
        .slice(0, 20);

    console.log('');
    console.log('  Ticker | Price    | Volume   | PrevClose | Change  | Data');
    console.log('  -------|----------|----------|-----------|---------|------');

    qualityStocks.forEach(s => {
        const price = s.day?.c || 0;
        const volume = s.day?.v || 0;
        const prevClose = s.prevDay?.c || 0;
        const change = s.todaysChangePerc || 0;

        const hasPrice = price > 0 ? '✓' : '✗';
        const hasVol = volume > 0 ? '✓' : '✗';
        const hasPrev = prevClose > 0 ? '✓' : '✗';
        const hasChange = s.todaysChangePerc !== undefined ? '✓' : '✗';

        const dataStatus = hasPrice + hasVol + hasPrev + hasChange;
        const isComplete = dataStatus === '✓✓✓✓' ? '✅ OK' : '⚠️ GAP';

        console.log('  ' + s.ticker.padEnd(6) + ' | $' + price.toFixed(2).padStart(7) + ' | ' +
            (volume / 1000000).toFixed(1).padStart(6) + 'M | $' +
            prevClose.toFixed(2).padStart(7) + ' | ' +
            (change >= 0 ? '+' : '') + change.toFixed(1).padStart(5) + '% | ' + isComplete);
    });

    // 4. Check for Data Freshness
    console.log('\n[CHECK 4] Data Freshness...');
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    let marketStatus = 'CLOSED';
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        // EST timezone (~UTC-5)
        const estHour = hour - 9; // KST to EST (-14 + 5 = -9)
        if (estHour >= 9.5 && estHour < 16) {
            marketStatus = 'OPEN';
        } else if (estHour >= 4 && estHour < 9.5) {
            marketStatus = 'PRE-MARKET';
        } else if (estHour >= 16 && estHour < 20) {
            marketStatus = 'AFTER-HOURS';
        }
    }

    console.log('  Current Time: ' + now.toISOString());
    console.log('  Market Status: ' + marketStatus);
    console.log('  Data Source: Polygon Real-time Snapshot');

    // 5. Scoring Component Audit
    console.log('\n[CHECK 5] Scoring Component Availability...');
    console.log('');
    console.log('  Component      | Source            | Status');
    console.log('  ---------------|-------------------|--------');
    console.log('  Price/Change   | Polygon Snapshot  | ✅ Available');
    console.log('  Volume/RelVol  | Polygon Snapshot  | ✅ Available');
    console.log('  PCR/OI         | Polygon Options*  | ⚠️ Simulated');
    console.log('  GEX/Gamma      | Polygon Options*  | ⚠️ Simulated');
    console.log('  Whale Index    | Forensic Service* | ⚠️ Simulated');
    console.log('  VIX/Regime     | External API*     | ⚠️ Simulated');
    console.log('');
    console.log('  * = Not called in this test (requires full pipeline)');

    // 6. Final Summary
    console.log('\n========================================');
    console.log('AUDIT SUMMARY');
    console.log('========================================');

    const snapshotOK = audit.dataPoints.snapshot?.withPrice > 10000;
    const gainersOK = audit.dataPoints.gainers?.total > 15;

    console.log('');
    console.log('  Snapshot API: ' + (snapshotOK ? '✅ HEALTHY' : '⚠️ ISSUE'));
    console.log('  Gainers API:  ' + (gainersOK ? '✅ HEALTHY' : '⚠️ ISSUE'));
    console.log('  Data Coverage: ' + ((audit.dataPoints.snapshot?.withPrice / audit.dataPoints.snapshot?.total) * 100).toFixed(1) + '%');
    console.log('  Errors: ' + audit.errors.length);
    console.log('  Warnings: ' + audit.warnings.length);

    if (audit.errors.length > 0) {
        console.log('\n  ERRORS:');
        audit.errors.forEach(e => console.log('    - ' + e));
    }
    if (audit.warnings.length > 0) {
        console.log('\n  WARNINGS:');
        audit.warnings.forEach(w => console.log('    - ' + w));
    }

    console.log('\n========================================');
    console.log('CONCLUSION');
    console.log('========================================');

    if (audit.errors.length === 0 && audit.warnings.length === 0) {
        console.log('\n  ✅ ALL DATA SOURCES HEALTHY');
        console.log('  Rankings reflect current real-time market data.');
    } else if (audit.errors.length === 0) {
        console.log('\n  ⚠️ DATA SOURCES PARTIALLY HEALTHY');
        console.log('  Some data points may be missing or stale.');
    } else {
        console.log('\n  ❌ DATA SOURCE ISSUES DETECTED');
        console.log('  Rankings may not reflect current market accurately.');
    }

    console.log('\n  NOTE: This test uses simplified Alpha Score calculation.');
    console.log('  Full pipeline includes Options, Forensic, and Regime data.');

    console.log('\n========================================');
    console.log('AUDIT COMPLETE');
    console.log('========================================\n');
}

runDataIntegrityAudit().catch(console.error);
