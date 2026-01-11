
import { fetchMassive } from '../src/services/massiveClient';

async function diagnose() {
    console.log("=== API PERMISSION DIAGNOSTIC ===");
    console.log("Testing Key Permissions for Stocks vs Options...");

    try {
        // 1. Test Basic Stock Access (Reference)
        console.log("\n1. Testing Stock Reference (AAPL)...");
        const stockRef = await fetchMassive('/v3/reference/tickers/AAPL');
        console.log("✅ Stock Reference: SUCCESS");
        console.log("   Name:", stockRef.results?.name);
    } catch (e: any) {
        console.log("❌ Stock Reference: FAILED");
        console.log("   Error:", e.message || e);
    }

    try {
        // 2. Test Options Snapshot (The one failing)
        console.log("\n2. Testing Options Snapshot (AAPL)...");
        const optSnap = await fetchMassive('/v3/snapshot/options/AAPL');
        console.log("✅ Options Snapshot: SUCCESS");
        console.log("   Contracts Found:", optSnap.results?.length || 0);
    } catch (e: any) {
        console.log("❌ Options Snapshot: FAILED");
        console.log("   Error:", e.message || e);
        if (e.httpStatus === 403) {
            console.log("   -> DIAGONOSIS: Key exists but lacks OPTIONS permissions.");
        }
    }

    try {
        // 3. Test Options Trades (Deep Data)
        console.log("\n3. Testing Options Trades (Specific Contract)...");
        // Needs a valid option symbol. Let's try to query contracts first to find one, but if snapshot failed, we can't.
        // We'll skip this if snapshot failed.
        // Or try a known format guess if needed, but Step 2 is usually enough.
    } catch (e) { }
}

diagnose();
