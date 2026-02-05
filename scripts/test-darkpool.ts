/**
 * Dark Pool Detection Test Script
 * Tests /v3/trades/{stockTicker} API to analyze dark pool activity
 */

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = "https://api.polygon.io";

// Dark Pool Exchange Codes (ADF/FINRA TRF are primary dark pools)
const DARK_POOL_EXCHANGES: Record<number, string> = {
    4: "FINRA ADF (Dark Pool)",      // Alternative Display Facility
    15: "FINRA TRF Carteret",         // Trade Reporting Facility
    16: "FINRA TRF Chicago",
    19: "FINRA TRF (Dark Pool)",
};

// Lit Exchange Codes (Traditional exchanges)
const LIT_EXCHANGES: Record<number, string> = {
    1: "NYSE American",
    2: "NASDAQ OMX BX",
    3: "NYSE National",
    5: "FINRA (Other)",
    6: "ISE",
    7: "CBOE EDGA",
    8: "CBOE EDGX",
    9: "NYSE Chicago",
    10: "NYSE",
    11: "NYSE Arca",
    12: "NASDAQ",
    13: "CTS",
    14: "NASDAQ TRF",
    17: "NYSE",
    18: "CBOE BZX",
    20: "MIAX Pearl",
    21: "IEX",
};

// Condition codes that indicate special trades
const TRADE_CONDITIONS: Record<number, { name: string; isBlockTrade: boolean }> = {
    0: { name: "Regular Sale", isBlockTrade: false },
    1: { name: "Acquisition", isBlockTrade: false },
    2: { name: "Average Price Trade", isBlockTrade: true },  // Often institutional
    5: { name: "Bunched Trade", isBlockTrade: true },
    7: { name: "Cash Sale", isBlockTrade: false },
    10: { name: "Cross Trade", isBlockTrade: true },
    12: { name: "Distribution", isBlockTrade: true },
    14: { name: "Intermarket Sweep", isBlockTrade: true },   // Often algorithmic
    37: { name: "Odd Lot Trade", isBlockTrade: false },
    38: { name: "Official Close", isBlockTrade: false },
    41: { name: "Prior Reference Price", isBlockTrade: false },
    52: { name: "Contingent Trade", isBlockTrade: true },
    53: { name: "Qualified Contingent Trade", isBlockTrade: true },
};

interface Trade {
    conditions?: number[];
    exchange: number;
    price: number;
    size: number;
    timestamp: number; // nanoseconds
    participant_timestamp?: number;
    trf_id?: number;
    trf_timestamp?: number;
}

interface TradesResponse {
    results: Trade[];
    status: string;
    request_id: string;
    count: number;
    next_url?: string;
}

async function fetchTrades(ticker: string, limit: number = 1000): Promise<Trade[]> {
    const url = `${MASSIVE_BASE_URL}/v3/trades/${ticker}?limit=${limit}&apiKey=${MASSIVE_API_KEY}`;

    console.log(`\n📡 Fetching trades for ${ticker}...`);
    console.log(`   URL: ${url.replace(MASSIVE_API_KEY, "***")}`);

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }

    const data: TradesResponse = await res.json();
    console.log(`   Status: ${data.status}, Count: ${data.results?.length || 0}`);

    return data.results || [];
}

interface DarkPoolAnalysis {
    ticker: string;
    totalTrades: number;
    totalVolume: number;
    darkPoolTrades: number;
    darkPoolVolume: number;
    darkPoolPercent: number;
    litTrades: number;
    litVolume: number;
    blockTrades: number; // trades > 10,000 shares
    blockVolume: number;
    largestTrade: { size: number; exchange: string; price: number };
    exchangeBreakdown: Record<string, { trades: number; volume: number }>;
    avgTradeSize: number;
    avgDarkPoolTradeSize: number;
}

function analyzeDarkPool(ticker: string, trades: Trade[]): DarkPoolAnalysis {
    let totalVolume = 0;
    let darkPoolTrades = 0;
    let darkPoolVolume = 0;
    let litTrades = 0;
    let litVolume = 0;
    let blockTrades = 0;
    let blockVolume = 0;
    let largestTrade = { size: 0, exchange: "", price: 0 };

    const exchangeBreakdown: Record<string, { trades: number; volume: number }> = {};

    for (const trade of trades) {
        const size = trade.size || 0;
        const price = trade.price || 0;
        const exchangeId = trade.exchange;

        totalVolume += size;

        // Identify exchange
        const isDarkPool = DARK_POOL_EXCHANGES[exchangeId] !== undefined;
        const exchangeName = DARK_POOL_EXCHANGES[exchangeId] || LIT_EXCHANGES[exchangeId] || `Unknown (${exchangeId})`;

        // Track exchange breakdown
        if (!exchangeBreakdown[exchangeName]) {
            exchangeBreakdown[exchangeName] = { trades: 0, volume: 0 };
        }
        exchangeBreakdown[exchangeName].trades++;
        exchangeBreakdown[exchangeName].volume += size;

        // Categorize
        if (isDarkPool) {
            darkPoolTrades++;
            darkPoolVolume += size;
        } else {
            litTrades++;
            litVolume += size;
        }

        // Block trades (> 10,000 shares)
        if (size >= 10000) {
            blockTrades++;
            blockVolume += size;
        }

        // Track largest
        if (size > largestTrade.size) {
            largestTrade = { size, exchange: exchangeName, price };
        }
    }

    const darkPoolPercent = totalVolume > 0 ? (darkPoolVolume / totalVolume) * 100 : 0;
    const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : 0;
    const avgDarkPoolTradeSize = darkPoolTrades > 0 ? darkPoolVolume / darkPoolTrades : 0;

    return {
        ticker,
        totalTrades: trades.length,
        totalVolume,
        darkPoolTrades,
        darkPoolVolume,
        darkPoolPercent,
        litTrades,
        litVolume,
        blockTrades,
        blockVolume,
        largestTrade,
        exchangeBreakdown,
        avgTradeSize,
        avgDarkPoolTradeSize,
    };
}

