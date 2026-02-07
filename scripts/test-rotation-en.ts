/**
 * Sector Rotation Data Validation Script (English-only output)
 * Run: npx tsx scripts/test-rotation-en.ts
 */

const POLYGON_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE = "https://api.polygon.io";

const SECTORS: Record<string, string> = {
    XLK: "Tech", XLC: "Comm", XLY: "ConsDisc", XLE: "Energy", XLF: "Financials",
    XLV: "Health", XLI: "Industrials", XLB: "Materials", XLP: "Staples", XLRE: "RealEst", XLU: "Utilities"
};

async function api(endpoint: string): Promise<any> {
    const url = `${BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}: ${endpoint}`);
    return res.json();
}

async function main() {
    console.log("=== SECTOR ROTATION DATA VALIDATION ===");
    console.log(`Time: ${new Date().toISOString()}\n`);

    // --- TEST 1: Snapshot ---
    console.log("--- TEST 1: Current Snapshot ---");
    try {
        const tickers = [...Object.keys(SECTORS), "QQQ", "SPY", "IWM"].join(",");
        const snap = await api(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}`);

        if (!snap.tickers || snap.tickers.length === 0) {
            console.log("No snapshot data (weekend expected)");
        } else {
            console.log(`Received ${snap.tickers.length} tickers`);
            for (const t of snap.tickers) {
                const chg = t.todaysChangePerc || 0;
                console.log(`  ${t.ticker.padEnd(5)} chg:${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vol:${((t.day?.v || 0) / 1e6).toFixed(1)}M dayC:${(t.day?.c || 0).toFixed(2)} prevC:${(t.prevDay?.c || 0).toFixed(2)} lastP:${(t.lastTrade?.p || 0).toFixed(2)}`);
            }
        }
    } catch (e: any) { console.log("Snapshot error:", e.message); }

    // --- TEST 2: 5-Day Time Series ---
    console.log("\n--- TEST 2: 5-Day Sector ETF Returns ---");
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 10);
    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const sectorResults: Record<string, { changes: number[]; volumes: number[]; dates: string[] }> = {};

    for (const [ticker, name] of Object.entries(SECTORS)) {
        await new Promise(r => setTimeout(r, 300));
        try {
            const data = await api(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=10`);
            const bars = (data.results || []).slice(-5);
            if (bars.length < 2) { console.log(`  ${ticker}: insufficient data`); continue; }

            const closes = bars.map((b: any) => b.c);
            const volumes = bars.map((b: any) => b.v);
            const dates = bars.map((b: any) => new Date(b.t).toISOString().split('T')[0]);
            const changes: number[] = [];
            for (let i = 1; i < closes.length; i++) {
                changes.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
            }
            sectorResults[ticker] = { changes, volumes, dates };
        } catch (e: any) { console.log(`  ${ticker} error: ${e.message}`); }
    }

    // Print 5-day table
    console.log("\n  Sector  | D-4     | D-3     | D-2     | D-1     | 5d Sum  | Dir    | VolTrend");
    console.log("  " + "-".repeat(85));

    const scores: { ticker: string; cumReturn: number; consistency: number; volTrend: number }[] = [];

    for (const [ticker, data] of Object.entries(sectorResults)) {
        const changes = data.changes;
        const vols = data.volumes;
        const cumReturn = changes.reduce((a, b) => a + b, 0);
        const positives = changes.filter(c => c > 0).length;
        const consistency = Math.max(positives, changes.length - positives) / changes.length;
        const recentVol = vols.slice(-2).reduce((a, b) => a + b, 0) / 2;
        const earlyVol = vols.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        const volTrend = earlyVol > 0 ? ((recentVol - earlyVol) / earlyVol) * 100 : 0;

        const dir = cumReturn > 0.3 ? "UP  " : cumReturn < -0.3 ? "DOWN" : "FLAT";
        const cStrs = changes.map(c => `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`);
        while (cStrs.length < 4) cStrs.unshift("  N/A  ");

        console.log(`  ${ticker.padEnd(6)}  | ${cStrs.map(s => s.padEnd(7)).join(" | ")} | ${cumReturn >= 0 ? '+' : ''}${cumReturn.toFixed(2)}%`.padEnd(72) + ` | ${dir}   | ${volTrend >= 0 ? '+' : ''}${volTrend.toFixed(0)}%`);
        scores.push({ ticker, cumReturn, consistency, volTrend });
    }

    // --- TEST 3: Current Logic vs Improved ---
    console.log("\n--- TEST 3: Current Logic vs Improved ---");

    // Current: last day only
    const lastDayChanges = Object.entries(sectorResults).map(([ticker, data]) => ({
        ticker, change: data.changes[data.changes.length - 1] || 0
    })).sort((a, b) => b.change - a.change);

    const curIn = lastDayChanges.filter(s => s.change > 0);
    const curOut = lastDayChanges.filter(s => s.change < 0);
    const curInSum = curIn.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const curOutSum = curOut.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const curScore = Math.min(100, (curInSum + curOutSum) * 10);

    console.log(`\n  [CURRENT] Score: ${curScore.toFixed(1)}/100`);
    console.log(`    Inflow:  ${curIn.map(s => `${s.ticker}(${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%)`).join(', ')}`);
    console.log(`    Outflow: ${curOut.map(s => `${s.ticker}(${s.change.toFixed(2)}%)`).join(', ')}`);

    // Risk direction
    const RISK_ON = ['XLK', 'XLY', 'XLC'];
    const RISK_OFF = ['XLU', 'XLP', 'XLRE'];
    const roFlow = lastDayChanges.filter(s => RISK_ON.includes(s.ticker)).reduce((sum, s) => sum + s.change, 0);
    const rfFlow = lastDayChanges.filter(s => RISK_OFF.includes(s.ticker)).reduce((sum, s) => sum + s.change, 0);
    const dir = roFlow > rfFlow + 0.5 ? 'RISK_ON' : rfFlow > roFlow + 0.5 ? 'RISK_OFF' : 'NEUTRAL';
    console.log(`    Direction: ${dir} (RiskOn=${roFlow.toFixed(2)} vs RiskOff=${rfFlow.toFixed(2)})`);

    // Improved: 5-day weighted
    console.log(`\n  [IMPROVED] 5-day Volume-Weighted + Consistency`);
    const improved = scores.map(s => {
        const data = sectorResults[s.ticker];
        const vols = data.volumes;
        const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
        const recentVol = vols.slice(-2).reduce((a, b) => a + b, 0) / 2;
        const rvol = avgVol > 0 ? recentVol / avgVol : 1;
        const flowScore = s.cumReturn * Math.min(rvol, 3);
        const finalScore = flowScore * s.consistency;
        return { ...s, rvol, flowScore, finalScore };
    }).sort((a, b) => b.finalScore - a.finalScore);

    const impIn = improved.filter(s => s.finalScore > 0);
    const impOut = improved.filter(s => s.finalScore < 0);
    console.log(`    Inflow:`);
    impIn.forEach(s => console.log(`      ${s.ticker}: 5dRet=${s.cumReturn >= 0 ? '+' : ''}${s.cumReturn.toFixed(2)}% RVOL=${s.rvol.toFixed(2)} consist=${(s.consistency * 100).toFixed(0)}% => score=${s.finalScore.toFixed(2)}`));
    console.log(`    Outflow:`);
    impOut.forEach(s => console.log(`      ${s.ticker}: 5dRet=${s.cumReturn.toFixed(2)}% RVOL=${s.rvol.toFixed(2)} consist=${(s.consistency * 100).toFixed(0)}% => score=${s.finalScore.toFixed(2)}`));

    // Comparison
    console.log("\n  [COMPARISON]");
    const curTop = lastDayChanges[0];
    const impTop = improved[0];
    const curBot = lastDayChanges[lastDayChanges.length - 1];
    const impBot = improved[improved.length - 1];
    console.log(`    Current  top inflow: ${curTop?.ticker}(${curTop?.change >= 0 ? '+' : ''}${curTop?.change.toFixed(2)}%) | top outflow: ${curBot?.ticker}(${curBot?.change.toFixed(2)}%)`);
    console.log(`    Improved top inflow: ${impTop?.ticker}(score ${impTop?.finalScore.toFixed(2)}) | top outflow: ${impBot?.ticker}(score ${impBot?.finalScore.toFixed(2)})`);

    if (curTop?.ticker !== impTop?.ticker) {
        console.log(`    ** MISMATCH: Current says ${curTop?.ticker} leads, Improved says ${impTop?.ticker} **`);
    } else {
        console.log(`    MATCH: Both agree ${curTop?.ticker} leads inflow`);
    }

    // Noise detection
    console.log("\n  [NOISE DETECTION]");
    const noise = scores.filter(s => s.consistency < 0.6);
    if (noise.length > 0) {
        console.log(`    ${noise.length} sectors with low consistency (<60%) - potential false signals:`);
        noise.forEach(s => console.log(`      ${s.ticker}: 5dRet=${s.cumReturn >= 0 ? '+' : ''}${s.cumReturn.toFixed(2)}% consistency=${(s.consistency * 100).toFixed(0)}% <- noise risk`));
    } else {
        console.log("    No low-consistency sectors detected");
    }

    // --- TEST 4: Pre-market field analysis ---
    console.log("\n--- TEST 4: Pre-Market Field Analysis ---");
    console.log("  Weekend - no live pre-market data available.");
    console.log("  Key fields to monitor on Monday pre-market:");
    console.log("    todaysChangePerc - does it update during pre-market?");
    console.log("    lastTrade.p/t    - last extended hours trade price/time");
    console.log("    day.c/v          - are these 0 or populated?");
    console.log("    min              - 1-min aggregates during pre-market?");

    console.log("\n=== VALIDATION COMPLETE ===");
}

main().catch(e => console.error("FATAL:", e));
