
import { fetchMassive } from '../src/services/massiveClient';

async function testMassive() {
    console.log("--- PROBING MASSIVE API ---");

    const ticker = "TSLA";

    // 1. Test existing implementation
    console.log(`\n1. Testing /v3/trades/${ticker} ...`);
    try {
        const t1 = await fetchMassive(`/v3/trades/${ticker}`, { limit: '5' }, false);
        console.log("Result:", JSON.stringify(t1).substring(0, 200));
    } catch (e: any) {
        console.log("Error:", e.message);
    }

    // 2. Test Snapshot (Most likely solution)
    console.log(`\n2. Testing /v3/snapshot/options/${ticker} ...`);
    try {
        const t2 = await fetchMassive(`/v3/snapshot/options/${ticker}`, {}, false);
        console.log("Result:", t2 ? JSON.stringify(t2).substring(0, 200) : "NULL");
        if (t2 && t2.results) {
            console.log(`Snapshot Items: ${t2.results.length}`);
            console.log("Sample:", JSON.stringify(t2.results[0]));
        }
    } catch (e: any) {
        console.log("Error:", e.message);
    }

    // 3. Test Contract Chain
    console.log(`\n3. Testing /v3/reference/options/contracts?underlying_ticker=${ticker} ...`);
    try {
        const t3 = await fetchMassive(`/v3/reference/options/contracts`, { underlying_ticker: ticker, limit: '5' }, false);
        console.log("Result:", t3 ? JSON.stringify(t3).substring(0, 200) : "NULL");
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}

testMassive();
