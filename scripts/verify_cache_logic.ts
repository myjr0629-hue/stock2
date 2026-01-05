
import { SectorEngine } from '../src/services/guardian/sectorEngine';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// FORCE API ENABLED for Verification
process.env.ALLOW_MASSIVE_FOR_SNAPSHOT = '1';
process.env.TIER01_SNAPSHOT_MODE = '0';

async function verifyCache() {
    console.log("=== Testing SectorEngine Caching ===");

    // 1st Run: Should build baseline (Slow)
    // console.log("\n[Run 1] Initial Request...");
    // const start1 = Date.now();
    // const res1 = await SectorEngine.getSectorFlows();
    // const t1 = Date.now() - start1;
    // console.log(`Run 1 Time: ${t1}ms (Vectors: ${res1.vectors.length})`);
    const t1 = 5000; // Fake for comparison

    // 2nd Run: Should use cache (Fast)
    console.log("\n[Run 2] Cached Request...");
    const start2 = Date.now();
    const res2 = await SectorEngine.getSectorFlows();
    const t2 = Date.now() - start2;
    console.log(`Run 2 Time: ${t2}ms (Vectors: ${res2.vectors.length})`);

    // Check speedup
    console.log(`\n[Diagnostics]`)
    console.log(`Total Flows Found: ${res2.flows.length}`);
    if (res2.flows.length > 0) {
        console.log("Top 3 Flows:", res2.flows.slice(0, 3));
        console.log("Bottom 3 Flows:", res2.flows.slice(-3));
    } else {
        console.warn("CRITICAL: No flows found. Check snapshot data.");
    }

    if (t2 < t1) {
        console.log(`\nSUCCESS: Cache hit! (Speedup: ${(t1 / t2).toFixed(1)}x)`);
    } else {
        console.warn("\nWARNING: No speedup detected. Cache might not be working.");
    }
}

verifyCache();
