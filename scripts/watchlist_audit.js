/**
 * Watchlist Data Integrity Audit Script
 * Tests all columns and data sources for the Watchlist feature
 */

const TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN'];

async function fetchTickerData(ticker) {
    const res = await fetch(`http://localhost:3000/api/live/ticker?t=${ticker}`);
    return res.json();
}

async function fetchOptionsData(ticker) {
    const res = await fetch(`http://localhost:3000/api/live/options/structure?t=${ticker}`);
    return res.json();
}

async function auditTicker(ticker) {
    const [stock, options] = await Promise.all([
        fetchTickerData(ticker),
        fetchOptionsData(ticker)
    ]);

    const results = {
        ticker,
        columns: {}
    };

    // Column 1: Symbol (always present)
    results.columns.symbol = { value: ticker, status: 'OK', source: 'Input' };

    // Column 2: Price
    const price = stock.price || stock.display?.price;
    results.columns.price = {
        value: price,
        status: price ? 'OK' : 'MISSING',
        source: '/api/live/ticker -> price'
    };

    // Column 3: Change %
    const changePct = stock.display?.changePctPct;
    results.columns.changePercent = {
        value: changePct,
        status: changePct !== undefined && changePct !== null ? 'OK' : 'MISSING',
        source: '/api/live/ticker -> display.changePctPct'
    };

    // Column 4: VWAP
    results.columns.vwap = {
        value: stock.vwap,
        status: stock.vwap ? 'OK' : 'MISSING',
        source: '/api/live/ticker -> vwap'
    };

    // Column 5: Max Pain
    results.columns.maxPain = {
        value: options.maxPain,
        status: options.maxPain ? 'OK' : 'MISSING',
        source: '/api/live/options/structure -> maxPain'
    };

    // Column 6: PCR
    results.columns.pcr = {
        value: options.pcr,
        status: options.pcr !== undefined && options.pcr !== null ? 'OK' : 'MISSING',
        source: '/api/live/options/structure -> pcr'
    };

    // Column 7: Session
    results.columns.session = {
        value: stock.session,
        status: stock.session ? 'OK' : 'MISSING',
        source: '/api/live/ticker -> session'
    };

    // Column 8: Options Status
    results.columns.optionsStatus = {
        value: options.options_status,
        status: options.options_status ? 'OK' : 'MISSING',
        source: '/api/live/options/structure -> options_status'
    };

    // Column 9: Expiration
    results.columns.expiration = {
        value: options.expiration,
        status: options.expiration ? 'OK' : 'MISSING',
        source: '/api/live/options/structure -> expiration'
    };

    return results;
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║            WATCHLIST DATA INTEGRITY AUDIT                          ║');
    console.log('║  Testing all columns and data sources for public launch readiness  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Tickers:', TICKERS.join(', '));
    console.log('Timestamp:', new Date().toISOString());
    console.log('');

    let allOK = true;
    const summary = [];

    for (const ticker of TICKERS) {
        try {
            const result = await auditTicker(ticker);
            console.log(`\n━━━ ${ticker} ━━━`);

            let tickerOK = true;
            for (const [col, data] of Object.entries(result.columns)) {
                const icon = data.status === 'OK' ? '✓' : '✗';
                const color = data.status === 'OK' ? '' : ' ← FIX REQUIRED';
                console.log(`  ${icon} ${col}: ${data.value ?? 'null'}${color}`);
                console.log(`      Source: ${data.source}`);
                if (data.status !== 'OK') {
                    allOK = false;
                    tickerOK = false;
                }
            }
            summary.push({ ticker, ok: tickerOK });
        } catch (e) {
            console.log(`\n━━━ ${ticker} ━━━ ERROR: ${e.message}`);
            allOK = false;
            summary.push({ ticker, ok: false, error: e.message });
        }
    }

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                         AUDIT SUMMARY                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');

    for (const s of summary) {
        console.log(`  ${s.ok ? '✓' : '✗'} ${s.ticker}${s.error ? ` (Error: ${s.error})` : ''}`);
    }

    console.log('');
    if (allOK) {
        console.log('🎉 ALL COLUMNS PASSING - READY FOR PUBLIC LAUNCH');
    } else {
        console.log('⚠️  ISSUES DETECTED - FIX REQUIRED BEFORE LAUNCH');
    }
}

main().catch(console.error);
