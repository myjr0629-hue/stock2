
import { getTier01Data, getMacroData, getStockData } from '../src/services/stockApi';

// Custom Universe including IONQ
const TARGET_SYMBOLS = ['IONQ', 'PLTR', 'TSLA', 'NVDA', 'MSTR', 'AAPL', 'AMD', 'COIN', 'MSFT', 'GOOGL', 'AMZN', 'META'];

async function generateReport() {
    console.log("=== ALPHA TIER 0.1 GEMS V8.1 EXECUTION STARTED ===");
    console.log(`Time: ${new Date().toISOString()}`);

    // 1. MACRO
    const macro = await getMacroData();
    console.log("\n[MACRO DATA]");
    console.log(JSON.stringify(macro, null, 2));

    // 2. TICKER ANALYSIS
    // Since getTier01Data uses a hardcoded list, we'll manually fetch for our custom universe using logic similar to getTier01Data
    // Actually, let's reuse getTier01Data but we need to modify the list in the source, OR just recreate the logic here.
    // Given we can't easily modify the source for this run, we'll import fetchMassive functionality but it is not exported.
    // So we will rely on getStockData loop which is exported.

    console.log("\n[SCANNING UNIVERSE...]");
    const results = [];
    for (const sym of TARGET_SYMBOLS) {
        try {
            // Get Basic Stock Data (includes VWAP, Price)
            const stock = await getStockData(sym);

            // Get Option Data (GEX, MaxPain) - this is slow but accurate
            // We need to import getOptionsData... wait, it is exported.
            const { getOptionsData } = require('../src/services/stockApi');
            const opts = await getOptionsData(sym);

            results.push({
                symbol: sym,
                price: stock.price,
                change: stock.change,
                changePercent: stock.changePercent,
                vwap: stock.vwap,
                session: stock.session,
                regPrice: stock.regPrice,
                maxPain: opts.maxPain,
                gex: opts.gems?.gex,
                mmPos: opts.gems?.mmPos,
                edge: opts.gems?.edge,
                comment: opts.gems?.comment
            });
            console.log(`Processed ${sym}...`);
        } catch (e) {
            console.error(`Failed ${sym}:`, e);
        }
    }

    // Sort by PulseScore/ChangePercent proxy for now as PulseScore logic is internal to analyzeGemsTicker which is NOT exported.
    // Wait, analyzeGemsTicker is NOT exported in the file view I saw.
    // I will approximate PulseScore: ChangePercent * 5 + (VolRatio * 10). 
    // Since I don't have VolRatio easily, I'll use ChangePercent.

    const sorted = results.sort((a, b) => b.changePercent - a.changePercent);

    console.log("\n[TOP 3 CANDIDATES]");
    console.log(JSON.stringify(sorted.slice(0, 3), null, 2));

    console.log("\n[FULL GRID DATA]");
    console.log(JSON.stringify(sorted, null, 2));
}

generateReport();
