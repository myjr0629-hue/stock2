import { generateReport } from '../src/services/reportScheduler';
import fs from 'fs';
import path from 'path';

// Manual .env loading
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, ''); // Basic quote handling
            if (key && !key.startsWith('#')) {
                process.env[key] = val;
            }
        }
    });
}

async function main() {
    console.log("=== Debugging Report Stages ===");

    // 1. Generate DRAFT
    console.log("\n--- Generating DRAFT ---");
    const draft = await generateReport('draft', true); // Force new
    console.log(`Generated DRAFT: ${draft.meta.id}, Items: ${draft.items.length}`);

    // 2. Generate FINAL (simulate Audit step skipped or merged for test)
    console.log("\n--- Generating FINAL (Locking) ---");
    // Wait a sec to ensure FS write? (Usually sync in local, but safe to wait)
    await new Promise(r => setTimeout(r, 1000));

    try {
        const final = await generateReport('final', true);
        console.log(`Generated FINAL: ${final.meta.id}`);
        console.log("Top 3 Locked:");
        final.meta.top3?.forEach((t, i) => {
            const item = final.items.find((x: any) => x.ticker === t.ticker);
            console.log(`#${i + 1} ${t.ticker}: Band=${item?.decisionSSOT?.entryBand}, Cut=${item?.decisionSSOT?.cutPrice} Locked=${item?.decisionSSOT?.isLocked}`);
        });
    } catch (e) {
        console.error("Final Generation Failed:", e);
    }
}

main();
