
import { generateReport } from '../src/services/reportScheduler';

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown', err);
    process.exit(1);
});

async function main() {
    console.log("=== START DEBUG ===");
    try {
        console.log("Calling generateReport('draft', true)...");
        const draft = await generateReport('draft', true);
        console.log("Draft generated:", draft.meta.id);

        console.log("Calling generateReport('final', true)...");
        const report = await generateReport('final', true);
        console.log("=== SUCCESS ===");
        console.log("Report ID:", report.meta.id);
        // Print top stocks
        if (report.meta.top3) {
            console.log("TOP 3 PICKS:");
            report.meta.top3.forEach(t => console.log(`- ${t.ticker}: ${t.whySummaryKR}`));
        }
    } catch (error: any) {
        console.error("=== FAILURE ===");
        console.error("Error Message:", error.message);
        console.error("Stack:", error.stack);
    }
}

main();
