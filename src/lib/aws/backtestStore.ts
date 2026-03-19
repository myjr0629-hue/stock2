/**
 * [Phase 3] Backtest Store — DynamoDB-backed persistent backtest tracking
 * 
 * Replaces the ephemeral /tmp/alpha-backtest-records.json approach.
 * All backtest records are stored permanently in DynamoDB for:
 * - Alpha Score accuracy validation (per-grade hit rate)
 * - T+3 outcome tracking (WIN/LOSS/FLAT)
 * - Historical score accuracy graphs
 * 
 * Table: signum-backtest
 *   PK: ticker (String)
 *   SK: recordedAt (String — ISO timestamp)
 */

import { putItem, queryItems, TABLES } from './dynamoClient';

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestRecord {
    ticker: string;
    recordedAt: string;         // ISO timestamp (sort key)
    alphaScore: number;
    grade: string;              // S/A/B/C/D/F
    priceAtRecord: number;
    changePct: number;
    targetCheckDate: string;    // YYYY-MM-DD (T+3 business days)
    // Filled after evaluation
    priceAtCheck?: number;
    returnPct?: number;
    outcome?: 'WIN' | 'LOSS' | 'FLAT' | 'PENDING';
    checkedAt?: string;
    // Pillar snapshot for deep analysis
    momentum?: number;
    structure?: number;
    flow?: number;
    regime?: number;
    catalyst?: number;
    engineVersion?: string;
}

export interface BacktestSummary {
    totalRecords: number;
    evaluatedRecords: number;
    pendingRecords: number;
    wins: number;
    losses: number;
    flat: number;
    winRate: number;
    avgWinReturn: number;
    avgLossReturn: number;
    expectancy: number;
    profitFactor: number;
    byGrade: Record<string, { count: number; winRate: number; avgReturn: number }>;
    lastUpdated: string;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Save a new backtest record (Alpha ≥ 70 tickers only)
 * Called by Lambda after market close or by SSR during report generation
 */
export async function saveBacktestRecord(record: BacktestRecord): Promise<boolean> {
    return putItem(TABLES.BACKTEST, record);
}

/**
 * Save multiple backtest records in batch
 */
export async function saveBatchBacktestRecords(records: BacktestRecord[]): Promise<void> {
    const { batchPutItems } = await import('./dynamoClient');
    await batchPutItems(TABLES.BACKTEST, records).catch(() => { });
}

/**
 * Get pending records for a specific ticker (for T+3 evaluation)
 */
export async function getPendingRecords(ticker: string): Promise<BacktestRecord[]> {
    const records = await queryItems<BacktestRecord>(
        TABLES.BACKTEST,
        'ticker = :t',
        { ':t': ticker },
        { limit: 100, scanForward: false }
    );
    return records.filter(r => r.outcome === 'PENDING');
}

/**
 * Get all records for a ticker (for history display)
 */
export async function getTickerBacktestHistory(ticker: string, limit = 50): Promise<BacktestRecord[]> {
    return queryItems<BacktestRecord>(
        TABLES.BACKTEST,
        'ticker = :t',
        { ':t': ticker },
        { limit, scanForward: false } // newest first
    );
}

/**
 * Update a record with evaluation outcome
 */
export async function updateBacktestOutcome(
    ticker: string,
    recordedAt: string,
    priceAtCheck: number,
    returnPct: number,
    outcome: 'WIN' | 'LOSS' | 'FLAT'
): Promise<boolean> {
    // DynamoDB PutItem overwrites the entire item, so we need to read-then-write
    const records = await queryItems<BacktestRecord>(
        TABLES.BACKTEST,
        'ticker = :t AND recordedAt = :r',
        { ':t': ticker, ':r': recordedAt },
        { limit: 1 }
    );

    if (records.length === 0) return false;

    const updated = {
        ...records[0],
        priceAtCheck,
        returnPct: Math.round(returnPct * 100) / 100,
        outcome,
        checkedAt: new Date().toISOString(),
    };

    return putItem(TABLES.BACKTEST, updated);
}

/**
 * Get backtest summary across all evaluated records for a specific ticker
 */
export async function getTickerBacktestSummary(ticker: string): Promise<{
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgReturn: number;
} | null> {
    const records = await queryItems<BacktestRecord>(
        TABLES.BACKTEST,
        'ticker = :t',
        { ':t': ticker },
        { limit: 200 }
    );

    const evaluated = records.filter(r => r.outcome && r.outcome !== 'PENDING');
    if (evaluated.length === 0) return null;

    const wins = evaluated.filter(r => r.outcome === 'WIN').length;
    const losses = evaluated.filter(r => r.outcome === 'LOSS').length;
    const returns = evaluated.map(r => r.returnPct || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    return {
        total: evaluated.length,
        wins,
        losses,
        winRate: Math.round((wins / evaluated.length) * 1000) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
    };
}

// ============================================================================
// UTILITY — Business Day Calculation
// ============================================================================

export function addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
        result.setDate(result.getDate() + 1);
        const dayOfWeek = result.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            added++;
        }
    }
    return result;
}
