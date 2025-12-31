
import { CentralDataHub } from '../src/services/centralDataHub';

async function main() {
    console.log("=== Debugging 3-Day Sniper Logic ===");
    const ticker = "NVDA";

    // 1. Fetch Unified Data
    const data = await CentralDataHub.getUnifiedData(ticker);
    console.log(`\nTicker: ${ticker}`);
    console.log(`Price: ${data.price}`);
    console.log(`History3D Length: ${data.history3d?.length}`);
    if (data.history3d?.length) {
        console.log("History Sample:", data.history3d[0]);
    }

    // 2. Check Risk Gate (Manual invocation if possible, or assume incorporated in analysis flow which requires full context)
    // We can't easily import PowerEngine logic here without mocking evidence structure entirely. 
    // We trust CentralDataHub fetch for now.
}

main();
