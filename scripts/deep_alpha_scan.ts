
import { getTier01Data, getMacroData, getStockData, getOptionsData } from '../src/services/stockApi';

async function deepScan() {
    console.log("=== [ALPHA COMMANDER] DEEP SCAN 300 PROTOCOL INITIATED ===");
    const symbols = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'AMZN', 'GOOGL', 'NFLX', 'COIN', 'MSTR', 'PLTR'];
    const results: any[] = [];

    for (const sym of symbols) {
        console.log(`[SCAN] Processing ${sym} with 300s quality precision...`);
        try {
            const stock = await getStockData(sym);
            const opts = await getOptionsData(sym, stock.price);
            results.push({ stock, opts });
        } catch (e) {
            console.error(`[ERROR] ${sym} scan failed:`, e);
        }
    }

    console.log("\n=== [DATA DUMP] START ===");
    console.log(JSON.stringify(results, null, 2));
    console.log("=== [DATA DUMP] END ===");
}

deepScan().catch(console.error);
