
import { fetchMassive } from '../src/services/massiveClient';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debugConnection() {
    console.log("=== Debugging Massive API Connection ===");
    const key = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
    console.log(`API Key Present: ${!!key} (Length: ${key?.length})`);

    // Test 1: Grouped Daily (Snapshot)
    console.log("\n[Test 1] Grouped Daily (2026-01-02)...");
    try {
        const res = await fetchMassive('/v2/aggs/grouped/locale/us/market/stocks/2026-01-02', { adjusted: 'true' });
        console.log(`Status: ${res.status || 'OK'}`);
        console.log(`Results Count: ${res.results?.length}`);
        if (res.results?.length > 0) console.log("Sample:", res.results[0]);
    } catch (e: any) {
        console.error("FAIL:", e.message);
    }

    // Test 2: Ticker History (NVDA)
    console.log("\n[Test 2] NVDA History...");
    try {
        const res = await fetchMassive('/v2/aggs/ticker/NVDA/range/1/day/2025-12-01/2026-01-01', { limit: '10' });
        console.log(`Results Count: ${res.results?.length}`);
    } catch (e: any) {
        console.error("FAIL:", e.message);
    }
}

debugConnection();
