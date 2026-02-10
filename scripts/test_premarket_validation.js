// [V3.4] Direct Engine Test — Pre-Market Validation Factor
// Bypasses API response truncation to see full factor breakdown
const http = require('http');

const TICKERS = ['NVDA', 'TSLA', 'AAPL', 'PLTR', 'AMD', 'META', 'SMCI', 'MSTR'];
const BASE = 'http://localhost:3000';

async function fetchTicker(ticker) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE}/api/live/ticker?t=${ticker}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('=== V3.4 Pre-Market Validation — LIVE SESSION ===');
    console.log(`Local: ${new Date().toISOString()}`);

    // Calculate ET time
    const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', minute: '2-digit', hour12: false,
        weekday: 'short', month: 'short', day: 'numeric'
    });
    console.log(`ET: ${etFormatter.format(new Date())}`);
    console.log('');

    const results = [];

    for (const ticker of TICKERS) {
        try {
            const d = await fetchTicker(ticker);
            if (!d || d.error) continue;

            const alpha = d.alpha;
            const session = d.session;
            const price = d.calc?.activePrice || 0;
            const changePct = d.calc?.changePctPct || 0;
            const engineVer = alpha?.engineVersion || '?';
            const score = alpha?.score || 0;
            const grade = alpha?.grade || '?';
            const momScore = alpha?.pillars?.momentum?.score || 0;
            const momMax = alpha?.pillars?.momentum?.max || 25;

            // Check if pre-market data is present
            // In PRE session, the price IS the pre-market price
            // changePct should reflect pre-market vs prevClose
            const baseline = d.calc?.baselinePrice || 0;
            const priceLabel = d.calc?.priceLabel || '';

            results.push({ ticker, session, price, changePct, score, grade, momScore, momMax, engineVer, baseline, priceLabel });

            const chgStr = changePct > 0 ? `+${changePct}%` : `${changePct}%`;
            console.log(`${ticker.padEnd(5)} | ${session.padEnd(6)} | $${price.toFixed(2).padStart(8)} | ${chgStr.padStart(8)} | Score: ${score} (${grade}) | Mom: ${momScore}/${momMax} | Engine: ${engineVer}`);
        } catch (e) {
            console.log(`${ticker}: ERROR - ${e.message}`);
        }
    }

    console.log('');
    console.log('=== ANALYSIS ===');
    console.log('Note: In PRE session, changePct = pre-market vs prevClose');
    console.log('Factor 7 (preMarketValidation) uses this to validate against previous session direction');
    console.log('');

    // Sort by score
    results.sort((a, b) => b.score - a.score);
    console.log('=== TOP SCORES ===');
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.ticker.padEnd(5)} ${r.score}점 (${r.grade}) Momentum: ${r.momScore}/${r.momMax}`);
    });
}

main().catch(console.error);
