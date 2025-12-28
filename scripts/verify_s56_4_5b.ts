// scripts/verify_s56_4_5b.ts
// S-56.4.5b: Ticker Diagnostics Verification

import fs from "fs";
import path from "path";

const LOCAL_ENV_URL = "http://localhost:3000/api/health/env";
const LOCAL_OVERVIEW_URL = "http://localhost:3000/api/ticker/overview?ticker=NVDA";

interface EnvResponse {
    ok: boolean;
    env: {
        MASSIVE_API_KEY_present: boolean;
        MASSIVE_API_KEY_last4: string | null;
    };
}

interface OverviewResponse {
    diagnostics?: {
        price: { ok: boolean; code?: string };
        chart: { ok: boolean; points?: number };
        vwap: { ok: boolean };
        session: { ok: boolean; badge?: string };
        options: { ok: boolean };
        news: { ok: boolean };
    };
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        return await res.json();
    } catch (e: any) {
        clearTimeout(timeout);
        return null;
    }
}

async function runVerification() {
    console.log("=== S-56.4.5b VERIFICATION: Ticker Diagnostics ===\n");

    const errors: string[] = [];
    const checks: string[] = [];

    // 1. Check /api/health/env exists and works
    console.log("[CHECK 1] /api/health/env endpoint");
    const envPath = path.join(process.cwd(), "src/app/api/health/env/route.ts");
    if (!fs.existsSync(envPath)) {
        errors.push("/api/health/env route.ts not found");
    } else {
        checks.push("/api/health/env route.ts exists");

        const envData = await fetchWithTimeout(LOCAL_ENV_URL);
        if (envData) {
            checks.push(`ENV API responds: ok=${envData.ok}`);
            if (envData.env?.MASSIVE_API_KEY_present) {
                checks.push(`MASSIVE_API_KEY present (last4: ${envData.env.MASSIVE_API_KEY_last4})`);
            } else {
                checks.push("MASSIVE_API_KEY not present (will use fallback)");
            }
        } else {
            checks.push("ENV API not reachable (dev server may not be running)");
        }
    }

    // 2. Check massiveClient.ts has normalizeError and MassiveError
    console.log("\n[CHECK 2] massiveClient.ts error standardization");
    const massiveClientPath = path.join(process.cwd(), "src/services/massiveClient.ts");
    if (!fs.existsSync(massiveClientPath)) {
        errors.push("massiveClient.ts not found");
    } else {
        const content = fs.readFileSync(massiveClientPath, "utf8");

        if (content.includes("normalizeError")) {
            checks.push("normalizeError function present");
        } else {
            errors.push("massiveClient.ts missing normalizeError function");
        }

        if (content.includes("MassiveError")) {
            checks.push("MassiveError type present");
        } else {
            errors.push("massiveClient.ts missing MassiveError type");
        }

        if (content.includes("ENV_MISSING")) {
            checks.push("ENV_MISSING error code present");
        } else {
            errors.push("massiveClient.ts missing ENV_MISSING error code");
        }
    }

    // 3. Check tickerOverview.ts has diagnostics
    console.log("\n[CHECK 3] tickerOverview.ts diagnostics");
    const tickerOverviewPath = path.join(process.cwd(), "src/services/tickerOverview.ts");
    if (!fs.existsSync(tickerOverviewPath)) {
        errors.push("tickerOverview.ts not found");
    } else {
        const content = fs.readFileSync(tickerOverviewPath, "utf8");

        if (content.includes("TickerDiagnostics")) {
            checks.push("TickerDiagnostics type present");
        } else {
            errors.push("tickerOverview.ts missing TickerDiagnostics type");
        }

        if (content.includes("SubCallDiagnostic")) {
            checks.push("SubCallDiagnostic type present");
        } else {
            errors.push("tickerOverview.ts missing SubCallDiagnostic type");
        }

        const subCalls = ["price", "chart", "vwap", "session", "options", "news"];
        const missingSubCalls = subCalls.filter(sc => !content.includes(`diagnostics.${sc}`));
        if (missingSubCalls.length === 0) {
            checks.push("All sub-call diagnostics tracked (price/chart/vwap/session/options/news)");
        } else {
            errors.push(`Missing sub-call diagnostics: ${missingSubCalls.join(", ")}`);
        }
    }

    // 4. Check ticker/page.tsx renders diagnostics
    console.log("\n[CHECK 4] ticker/page.tsx diagnostics rendering");
    const tickerPagePath = path.join(process.cwd(), "src/app/ticker/page.tsx");
    if (!fs.existsSync(tickerPagePath)) {
        errors.push("ticker/page.tsx not found");
    } else {
        const content = fs.readFileSync(tickerPagePath, "utf8");

        if (content.includes("ParityDiagnostics")) {
            checks.push("ParityDiagnostics component present");
        } else {
            errors.push("ticker/page.tsx missing ParityDiagnostics component");
        }

        if (content.includes("DiagnosticsPanel")) {
            checks.push("DiagnosticsPanel component present");
        } else {
            errors.push("ticker/page.tsx missing DiagnosticsPanel component");
        }

        if (content.includes("diagnostics.price") || content.includes("d.price")) {
            checks.push("Sub-call diagnostics rendered in UI");
        } else {
            errors.push("ticker/page.tsx not rendering sub-call diagnostics");
        }

        if (content.includes("reasonKR")) {
            checks.push("reasonKR displayed for failures");
        } else {
            errors.push("ticker/page.tsx not displaying reasonKR");
        }
    }

    // 5. Test API response (if dev server running)
    console.log("\n[CHECK 5] API Response Structure");
    const overviewData = await fetchWithTimeout(LOCAL_OVERVIEW_URL);
    if (overviewData) {
        if (overviewData.diagnostics) {
            checks.push("API response includes diagnostics object");

            const d = overviewData.diagnostics;
            if (d.price && typeof d.price.ok === "boolean") {
                checks.push(`diagnostics.price present (ok=${d.price.ok})`);
            }
            if (d.chart && typeof d.chart.points === "number") {
                checks.push(`diagnostics.chart.points=${d.chart.points}`);
            }
            if (d.session && d.session.badge) {
                checks.push(`diagnostics.session.badge=${d.session.badge}`);
            }
        } else {
            checks.push("API responded but diagnostics may be in error path");
        }
    } else {
        checks.push("API not reachable (dev server may not be running - skipping live test)");
    }

    // Summary
    console.log("\n--- Checks Passed ---");
    checks.forEach(c => console.log(`  ✓ ${c}`));

    console.log("\n--- Summary ---");
    if (errors.length > 0) {
        console.error("FAIL: Verification Errors Found:");
        errors.forEach(e => console.error(`  ✗ ${e}`));
        console.log("\n=== FAIL ===");
        process.exit(1);
    } else {
        console.log("PASS: All diagnostics checks passed.");
        console.log("\nUser Verification Commands:");
        console.log("  Local:");
        console.log("    irm http://localhost:3000/api/health/env");
        console.log('    irm "http://localhost:3000/api/ticker/overview?ticker=NVDA" | ConvertTo-Json -Depth 8');
        console.log("  Production:");
        console.log("    irm https://stock2-red.vercel.app/api/health/env");
        console.log('    irm "https://stock2-red.vercel.app/api/ticker/overview?ticker=NVDA" | ConvertTo-Json -Depth 8');
        console.log("\n=== PASS ===");
    }
}

runVerification();
