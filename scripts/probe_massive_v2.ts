
import { fetchMassive } from '../src/services/massiveClient';

async function testMassiveV2() {
    console.log("--- PROBING MASSIVE API V2 ---");
    const ticker = "TSLA";

    // 1. Try Standard V3 Snapshot
    console.log(`\n[1] Testing /v3/snapshot/options/${ticker} ...`);
    try {
        const t1 = await fetchMassive(`/v3/snapshot/options/${ticker}`, {}, false);
        if (t1 && t1.results) {
            console.log(`[SUCCESS] Items: ${t1.results.length}`);
            console.log("Sample Item:", JSON.stringify(t1.results[0]));
        } else {
            console.log("[FAIL] No results or empty.");
            console.log("Raw:", JSON.stringify(t1).substring(0, 100));
        }
    } catch (e: any) {
        console.log(`[ERROR] ${e.message} (Status: ${e.response?.status})`);
    }

    // 2. Try Universal/Legacy Snapshot
    // /v2/snapshot/locale/us/markets/options/tickers
    console.log(`\n[2] Testing /v2/snapshot/locale/us/markets/options/tickers?underlying_asset=${ticker} ...`);
    try {
        const t2 = await fetchMassive(`/v2/snapshot/locale/us/markets/options/tickers`, { underlying_asset: ticker }, false);
        if (t2 && t2.tickers) {
            console.log(`[SUCCESS] Items: ${t2.tickers.length}`);
            console.log("Sample Item:", JSON.stringify(t2.tickers[0]));
        } else {
            console.log("[FAIL] No tickers or empty.");
            console.log("Raw:", JSON.stringify(t2).substring(0, 100));
        }
    } catch (e: any) {
        console.log(`[ERROR] ${e.message}`);
    }
}
testMassiveV2();
