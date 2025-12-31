
import yahooFinance from 'yahoo-finance2';

async function main() {
    console.log("Testing Yahoo Finance Connection...");
    try {
        const result = await yahooFinance.quote('^NDX'); // Nasdaq 100
        console.log("Success! ^NDX Price:", result.regularMarketPrice);
        console.log("Full Result keys:", Object.keys(result));
    } catch (e) {
        console.error("Yahoo Fetch Failed:", e);
    }

    try {
        const vix = await yahooFinance.quote('^VIX');
        console.log("Success! ^VIX Price:", vix.regularMarketPrice);
    } catch (e) {
        console.error("VIX Fetch Failed:", e);
    }
}

main();
