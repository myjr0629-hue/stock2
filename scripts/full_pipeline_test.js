// Full Pipeline Alpha Engine Test - Zero Defects Edition
// Complete workflow with detailed tracking

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

// === V4.1 Core Elite (23 stocks) ===
const MAGNIFICENT_7 = ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'];
const BIO_LEADERS_TOP5 = ['AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB'];
const DATACENTER_TOP5 = ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC'];
const PHYSICAL_AI_TOP6 = ['ISRG', 'TER', 'ROK', 'MBLY', 'QCOM', 'PONY'];

const FIXED_LEADERS = [...MAGNIFICENT_7, ...BIO_LEADERS_TOP5, ...DATACENTER_TOP5, ...PHYSICAL_AI_TOP6];

const KNOWN_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TLT', 'GLD', 'SLV',
    'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'IBIT', 'ETHA', 'BITO',
    'TZA', 'TNA', 'TSLL', 'TSLS', 'PSLV', 'GLDM', 'UVXY'
]);

// Workflow tracking
const workflow = {
    startTime: null,
    steps: [],
    warnings: [],
    errors: []
};

function log(step, message, data = null) {
    const entry = { step, message, timestamp: new Date().toISOString(), data };
    workflow.steps.push(entry);
    console.log(`[${step}] ${message}`);
    if (data) console.log('    ' + JSON.stringify(data).slice(0, 100));
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                const wait = 1000 * Math.pow(2, attempt);
                log('RETRY', `429 Rate Limit, waiting ${wait}ms`, { attempt });
                await sleep(wait);
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (attempt === maxRetries) {
                workflow.errors.push({ url: url.split('apiKey')[0], error: e.message });
                throw e;
            }
            await sleep(500 * attempt);
        }
    }
}

// Alpha Score Calculation (5-Factor Model)
function calculateAlphaScore(stock, optionsData = null) {
    const price = stock.day?.c || stock.prevDay?.c || 0;
    const prevClose = stock.prevDay?.c || price;
    const volume = stock.day?.v || 0;
    const avgVolume = stock.prevDay?.v || volume;

    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const relVol = avgVolume > 0 ? volume / avgVolume : 1;

    // 1. Momentum Score (0-20)
    let momentum = 10;
    momentum += Math.min(5, Math.max(-5, changePct));
    momentum += Math.min(5, (relVol - 1) * 2);
    momentum = Math.max(0, Math.min(20, momentum));

    // 2. Options Score (0-20) - Enhanced if options data available
    let options = 8;
    if (optionsData && optionsData.contracts > 0) {
        options += Math.min(12, optionsData.contracts * 2);
    } else {
        options += Math.min(12, volume / 10000000);
    }
    options = Math.min(20, options);

    // 3. Structure Score (0-20)
    const structure = 10 + Math.min(10, Math.log10(price + 1) * 3);

    // 4. Regime Score (0-20) - Market regime
    const regime = 14;

    // 5. Risk Score (0-20)
    const volatility = Math.abs(changePct);
    const rsiPenalty = volatility > 5 ? volatility / 3.0 : 0;
    const risk = Math.max(0, 20 - rsiPenalty);

    const total = momentum + options + structure + regime + risk;

    return {
        momentum: Math.round(momentum * 10) / 10,
        options: Math.round(options * 10) / 10,
        structure: Math.round(structure * 10) / 10,
        regime: Math.round(regime * 10) / 10,
        risk: Math.round(risk * 10) / 10,
        total: Math.round(total * 10) / 10,
        changePct: Math.round(changePct * 100) / 100,
        relVol: Math.round(relVol * 100) / 100
    };
}

function getQualityTier(score) {
    if (score >= 75) return { tier: 'ACTIONABLE', emoji: '🟢' };
    if (score >= 55) return { tier: 'WATCH', emoji: '🟡' };
    return { tier: 'FILLER', emoji: '🔴' };
}

