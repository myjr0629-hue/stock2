
import { fetchMassive } from '../src/services/massiveClient';

async function main() {
    console.log("Searching Massive API for Yield Tickers...");

    const queries = ["TNX", "Yield", "10 Year"];

    for (const q of queries) {
        try {
            console.log(`\n--- Searching for '${q}' ---`);
            const res = await fetchMassive(`/v3/reference/tickers`, { search: q, limit: '5', active: 'true' }, true);
            if (res.results && res.results.length > 0) {
                res.results.forEach((t: any) => console.log(`${t.ticker} (${t.name}) - Market: ${t.market}`));
            } else {
                console.log("No results.");
            }
        } catch (e: any) {
            console.error(`Search failed for '${q}': ${e.message || e}`);
        }
    }

    console.log("\n--- Probing Specific Tickers ---");
    // Try some common variants just in case
    const variants = ["I:TNX", "I:US10Y", "US10Y", "C:US10Y", "C:USDJPY"];
    for (const v of variants) {
        try {
            const res = await fetchMassive(`/v2/aggs/ticker/${v}/prev`, {}, true);
            console.log(`${v}: ${res.results ? 'SUCCESS' : 'FAILED'} (Status: ${res.status}, Count: ${res.count})`);
            if (res.results) console.log(JSON.stringify(res.results[0]));
        } catch (e: any) {
            console.log(`${v}: ERROR ${e.httpStatus || ''} - ${e.reasonKR || e.message}`);
        }
    }
}

main();
