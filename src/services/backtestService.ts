// [V3.1 PIPELINE] Alpha Backtest Service — Self-Correction Engine
// Tracks ACTIONABLE recommendations and measures 3-day outcomes.
// This is the engine's "memory" — it learns from its own predictions.
//
// Workflow:
// 1. After each report, record ACTIONABLE tickers with their alpha scores
// 2. After 3 business days, fetch actual price outcomes
// 3. Calculate hit rate (% of recommendations that were profitable)
// 4. Generate calibration data for future weight adjustments

import { fetchMassive } from './massiveClient';

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestRecord {
    ticker: string;
    recordedAt: string;         // ISO timestamp of recommendation
    alphaScore: number;         // Score at time of recommendation
    grade: string;              // Grade at time of recommendation
    action: string;             // Action (STRONG_BUY, BUY, etc.)
    priceAtRecommendation: number;
    targetCheckDate: string;    // Date to check outcome (T+3 business days)
    // Filled after check
    priceAtCheck?: number;
    returnPct?: number;
    outcome?: 'WIN' | 'LOSS' | 'FLAT' | 'PENDING';
    checkedAt?: string;
}

export interface BacktestSummary {
    totalRecords: number;
    checkedRecords: number;
    pendingRecords: number;
    wins: number;
    losses: number;
    flat: number;
    winRate: number;            // % of profitable recommendations
    avgWinReturn: number;       // Average return on winning trades
    avgLossReturn: number;      // Average return on losing trades
    expectancy: number;         // (winRate * avgWin) - ((1-winRate) * avgLoss)
    profitFactor: number;       // Total wins / Total losses
    bestTicker: string | null;
    worstTicker: string | null;
    lastUpdated: string;
    engineVersion: string;
}

// ============================================================================
// IN-MEMORY STORE (Persistent via file system in production)
// ============================================================================

// In-memory store for serverless environment
// Will be persisted to /tmp/backtest-records.json when available
const RECORDS_FILE = '/tmp/alpha-backtest-records.json';
let records: BacktestRecord[] = [];
let initialized = false;

function loadRecords(): BacktestRecord[] {
    if (initialized) return records;
    try {
        const fs = require('fs');
        if (fs.existsSync(RECORDS_FILE)) {
            const raw = fs.readFileSync(RECORDS_FILE, 'utf-8');
            records = JSON.parse(raw);
        }
    } catch {
        records = [];
    }
    initialized = true;
    return records;
}

function saveRecords(): void {
    try {
        const fs = require('fs');
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2));
    } catch {
        // Silently fail in serverless environments without filesystem access
    }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record an ACTIONABLE recommendation for future tracking.
 * Call this after each report generation with any ticker scored >= 70.
 */
export function recordRecommendation(
    ticker: string,
    alphaScore: number,
    grade: string,
    action: string,
    price: number
): void {
    loadRecords();

    // Calculate T+3 business days
    const now = new Date();
    const targetDate = addBusinessDays(now, 3);
    const targetCheckDate = targetDate.toISOString().split('T')[0];

    // Avoid duplicates (same ticker within same day)
    const today = now.toISOString().split('T')[0];
    const existing = records.find(r =>
        r.ticker === ticker &&
        r.recordedAt.startsWith(today)
    );
    if (existing) {
        // Update instead of duplicate
        existing.alphaScore = alphaScore;
        existing.grade = grade;
        existing.action = action;
        existing.priceAtRecommendation = price;
        saveRecords();
        return;
    }

    records.push({
        ticker,
        recordedAt: now.toISOString(),
        alphaScore,
        grade,
        action,
        priceAtRecommendation: price,
        targetCheckDate,
        outcome: 'PENDING',
    });

    // Keep only last 500 records to prevent unbounded growth
    if (records.length > 500) {
        records = records.slice(-500);
    }

    saveRecords();
    console.log(`[Backtest] Recorded: ${ticker} @ $${price.toFixed(2)} | Score=${alphaScore} | Check by ${targetCheckDate}`);
}

/**
 * Check pending records that have reached their T+3 date.
 * Fetches actual prices from Polygon and calculates returns.
 */
