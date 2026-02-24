import { generateReport } from '../src/services/reportScheduler';
import { enrichTerminalItems } from '../src/services/terminalEnricher';
import { processWatchlistBatch } from '../src/services/watchlistBatchService';

async function testFilter() {
    console.log("Testing Watchlist Batch API (what user sees):");
    const watchData = await processWatchlistBatch(['PL', 'FCX'], 'full');
    watchData.results.forEach((r: any) => {
        const cw = r.alphaResult?.pillars?.structure?.details?.callWall || 0;
        const pf = r.alphaResult?.pillars?.structure?.details?.putFloor || 0;
        console.log(`[Watchlist] ${r.ticker}: Score=${r.alphaScore}, CallWall=${cw}, PutFloor=${pf}`);
    });

    console.log("\nTesting Report Generator Hard Filter (what engine sees):");
    const rawItems = await enrichTerminalItems(['PL', 'FCX'], 'regular', true);

    rawItems.forEach(item => {
        const price = item.evidence?.price?.last || 0;
        const callWall = item.evidence?.options?.callWall || 0;
        const putFloor = item.evidence?.options?.putFloor || 0;
        const hasOptions = callWall > 0 || putFloor > 0;

        console.log(`[Report] ${item.ticker}: Price=$${price}, CallWall=${callWall}, PutFloor=${putFloor}, hasOptions=${hasOptions}`);

        if (price < 5) console.log(`   -> Fails Penny Stock Check ($${price})`);
        if (!hasOptions) console.log(`   -> Fails Options Data Check (No Support/Resistance Walls)`);
    });
}

testFilter().catch(console.error);
