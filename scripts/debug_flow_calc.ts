
const { CentralDataHub } = require('../src/services/centralDataHub');

async function run() {
    console.log("=== Debugging Flow Calc ===");
    const ticker = "NVDA";

    // 1. Get Price first to determine the strike range
    const quote = await CentralDataHub.getUnifiedData(ticker);
    const price = quote.price;
    console.log(`Ticker: ${ticker}, Price: ${price}`);

    if (!price) {
        console.error("Failed to get price");
        return;
    }

    // 2. Run _fetchOptionsChain
    console.log("Running _fetchOptionsChain...");
    const flow = await CentralDataHub._fetchOptionsChain(ticker, price);

    console.log("=== Flow Result ===");
    console.log(JSON.stringify(flow, null, 2));

    if (flow.optionsCount === 0) {
        console.log("⚠️ ZERO OPTIONS FOUND. Filters are too strict!");
    } else {
        console.log(`✅ Found ${flow.optionsCount} options. NetPrem: ${flow.netPremium}`);
    }
}

run().catch(console.error);
