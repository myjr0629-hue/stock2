
const API_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

async function probe() {
    console.log("Probing Massive API for Live Data (QQQ, VIXY, UUP)...");

    // Polyfill fetch for older Node versions if needed (but Node 18+ has it)
    // If running in environment without fetch, we might fail, but let's try.

    const tickers = ["QQQ", "VIXY", "UUP"];

    for (const t of tickers) {
        try {
            console.log(`\n--- ${t} ---`);
            const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${t}?apiKey=${API_KEY}`;
            const res = await fetch(url);
            const json = await res.json();
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.error(`Error fetching ${t}:`, e);
        }
    }
}

probe();
