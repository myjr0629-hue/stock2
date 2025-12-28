// scripts/verify_s56_4_5c.ts
// S-56.4.5c: Production Route Parity Verification

import fs from "fs";
import path from "path";

async function runVerification() {
    console.log("=== S-56.4.5c VERIFICATION: Production Route Parity ===\n");

    const errors: string[] = [];
    const checks: string[] = [];

    // 1. Check /api/health/env route.ts exists with runtime/dynamic
    console.log("[CHECK 1] /api/health/env route.ts");
    const envRoutePath = path.join(process.cwd(), "src/app/api/health/env/route.ts");
    if (!fs.existsSync(envRoutePath)) {
        errors.push("/api/health/env/route.ts not found");
    } else {
        const content = fs.readFileSync(envRoutePath, "utf8");

        if (content.includes('export const runtime = "nodejs"') || content.includes("export const runtime = 'nodejs'")) {
            checks.push("env/route.ts has runtime='nodejs'");
        } else {
            errors.push("env/route.ts missing runtime='nodejs'");
        }

        if (content.includes('export const dynamic = "force-dynamic"') || content.includes("export const dynamic = 'force-dynamic'")) {
            checks.push("env/route.ts has dynamic='force-dynamic'");
        } else {
            errors.push("env/route.ts missing dynamic='force-dynamic'");
        }

        if (content.includes("export async function GET")) {
            checks.push("env/route.ts has GET handler");
        } else {
            errors.push("env/route.ts missing GET handler");
        }
    }

    // 2. Check /api/ticker/overview route.ts exists with runtime/dynamic
    console.log("\n[CHECK 2] /api/ticker/overview route.ts");
    const overviewRoutePath = path.join(process.cwd(), "src/app/api/ticker/overview/route.ts");
    if (!fs.existsSync(overviewRoutePath)) {
        errors.push("/api/ticker/overview/route.ts not found");
    } else {
        const content = fs.readFileSync(overviewRoutePath, "utf8");

        if (content.includes('export const runtime = "nodejs"') || content.includes("export const runtime = 'nodejs'")) {
            checks.push("overview/route.ts has runtime='nodejs'");
        } else {
            errors.push("overview/route.ts missing runtime='nodejs'");
        }

        if (content.includes('export const dynamic = "force-dynamic"') || content.includes("export const dynamic = 'force-dynamic'")) {
            checks.push("overview/route.ts has dynamic='force-dynamic'");
        } else {
            errors.push("overview/route.ts missing dynamic='force-dynamic'");
        }
    }

    // 3. Check /api/health/report has envDiagnostics
    console.log("\n[CHECK 3] /api/health/report envDiagnostics");
    const reportRoutePath = path.join(process.cwd(), "src/app/api/health/report/route.ts");
    if (!fs.existsSync(reportRoutePath)) {
        errors.push("/api/health/report/route.ts not found");
    } else {
        const content = fs.readFileSync(reportRoutePath, "utf8");

        if (content.includes("envDiagnostics")) {
            checks.push("report/route.ts has envDiagnostics fallback");
        } else {
            errors.push("report/route.ts missing envDiagnostics fallback");
        }

        if (content.includes("S-56.4.5c")) {
            checks.push("report/route.ts has S-56.4.5c version tag");
        } else {
            checks.push("report/route.ts missing version tag (non-critical)");
        }
    }

    // 4. Directory structure check
    console.log("\n[CHECK 4] Directory Structure");
    const expectedDirs = [
        "src/app/api/health/env",
        "src/app/api/ticker/overview"
    ];
    for (const dir of expectedDirs) {
        const fullPath = path.join(process.cwd(), dir);
        if (fs.existsSync(fullPath)) {
            checks.push(`Directory exists: ${dir}`);
        } else {
            errors.push(`Directory missing: ${dir}`);
        }
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
        console.log("PASS: All route parity checks passed.");
        console.log("\nDeployment Verification Commands:");
        console.log("  Local:");
        console.log("    irm http://localhost:3000/api/health/report?type=eod | ConvertTo-Json -Depth 6");
        console.log("    irm http://localhost:3000/api/health/env");
        console.log('    irm "http://localhost:3000/api/ticker/overview?ticker=NVDA" | ConvertTo-Json -Depth 6');
        console.log("  Production:");
        console.log("    irm https://stock2-red.vercel.app/api/health/report?type=eod | ConvertTo-Json -Depth 6");
        console.log("    irm https://stock2-red.vercel.app/api/health/env");
        console.log('    irm "https://stock2-red.vercel.app/api/ticker/overview?ticker=NVDA" | ConvertTo-Json -Depth 6');
        console.log("\nNote: If production returns 404, run:");
        console.log("    git add . && git commit -m 'S-56.4.5c route parity' && git push");
        console.log("    OR: npx vercel --prod");
        console.log("\n=== PASS ===");
    }
}

runVerification();
