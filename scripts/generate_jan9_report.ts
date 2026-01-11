
// Script to force generate EOD report for Jan 9
import { generateReport } from '../src/services/reportScheduler';
import { saveReport } from '../src/lib/storage/reportStore';
import * as dotenv from 'dotenv';

// Load env
dotenv.config({ path: '.env.local' });

async function run() {
    console.log("Starting Manual Generation for 2026-01-09...");
    try {
        // Generate EOD report for Jan 9
        // This will fetch full 12 items, run power engine, etc.
        const report = await generateReport('eod', true, '2026-01-09');

        console.log("Generation Complete!");
        console.log(`ID: ${report.meta.id}`);
        console.log(`Items: ${report.items.length}`);

        if (report.items.length < 12) {
            console.warn("WARNING: Generated report has fewer than 12 items!");
        }

        // It is automatically saved to FS by generateReport, 
        // but let's ensure we log the path.
        console.log("Report saved to snapshots/reports/2026-01-09/eod.json (by default)");

    } catch (e) {
        console.error("Generation Failed:", e);
    }
    process.exit(0);
}

run();