function printReport(analysis: DarkPoolAnalysis) {
    console.log("\n" + "=".repeat(60));
    console.log(`🌑 DARK POOL ANALYSIS: ${analysis.ticker}`);
    console.log("=".repeat(60));

    console.log("\n📊 SUMMARY:");
    console.log(`   Total Trades:     ${analysis.totalTrades.toLocaleString()}`);
    console.log(`   Total Volume:     ${analysis.totalVolume.toLocaleString()} shares`);
    console.log(`   Avg Trade Size:   ${Math.round(analysis.avgTradeSize).toLocaleString()} shares`);

    console.log("\n🌑 DARK POOL ACTIVITY:");
    console.log(`   Dark Pool Trades: ${analysis.darkPoolTrades.toLocaleString()} (${((analysis.darkPoolTrades / analysis.totalTrades) * 100).toFixed(1)}%)`);
    console.log(`   Dark Pool Volume: ${analysis.darkPoolVolume.toLocaleString()} shares`);
    console.log(`   ⭐ Dark Pool %:   ${analysis.darkPoolPercent.toFixed(2)}%`);
    console.log(`   Avg DP Trade:     ${Math.round(analysis.avgDarkPoolTradeSize).toLocaleString()} shares`);

    console.log("\n💡 LIT EXCHANGE ACTIVITY:");
    console.log(`   Lit Trades:       ${analysis.litTrades.toLocaleString()}`);
    console.log(`   Lit Volume:       ${analysis.litVolume.toLocaleString()} shares`);

    console.log("\n🐋 BLOCK TRADES (10,000+ shares):");
    console.log(`   Block Trades:     ${analysis.blockTrades.toLocaleString()}`);
    console.log(`   Block Volume:     ${analysis.blockVolume.toLocaleString()} shares`);
    console.log(`   Block % of Vol:   ${((analysis.blockVolume / analysis.totalVolume) * 100).toFixed(2)}%`);

    console.log("\n🏆 LARGEST TRADE:");
    console.log(`   Size:     ${analysis.largestTrade.size.toLocaleString()} shares`);
    console.log(`   Exchange: ${analysis.largestTrade.exchange}`);
    console.log(`   Price:    $${analysis.largestTrade.price.toFixed(2)}`);

    console.log("\n📈 EXCHANGE BREAKDOWN:");
    const sorted = Object.entries(analysis.exchangeBreakdown)
        .sort((a, b) => b[1].volume - a[1].volume);

    for (const [exchange, data] of sorted.slice(0, 10)) {
        const volPct = ((data.volume / analysis.totalVolume) * 100).toFixed(1);
        const isDark = exchange.includes("Dark Pool") || exchange.includes("ADF") || exchange.includes("TRF");
        const marker = isDark ? "🌑" : "💡";
        console.log(`   ${marker} ${exchange.padEnd(25)} ${data.volume.toLocaleString().padStart(12)} shares (${volPct}%)`);
    }

    console.log("\n" + "=".repeat(60));

    // Interpretation
    console.log("\n🔍 INTERPRETATION:");
    if (analysis.darkPoolPercent > 40) {
        console.log("   ⚠️  HIGH DARK POOL ACTIVITY - Institutions are actively trading off-exchange");
        console.log("   ⚠️  This could indicate large position building or unwinding");
    } else if (analysis.darkPoolPercent > 20) {
        console.log("   📊 MODERATE DARK POOL ACTIVITY - Normal institutional participation");
    } else {
        console.log("   💡 LOW DARK POOL ACTIVITY - Trading is mostly on lit exchanges");
    }

    if (analysis.avgDarkPoolTradeSize > analysis.avgTradeSize * 2) {
        console.log("   🐋 Dark pool trades are significantly LARGER than average → Whale accumulation");
    }

    console.log("=".repeat(60));
}

async function main() {
    const ticker = process.argv[2] || "NVDA";

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║       🌑 DARK POOL DETECTION TEST - Massive API           ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`\nTicker: ${ticker}`);
    console.log(`Time: ${new Date().toISOString()}`);

    try {
        const trades = await fetchTrades(ticker, 1000);

        if (trades.length === 0) {
            console.log("\n❌ No trades data returned. API may not have access or market is closed.");
            return;
        }

        const analysis = analyzeDarkPool(ticker, trades);
        printReport(analysis);

    } catch (error) {
        console.error("\n❌ Error:", error);
    }
}

main();
