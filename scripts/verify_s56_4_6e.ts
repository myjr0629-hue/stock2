// scripts/verify_s56_4_6e.ts
// S-56.4.6e: Git SSOT Lock Verification
// Verifies production endpoint parity and BuildID consistency

import fetch from 'node-fetch';

const PROD_BASE = "https://stock2-red.vercel.app";
const LOCAL_BASE = "http://localhost:3000";

async function verifyEndpoint(url: string, description: string): Promise<any> {
    try {
        console.log(`Checking ${description}: ${url}`);
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`❌ FAIL: ${url} returned ${res.status}`);
            return null;
        }
        const json = await res.json();
        console.log(`✓ PASS: ${res.status} OK`);
        return json;
    } catch (e: any) {
        console.error(`❌ ERROR: Failed to fetch ${url}`, e.message);
        return null;
    }
}

async function run() {
    console.log("=== S-56.4.6e Git SSOT Verification ===\n");

    // 1. Verify /api/health/env
    const envData = await verifyEndpoint(`${PROD_BASE}/api/health/env`, "Prod Env");
    if (envData) {
        if (envData.buildId === "local") {
            console.error("❌ FAIL: Production buildId is 'local'!");
        } else {
            console.log(`✓ PASS: Production buildId = ${envData.buildId}`);
        }
        if (envData.env?.MASSIVE_API_KEY_present) console.log("✓ PASS: MASSIVE_API_KEY present");
        else console.error("❌ FAIL: MASSIVE_API_KEY missing");
    }

    // 2. Verify /api/ticker/overview
    const tickerData = await verifyEndpoint(`${PROD_BASE}/api/ticker/overview?ticker=NVDA`, "Prod Ticker");
    if (tickerData) {
        const metaBuildId = tickerData.meta?.buildId;
        const source = tickerData.diagnostics?.source;
        console.log(`Info: Ticker BuildID=${metaBuildId}, Source=${source}`);

        if (metaBuildId === "local") console.error("❌ FAIL: Ticker meta.buildId is 'local'");
        else console.log("✓ PASS: Ticker meta.buildId is valid");

        if (source === "MASSIVE") console.log("✓ PASS: Source is MASSIVE");
        else console.error(`❌ FAIL: Source is ${source}`);
    }

    // 3. Verify /api/health/report
    const reportData = await verifyEndpoint(`${PROD_BASE}/api/health/report?type=eod`, "Prod Report");
    if (reportData) {
        const reportBuildId = reportData.envDiagnostics?.buildId;
        const versionTag = reportData.envDiagnostics?.routeVersionTag;
        console.log(`Info: Report BuildID=${reportBuildId}, Tag=${versionTag}`);

        if (reportBuildId === "local") console.error("❌ FAIL: Report buildId is 'local'");
        else console.log("✓ PASS: Report buildId is valid");

        if (versionTag === "S-56.4.6d" || versionTag === "S-56.4.6e") console.log(`✓ PASS: Version Tag OK (${versionTag})`);
        else console.warn(`⚠ WARN: Unexpected Version Tag: ${versionTag}`);
    }

    console.log("\n=== Verification Complete ===");
}

run();