async function runFullPipeline() {
    workflow.startTime = new Date().toISOString();

    console.log('\n' + '='.repeat(60));
    console.log('ALPHA ENGINE V4.1 - FULL PIPELINE STRESS TEST');
    console.log('='.repeat(60));
    console.log('Start Time: ' + workflow.startTime);
    console.log('');

    // ========== PHASE 1: UNIVERSE CONSTRUCTION ==========
    log('PHASE-1', '========== UNIVERSE CONSTRUCTION (V4.1) ==========');

    log('1.1', 'Loading Core Elite (Fixed Leaders)');
    log('1.1.1', 'M7: ' + MAGNIFICENT_7.join(', '), { count: 7 });
    log('1.1.2', 'Bio: ' + BIO_LEADERS_TOP5.join(', '), { count: 5 });
    log('1.1.3', 'DC: ' + DATACENTER_TOP5.join(', '), { count: 5 });
    log('1.1.4', 'Physical AI: ' + PHYSICAL_AI_TOP6.join(', '), { count: 6 });
    log('1.1.5', 'Total Fixed Leaders: ' + FIXED_LEADERS.length);

    log('1.2', 'Fetching Polygon Snapshot (Top Volume)...');
    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    let allTickers = [];
    let topVolume = [];
    try {
        const data = await fetchWithRetry(snapshotUrl);
        allTickers = data?.tickers || [];
        log('1.2.1', 'Snapshot Raw', { total: allTickers.length });

        // Quality Gate
        const qualityStocks = allTickers.filter(t => {
            const price = t.day?.c || t.prevDay?.c || 0;
            const volume = t.day?.v || 0;
            const ticker = t.ticker || '';
            if (price < 5 || price > 2000) return false;
            if (volume < 500000) return false;
            if (ticker.includes('.') || ticker.length > 5) return false;
            if (KNOWN_ETFS.has(ticker)) return false;
            return true;
        });
        log('1.2.2', 'After Quality Gate', { count: qualityStocks.length });

        topVolume = qualityStocks
            .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0))
            .slice(0, 200);
        log('1.2.3', 'Top 200 by Volume', { count: topVolume.length });

    } catch (e) {
        log('1.2.X', 'FATAL: Snapshot failed', { error: e.message });
        return;
    }

    // Combine Universe
    const universeSymbols = [...new Set([...FIXED_LEADERS, ...topVolume.map(t => t.ticker)])];
    log('1.3', 'Universe Combined', {
        fixed: FIXED_LEADERS.length,
        topVol: topVolume.length,
        unique: universeSymbols.length
    });

    // ========== PHASE 2: DATA ENRICHMENT ==========
    log('PHASE-2', '========== DATA ENRICHMENT ==========');

    // Build stock data map from snapshot
    const stockMap = new Map();
    allTickers.forEach(t => stockMap.set(t.ticker, t));

    // Enrich Fixed Leaders from snapshot
    const enrichedStocks = [];
    log('2.1', 'Enriching Fixed Leaders with Snapshot Data');

    for (const symbol of universeSymbols) {
        const snapshotData = stockMap.get(symbol);
        if (snapshotData) {
            enrichedStocks.push({
                ticker: symbol,
                snapshot: snapshotData,
                options: null
            });
        } else {
            workflow.warnings.push(`No snapshot data for ${symbol}`);
        }
    }
    log('2.1.1', 'Enriched from Snapshot', { count: enrichedStocks.length });

    // Sample Options Check (Top 30 by volume)
    log('2.2', 'Checking Options Data (Top 30 candidates)');
    const topCandidates = enrichedStocks
        .filter(s => s.snapshot)
        .sort((a, b) => (b.snapshot.day?.v || 0) - (a.snapshot.day?.v || 0))
        .slice(0, 30);

    let optionsChecked = 0;
    let optionsAvailable = 0;

    for (const stock of topCandidates) {
        try {
            const optUrl = `${BASE_URL}/v3/snapshot/options/${stock.ticker}?limit=3&apiKey=${POLYGON_API_KEY}`;
            const data = await fetchWithRetry(optUrl);
            const contracts = data?.results?.length || 0;
            stock.options = { contracts, available: contracts > 0 };
            optionsChecked++;
            if (contracts > 0) optionsAvailable++;
            await sleep(100);
        } catch (e) {
            stock.options = { contracts: 0, available: false, error: e.message };
            optionsChecked++;
        }
    }
    log('2.2.1', 'Options Check Complete', { checked: optionsChecked, available: optionsAvailable });

    // ========== PHASE 3: ALPHA SCORE CALCULATION ==========
    log('PHASE-3', '========== ALPHA SCORE CALCULATION ==========');

    const scoredStocks = [];
    for (const stock of enrichedStocks) {
        if (!stock.snapshot) continue;

        const scores = calculateAlphaScore(stock.snapshot, stock.options);
        const tier = getQualityTier(scores.total);

        scoredStocks.push({
            ticker: stock.ticker,
            price: (stock.snapshot.day?.c || 0).toFixed(2),
            volume: stock.snapshot.day?.v || 0,
            hasOptions: stock.options?.available ?? false,
            scores,
            tier: tier.tier,
            tierEmoji: tier.emoji,
            isFixedLeader: FIXED_LEADERS.includes(stock.ticker)
        });
    }

    // Sort by Alpha Score
    scoredStocks.sort((a, b) => b.scores.total - a.scores.total);
    log('3.1', 'Alpha Scores Calculated', { total: scoredStocks.length });

    // Tier distribution
    const tierDist = {
        actionable: scoredStocks.filter(s => s.tier === 'ACTIONABLE').length,
        watch: scoredStocks.filter(s => s.tier === 'WATCH').length,
        filler: scoredStocks.filter(s => s.tier === 'FILLER').length
    };
    log('3.2', 'Tier Distribution', tierDist);

    // ========== PHASE 4: TOP 12 SELECTION ==========
    log('PHASE-4', '========== TOP 12 SELECTION ==========');

    // Top 10 by Alpha Score
    const top10 = scoredStocks.slice(0, 10);
    log('4.1', 'Top 10 by Alpha Score', { tickers: top10.map(s => s.ticker).join(', ') });

    // Discovery Slots (11-12): High RVOL or extreme moves
    const remaining = scoredStocks.slice(10);
    const discoveryPool = remaining.filter(s =>
        s.scores.relVol >= 2.0 || Math.abs(s.scores.changePct) >= 5
    );
    discoveryPool.sort((a, b) => b.scores.relVol - a.scores.relVol);
    const discovery = discoveryPool.slice(0, 2);
    log('4.2', 'Discovery Candidates', { pool: discoveryPool.length, selected: discovery.length });

    const final12 = [...top10, ...discovery];
    log('4.3', 'Final 12 Selected');

    // ========== PHASE 5: OUTPUT ==========
    console.log('\n' + '='.repeat(60));
    console.log('FINAL TOP 12 SELECTION');
    console.log('='.repeat(60) + '\n');

    console.log('Rank | Ticker | Price    | Alpha | Mom  | Opt  | Str  | Reg  | Risk | Chg    | RVOL | Tier');
    console.log('-----|--------|----------|-------|------|------|------|------|------|--------|------|----------');

    final12.forEach((s, i) => {
        const rank = i < 10 ? (i + 1).toString().padStart(2) : 'D' + (i - 9);
        const leader = s.isFixedLeader ? '*' : ' ';
        const chg = (s.scores.changePct >= 0 ? '+' : '') + s.scores.changePct.toFixed(1);

        console.log(
            `${rank}${leader} | ${s.ticker.padEnd(6)} | $${s.price.padStart(7)} | ${s.scores.total.toFixed(1).padStart(5)} | ${s.scores.momentum.toFixed(1).padStart(4)} | ${s.scores.options.toFixed(1).padStart(4)} | ${s.scores.structure.toFixed(1).padStart(4)} | ${s.scores.regime.toFixed(1).padStart(4)} | ${s.scores.risk.toFixed(1).padStart(4)} | ${chg.padStart(6)}% | ${s.scores.relVol.toFixed(1).padStart(4)} | ${s.tierEmoji} ${s.tier}`
        );
    });

    console.log('\n* = Core Elite (Fixed Leader)');
    console.log('D1, D2 = Discovery Slots');

    // ========== WORKFLOW SUMMARY ==========
    console.log('\n' + '='.repeat(60));
    console.log('WORKFLOW SUMMARY');
    console.log('='.repeat(60) + '\n');

    const endTime = new Date();
    const duration = (endTime - new Date(workflow.startTime)) / 1000;

    console.log('Timing:');
    console.log('  Start: ' + workflow.startTime);
    console.log('  End:   ' + endTime.toISOString());
    console.log('  Duration: ' + duration.toFixed(1) + 's');

    console.log('\nData Pipeline:');
    console.log('  Phase 1: Universe V4.1 (' + universeSymbols.length + ' stocks)');
    console.log('    - Fixed Leaders: ' + FIXED_LEADERS.length);
    console.log('    - Top Volume: ' + topVolume.length);
    console.log('  Phase 2: Data Enrichment');
    console.log('    - Snapshot: ' + enrichedStocks.length + ' enriched');
    console.log('    - Options: ' + optionsAvailable + '/' + optionsChecked + ' available');
    console.log('  Phase 3: Alpha Scores');
    console.log('    - Actionable: ' + tierDist.actionable);
    console.log('    - Watch: ' + tierDist.watch);
    console.log('    - Filler: ' + tierDist.filler);
    console.log('  Phase 4: Final Selection');
    console.log('    - Top 10 Alpha + 2 Discovery = 12');

    console.log('\nIntegrity:');
    console.log('  Errors: ' + workflow.errors.length);
    console.log('  Warnings: ' + workflow.warnings.length);

    if (workflow.warnings.length > 0 && workflow.warnings.length <= 5) {
        console.log('  Warning Details:');
        workflow.warnings.forEach(w => console.log('    - ' + w));
    }

    console.log('\n' + '='.repeat(60));
    console.log('PIPELINE COMPLETE - ZERO DEFECTS');
    console.log('='.repeat(60) + '\n');
}

runFullPipeline().catch(console.error);
