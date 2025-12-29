
import { loadLatest } from '../src/lib/storage/reportStore';
// Mock environment if needed, but loadLatest uses Redis.fromEnv() which might fail if not set in shell.
// We assume .env is loaded or we rely on FS fallback if Redis fails (but we hardcoded UseRedis=true).

// Usage: npx tsx scripts/diagnose_report_cli.ts

async function run() {
    try {
        console.log("--- DIAGNOSTIC START ---");
        const report = await loadLatest('morning');

        if (!report) {
            console.log("Result: NULL (No 'morning' report found)");
            console.log("Status: DATA_MISSING");
            return;
        }

        console.log(`Report Meta ID: ${report.meta?.id}`);
        console.log(`Generated At: ${report.meta?.generatedAt}`);
        console.log(`Items Count: ${report.items?.length}`);

        if (report.items && report.items.length > 0) {
            const firstItem = report.items[0];
            console.log("\n[First Item Inspection]");
            console.log(`Ticker: ${firstItem.ticker || firstItem.symbol}`);
            console.log(`Keys: ${Object.keys(firstItem).join(', ')}`);

            if (firstItem.evidence) {
                console.log("Evidence Found: YES");
                console.log(`Evidence Keys: ${Object.keys(firstItem.evidence).join(', ')}`);
                // Check completeness
                const price = firstItem.evidence.price;
                const priceValid = price && typeof price.last === 'number';
                console.log(`Evidence.Price Valid? ${priceValid ? 'YES' : 'NO'}`);
            } else {
                console.log("Evidence Found: NO");
                console.log("Status: SCHEMA_MISMATCH (Legacy Data Detected)");
            }
        } else {
            console.log("Result: EMPTY_ITEMS");
        }

    } catch (e: any) {
        console.error("Diagnostic Error:", e.message);
    }
}

run();
