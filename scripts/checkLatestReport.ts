import { loadLatest } from '../src/lib/storage/reportStore';

async function main() {
    try {
        console.log("Fetching latest draft report...");
        const report = await loadLatest("draft");
        if (!report) {
            console.log("No draft report found!");
            return;
        }

        console.log(`\n=== DRAFT REPORT (${report.createdAt}) ===`);
        console.log(`Version: ${report.engineVersion}`);
        console.log(`Generated At: ${report.generatedAt}`);

        console.log("\n--- Top 3 Recommendations ---");
        for (let i = 0; i < report.items.length && i < 3; i++) {
            const item = report.items[i];
            console.log(`${i + 1}. ${item.ticker} | Score: ${item.alphaScore}`);
            console.log(`   Action: ${item.decisionSSOT?.action}, Tier: ${item.decisionSSOT?.tier}`);
            console.log(`   Quality: ${item.decisionSSOT?.qualityLabel} - ${item.decisionSSOT?.reasonKR}`);
        }

        console.log("\n--- All Items ---");
        report.items.forEach(item => {
            console.log(`${item.ticker} (Score: ${item.alphaScore})`);
        });

    } catch (e) {
        console.error("Error reading report:", e);
    }
}

main();
