/**
 * Compact rotation validation - JSON output to file
 */
const POLYGON_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE = "https://api.polygon.io";
const fs = require('fs');
const path = require('path');

const SECTORS: Record<string, string> = {
    XLK: "Tech", XLC: "Comm", XLY: "ConsDisc", XLE: "Energy", XLF: "Fin",
    XLV: "Health", XLI: "Indust", XLB: "Materials", XLP: "Staples", XLRE: "RealEst", XLU: "Util"
};

async function api(ep: string): Promise<any> {
    const url = `${BASE}${ep}${ep.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

async function main() {
    const output: any = { timestamp: new Date().toISOString(), tests: {} };

    // TEST 1: Snapshot
    try {
        const tickers = [...Object.keys(SECTORS), "QQQ", "SPY", "IWM"].join(",");
        const snap = await api(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}`);
        output.tests.snapshot = (snap.tickers || []).map((t: any) => ({
            ticker: t.ticker,
            todaysChangePerc: t.todaysChangePerc || 0,
            dayClose: t.day?.c || 0,
            dayVolume: t.day?.v || 0,
            prevClose: t.prevDay?.c || 0,
            lastTradePrice: t.lastTrade?.p || 0,
            lastTradeTime: t.lastTrade?.t ? new Date(t.lastTrade.t / 1e6).toISOString() : null,
            min: t.min || null
        }));
    } catch (e: any) { output.tests.snapshot = { error: e.message }; }

    // TEST 2: 5-day time series
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 10);
    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const seriesData: Record<string, any> = {};
    for (const [ticker] of Object.entries(SECTORS)) {
        await new Promise(r => setTimeout(r, 300));
        try {
            const data = await api(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=10`);
            const bars = (data.results || []).slice(-5);
            if (bars.length < 2) continue;
            const closes = bars.map((b: any) => b.c);
            const volumes = bars.map((b: any) => b.v);
            const dates = bars.map((b: any) => new Date(b.t).toISOString().split('T')[0]);
            const changes: number[] = [];
            for (let i = 1; i < closes.length; i++) {
                changes.push(+((closes[i] - closes[i - 1]) / closes[i - 1] * 100).toFixed(3));
            }
            seriesData[ticker] = { dates, closes, volumes, changes };
        } catch (e) { /* skip */ }
    }
    output.tests.fiveDaySeries = seriesData;

    // TEST 3: Current vs Improved comparison
    const lastDay: Record<string, number> = {};
    const analysis: any[] = [];
    for (const [ticker, data] of Object.entries(seriesData)) {
        const d = data as any;
        const changes = d.changes as number[];
        const vols = d.volumes as number[];
        const lastChange = changes[changes.length - 1] || 0;
        lastDay[ticker] = lastChange;

        const cumReturn = changes.reduce((a: number, b: number) => a + b, 0);
        const positives = changes.filter((c: number) => c > 0).length;
        const consistency = Math.max(positives, changes.length - positives) / changes.length;
        const avgVol = vols.reduce((a: number, b: number) => a + b, 0) / vols.length;
        const recentVol = vols.slice(-2).reduce((a: number, b: number) => a + b, 0) / 2;
        const rvol = avgVol > 0 ? +(recentVol / avgVol).toFixed(2) : 1;
        const flowScore = +(cumReturn * Math.min(rvol, 3)).toFixed(3);
        const finalScore = +(flowScore * consistency).toFixed(3);

        analysis.push({ ticker, name: SECTORS[ticker], lastDayChange: +lastChange.toFixed(3), cumReturn5d: +cumReturn.toFixed(3), consistency: +(consistency * 100).toFixed(0), rvol, flowScore, finalScore });
    }

    // Current logic
    const currentRanked = [...Object.entries(lastDay)].sort((a, b) => b[1] - a[1]);
    const curIn = currentRanked.filter(([, c]) => c > 0);
    const curOut = currentRanked.filter(([, c]) => c < 0);
    const curInSum = curIn.slice(0, 3).reduce((s, [, c]) => s + Math.abs(c), 0);
    const curOutSum = curOut.slice(0, 3).reduce((s, [, c]) => s + Math.abs(c), 0);
    const curScore = Math.min(100, (curInSum + curOutSum) * 10);

    // Risk direction
    const RISK_ON = ['XLK', 'XLY', 'XLC'];
    const RISK_OFF = ['XLU', 'XLP', 'XLRE'];
    const roFlow = currentRanked.filter(([t]) => RISK_ON.includes(t)).reduce((s, [, c]) => s + c, 0);
    const rfFlow = currentRanked.filter(([t]) => RISK_OFF.includes(t)).reduce((s, [, c]) => s + c, 0);
    const direction = roFlow > rfFlow + 0.5 ? 'RISK_ON' : rfFlow > roFlow + 0.5 ? 'RISK_OFF' : 'NEUTRAL';

    output.tests.comparison = {
        currentLogic: {
            rotationScore: +curScore.toFixed(1),
            topInflow: curIn.slice(0, 3).map(([t, c]) => ({ ticker: t, change: +c.toFixed(3) })),
            topOutflow: curOut.slice(0, 3).map(([t, c]) => ({ ticker: t, change: +c.toFixed(3) })),
            breadth: +((curIn.length / currentRanked.length) * 100).toFixed(0),
            direction, riskOnFlow: +roFlow.toFixed(3), riskOffFlow: +rfFlow.toFixed(3)
        },
        improvedLogic: {
            ranked: analysis.sort((a, b) => b.finalScore - a.finalScore),
            topInflow: analysis.filter(a => a.finalScore > 0).slice(0, 3),
            topOutflow: analysis.filter(a => a.finalScore < 0).sort((a, b) => a.finalScore - b.finalScore).slice(0, 3),
            noiseDetected: analysis.filter(a => a.consistency < 60).map(a => ({ ticker: a.ticker, consistency: a.consistency, cumReturn: a.cumReturn5d }))
        },
        mismatch: currentRanked[0]?.[0] !== analysis[0]?.ticker ? {
            currentTop: currentRanked[0]?.[0],
            improvedTop: analysis[0]?.ticker,
            reason: "5-day trend differs from last-day snapshot"
        } : null
    };

    // Write output
    const outPath = path.join(process.cwd(), 'scripts', 'rotation-data.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`DONE: ${outPath}`);
}

main().catch(e => console.error("FATAL:", e));
