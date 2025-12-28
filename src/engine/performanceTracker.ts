// [S-51.2] Performance Tracker - Measure 3-day returns for Top3 selections
// Auto-calculates D+1/D+2/D+3 performance with win rate statistics

import * as fs from 'fs';
import * as path from 'path';

import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

// Top3 Snapshot saved with each report
export interface Top3Snapshot {
    date: string;              // YYYY-MM-DD (ET)
    timestamp: string;         // ISO timestamp
    reportType: 'eod' | 'pre2h' | 'open30m';
    sessionType: 'regular' | 'pre' | 'post';
    tickers: {
        symbol: string;
        rank: number;
        baselinePrice: number;
        alphaScore: number;
    }[];
}

// Performance result for a single ticker
export interface TickerPerformance {
    symbol: string;
    baselinePrice: number;
    returns: {
        d1: number | null;    // D+1 return %
        d2: number | null;    // D+2 return %
        d3: number | null;    // D+3 return %
    };
    prices: {
        d1: number | null;
        d2: number | null;
        d3: number | null;
    };
    isWin: boolean | null;    // D+3 > 0
}

// Full performance record for a snapshot
export interface PerformanceRecord {
    snapshot: Top3Snapshot;
    tickers: TickerPerformance[];
    avgReturn: {
        d1: number | null;
        d2: number | null;
        d3: number | null;
    };
    winCount: number;
    tradeCount: number;
}

// Summary statistics
export interface PerformanceSummary {
    sampleSize: number;
    avgReturnD1: number | null;
    avgReturnD2: number | null;
    avgReturnD3: number | null;
    winRate: number | null;      // % of D+3 > 0
    maxWin: number | null;
    maxLoss: number | null;
    noTradeCount: number;
    lastUpdated: string;
}

// Storage path
const PERF_TRACKER_PATH = path.join(process.cwd(), 'snapshots', 'performance_tracker.json');

// Load performance data
export function loadPerformanceData(): PerformanceRecord[] {
    try {
        if (fs.existsSync(PERF_TRACKER_PATH)) {
            return JSON.parse(fs.readFileSync(PERF_TRACKER_PATH, 'utf-8'));
        }
    } catch (e) {
        console.warn('[PerfTracker] Failed to load data:', (e as Error).message);
    }
    return [];
}

