// Debug script to examine raw Polygon option trade data
// Run: node scripts/debug_order_flow.js

const MASSIVE_API_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE_URL = "https://api.polygon.io";

async function debugOptionTrades(ticker) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Debugging Order Flow for: ${ticker}`);
    console.log(`Current Time: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        // Fetch option snapshot
        const url = `${BASE_URL}/v3/snapshot/options/${ticker}?limit=250&apiKey=${MASSIVE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            console.log("❌ No option snapshot data returned");
            return;
        }

        console.log(`✅ Total contracts fetched: ${data.results.length}`);
        console.log(`\n--- Analyzing last_trade timestamps ---\n`);

        const now = Date.now();
        const cutoff20h = now - 20 * 60 * 60 * 1000;
        const cutoff48h = now - 48 * 60 * 60 * 1000;
        const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;

        let stats = {
            noTrade: 0,
            within20h: 0,
            within48h: 0,
            within7d: 0,
            older: 0,
            premiumAbove50k: 0,
            premiumAbove10k: 0,
            expiryWithin14d: 0
        };

        let sampleTrades = [];

        for (const contract of data.results) {
            const trade = contract.last_trade?.last_trade_sip || contract.last_trade;
            
            if (!trade || !trade.price || !trade.size) {
                stats.noTrade++;
                continue;
            }

            // Timestamp analysis
            const timestampNs = trade.sip_timestamp || trade.t || 0;
            const timestampMs = timestampNs / 1000000;
            const tradeDate = new Date(timestampMs);

            if (timestampMs > cutoff20h) stats.within20h++;
            else if (timestampMs > cutoff48h) stats.within48h++;
            else if (timestampMs > cutoff7d) stats.within7d++;
            else stats.older++;

            // Premium analysis
            const premium = trade.price * trade.size * 100;
            if (premium >= 50000) stats.premiumAbove50k++;
            if (premium >= 10000) stats.premiumAbove10k++;

            // Expiry analysis
            const expiry = new Date(contract.details?.expiration_date);
            const now14d = new Date();
            now14d.setDate(now14d.getDate() + 14);
            if (expiry <= now14d && expiry >= new Date()) {
                stats.expiryWithin14d++;
            }

            // Collect samples (first 5 with decent premium)
            if (sampleTrades.length < 5 && premium >= 10000) {
                sampleTrades.push({
                    contract: contract.details?.ticker,
                    strike: contract.details?.strike_price,
                    type: contract.details?.contract_type,
                    expiry: contract.details?.expiration_date,
                    premium: `$${(premium/1000).toFixed(1)}K`,
                    tradeTime: tradeDate.toISOString(),
                    ageHours: ((now - timestampMs) / 3600000).toFixed(1)
                });
            }
        }

        console.log("📊 Trade Age Distribution:");
        console.log(`   Within 20h (current filter): ${stats.within20h}`);
        console.log(`   20h - 48h ago: ${stats.within48h}`);
        console.log(`   48h - 7d ago: ${stats.within7d}`);
        console.log(`   Older than 7d: ${stats.older}`);
        console.log(`   No trade data: ${stats.noTrade}`);

        console.log("\n📊 Premium Distribution:");
        console.log(`   >= $50K (current filter): ${stats.premiumAbove50k}`);
        console.log(`   >= $10K: ${stats.premiumAbove10k}`);

        console.log("\n📊 Expiry Distribution:");
        console.log(`   Within 14 days: ${stats.expiryWithin14d}`);

        console.log("\n📝 Sample Trades (Premium >= $10K):");
        console.table(sampleTrades);

        // Root cause analysis
        console.log("\n🔍 ROOT CAUSE ANALYSIS:");
        if (stats.within20h === 0 && stats.within48h > 0) {
            console.log("⚠️  LIKELY CAUSE: Weekend/Holiday - No trading in last 20h");
            console.log("    All recent trades are from Friday's session (20-48h old)");
            console.log("    FIX: Extend lookback to 48-72h during weekends");
        } else if (stats.premiumAbove50k === 0 && stats.premiumAbove10k > 0) {
            console.log("⚠️  LIKELY CAUSE: Premium threshold too high");
            console.log("    FIX: Lower premium threshold to $10K-$25K");
        } else if (stats.expiryWithin14d === 0) {
            console.log("⚠️  LIKELY CAUSE: No contracts expiring within 14 days");
        } else if (stats.within20h > 0 && stats.premiumAbove50k > 0) {
            console.log("✅ Data looks healthy - check filter logic in route.ts");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

// Run for both tickers
(async () => {
    await debugOptionTrades("NVDA");
    await debugOptionTrades("TSLA");
    await debugOptionTrades("AAPL");
})();
