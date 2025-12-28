// scripts/verify_s56_4_6e.ts
// S-56.4.6e: Git SSOT Lock Verification (Native Fetch)
// Verifies production endpoint parity and BuildID consistency using Node 18+ global fetch

// [S-56.4.6e] Dependencies: None (Uses Node.js global fetch)
const _fetch: typeof fetch = (globalThis as any).fetch;

const PROD_BASE = "https://stock2-red.vercel.app";

async function fetchJson(url: string): Promise<any> {
    try {
        const res = await _fetch(url);
        if (!res.ok) {
            console.error(`Fetch failed: ${url} (Status: ${res.status})`);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error(`Fetch error for ${url}:`, e);
        return null;
    }
}

async function run() {
    console.log("=== S-56.4.6e Git SSOT Verification (Global Fetch) ===\n");

    try {
        // 1. Verify /api/health/env
        console.log(`Checking Prod Env: ${PROD_BASE}/api/health/env`);
        const envData = await fetchJson(`${PROD_BASE}/api/health/env`);

        if (envData) {
            console.log(`✓ Status OK`);
            // [S-56.4.6e] Check output buildId
            const buildId = envData.env?.buildId || envData.buildId;

            if (buildId === "local") {
                console.error("❌ FAIL: Production buildId is 'local'!");
            } else if (buildId) {
                console.log(`✓ PASS: Production buildId = ${buildId}`);
            } else {
                console.error("❌ FAIL: Production buildId is missing!");
            }

            if (envData.env?.MASSIVE_API_KEY_present || envData.envDiagnostics?.MASSIVE_API_KEY_present) console.log("✓ PASS: MASSIVE_API_KEY present");
            else console.error("❌ FAIL: MASSIVE_API_KEY missing");
        } else {
            console.error("❌ FAIL: Env endpoint unreachable");
        }

        // 2. Verify /api/ticker/overview
        console.log(`\nChecking Prod Ticker: ${PROD_BASE}/api/ticker/overview?ticker=NVDA`);
        const tickerData = await fetchJson(`${PROD_BASE}/api/ticker/overview?ticker=NVDA`);

        if (tickerData) {
            console.log(`✓ Status OK`);
            const metaBuildId = tickerData.meta?.buildId;
            const source = tickerData.diagnostics?.source;
            console.log(`Info: Ticker BuildID=${metaBuildId}, Source=${source}`);

            if (metaBuildId === "local") console.error("❌ FAIL: Ticker meta.buildId is 'local'");
            else if (metaBuildId) console.log("✓ PASS: Ticker meta.buildId is valid");
            else console.error("❌ FAIL: Ticker meta.buildId is missing");

            if (source === "MASSIVE") console.log("✓ PASS: Source is MASSIVE");
            else console.error(`❌ FAIL: Source is ${source}`);

            // S-56.4.7 pre-check
            const points = tickerData.diagnostics?.chart?.points || 0;
            console.log(`Info: Chart Points=${points}`);
        } else {
            console.error("❌ FAIL: Ticker endpoint unreachable");
        }

        // 3. Verify /api/health/report
        console.log(`\nChecking Prod Report: ${PROD_BASE}/api/health/report?type=eod`);
        const reportData = await fetchJson(`${PROD_BASE}/api/health/report?type=eod`);

        if (reportData) {
            console.log(`✓ Status OK`);
            const reportBuildId = reportData.envDiagnostics?.buildId || reportData.env?.buildId;
            const versionTag = reportData.envDiagnostics?.routeVersionTag;
            console.log(`Info: Report BuildID=${reportBuildId}, Tag=${versionTag}`);

            if (reportBuildId === "local") console.error("❌ FAIL: Report buildId is 'local'");
            else if (reportBuildId) console.log("✓ PASS: Report buildId is valid");
            else console.error("❌ FAIL: Report buildId is missing");

            // Allow 4.6d or 4.6e or higher
            if (versionTag && versionTag.startsWith("S-56.4.6")) console.log(`✓ PASS: Version Tag OK (${versionTag})`);
            else console.warn(`⚠ WARN: Unexpected Version Tag: ${versionTag}`);
        } else {
            console.error("❌ FAIL: Report endpoint unreachable");
        }

    } catch (e: any) {
        console.error("Fatal Error during verification:", e.message);
        process.exit(1);
    }

    console.log("\n=== Verification Complete ===");
}

run();
