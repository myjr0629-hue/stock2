
import { fetchMassive, CACHE_POLICY } from '../src/services/massiveClient';

// Mock MASSIVE_API_KEY if needed, but massiveClient usually handles it or uses valid key.
// We strictly need to see the V3 response.

async function debugMacro() {
    console.log("--- DEBUGGING MACRO V3 SNAPSHOT ---");
    const tickers = ["QQQ", "VIXY", "UUP"]; // The proxies we use

    for (const t of tickers) {
        try {
            console.log(`\nFetching ${t}...`);
            // Exact call from macroHubProvider
            const res = await fetchMassive(`/v3/snapshot?ticker.any_of=${t}`, {}, true, undefined, CACHE_POLICY.LIVE);
            const result = res?.results?.[0];

            if (result) {
                console.log(`[${t}] Raw Result:`, JSON.stringify(result, null, 2));

                const last = result.last_trade?.p;
                const prev = result.prev_day?.c;
                const dayClose = result.day?.c;
                const todaysChange = result.todaysChange;
                const todaysChangePerc = result.todaysChangePerc;

                console.log(`[${t}] last_trade: ${last}`);
                console.log(`[${t}] prev_day.c: ${prev}`);
                console.log(`[${t}] day.c: ${dayClose}`);
                console.log(`[${t}] todaysChange: ${todaysChange}`);
                console.log(`[${t}] todaysChangePerc: ${todaysChangePerc}`);

                // Manual Calc Check
                if (last && prev) {
                    const calcChg = last - prev;
                    const calcPct = (calcChg / prev) * 100;
                    console.log(`[${t}] Calculated: ${calcChg.toFixed(2)} (${calcPct.toFixed(2)}%)`);
                }
            } else {
                console.log(`[${t}] No results found.`);
            }

        } catch (e: any) {
            console.error(`[${t}] Error:`, e.message);
        }
    }
}

debugMacro();
