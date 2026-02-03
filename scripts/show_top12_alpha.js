// Top 12 Selection with Alpha Scores Simulation
// Simulates the full pipeline: Universe -> Alpha Score -> Top 12

const POLYGON_API_KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const BASE_URL = 'https://api.polygon.io';

// Core Elite
const MAGNIFICENT_7 = ['AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA'];

// ETF Exclusion
const KNOWN_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TLT', 'GLD', 'SLV',
    'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB',
    'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'ARKK', 'ARKG',
    'IBIT', 'ETHA', 'BITO', 'GBTC', 'ETHE', 'TZA', 'TNA', 'DUST',
    'TSLL', 'TSLS', 'NVDL', 'NVDS', 'PSLV', 'EEM', 'HYG', 'GDX',
    'FXI', 'LQD', 'GLDM', 'UVIX', 'FNGD', 'IAU', 'EWZ'
]);

// Alpha Score Calculation (Simplified Version of stockTypes.ts)
function calculateAlphaScore(stock) {
    const price = stock.day?.c || stock.prevDay?.c || 0;
    const prevClose = stock.prevDay?.c || price;
    const volume = stock.day?.v || 0;
    const avgVolume = stock.prevDay?.v || volume;

    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const relVol = avgVolume > 0 ? volume / avgVolume : 1;

    // 1. Momentum (0-20)
    let momentum = 10; // Base
    momentum += Math.min(5, Math.max(-5, changePct));
    momentum += Math.min(5, (relVol - 1) * 2);
    momentum = Math.max(0, Math.min(20, momentum));

    // 2. Options (0-20) - Simulated based on volume activity
    const optionsScore = Math.min(20, 8 + (volume / 10000000)); // Higher volume = better options activity

    // 3. Structure (0-20) - Simulated based on price stability
    const structure = 10 + Math.min(10, Math.log10(price + 1) * 3);

    // 4. Regime (0-20) - Market regime (simulated as neutral-bullish today)
    const regime = 14; // Assuming neutral-bullish market

    // 5. Risk (0-20) - Lower volatility = higher score
    const volatility = Math.abs(changePct);
    const rsiPenalty = volatility > 5 ? volatility / 3.0 : 0; // V2.1 /3.0
    const risk = Math.max(0, 20 - rsiPenalty);

    const total = momentum + optionsScore + structure + regime + risk;

    return {
        momentum: Math.round(momentum * 10) / 10,
        options: Math.round(optionsScore * 10) / 10,
        structure: Math.round(structure * 10) / 10,
        regime: Math.round(regime * 10) / 10,
        risk: Math.round(risk * 10) / 10,
        total: Math.round(total * 10) / 10,
        changePct: Math.round(changePct * 100) / 100,
        volume: volume,
        relVol: Math.round(relVol * 100) / 100
    };
}

// Determine Quality Tier
function getQualityTier(score) {
    if (score >= 75) return '🟢 ACTIONABLE';
    if (score >= 55) return '🟡 WATCH';
    return '🔴 FILLER';
}

async function runTop12Selection() {
    console.log('\n========================================');
    console.log('TOP 12 SELECTION WITH ALPHA SCORES');
    console.log('========================================\n');

    console.log('[1] Fetching Universe from Polygon...');
    const snapshotUrl = `${BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;

    try {
        const res = await fetch(snapshotUrl);
        const data = await res.json();
        const allTickers = data?.tickers || [];

        console.log('    Raw tickers: ' + allTickers.length);

        // Quality Gate
        const qualityStocks = allTickers
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
            });

        console.log('    After Quality Gate: ' + qualityStocks.length);

        // Calculate Alpha Scores for all
        console.log('\n[2] Calculating Alpha Scores...');
        const scoredStocks = qualityStocks.map(stock => {
            const scores = calculateAlphaScore(stock);
            return {
                ticker: stock.ticker,
                price: (stock.day?.c || 0).toFixed(2),
                ...scores
            };
        });

        // Sort by Alpha Score
        scoredStocks.sort((a, b) => b.total - a.total);

        // Top 10 by Score
        const top10 = scoredStocks.slice(0, 10);

        // Discovery Slots (11-12): High RVOL or High Change
        const remaining = scoredStocks.slice(10);
        const discoveryPool = remaining.filter(s => s.relVol >= 2.5 || Math.abs(s.changePct) >= 4);
        discoveryPool.sort((a, b) => b.relVol - a.relVol);

        const discovery = discoveryPool.slice(0, 2);

        // Final 12
        const final12 = [...top10, ...discovery];

        console.log('\n========================================');
        console.log('FINAL TOP 12 SELECTION');
        console.log('========================================\n');

        console.log('Rank | Ticker | Price    | Alpha | Mom  | Opt  | Str  | Reg  | Risk | Change | Tier');
        console.log('-----|--------|----------|-------|------|------|------|------|------|--------|-------------');

        final12.forEach((s, i) => {
            const tier = getQualityTier(s.total);
            const rank = i < 10 ? (i + 1).toString().padStart(2) : 'D' + (i - 9);
            const isM7 = MAGNIFICENT_7.includes(s.ticker) ? '*' : ' ';

            console.log(
                `${rank}${isM7} | ${s.ticker.padEnd(6)} | $${s.price.padStart(7)} | ${s.total.toFixed(1).padStart(5)} | ${s.momentum.toFixed(1).padStart(4)} | ${s.options.toFixed(1).padStart(4)} | ${s.structure.toFixed(1).padStart(4)} | ${s.regime.toFixed(1).padStart(4)} | ${s.risk.toFixed(1).padStart(4)} | ${(s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(1).padStart(5)}% | ${tier}`
            );
        });

        console.log('\n* = Magnificent 7');
        console.log('D1, D2 = Discovery Slots (High RVOL or Momentum)');

        // Stats
        const actionable = final12.filter(s => s.total >= 75).length;
        const watch = final12.filter(s => s.total >= 55 && s.total < 75).length;
        const filler = final12.filter(s => s.total < 55).length;

        console.log('\n========================================');
        console.log('TIER BREAKDOWN');
        console.log('========================================');
        console.log(`🟢 ACTIONABLE: ${actionable}/12`);
        console.log(`🟡 WATCH:      ${watch}/12`);
        console.log(`🔴 FILLER:     ${filler}/12`);

        console.log('\n========================================');
        console.log('COMPLETE');
        console.log('========================================\n');

    } catch (e) {
        console.log('Error: ' + e.message);
    }
}

runTop12Selection().catch(console.error);
