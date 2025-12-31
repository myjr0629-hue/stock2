
import { CentralDataHub } from '../src/services/centralDataHub';

async function verify() {
    console.log("Verifying CentralDataHub Refactor...");
    const tickers = ["NVDA", "SPY"];

    for (const t of tickers) {
        console.log(`\nFetching ${t}...`);
        const data = await CentralDataHub.getUnifiedData(t);
        console.log(`[${t}] Price: ${data.price}`);
        console.log(`[${t}] Source: ${data.priceSource}`); // Should be OFFICIAL_CLOSE, LIVE_SNAPSHOT, etc.
        console.log(`[${t}] Rollover: ${data.isRollover}`);
        console.log(`[${t}] Change%: ${data.finalChangePercent.toFixed(2)}%`);

        if (["OFFICIAL_CLOSE", "LIVE_SNAPSHOT", "POST_CLOSE", "PRE_OPEN"].includes(data.priceSource)) {
            console.log(`✅ [${t}] priceSource is valid: ${data.priceSource}`);
        } else {
            console.error(`❌ [${t}] Invalid priceSource: ${data.priceSource}`);
        }
    }
}

verify().catch(console.error);
