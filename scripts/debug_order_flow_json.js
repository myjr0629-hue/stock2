// Debug script to examine raw Polygon option trade data - JSON output
const MASSIVE_API_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE_URL = "https://api.polygon.io";
const fs = require('fs');

async function debugOptionTrades(ticker) {
    const result = {
        ticker,
        currentTime: new Date().toISOString(),
        stats: {},
        sampleTrades: [],
        rootCause: ""
    };

    try {
        const url = `${BASE_URL}/v3/snapshot/options/${ticker}?limit=250&apiKey=${MASSIVE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            result.error = "No option snapshot data returned";
            return result;
        }

        result.totalContracts = data.results.length;
        const now = Date.now();
        const cutoff20h = now - 20 * 60 * 60 * 1000;
        const cutoff48h = now - 48 * 60 * 60 * 1000;
        const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;

        let stats = {
            noTrade: 0,
            within20h: 0,
            between20h48h: 0,
            between48h7d: 0,
            older7d: 0,
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

            const timestampNs = trade.sip_timestamp || trade.t || 0;
            const timestampMs = timestampNs / 1000000;
            const tradeDate = new Date(timestampMs);

            if (timestampMs > cutoff20h) stats.within20h++;
            else if (timestampMs > cutoff48h) stats.between20h48h++;
            else if (timestampMs > cutoff7d) stats.between48h7d++;
            else stats.older7d++;

            const premium = trade.price * trade.size * 100;
            if (premium >= 50000) stats.premiumAbove50k++;
            if (premium >= 10000) stats.premiumAbove10k++;

            const expiry = new Date(contract.details?.expiration_date);
            const now14d = new Date();
            now14d.setDate(now14d.getDate() + 14);
            if (expiry <= now14d && expiry >= new Date()) {
                stats.expiryWithin14d++;
            }

            if (sampleTrades.length < 5 && premium >= 10000) {
                sampleTrades.push({
                    contract: contract.details?.ticker,
                    strike: contract.details?.strike_price,
                    type: contract.details?.contract_type,
                    expiry: contract.details?.expiration_date,
                    premiumK: (premium / 1000).toFixed(1),
                    tradeTime: tradeDate.toISOString(),
                    ageHours: ((now - timestampMs) / 3600000).toFixed(1)
                });
            }
        }

        result.stats = stats;
        result.sampleTrades = sampleTrades;

        // Root cause analysis
        if (stats.within20h === 0 && stats.between20h48h > 0) {
            result.rootCause = "WEEKEND_CLOSED: No trades in 20h, but trades exist 20-48h ago (Friday session)";
        } else if (stats.premiumAbove50k === 0 && stats.premiumAbove10k > 0) {
            result.rootCause = "PREMIUM_THRESHOLD: No trades >= $50K, but many >= $10K";
        } else if (stats.expiryWithin14d === 0) {
            result.rootCause = "NO_NEAR_EXPIRY: No contracts expiring within 14 days";
        } else if (stats.within20h > 0 && stats.premiumAbove50k > 0) {
            result.rootCause = "DATA_HEALTHY: Filter logic issue";
        } else {
            result.rootCause = "UNKNOWN: Check data manually";
        }

    } catch (e) {
        result.error = e.message;
    }

    return result;
}

(async () => {
    const results = [];
    for (const ticker of ["NVDA", "TSLA", "AAPL"]) {
        results.push(await debugOptionTrades(ticker));
    }
    fs.writeFileSync('debug_order_flow.json', JSON.stringify(results, null, 2));
    console.log("Done! Check debug_order_flow.json");
})();