// Save performance data
export function savePerformanceData(records: PerformanceRecord[]): void {
    try {
        const dir = path.dirname(PERF_TRACKER_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(PERF_TRACKER_PATH, JSON.stringify(records, null, 2));
    } catch (e) {
        console.error('[PerfTracker] Failed to save:', (e as Error).message);
    }
}

// Create Top3 snapshot from report data
export function createTop3Snapshot(
    reportMeta: any,
    top3Items: any[]
): Top3Snapshot {
    const slot = reportMeta.slot || 'eod';
    let sessionType: 'regular' | 'pre' | 'post' = 'regular';

    if (slot === 'pre2h') sessionType = 'pre';
    else if (slot === 'open30m') sessionType = 'pre';
    else sessionType = 'regular';

    return {
        date: reportMeta.etDate || new Date().toISOString().split('T')[0],
        timestamp: reportMeta.etTimestamp || new Date().toISOString(),
        reportType: slot,
        sessionType,
        tickers: top3Items.slice(0, 3).map((t, i) => ({
            symbol: t.ticker || t.symbol,
            rank: i + 1,
            baselinePrice: t.price || t.lastTrade?.p || 0,
            alphaScore: t.alphaScore || 0
        }))
    };
}

// Fetch closing price for a date
async function fetchClosingPrice(symbol: string, date: string): Promise<number | null> {
    try {
        const data = await fetchMassive(
            `/v1/open-close/${symbol}/${date}`,
            { adjusted: 'true' },
            true,
            undefined,
            CACHE_POLICY.REPORT_GEN
        );
        return data.close ?? null;
    } catch (e) {
        console.warn(`[PerfTracker] Price fetch failed: ${symbol}/${date}`);
        return null;
    }
}

// Calculate returns for a snapshot
export async function calculateReturns(snapshot: Top3Snapshot): Promise<PerformanceRecord> {
    const baseDate = new Date(snapshot.date);

    // Calculate D+1, D+2, D+3 dates (skip weekends)
    const getDayOffset = (base: Date, days: number): string => {
        const result = new Date(base);
        let added = 0;
        while (added < days) {
            result.setDate(result.getDate() + 1);
            const dow = result.getDay();
            if (dow !== 0 && dow !== 6) added++;
        }
        return result.toISOString().split('T')[0];
    };

    const d1Date = getDayOffset(baseDate, 1);
    const d2Date = getDayOffset(baseDate, 2);
    const d3Date = getDayOffset(baseDate, 3);

    const tickerPerfs: TickerPerformance[] = [];

    for (const t of snapshot.tickers) {
        const [priceD1, priceD2, priceD3] = await Promise.all([
            fetchClosingPrice(t.symbol, d1Date),
            fetchClosingPrice(t.symbol, d2Date),
            fetchClosingPrice(t.symbol, d3Date)
        ]);

        const baseline = t.baselinePrice;
        const calcReturn = (price: number | null): number | null => {
            if (!price || !baseline || baseline === 0) return null;
            return ((price - baseline) / baseline) * 100;
        };

        const returnD1 = calcReturn(priceD1);
        const returnD2 = calcReturn(priceD2);
        const returnD3 = calcReturn(priceD3);

        tickerPerfs.push({
            symbol: t.symbol,
            baselinePrice: baseline,
            returns: { d1: returnD1, d2: returnD2, d3: returnD3 },
            prices: { d1: priceD1, d2: priceD2, d3: priceD3 },
            isWin: returnD3 !== null ? returnD3 > 0 : null
        });
    }

    // Calculate averages
    const avgD1 = tickerPerfs.filter(t => t.returns.d1 !== null).reduce((acc, t) => acc + (t.returns.d1 || 0), 0) / tickerPerfs.filter(t => t.returns.d1 !== null).length || null;
    const avgD2 = tickerPerfs.filter(t => t.returns.d2 !== null).reduce((acc, t) => acc + (t.returns.d2 || 0), 0) / tickerPerfs.filter(t => t.returns.d2 !== null).length || null;
    const avgD3 = tickerPerfs.filter(t => t.returns.d3 !== null).reduce((acc, t) => acc + (t.returns.d3 || 0), 0) / tickerPerfs.filter(t => t.returns.d3 !== null).length || null;

    const winCount = tickerPerfs.filter(t => t.isWin === true).length;
    const tradeCount = tickerPerfs.filter(t => t.isWin !== null).length;

    return {
        snapshot,
        tickers: tickerPerfs,
        avgReturn: { d1: avgD1, d2: avgD2, d3: avgD3 },
        winCount,
        tradeCount
    };
}

// Get performance summary for last N records
export function getPerformanceSummary(records: PerformanceRecord[], limit: number = 20): PerformanceSummary {
    const recentRecords = records.slice(-limit);

    if (recentRecords.length === 0) {
        return {
            sampleSize: 0,
            avgReturnD1: null,
            avgReturnD2: null,
            avgReturnD3: null,
            winRate: null,
            maxWin: null,
            maxLoss: null,
            noTradeCount: 0,
            lastUpdated: new Date().toISOString()
        };
    }

    // Flatten all ticker performances
    const allPerfs = recentRecords.flatMap(r => r.tickers);
    const validD3 = allPerfs.filter(t => t.returns.d3 !== null);

    // Calculate stats
    const avgD1 = allPerfs.filter(t => t.returns.d1 !== null).length > 0
        ? allPerfs.filter(t => t.returns.d1 !== null).reduce((acc, t) => acc + (t.returns.d1 || 0), 0) / allPerfs.filter(t => t.returns.d1 !== null).length
        : null;

    const avgD2 = allPerfs.filter(t => t.returns.d2 !== null).length > 0
        ? allPerfs.filter(t => t.returns.d2 !== null).reduce((acc, t) => acc + (t.returns.d2 || 0), 0) / allPerfs.filter(t => t.returns.d2 !== null).length
        : null;

    const avgD3 = validD3.length > 0
        ? validD3.reduce((acc, t) => acc + (t.returns.d3 || 0), 0) / validD3.length
        : null;

    const winCount = allPerfs.filter(t => t.isWin === true).length;
    const tradeCount = allPerfs.filter(t => t.isWin !== null).length;
    const winRate = tradeCount > 0 ? (winCount / tradeCount) * 100 : null;

    const allReturns = validD3.map(t => t.returns.d3 as number);
    const maxWin = allReturns.length > 0 ? Math.max(...allReturns) : null;
    const maxLoss = allReturns.length > 0 ? Math.min(...allReturns) : null;

    const noTradeCount = allPerfs.filter(t => t.returns.d3 === null).length;

    return {
        sampleSize: recentRecords.length,
        avgReturnD1: avgD1 !== null ? Number(avgD1.toFixed(2)) : null,
        avgReturnD2: avgD2 !== null ? Number(avgD2.toFixed(2)) : null,
        avgReturnD3: avgD3 !== null ? Number(avgD3.toFixed(2)) : null,
        winRate: winRate !== null ? Number(winRate.toFixed(1)) : null,
        maxWin: maxWin !== null ? Number(maxWin.toFixed(2)) : null,
        maxLoss: maxLoss !== null ? Number(maxLoss.toFixed(2)) : null,
        noTradeCount,
        lastUpdated: new Date().toISOString()
    };
}

// Add new snapshot to tracker (called after report generation)
export function addSnapshotToTracker(snapshot: Top3Snapshot): void {
    const records = loadPerformanceData();

    // Check if already exists (same date + reportType)
    const existingIdx = records.findIndex(
        r => r.snapshot.date === snapshot.date && r.snapshot.reportType === snapshot.reportType
    );

    if (existingIdx >= 0) {
        console.log(`[PerfTracker] Snapshot already exists: ${snapshot.date}/${snapshot.reportType}`);
        return;
    }

    // Create placeholder record (returns will be calculated later)
    const newRecord: PerformanceRecord = {
        snapshot,
        tickers: snapshot.tickers.map(t => ({
            symbol: t.symbol,
            baselinePrice: t.baselinePrice,
            returns: { d1: null, d2: null, d3: null },
            prices: { d1: null, d2: null, d3: null },
            isWin: null
        })),
        avgReturn: { d1: null, d2: null, d3: null },
        winCount: 0,
        tradeCount: 0
    };

    records.push(newRecord);

    // Keep only last 60 records
    if (records.length > 60) {
        records.splice(0, records.length - 60);
    }

    savePerformanceData(records);
    console.log(`[PerfTracker] Added snapshot: ${snapshot.date}/${snapshot.reportType}`);
}

// Update pending records with actual prices (should be called daily)
export async function updatePendingReturns(): Promise<number> {
    const records = loadPerformanceData();
    let updatedCount = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const record of records) {
        // Skip if already fully calculated
        if (record.tickers.every(t => t.returns.d3 !== null)) continue;

        // Check if D+3 has passed
        const baseDate = new Date(record.snapshot.date);
        baseDate.setDate(baseDate.getDate() + 5); // 3 trading days + buffer

        if (baseDate.toISOString().split('T')[0] > today) continue;

        // Calculate returns
        const updated = await calculateReturns(record.snapshot);
        Object.assign(record, updated);
        updatedCount++;
    }

    if (updatedCount > 0) {
        savePerformanceData(records);
        console.log(`[PerfTracker] Updated ${updatedCount} records`);
    }

    return updatedCount;
}
