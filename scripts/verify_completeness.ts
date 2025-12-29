
import { generateReport } from '../src/services/reportScheduler';

async function verifyCompleteness() {
    console.log("=== Verifying Zero-is-Invalid / Completeness Gate ===");

    // Generate Report Forcefully
    const report = await generateReport('morning', true);

    // Integrity Check
    let failures = 0;

    report.items.forEach(item => {
        const ev = item.evidence;
        const reasons = [];

        // 1. Critical Zeros
        if (ev.price.last === 0) reasons.push("Price=0");
        if (ev.price.vwap === 0) reasons.push("VWAP=0");
        if (ev.options.callWall === 0) reasons.push("CallWall=0");
        if (ev.flow.vol === 0) reasons.push("Vol=0");

        // 2. Invalid Status
        if (ev.options.status === 'PENDING' || ev.options.status === 'FAILED') reasons.push(`Status=${ev.options.status}`);

        if (reasons.length > 0) {
            console.error(`[FAIL] ${item.ticker}: ${reasons.join(', ')}`);
            failures++;
        } else {
            console.log(`[PASS] ${item.ticker} (Score: ${item.alphaScore})`);
        }
    });

    console.log(`\nResult: ${failures === 0 ? 'ALL CLEAR ✅' : `${failures} FAILURES ❌`}`);
}

verifyCompleteness();
