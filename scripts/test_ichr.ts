import { processWatchlistBatch } from '../src/services/watchlistBatchService';

async function main() {
    console.log("Fetching real-time Alpha Score for ICHR...");
    try {
        const result = await processWatchlistBatch(['ICHR'], 'full');
        const item = result.results[0];
        if (item) {
            console.log("\n--- ICHR ALPHA SCORE RESULT ---");
            console.log("Total Score:", item.alphaScore);
            console.log("Alpha Details:", JSON.stringify(item.alphaResult, null, 2));
            console.log("Pillars:", JSON.stringify(item.alphaResult?.pillars, null, 2));
            console.log("Gates Applied:", item.alphaResult?.gatesApplied);
            console.log("Quality Tier:", item.qualityTier);
            console.log("Reason:", item.tierReasonKR);
        } else {
            console.log("No data returned for ICHR.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
