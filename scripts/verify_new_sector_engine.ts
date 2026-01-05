
import { SectorEngine } from '../src/services/guardian/sectorEngine';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    console.log("Running SectorEngine Institutional Upgrade Verification...");
    const start = Date.now();

    // Call the engine
    const result = await SectorEngine.getSectorFlows();

    const duration = Date.now() - start;
    console.log(`Execution Time: ${duration}ms`);

    // Check Basic Structure
    if (!result.flows || result.flows.length === 0) {
        console.error("FAIL: No flows returned.");
        return;
    }

    console.log(`Source: ${result.source}, Target: ${result.target}`);
    console.log(`Vectors: ${result.vectors.length}`);

    // Inspect Scores
    console.log("\n--- Top 3 Sectors (Smart Money Inflow) ---");
    result.flows.slice(0, 3).forEach(s => {
        console.log(`${s.id} (${s.name}): Score=${s.change.toFixed(2)}, Vol=${s.volume}`);
    });

    console.log("\n--- Bottom 3 Sectors (Smart Money Outflow) ---");
    result.flows.slice(-3).forEach(s => {
        console.log(`${s.id} (${s.name}): Score=${s.change.toFixed(2)}, Vol=${s.volume}`);
    });

    // Inspect Vectors
    if (result.vectors.length > 0) {
        console.log("\n--- Top Vector ---");
        const v = result.vectors[0];
        console.log(`${v.sourceId} -> ${v.targetId} (Strength: ${v.strength.toFixed(2)})`);
    } else {
        console.warn("WARNING: No vectors generated (Market might be flat or data missing).");
    }
}

verify();
