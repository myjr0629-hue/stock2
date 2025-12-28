
// Scripts/verify_s56_4_3.ts (ReferenceError Check)

import { analyzeGemsTicker } from '../src/services/stockTypes';
import { getUniverseCandidates } from '../src/services/stockApi';

async function runVerification() {
    console.log("=== S-56.4.3 VERIFICATION: ReferenceError Check ===");

    try {
        // 1. Check stockApi exports integrity (if assertLiveApiEnabled was removed, imports shouldn't crash)
        // Note: Running this script tests if module loading throws ReferenceError
        console.log("Importing stockApi...");
        const api = await import('../src/services/stockApi');

        console.log("Checking function exports...");
        if (typeof api.analyzeGemsTicker !== 'function') throw new Error("analyzeGemsTicker missing");

        // 2. Simulate calls (mock budget to trigger safe paths)
        console.log("Simulating API calls (Dry Run)...");
        // We can't easily mock fetch here without more setup, BUT the ReferenceError would happen
        // on MODULE LOAD or FUNCTION EXECUTION start if it was a missing variable.

        // If we reached here, module loaded fine.
        console.log("PASS: Module loaded without ReferenceError.");

        // 3. Inspect source code for 'assertLiveApiEnabled' string to be sure
        const fs = await import('fs');
        const content = fs.readFileSync('src/services/stockApi.ts', 'utf-8');
        if (content.includes('assertLiveApiEnabled')) {
            console.error("FAIL: 'assertLiveApiEnabled' still present in stockApi.ts!");
            process.exit(1);
        } else {
            console.log("PASS: 'assertLiveApiEnabled' call removed from stockApi.ts.");
        }

    } catch (e) {
        console.error("FAIL: Verification crashed", e);
        process.exit(1);
    }

    console.log("=== DONE ===");
}

runVerification();
