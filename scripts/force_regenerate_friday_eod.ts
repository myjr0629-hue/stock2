
import { generateReport } from '../src/services/reportScheduler';

async function main() {
    console.log("Starting forced regeneration for Friday EOD (Jan 9, 2026)...");
    const TARGET_DATE = '2026-01-09';
    try {
        // force=true to trigger slow adaptive concurrency
        const report = await generateReport('eod', true, TARGET_DATE);
        console.log("Report generated successfully:", report.meta.id);
        console.log("Market Date:", report.meta.marketDate);
        console.log("Top 3:", report.meta.top3?.map(t => t.ticker).join(', '));
        console.log("Coverage Pct:", report.meta.optionsStatus?.coveragePct + "%");
    } catch (error) {
        console.error("Report generation failed:", error);
    }
}

main();
