
import { generateReport } from '../src/services/reportScheduler';

async function main() {
    console.log("Starting manual report generation...");
    try {
        const report = await generateReport('final', true);
        console.log("Report generated successfully:", report.meta.id);
        console.log("Top 3:", report.meta.top3?.map(t => t.ticker).join(', '));
    } catch (error) {
        console.error("Report generation failed:", error);
    }
}

main();
