// V3.3 Engine Full Universe Test
// Screens ALL stocks from SECTOR_MAP + Leaders through the engine
// Reports: all stocks sorted by score, Top 3, and 80+ ACTIONABLE stocks

async function fullUniverseTest() {
    console.log('=== V3.3 FULL UNIVERSE ENGINE TEST ===');
    console.log(`Time: ${new Date().toISOString()}\n`);

    // Build complete universe from SECTOR_MAP + Leaders
    const SECTOR_TICKERS = {
        'Tech(XLK)': ['NVDA', 'AAPL', 'MSFT', 'AVGO', 'ORCL', 'AMD', 'QCOM', 'INTC', 'IBM', 'TXN'],
        'Comm(XLC)': ['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'TMUS', 'VZ', 'T', 'CHTR'],
        'ConsDisc(XLY)': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'BKNG', 'TJX'],
        'Energy(XLE)': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'OXY'],
        'Finance(XLF)': ['JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'C', 'AXP'],
        'Health(XLV)': ['LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'PFE', 'ABT', 'DHR'],
        'Indust(XLI)': ['GE', 'CAT', 'HON', 'UNP', 'UPS', 'DE', 'RTX', 'LMT', 'BA'],
        'Material(XLB)': ['LIN', 'SHW', 'FCX', 'APD', 'ECL', 'NEM', 'DOW', 'DD'],
        'ConStap(XLP)': ['PG', 'COST', 'WMT', 'KO', 'PEP', 'PM', 'MO', 'CL', 'KMB'],
        'RealEst(XLRE)': ['PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'O', 'VICI', 'WELL'],
        'Utility(XLU)': ['NEE', 'SO', 'DUK', 'CEG', 'AEP', 'SRE', 'D', 'PEG'],
        'AI_Power': ['VST', 'CEG', 'VRT', 'ETN', 'PWR'],
        'Bio_Leaders': ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'],
        'DC_Leaders': ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC'],
        'PhysicalAI': ['ISRG', 'TER', 'ROK', 'MBLY', 'QCOM', 'PONY'],
        'Extra_Popular': ['SMCI', 'PLTR', 'COIN', 'SNOW', 'CRWD', 'PANW', 'ZS', 'NET', 'SHOP', 'SQ', 'SOFI', 'RIVN', 'LCID', 'ARM', 'MRVL', 'MU', 'LRCX', 'AMAT', 'KLAC', 'ON', 'ABNB', 'UBER', 'DKNG', 'RBLX', 'U', 'SNAP', 'PINS', 'TTD', 'ROKU', 'DASH', 'LYFT', 'HOOD', 'MARA', 'RIOT', 'AFRM'],
    };

    // Deduplicate all tickers
    const allTickers = [...new Set(Object.values(SECTOR_TICKERS).flat())];
    console.log(`Total unique tickers: ${allTickers.length}\n`);

    // Run alpha engine on each ticker
    const results = [];
    let processed = 0;
    let errors = 0;

    for (const ticker of allTickers) {
        try {
            const res = await fetch(`http://localhost:3000/api/live/ticker?t=${ticker}`);
            const d = await res.json();
            const a = d.alpha || {};
            const p = a.pillars || {};
            results.push({
                ticker,
                score: a.score || 0,
                grade: a.grade || '?',
                action: a.action || '?',
                gates: (a.gatesApplied || []),
                momentum: p.momentum?.score || 0,
                structure: p.structure?.score || 0,
                flow: p.flow?.score || 0,
                regime: p.regime?.score || 0,
                catalyst: p.catalyst?.score || 0,
                engine: a.engineVersion || '?',
                changePct: d.changePct || d.changePercent || 0,
            });
            processed++;
        } catch (e) {
            errors++;
        }

        if (processed % 20 === 0) {
            process.stdout.write(`  [${processed}/${allTickers.length}]...`);
        }
    }

    console.log(`\n\nProcessed: ${processed}/${allTickers.length} (errors: ${errors})\n`);

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // === 80+ ACTIONABLE ===
    const actionable = results.filter(r => r.score >= 80);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`★★★ ACTIONABLE (80+) — ${actionable.length}개 ★★★`);
    console.log(`${'='.repeat(70)}`);
    if (actionable.length > 0) {
        console.log('Rank | Ticker  | Score | Grade | Gates                   | M   S    F    R   C');
        console.log('-----|---------|-------|-------|-------------------------|---  ---  ---  --- ---');
        actionable.forEach((r, i) => {
            console.log(`  ${(i + 1).toString().padStart(2)}  | ${r.ticker.padEnd(7)} | ${String(r.score).padStart(5)} | ${r.grade.padEnd(5)} | ${(r.gates.join(',') || 'none').padEnd(23)} | ${String(r.momentum).padStart(3)} ${String(r.structure).padStart(4)} ${String(r.flow).padStart(4)} ${String(r.regime).padStart(4)} ${String(r.catalyst).padStart(3)}`);
        });
    } else {
        console.log('  ❌ 80점 이상 종목 없음');
    }

    // === TOP 3 ===
    console.log(`\n${'='.repeat(70)}`);
    console.log(`★★★ TOP 3 ★★★`);
    console.log(`${'='.repeat(70)}`);
    const top3 = results.slice(0, 3);
    top3.forEach((r, i) => {
        console.log(`\n#${i + 1}: ${r.ticker} — ${r.score}점 (${r.grade})`);
        console.log(`  Momentum:  ${r.momentum}/25`);
        console.log(`  Structure: ${r.structure}/25`);
        console.log(`  Flow:      ${r.flow}/25`);
        console.log(`  Regime:    ${r.regime}/15`);
        console.log(`  Catalyst:  ${r.catalyst}/10`);
        console.log(`  Gates:     ${r.gates.join(', ') || 'none'}`);
    });

    // === TOP 20 ===
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TOP 20 종목 순위`);
    console.log(`${'='.repeat(70)}`);
    console.log('Rank | Ticker  | Score | Grade | changePct | Gates');
    console.log('-----|---------|-------|-------|-----------|------');
    results.slice(0, 20).forEach((r, i) => {
        console.log(`  ${(i + 1).toString().padStart(2)}  | ${r.ticker.padEnd(7)} | ${String(r.score).padStart(5)} | ${r.grade.padEnd(5)} | ${typeof r.changePct === 'number' ? r.changePct.toFixed(2) + '%' : 'N/A'} | ${r.gates.join(', ') || 'none'}`);
    });

    // === SCORE DISTRIBUTION ===
    console.log(`\n${'='.repeat(70)}`);
    console.log(`SCORE DISTRIBUTION`);
    console.log(`${'='.repeat(70)}`);
    const dist = {
        '90+': results.filter(r => r.score >= 90).length,
        '80-89': results.filter(r => r.score >= 80 && r.score < 90).length,
        '70-79': results.filter(r => r.score >= 70 && r.score < 80).length,
        '60-69': results.filter(r => r.score >= 60 && r.score < 70).length,
        '50-59': results.filter(r => r.score >= 50 && r.score < 60).length,
        '<50': results.filter(r => r.score < 50).length,
    };
    Object.entries(dist).forEach(([range, count]) => {
        const bar = '█'.repeat(count);
        console.log(`  ${range.padStart(6)}: ${String(count).padStart(3)}개 ${bar}`);
    });

    console.log(`\nEngine Version: ${results[0]?.engine || '?'}`);
}

fullUniverseTest();
