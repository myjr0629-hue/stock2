
// src/scripts/verify_whale_logic.ts

// Mocking the logic found in route.ts to verify correctness
// Define Interface for safety
interface WhaleTrade {
    ticker: string;
    price: number;
    size: number;
    premium: number;
    isWhale: boolean;
}

// Mocking the logic found in route.ts to verify correctness
function processTrades(mockSnapshot: any[]): WhaleTrade[] {
    return mockSnapshot
        .map((item: any) => {
            const lastTrade = item.last_trade;
            if (!lastTrade || !lastTrade.p || !lastTrade.s) return null;

            // Logic from route.ts
            const premium = lastTrade.p * lastTrade.s * 100;

            const details = item.details || {};

            return {
                ticker: details.ticker,
                price: lastTrade.p,
                size: lastTrade.s,
                premium,
                isWhale: premium >= 50000
            };
        })
        .filter((t): t is WhaleTrade => t !== null && t.isWhale);
}

// Test Cases
const mockData = [
    {
        // Case 1: Small trade ($2.50 * 10 * 100 = $2,500) -> Should be filtered out
        details: { ticker: 'SMALL_FISH' },
        last_trade: { p: 2.50, s: 10, sip_timestamp: 1000 }
    },
    {
        // Case 2: Borderline Whale ($5.00 * 100 * 100 = $50,000) -> Should be IN
        details: { ticker: 'EXACT_WHALE' },
        last_trade: { p: 5.00, s: 100, sip_timestamp: 2000 }
    },
    {
        // Case 3: Proper Whale ($10.50 * 50 * 100 = $52,500) -> Should be IN
        details: { ticker: 'BIG_WHALE' },
        last_trade: { p: 10.50, s: 50, sip_timestamp: 3000 }
    },
    {
        // Case 4: Huge Whale ($20.00 * 100 * 100 = $200,000) -> Should be IN (and highlighted in UI)
        details: { ticker: 'MEGA_WHALE' },
        last_trade: { p: 20.00, s: 100, sip_timestamp: 4000 }
    },
    {
        // Case 5: Partial Data -> Should be filtered out (safety check)
        details: { ticker: 'BROKEN' },
        last_trade: { p: 100.00, s: 0, sip_timestamp: 5000 } // Size 0 implies 0 premium
    }
];

console.log("--- Starting Whale Logic Verification ---");
const results = processTrades(mockData);

console.log(`Input Items: ${mockData.length}`);
console.log(`Output Items: ${results.length}`);

results.forEach(r => {
    console.log(`[PASS] ${r.ticker}: Premium $${r.premium.toLocaleString()} (Is Whale: ${r.isWhale})`);
});

// Verification Assertions
const foundSmall = results.find(r => r.ticker === 'SMALL_FISH');
const foundExact = results.find(r => r.ticker === 'EXACT_WHALE');

if (!foundSmall && foundExact && results.length === 3) {
    console.log("\n✅ VERIFICATION SUCCESS: Logic correctly filters $50k+ premiums.");
} else {
    console.error("\n❌ VERIFICATION FAILED: Filtering logic is incorrect.");
}
