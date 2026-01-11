// [V4.0] Condition Codes Mapper
// Maps trade condition codes to classify Dark Pool / Off-Exchange / Regular trades
// Reference: Polygon/Massive API Condition Code documentation

/**
 * Trade Condition Classifications
 * 
 * DARK_POOL: Trades executed on Alternative Trading Systems (ATS) or dark pools
 * OFF_EXCHANGE: Trades executed off primary exchanges (e.g., intermarket sweeps)
 * REGULAR: Standard exchange trades
 * NOISE: Small/odd lot trades that should be deprioritized
 */
export type TradeChannel = 'DARK_POOL' | 'OFF_EXCHANGE' | 'REGULAR' | 'NOISE';

// Condition codes indicating Dark Pool / ATS activity
const DARK_POOL_CONDITIONS = new Set([
    'W',   // Average Price Trade (typical dark pool)
    'T',   // Form T (extended hours off-exchange)
    'U',   // Extended Hours Trade
    'Z',   // Sold (Out of Sequence) - often dark pool delayed reports
]);

// Condition codes indicating institutional sweep / off-exchange
const OFF_EXCHANGE_CONDITIONS = new Set([
    'F',   // Intermarket Sweep Order (ISO) - Large institutional order
    'E',   // Automatic Execution - automated systems
    'K',   // Rule 155 Trade (NYSE)
    '6',   // Derivatively Priced
    '1',   // Odd Lot Trade Execution of Odd Lot (Still may be block)
]);

// Condition codes indicating noise/deprioritize
const NOISE_CONDITIONS = new Set([
    'I',   // Odd Lot Trade - small retail
    'Q',   // Market Center Opening Trade
    'M',   // Market Center Closing Trade
    'L',   // Sold Last
    'N',   // Next Day (Settlement)
]);

// Condition codes indicating regular exchange trades
const REGULAR_CONDITIONS = new Set([
    '@',   // Regular Sale
    'O',   // Market Center Opening Trade
    'C',   // Cash Trade
    'P',   // Prior Reference Price
]);

/**
 * Classify a trade based on its condition codes
 * @param conditions - Array of condition code strings from trade data
 * @returns TradeChannel classification
 */
export function classifyTrade(conditions: string[] | undefined): TradeChannel {
    if (!conditions || conditions.length === 0) {
        return 'REGULAR'; // Default to regular if no conditions
    }

    // Priority: DARK_POOL > OFF_EXCHANGE > NOISE > REGULAR
    for (const cond of conditions) {
        if (DARK_POOL_CONDITIONS.has(cond)) return 'DARK_POOL';
    }
    for (const cond of conditions) {
        if (OFF_EXCHANGE_CONDITIONS.has(cond)) return 'OFF_EXCHANGE';
    }
    for (const cond of conditions) {
        if (NOISE_CONDITIONS.has(cond)) return 'NOISE';
    }

    return 'REGULAR';
}

/**
 * Calculate weighted trade value based on conditions and size
 * @param tradeValue - Raw trade value in USD
 * @param conditions - Condition codes
 * @param tradeTime - Trade timestamp
 * @param marketCloseTime - Market close time for time weighting
 * @returns Weighted value for scoring
 */
