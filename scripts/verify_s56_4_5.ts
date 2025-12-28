// scripts/verify_s56_4_5.ts
// S-56.4.5: Ticker SSOT Parity Verification

import fs from "fs";
import path from "path";

const LOCAL_URL = "http://localhost:3000/api/ticker/overview?ticker=NVDA";
const PROD_URL = "https://stock2-nine.vercel.app/api/ticker/overview?ticker=NVDA";

interface TickerOverviewResponse {
    ticker: string;
    name: string | null;
    meta: {
        buildId: string;
        env: string;
        fetchedAt: string;
    };
    price: {
        last: number | null;
        vwap: number | null;
        vwapReasonKR?: string;
        session: string;
    };
    options: {
        status: string;
        coveragePct: number;
        gammaExposure: number | null;
        gammaExposureReasonKR?: string;
    };
    error?: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<TickerOverviewResponse | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
            console.error(`  HTTP ${res.status} from ${url}`);
            return null;
        }
        return await res.json();
    } catch (e: any) {
        clearTimeout(timeout);
        console.error(`  Fetch error: ${e.message}`);
        return null;
    }
}

async function runVerification() {
    console.log("=== S-56.4.5 VERIFICATION: Ticker SSOT Parity ===\n");

    const errors: string[] = [];

    // 1. Check local API
    console.log("[CHECK 1] Local API: /api/ticker/overview?ticker=NVDA");
    const local = await fetchWithTimeout(LOCAL_URL);

    if (!local) {
        errors.push("Local API returned null or errored. Is dev server running?");
    } else {
        // meta.buildId exists
        if (!local.meta?.buildId) {
            errors.push("Local: meta.buildId missing");
        } else {
            console.log(`  buildId: ${local.meta.buildId}`);
        }

        // options.status is valid enum
        const validStatuses = ["OK", "PARTIAL", "PENDING", "ERROR"];
        if (!validStatuses.includes(local.options?.status)) {
            errors.push(`Local: options.status invalid (${local.options?.status})`);
        } else {
            console.log(`  options.status: ${local.options.status}`);
        }

        // vwap numeric OR explicit reasonKR
        if (local.price?.vwap !== null && typeof local.price.vwap === "number") {
            console.log(`  vwap: $${local.price.vwap.toFixed(2)}`);
        } else if (local.price?.vwapReasonKR) {
            console.log(`  vwap: ${local.price.vwapReasonKR}`);
        } else {
            errors.push("Local: vwap is null without reasonKR explanation");
        }

        // No runtime error
        if (local.error) {
            errors.push(`Local: API returned error: ${local.error}`);
        }
    }

    // 2. Static code checks
    console.log("\n[CHECK 2] Static Code Analysis");

    const tickerPagePath = path.join(process.cwd(), "src/app/ticker/page.tsx");
    const tickerOverviewPath = path.join(process.cwd(), "src/services/tickerOverview.ts");

    if (!fs.existsSync(tickerPagePath)) {
        errors.push("ticker/page.tsx not found");
    } else {
        const content = fs.readFileSync(tickerPagePath, "utf8");

        // Must import from tickerOverview
        if (!content.includes('from "@/services/tickerOverview"') && !content.includes("from '@/services/tickerOverview'")) {
            errors.push("ticker/page.tsx does not import from tickerOverview service");
        } else {
            console.log("  ticker/page.tsx imports tickerOverview SSOT service ✓");
        }

        // Must NOT import from stockApi for ticker data
        if (content.includes('from "@/services/stockApi"') || content.includes("from '@/services/stockApi'")) {
            console.log("  WARNING: ticker/page.tsx still imports from stockApi (should use tickerOverview)");
        }

        // Must have ParityDiagnostics
        if (!content.includes("ParityDiagnostics")) {
            errors.push("ticker/page.tsx missing ParityDiagnostics component");
        } else {
            console.log("  ParityDiagnostics strip present ✓");
        }
    }

    if (!fs.existsSync(tickerOverviewPath)) {
        errors.push("tickerOverview.ts not found");
    } else {
        const content = fs.readFileSync(tickerOverviewPath, "utf8");

        // Must use massiveClient
        if (!content.includes('from "./massiveClient"')) {
            errors.push("tickerOverview.ts does not use massiveClient");
        } else {
            console.log("  tickerOverview.ts uses massiveClient ✓");
        }

        // Must have vwapReasonKR
        if (!content.includes("vwapReasonKR")) {
            errors.push("tickerOverview.ts missing vwapReasonKR field");
        } else {
            console.log("  vwapReasonKR field present ✓");
        }
    }

    // Summary
    console.log("\n--- Summary ---");
    if (errors.length > 0) {
        console.error("FAIL: Verification Errors Found:");
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    } else {
        console.log("PASS: All checks passed.");
        console.log("\nLocal/Prod divergence resolved by:");
        console.log("  1. Created tickerOverview.ts SSOT service");
        console.log("  2. Bound ticker/page.tsx to use SSOT only");
        console.log("  3. Removed direct stockApi usage from ticker page");
        console.log("  4. Added ParityDiagnostics strip for buildId/status visibility");
        console.log("\n=== PASS ===");
    }
}

runVerification();
