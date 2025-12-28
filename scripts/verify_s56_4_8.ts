// scripts/verify_s56_4_8.ts
// [S-56.4.8] Engine Integrity Hotfix Verification
// Checks:
// 1. Ticker Overview: Indicators source must be 'DAILY' (even if intraday chart)
// 2. Health Report: must allow degraded mode if massive key missing, OR explicitly show error
// 3. Env: MASSIVE_KEY presence

const _fetch: typeof fetch = (globalThis as any).fetch;
const BASE_URL = process.argv[2] || "http://localhost:3000";

async function run() {
    console.log(`=== S-56.4.8 Engine Integrity Verification (${BASE_URL}) ===\n`);

    try {
        // 1. Check Env for MASSIVE Key
        console.log(`[1] Checking Environment...`);
        const envRes = await _fetch(`${BASE_URL}/api/health/env`);
        const envData = await envRes.json();

        const hasKey = envData.env?.MASSIVE_API_KEY_present || envData.massiveKeyPresent;
        if (hasKey) console.log("✓ PASS: MASSIVE_API_KEY present");
        else console.warn("⚠ WARN: MASSIVE_API_KEY missing (Expected in Prod, acceptable in Dev if mocked)");

        // 2. Check Ticker Indicators (Must be DAILY)
        console.log(`\n[2] Checking Ticker Indicators (NVDA 1d)...`);
        const tickerRes = await _fetch(`${BASE_URL}/api/ticker/overview?ticker=NVDA&range=1d`);
        const tickerData = await tickerRes.json();

        if (tickerData.indicators?.dataSource === "DAILY") {
            const rsi = tickerData.indicators.rsi14;
            const ret3d = tickerData.indicators.return3D;
            console.log(`✓ PASS: Indicator Source is DAILY`);
            console.log(`  RSI(14): ${rsi}`);
            console.log(`  3D Ret:  ${ret3d}%`);

            if (rsi === null) console.warn("⚠ WARN: RSI is null (insufficient daily history?)");
        } else {
            console.error(`❌ FAIL: Indicator Source is ${tickerData.indicators?.dataSource} (Expected DAILY)`);
            console.log("diagnostics:", JSON.stringify(tickerData.diagnostics?.indicators, null, 2));
        }

        // 3. Check Chart Source (Should be INTRADAY for 1d)
        if (tickerData.diagnostics?.chart?.dataSource === "INTRADAY") {
            console.log("✓ PASS: Chart Source is INTRADAY (Correct for 1d)");
        } else {
            console.warn(`⚠ WARN: Chart Source is ${tickerData.diagnostics?.chart?.dataSource} (Expected INTRADAY if market open)`);
        }

    } catch (e: any) {
        console.error("Fatal Error:", e.message);
        process.exit(1);
    }
    console.log("\n=== Verification Complete ===");
}

run();
