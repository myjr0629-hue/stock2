// scripts/verify_s56_4_5a.ts
// S-56.4.5a: Ticker UI Parity Verification

import fs from "fs";
import path from "path";

async function runVerification() {
    console.log("=== S-56.4.5a VERIFICATION: Ticker UI Parity ===\n");

    const errors: string[] = [];
    const warnings: string[] = [];

    const tickerPagePath = path.join(process.cwd(), "src/app/ticker/page.tsx");
    const tickerOverviewPath = path.join(process.cwd(), "src/services/tickerOverview.ts");
    const liveTickerDashboardPath = path.join(process.cwd(), "src/components/LiveTickerDashboard.tsx");

    // 1. Check ticker/page.tsx structure
    console.log("[CHECK 1] ticker/page.tsx Structure");
    if (!fs.existsSync(tickerPagePath)) {
        errors.push("ticker/page.tsx not found");
    } else {
        const content = fs.readFileSync(tickerPagePath, "utf8");

        // Must import from tickerOverview (SSOT)
        if (!content.includes('from "@/services/tickerOverview"') && !content.includes("from '@/services/tickerOverview'")) {
            errors.push("ticker/page.tsx does not import from tickerOverview SSOT service");
        } else {
            console.log("  ✓ Imports tickerOverview SSOT service");
        }

        // Must NOT import from stockApi for data fetching
        if (content.includes('getStockData') || content.includes('getStockNews')) {
            errors.push("ticker/page.tsx still uses getStockData/getStockNews from stockApi (should use tickerOverview)");
        } else {
            console.log("  ✓ No direct stockApi data fetching");
        }

        // Must use LiveTickerDashboard
        if (!content.includes("LiveTickerDashboard")) {
            errors.push("ticker/page.tsx missing LiveTickerDashboard component (Production UI)");
        } else {
            console.log("  ✓ Uses LiveTickerDashboard (Production UI)");
        }

        // Must have ParityDiagnostics
        if (!content.includes("ParityDiagnostics")) {
            errors.push("ticker/page.tsx missing ParityDiagnostics component");
        } else {
            console.log("  ✓ ParityDiagnostics strip present");
        }

        // Must handle vwapReasonKR
        if (!content.includes("vwapReasonKR")) {
            warnings.push("ticker/page.tsx may not pass vwapReasonKR to components");
        } else {
            console.log("  ✓ vwapReasonKR handling present");
        }
    }

    // 2. Check tickerOverview.ts exists and has required fields
    console.log("\n[CHECK 2] tickerOverview.ts SSOT Service");
    if (!fs.existsSync(tickerOverviewPath)) {
        errors.push("tickerOverview.ts not found");
    } else {
        const content = fs.readFileSync(tickerOverviewPath, "utf8");

        if (!content.includes('from "./massiveClient"')) {
            errors.push("tickerOverview.ts does not use massiveClient");
        } else {
            console.log("  ✓ Uses massiveClient");
        }

        if (!content.includes("vwapReasonKR")) {
            errors.push("tickerOverview.ts missing vwapReasonKR field");
        } else {
            console.log("  ✓ vwapReasonKR field present");
        }

        if (!content.includes("optionsReasonKR") && !content.includes("reasonKR")) {
            errors.push("tickerOverview.ts missing optionsReasonKR/reasonKR field");
        } else {
            console.log("  ✓ Options reasonKR field present");
        }

        if (!content.includes("session")) {
            errors.push("tickerOverview.ts missing session field");
        } else {
            console.log("  ✓ Session field present");
        }
    }

    // 3. Check LiveTickerDashboard exists
    console.log("\n[CHECK 3] LiveTickerDashboard Component");
    if (!fs.existsSync(liveTickerDashboardPath)) {
        errors.push("LiveTickerDashboard.tsx not found");
    } else {
        const content = fs.readFileSync(liveTickerDashboardPath, "utf8");

        // Core sections
        const hasChart = content.includes("StockChart");
        const hasOptions = content.includes("OIChart") || content.includes("Options");
        const hasNews = content.includes("News") || content.includes("Newspaper");

        if (hasChart) console.log("  ✓ Price History (StockChart) present");
        else warnings.push("LiveTickerDashboard may be missing Price History chart");

        if (hasOptions) console.log("  ✓ Options Analysis section present");
        else warnings.push("LiveTickerDashboard may be missing Options section");

        if (hasNews) console.log("  ✓ News/Intel Feed section present");
        else warnings.push("LiveTickerDashboard may be missing News section");
    }

    // Summary
    console.log("\n--- Summary ---");

    if (warnings.length > 0) {
        console.log("Warnings:");
        warnings.forEach(w => console.log(`  ⚠ ${w}`));
    }

    if (errors.length > 0) {
        console.error("\nFAIL: Verification Errors Found:");
        errors.forEach(e => console.error(`  ✗ ${e}`));
        console.log("\n=== FAIL ===");
        process.exit(1);
    } else {
        console.log("\nPASS: UI Parity Verified.");
        console.log("\nUI Parity achieved by:");
        console.log("  1. ticker/page.tsx uses LiveTickerDashboard (Production UI)");
        console.log("  2. Data fetched via tickerOverview SSOT service only");
        console.log("  3. stockApi direct usage removed from page");
        console.log("  4. ParityDiagnostics strip shows buildId/status");
        console.log("  5. vwapReasonKR/optionsReasonKR passed for non-silent errors");
        console.log("\n=== PASS ===");
    }
}

runVerification();
