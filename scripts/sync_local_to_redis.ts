
import { saveReport } from '../src/lib/storage/reportStore';
import * as fs from 'fs';
import * as path from 'path';

async function sync() {
    console.log("Syncing local 2026-01-09 EOD report to Redis...");

    const filePath = path.join(process.cwd(), 'snapshots', 'reports', '2026-01-09', '2026-01-09-eod.json');
    if (!fs.existsSync(filePath)) {
        console.error("File not found:", filePath);
        process.exit(1);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);

    console.log("Read file, uploading...");

    // Force save to Redis
    try {
        await saveReport('2026-01-09', 'eod', json, true);
        console.log("SUCCESS: Report synced to Redis.");
    } catch (e) {
        console.error("FAILED to sync:", e);
    }
}

sync();
