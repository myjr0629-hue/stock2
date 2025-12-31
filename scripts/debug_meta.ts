
import fs from 'fs';
import path from 'path';
import { enrichTerminalItems } from '../src/services/terminalEnricher';

// Manual Env Parsing
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf-8');
    raw.split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) process.env[k.trim()] = v.trim();
    });
}
// Force Snapshot Mode
process.env.ALLOW_MASSIVE_FOR_SNAPSHOT = '1';

async function probe() {
    console.log("Probing META...");
    try {
        const items = await enrichTerminalItems(['META'], 'regular', true);
        const item = items[0];

        console.log("=== META PROBE RESULTS ===");
        console.log("Score:", item.alphaScore);
        console.log("Evidence Complete?", item.evidence.complete);
        console.log("Flow Data:", item.evidence.flow);
        // Specifically check netPremium
        console.log("Net Premium:", item.evidence.flow.netPremium);
        console.log("Options Status:", item.evidence.options.status);

    } catch (e) {
        console.error("Probe Error:", e);
    }
}
probe();
