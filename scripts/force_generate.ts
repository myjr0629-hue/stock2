
import { generateReport } from '../src/services/reportScheduler';
import { saveReport } from '../src/lib/storage/reportStore';
import * as fs from 'fs';
import * as path from 'path';

// Mock Environment for Script
process.env.MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || 'sk_test_massive_key_v3';

async function run() {
    console.log(">>> [FORCE SCRIPT] Starting Manual Report Generation (BOOTSTRAP MODE)...");

    try {
        const dateStr = new Date().toISOString().split('T')[0];

        // 1. Generate DRAFT (Detailed Analysis) - Seeds the chain
        console.log(">>> [FORCE SCRIPT] Generating Phase 1: DRAFT...");
        const draftReport = await generateReport('draft');
        await saveReport(dateStr, 'draft', draftReport, true);
        console.log(`>>> [FORCE SCRIPT] DRAFT Saved. Items: ${draftReport.items.length}`);

        // 2. Generate FINAL (Lock & Tactical) - Uses Draft
        console.log(">>> [FORCE SCRIPT] Generating Phase 2: FINAL...");
        const finalReport = await generateReport('final');
        await saveReport(dateStr, 'final', finalReport, true);
        console.log(`>>> [FORCE SCRIPT] FINAL Saved. Items: ${finalReport.items.length}`);

        // 3. Verify File
        const dir = path.join(process.cwd(), 'snapshots/reports', dateStr);
        if (fs.existsSync(dir)) {
            console.log(`>>> [FORCE SCRIPT] Verified Directory Exists: ${dir}`);
            const files = fs.readdirSync(dir);
            console.log(`>>> [FORCE SCRIPT] Files: ${files.join(', ')}`);
        } else {
            console.error(`>>> [FORCE SCRIPT] CRITICAL: Directory not found: ${dir}`);
        }

    } catch (error: any) {
        console.error(">>> [FORCE SCRIPT] FATAL ERROR:", error);
        fs.writeFileSync('gen_error.txt', JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
    }
}

run();
