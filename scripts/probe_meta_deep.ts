
import fs from 'fs';
import path from 'path';
import { CentralDataHub } from '../src/services/centralDataHub';
import { enrichTerminalItems } from '../src/services/terminalEnricher';
import { fetchMassive } from '../src/services/massiveClient';

// 1. Env Loader (Enhanced Robustness)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf-8');
    raw.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const firstEq = trimmed.indexOf('=');
        if (firstEq === -1) return;

        const key = trimmed.substring(0, firstEq).trim();
        let val = trimmed.substring(firstEq + 1).trim();

        // Remove quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }

        process.env[key] = val;
    });
}

// 2. Config Override
process.env.ALLOW_MASSIVE_FOR_SNAPSHOT = '1';

async function deepProbe() {
    console.log("=== META DEEP PROBE START (Post-Fix) ===");
    const ticker = 'META';

    try {
        // Step 1: Check Raw Options API
        console.log("\n[1] Checking CentralDataHub Internal Logic...");
        // This implicitly calls _fetchOptionsChain which now has the filter

        const priceSnap = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true);
        const price = priceSnap?.ticker?.lastTrade?.p || 500;
        console.log(`   Price Reference: $${price}`);

        const hubOpts = await CentralDataHub._fetchOptionsChain(ticker, price);
        console.log("   Processed Hub Result:");
        console.log(`     - Contracts: ${hubOpts.optionsCount}`);
        console.log(`     - Net Premium: $${(hubOpts.netPremium / 1e6).toFixed(2)}M`);
        console.log(`     - Status: ${hubOpts.optionsCount > 0 ? 'SUCCESS' : 'EMPTY'}`);

        if (hubOpts.optionsCount > 0) {
            console.log("✅ FIXED: META Options loaded successfully!");
        } else {
            console.error("❌ FAILED: Still 0 contracts.");
        }

    } catch (e) {
        console.error("🚨 CRITICAL PROBE FAILURE:", e);
    }
}

deepProbe();
