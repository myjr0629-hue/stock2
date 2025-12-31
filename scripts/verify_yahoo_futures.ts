
async function main() {
    // Debugging the export
    const yfModule = await import('yahoo-finance2');

    // It seems default export is the CLASS, so we must instantiate it
    const YahooFinanceClass = yfModule.default as any;
    const yahooFinance = new YahooFinanceClass();

    console.log("=== Testing Yahoo Finance Futures (NQ=F) ===");
    try {
        const nq = await yahooFinance.quote('NQ=F');
        console.log("NQ=F (Nasdaq 100 Futures):");
        console.log(`- Price: ${nq.regularMarketPrice}`);
        console.log(`- Change: ${nq.regularMarketChange} (${nq.regularMarketChangePercent}%)`);
        console.log(`- Time: ${nq.regularMarketTime}`);
        console.log("- Status: SUCCESS");
    } catch (e) {
        console.error("NQ=F Failed:", e);
    }

    console.log("\n=== Testing Yahoo Finance Index (^VIX) ===");
    try {
        const vix = await yahooFinance.quote('^VIX');
        console.log("^VIX (Volatility Index):");
        console.log(`- Price: ${vix.regularMarketPrice}`);
        console.log("- Status: SUCCESS");
    } catch (e) {
        console.error("^VIX Failed:", e);
    }
}

main();
