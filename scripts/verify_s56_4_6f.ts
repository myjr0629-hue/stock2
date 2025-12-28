// scripts/verify_s56_4_6f.ts
// [S-56.4.6f] Deploy Lock Hard Seal Verification
// Checks /api/health/deploy for SSOT metadata and guard logic.

const _fetch: typeof fetch = (globalThis as any).fetch;
const BASE_URL = process.argv[2] || "http://localhost:3000";

async function run() {
    console.log(`=== S-56.4.6f Deploy Lock Verification (${BASE_URL}) ===\n`);

    try {
        const url = `${BASE_URL}/api/health/deploy`;
        console.log(`Fetching ${url}...`);

        const res = await _fetch(url);
        if (!res.ok) throw new Error(`Status ${res.status}`);

        const data = await res.json();

        // 1. Check Payload Structure
        if (data.deploy && data.guard) {
            console.log("✓ PASS: Payload structure OK");
            console.log("  BuildID:", data.deploy.buildId);
            console.log("  EnvType:", data.deploy.envType);
            console.log("  CommitSHA:", data.deploy.gitCommitSha || "(null - local)");
            console.log("  VercelEnv:", data.deploy.vercelEnv || "(null - local)");
        } else {
            console.error("❌ FAIL: Invalid payload structure", data);
            process.exit(1);
        }

        // 2. Check Guard Logic
        const { buildId, envType } = data.deploy;
        const { isDrifted, message } = data.guard;

        if (envType === "production" && buildId === "local") {
            // Should be drifting
            if (isDrifted) {
                console.log("✓ PASS: DRIFT DETECTED correctly (Prod Env + Local Build)");
                console.log("  Message:", message);
            } else {
                console.error("❌ FAIL: Drift NOT detected despite Prod Env + Local Build");
            }
        } else {
            // Should be OK
            if (!isDrifted) {
                console.log("✓ PASS: Guard OK (No drift detected)");
            } else {
                console.error("❌ FAIL: False positive drift detection");
            }
        }

    } catch (e: any) {
        console.error("Fatal Error:", e.message);
        process.exit(1);
    }
    console.log("\n=== Verification Complete ===");
}

run();
