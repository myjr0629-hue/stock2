// Debug Simulation for Home Page Logic


// Mock Fetch for FMP (since we use fetch in stockApi.ts and it might not be polyfilled in node script unless Next.js environment?)
// Actually stockApi uses `fetch`. In Node 18+ `fetch` is native. User has Node environment?
// If not, this script might fail on `fetch`.
// But user ran `debug_options.js` which used `yahoo-finance2`.
// `stockApi.ts` is TS. I cannot run it directly with `node`. 
// I need `ts-node` or similar.
// Or I can copy the LOGIC into this JS file.

// Wait, the user has `debug_options.js` which is JS.
// But `stockApi` is TS.
// I cannot require TS file in JS script easily without compilation.
// I will instead create `debug_home_simulation.js` that recreates the logic using `yahoo-finance2` directly,
// to see if the *Library Calls* fail. I can't test `stockApi.ts` directly easily.

const YF = require('yahoo-finance2').default;
const yahooFinance = new YF({ suppressNotices: ['yahooSurvey'] });

async function testHome() {
    console.log("--- Simulating Homepage Data Load ---");

    try {
        // 1. Indices
        console.log("1. Fetching Indices...");
        const indices = ['^GSPC', '^IXIC', '^VIX'];
        const p1 = indices.map(s => yahooFinance.quote(s).then(q => console.log(`Got Index: ${s} = ${q.regularMarketPrice}`)).catch(e => console.error(`Index Fail ${s}:`, e.message)));
        await Promise.all(p1);

        // 2. Market Movers
        console.log("2. Fetching Market Movers (Quote Array)...");
        const symbols = ['NVDA', 'AMD', 'PLTR', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX'];
        const quotes = await yahooFinance.quote(symbols);
        console.log(`Got ${quotes.length} quotes for movers.`);
        if (!Array.isArray(quotes)) console.error("Quotes is NOT array:", quotes);
        else console.log("First quote:", quotes[0].symbol);

        // 3. News
        console.log("3. Fetching News...");
        const news = await yahooFinance.search('^GSPC', { newsCount: 5 });
        console.log(`Got ${news.news.length} news items.`);

    } catch (e) {
        console.error("FATAL ERROR in Simulation:", e);
    }
}

testHome();
