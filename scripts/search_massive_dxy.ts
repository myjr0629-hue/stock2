
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Searching Massive API for DXY/Dollar...");

    // 1. Search Logic
    const queries = ["DXY", "Dollar Index", "UUP"];
    for (const q of queries) {
        try {
            console.log(`\n--- Searching for '${q}' ---`);
            const res = await fetchMassive(`/v3/reference/tickers`, { search: q, limit: '5', active: 'true' }, true);
            if (res.results) {
                res.results.forEach((t: any) => console.log(`${t.ticker} (${t.name}) - Market: ${t.market}`));
            }
        } catch (e: any) {
            console.log(`Search error: ${e.message}`);
        }
    }

    // 2. Direct Probe
    console.log("\n--- Probing Candidates ---");
    const candidates = ["UUP", "I:DX", "I:DXY", "C:EURUSD"];
    for (const c of candidates) {
        try {
            // Adjust endpoint based on type
            let url = `/v2/snapshot/locale/us/markets/stocks/tickers/${c}`;
            if (c.startsWith("I:")) url = `/v2/snapshot/locale/global/markets/indices/tickers/${c}`;
            if (c.startsWith("C:")) url = `/v2/snapshot/locale/global/markets/forex/tickers/${c}`; // Guessing forex path

            // Note: Forex path might be different: /v2/snapshot/locale/global/markets/forex/tickers?tickers=C:EURUSD
            // Let's try standard agg for safety
            const aggUrl = `/v2/aggs/ticker/${c}/prev`;

            const res = await fetchMassive(aggUrl, {}, true);
            console.log(`${c}: SUCCESS - Close ${res?.results?.[0]?.c}`);
        } catch (e: any) {
            console.log(`${c}: FAILED - ${e.httpStatus || e.message}`);
        }
    }
}
main();