export async function checkPendingOutcomes(): Promise<number> {
    loadRecords();

    const today = new Date().toISOString().split('T')[0];
    const pending = records.filter(r =>
        r.outcome === 'PENDING' &&
        r.targetCheckDate <= today
    );

    if (pending.length === 0) return 0;

    let checked = 0;

    for (const record of pending) {
        try {
            // Fetch price at target date
            const prevRes = await fetchMassive(
                `/v2/aggs/ticker/${record.ticker}/range/1/day/${record.targetCheckDate}/${record.targetCheckDate}`,
                { adjusted: 'true' },
                true
            );

            const result = prevRes?.results?.[0];
            if (result?.c) {
                const priceAtCheck = result.c;
                const returnPct = ((priceAtCheck - record.priceAtRecommendation) / record.priceAtRecommendation) * 100;

                record.priceAtCheck = priceAtCheck;
                record.returnPct = Math.round(returnPct * 100) / 100;
                record.checkedAt = new Date().toISOString();

                if (returnPct > 0.25) {
                    record.outcome = 'WIN';
                } else if (returnPct < -0.25) {
                    record.outcome = 'LOSS';
                } else {
                    record.outcome = 'FLAT';
                }

                checked++;
                console.log(`[Backtest] ${record.ticker}: ${record.outcome} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%) | Alpha was ${record.alphaScore}`);
            }
        } catch (e) {
            // Skip this record for now, will retry next time
            console.warn(`[Backtest] Failed to check ${record.ticker}:`, e);
        }
    }

    if (checked > 0) saveRecords();
    return checked;
}

/**
 * Generate a comprehensive summary of backtest performance.
 */
export function getBacktestSummary(): BacktestSummary {
    loadRecords();

    const checked = records.filter(r => r.outcome && r.outcome !== 'PENDING');
    const pending = records.filter(r => r.outcome === 'PENDING');
    const wins = checked.filter(r => r.outcome === 'WIN');
    const losses = checked.filter(r => r.outcome === 'LOSS');
    const flat = checked.filter(r => r.outcome === 'FLAT');

    const winReturns = wins.map(r => r.returnPct || 0);
    const lossReturns = losses.map(r => Math.abs(r.returnPct || 0));

    const avgWinReturn = winReturns.length > 0
        ? Math.round((winReturns.reduce((a, b) => a + b, 0) / winReturns.length) * 100) / 100
        : 0;
    const avgLossReturn = lossReturns.length > 0
        ? Math.round((lossReturns.reduce((a, b) => a + b, 0) / lossReturns.length) * 100) / 100
        : 0;

    const winRate = checked.length > 0
        ? Math.round((wins.length / checked.length) * 1000) / 10
        : 0;

    const totalWinAmount = winReturns.reduce((a, b) => a + b, 0);
    const totalLossAmount = lossReturns.reduce((a, b) => a + b, 0);
    const profitFactor = totalLossAmount > 0 ? Math.round((totalWinAmount / totalLossAmount) * 100) / 100 : Infinity;

    // Expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss)
    const wr = winRate / 100;
    const expectancy = Math.round(((wr * avgWinReturn) - ((1 - wr) * avgLossReturn)) * 100) / 100;

    // Best/worst tickers
    const sortedByReturn = [...checked].sort((a, b) => (b.returnPct || 0) - (a.returnPct || 0));
    const bestTicker = sortedByReturn.length > 0 ? `${sortedByReturn[0].ticker} (+${sortedByReturn[0].returnPct}%)` : null;
    const worstTicker = sortedByReturn.length > 0 ? `${sortedByReturn[sortedByReturn.length - 1].ticker} (${sortedByReturn[sortedByReturn.length - 1].returnPct}%)` : null;

    return {
        totalRecords: records.length,
        checkedRecords: checked.length,
        pendingRecords: pending.length,
        wins: wins.length,
        losses: losses.length,
        flat: flat.length,
        winRate,
        avgWinReturn,
        avgLossReturn,
        expectancy,
        profitFactor,
        bestTicker,
        worstTicker,
        lastUpdated: new Date().toISOString(),
        engineVersion: '3.1.0',
    };
}

/**
 * Get all records (for UI display or debugging)
 */
export function getAllRecords(): BacktestRecord[] {
    loadRecords();
    return [...records].reverse(); // Most recent first
}

// ============================================================================
// UTILITIES
// ============================================================================

function addBusinessDays(date: Date, days: number): Date {
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
