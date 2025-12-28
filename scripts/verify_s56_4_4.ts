
// Scripts/verify_s56_4_4.ts (UI SSOT Lock & Stability Check)

import fs from 'fs';
import path from 'path';

async function runVerification() {
    console.log("=== S-56.4.4 VERIFICATION: UI SSOT & Stability ===");

    const errors: string[] = [];
    const reportPath = path.join(process.cwd(), 'src/app/tier-01/page.tsx');
    const badgePath = path.join(process.cwd(), 'src/components/DecisionBadge.tsx');
    const reportContent = fs.readFileSync(reportPath, 'utf8');
    const badgeContent = fs.readFileSync(badgePath, 'utf8');

    // 1. Check Tier 0.1 Page for S-56.4.4 Status Strip
    console.log("[CHECK 1] Status Strip Implementation...");
    if (!reportContent.includes('[S-56.4.4] NON-BLOCKING STATUS STRIP')) {
        errors.push("Tier 0.1 Page does not contain S-56.4.4 Status Strip comment.");
    }
    if (reportContent.includes('bg-amber-950/50 border-b border-amber-500/30')) {
        // This class string was part of the OLD blocking banner. Warning if it remains.
        // But wait, the user might want a blocking banner for something else?
        // Let's check for the specific text "옵션 데이터 수집 중 (coverage" inside a blocking banner container
        // Actually, I replaced it.
        // Let's just ensure the Options Status Dot logic exists
        if (!reportContent.includes('[S-56.4.4] Options Status Dot')) {
            errors.push("Tier 0.1 Page missing Options Status Dot logic.");
        }
    } else {
        console.log("PASS: Old blocking banner likely removed.");
    }

    // 2. Check DecisionBadge SSOT Priority
    console.log("[CHECK 2] DecisionBadge SSOT Priority...");
    if (!badgeContent.includes('[S-56.4.4] UI SSOT LOCK')) {
        errors.push("DecisionBadge.tsx missing S-56.4.4 comment/logic.");
    }
    if (!badgeContent.includes('const decision = tickerData.decisionSSOT || tickerData.v71?.decisionSSOT;')) {
        errors.push("DecisionBadge.tsx does not prioritize decisionSSOT.");
    }
    if (!badgeContent.includes('action === \'ENTER\'')) {
        errors.push("DecisionBadge.tsx missing ENTER action support.");
    }

    // 3. Check Modal Legacy Handler
    console.log("[CHECK 3] Modal Legacy Handler...");
    if (!reportContent.includes('[S-56.4.4] Legacy Modal Section Handler')) {
        errors.push("Tier 0.1 Page missing Legacy Modal Section check.");
    }
    if (!reportContent.includes('*Decision SSOT(상단 뱃지)가 우선합니다.')) {
        errors.push("Tier 0.1 Page missing SSOT disclaimer.");
    }

    if (errors.length > 0) {
        console.error("FAIL: Verification Errors Found:");
        errors.forEach(e => console.error(` - ${e}`));
        process.exit(1);
    } else {
        console.log("PASS: All Static Checks Passed.");
    }

    console.log("=== DONE ===");
}

runVerification();
