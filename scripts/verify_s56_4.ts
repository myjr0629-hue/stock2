
import { orchestrateGemsEngine } from '../src/engine/reportOrchestrator';
import { GemsSnapshotItem, MacroData } from '../src/services/stockTypes';
import * as process from 'process';

async function verify() {
    try {
        console.log("[Verification] Starting S-56.4.1 Validation...");

        // Mock Macro
        const macro: MacroData = { us10y: 4.0, vix: 15.0, spySpy: 1.0, nqF: 0.5, sectorPerformance: {} };

        // Mock Input Item Factory
        const createItem = (i: number, type: 'ETF' | 'CS'): any => ({
            ticker: type === 'ETF' ? `ETF${i}` : `STOCK${i}`,
            symbol: type === 'ETF' ? `ETF${i}` : `STOCK${i}`,
            type: type,
            sector: type === 'ETF' ? 'ETF' : 'Technology',
            alphaScore: type === 'ETF' ? 90 + i : 50 + i,
            price: 100,
            changePct: 0,
            volume: 1000000,
            marketCap: 1000000000,
            isBackfilled: false,
            v71: { options_status: 'OK' },
            scoreDecomposition: { momentum: 10, options: 10, structure: 10, regime: 10, risk: 5 },
            decisionSSOT: { action: 'MAINTAIN', confidence: 80, triggersKR: [] }
        });

        const universe: Partial<GemsSnapshotItem>[] = [];
        // Add ETFs (Should be filtered if policy works)
        for (let i = 0; i < 5; i++) universe.push(createItem(i, 'ETF'));
        // Add Stocks
        for (let i = 0; i < 20; i++) universe.push(createItem(i, 'CS'));

        // Run 1
        console.log("Running Orchestrator Run 1...");
        const t0 = Date.now();
        const engine1 = orchestrateGemsEngine(universe as any[], macro, null);
        const t1 = Date.now();
        console.log(`Run 1 Complete (${t1 - t0}ms). Top3: ${engine1.newTop3.length}, Alpha12: ${engine1.newAlpha12.length}`);

        // Run 2 (Determinism Check)
        console.log("Running Orchestrator Run 2...");
        const engine2 = orchestrateGemsEngine(universe as any[], macro, null);

        // Checks
        const errors: string[] = [];

        // 1. Alpha12 Size
        if (engine1.newAlpha12.length !== 12) {
            errors.push(`Alpha12 Size: Expected 12, got ${engine1.newAlpha12.length}`);
        }

        // 2. Determinism
        if (JSON.stringify(engine1.newTop3) !== JSON.stringify(engine2.newTop3)) {
            errors.push(`Determinism Violation: Top3 mismatch between duplicate runs`);
        }

        if (errors.length > 0) {
            console.error("[FAIL] Verification Errors:");
            errors.forEach(e => console.error(`- ${e}`));
            process.exit(1);
        } else {
            console.log("[PASS] S-56.4.1 Checks Passed.");
            console.log("Top3 Sample:", engine1.newTop3.map((t: any) => `${t.ticker}(${t.alphaScore})`).join(', '));
            process.exit(0);
        }

    } catch (e: any) {
        console.error("[CRITICAL FAIL] Exception during verification:", e);
        console.error(e.stack);
        process.exit(1);
    }
}

verify();