export function calculateWeightedValue(
    tradeValue: number,
    conditions: string[] | undefined,
    tradeTime?: Date,
    marketCloseTime?: Date
): { weightedValue: number; sizeWeight: number; timeWeight: number; channelWeight: number } {

    // 1. SIZE WEIGHT: Larger blocks get more weight
    let sizeWeight = 1.0;
    if (tradeValue >= 500000) {
        sizeWeight = 3.0;     // $500K+ = 3x (institutional)
    } else if (tradeValue >= 100000) {
        sizeWeight = 1.5;     // $100K+ = 1.5x (significant)
    } else if (tradeValue >= 50000) {
        sizeWeight = 1.0;     // $50K+ = baseline
    } else {
        sizeWeight = 0.3;     // <$50K = noise reduction
    }

    // 2. TIME WEIGHT: Trades near market close are more significant
    let timeWeight = 1.0;
    if (tradeTime && marketCloseTime) {
        const hoursToClose = (marketCloseTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);
        if (hoursToClose <= 2) {
            timeWeight = 2.0;   // Last 2 hours = 2x (closing positioning)
        } else if (hoursToClose <= 4) {
            timeWeight = 1.5;   // Last 4 hours = 1.5x
        }
    }

    // 3. CHANNEL WEIGHT: Dark pool trades are more significant
    let channelWeight = 1.0;
    const channel = classifyTrade(conditions);
    switch (channel) {
        case 'DARK_POOL':
            channelWeight = 2.5;  // Dark pool = 2.5x (hidden institutional)
            break;
        case 'OFF_EXCHANGE':
            channelWeight = 1.8;  // Off-exchange = 1.8x (institutional sweep)
            break;
        case 'REGULAR':
            channelWeight = 1.0;  // Regular = baseline
            break;
        case 'NOISE':
            channelWeight = 0.2;  // Noise = heavily deprioritize
            break;
    }

    const weightedValue = tradeValue * sizeWeight * timeWeight * channelWeight;

    return { weightedValue, sizeWeight, timeWeight, channelWeight };
}

/**
 * Detect consecutive block pattern (institutional accumulation signal)
 * @param trades - Array of trades sorted by timestamp
 * @returns Pattern detection result
 */
export interface BlockClusterResult {
    isCluster: boolean;
    clusterCount: number;
    totalValue: number;
    darkPoolRatio: number;
    direction: 'BUY' | 'SELL' | 'NEUTRAL';
}

export function detectBlockCluster(
    trades: Array<{ timestamp: number; value: number; conditions?: string[]; side?: 'buy' | 'sell' }>,
    windowMs: number = 300000 // 5 minutes default
): BlockClusterResult {
    if (trades.length < 3) {
        return { isCluster: false, clusterCount: 0, totalValue: 0, darkPoolRatio: 0, direction: 'NEUTRAL' };
    }

    // Sort by timestamp
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    let clusterCount = 0;
    let clusterValue = 0;
    let darkPoolValue = 0;
    let buyValue = 0;
    let sellValue = 0;

    for (let i = 1; i < sortedTrades.length; i++) {
        const timeDiff = sortedTrades[i].timestamp - sortedTrades[i - 1].timestamp;
        const trade = sortedTrades[i];

        // Within window AND significant size
        if (timeDiff <= windowMs && trade.value >= 50000) {
            clusterCount++;
            clusterValue += trade.value;

            const channel = classifyTrade(trade.conditions);
            if (channel === 'DARK_POOL' || channel === 'OFF_EXCHANGE') {
                darkPoolValue += trade.value;
            }

            if (trade.side === 'buy') {
                buyValue += trade.value;
            } else if (trade.side === 'sell') {
                sellValue += trade.value;
            }
        }
    }

    const isCluster = clusterCount >= 3; // At least 3 blocks in sequence
    const darkPoolRatio = clusterValue > 0 ? darkPoolValue / clusterValue : 0;

    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (buyValue > sellValue * 1.5) {
        direction = 'BUY';
    } else if (sellValue > buyValue * 1.5) {
        direction = 'SELL';
    }

    return {
        isCluster,
        clusterCount,
        totalValue: clusterValue,
        darkPoolRatio,
        direction
    };
}

/**
 * Calculate Off-Exchange percentage from trade list
 * @param trades - Array of trades with value and conditions
 * @returns Off-exchange percentage (0-100)
 */
export function calculateOffExchangePercent(
    trades: Array<{ value: number; conditions?: string[] }>
): number {
    if (trades.length === 0) return 0;

    let totalValue = 0;
    let offExValue = 0;

    for (const trade of trades) {
        totalValue += trade.value;
        const channel = classifyTrade(trade.conditions);
        if (channel === 'DARK_POOL' || channel === 'OFF_EXCHANGE') {
            offExValue += trade.value;
        }
    }

    return totalValue > 0 ? (offExValue / totalValue) * 100 : 0;
}
