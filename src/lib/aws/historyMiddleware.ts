/**
 * [Phase 2] History Middleware — Non-blocking DynamoDB history recording
 * 
 * Intercepts API response data and asynchronously stores snapshots to DynamoDB.
 * CRITICAL: All saves are fire-and-forget — NEVER blocks or delays the API response.
 * 
 * Usage:
 *   import { recordGexSnapshot, recordFlowSnapshot } from '@/lib/aws/historyMiddleware';
 *   // After computing GEX data in API route:
 *   recordGexSnapshot(ticker, gexData); // non-blocking
 */

import { saveGexSnapshot, saveFlowSnapshot, saveAlphaDaily, saveSectorDaily } from './historyStore';
import type { GexHistoryItem, FlowHistoryItem, AlphaHistoryItem, SectorDailyItem } from './historyStore';

// ====== US Market Hours Guard ======
// Only record intraday snapshots during or near US market hours (9:00–16:30 ET, Mon–Fri)
// Extended window: 9:00–16:30 ET (30min before open for pre-market data, 30min after close for settlement)
function isWithinMarketHours(): boolean {
    const now = new Date();
    // Get ET time using timezone offset
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const day = et.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false; // Weekend

    const hour = et.getHours();
    const minute = et.getMinutes();
    const timeMin = hour * 60 + minute;
    // 9:00 ET (540) to 16:30 ET (990) — captures full trading + settlement
    return timeMin >= 540 && timeMin <= 990;
}

// ====== GEX Recording ======
// Called from: /api/live/options/structure, /api/live/ticker, any GEX-computing endpoint
export function recordGexSnapshot(
    ticker: string,
    data: {
        gex?: number | null;
        gammaFlipLevel?: number | null;
        callWall?: number | null;
        putFloor?: number | null;
        maxPain?: number | null;
        price?: number;
        gammaState?: string;
    }
): void {
    if (!data.gex && data.gex !== 0) return; // No GEX data, skip
    if (!ticker) return;
    if (!isWithinMarketHours()) return; // Skip outside market hours

    const item: GexHistoryItem = {
        ticker,
        timestamp: Date.now(),
        gex: data.gex ?? 0,
        flipLevel: data.gammaFlipLevel ?? null,
        callWall: data.callWall ?? null,
        putFloor: data.putFloor ?? null,
        maxPain: data.maxPain ?? null,
        price: data.price ?? 0,
        gammaRegime: data.gammaState === 'LONG_GAMMA' ? 'POSITIVE'
            : data.gammaState === 'SHORT_GAMMA' ? 'NEGATIVE'
                : data.gex && data.gex > 0 ? 'POSITIVE'
                    : data.gex && data.gex < 0 ? 'NEGATIVE' : 'NEUTRAL',
    };

    // Fire-and-forget — never await
    saveGexSnapshot(item).catch(() => { });
}

// ====== Flow Recording ======
// Called from: /api/flow, /api/live/options endpoints
export function recordFlowSnapshot(
    ticker: string,
    data: {
        compositeScore?: number;
        opi?: number;
        whaleScore?: number;
        dex?: number;
        ivSkew?: number;
        squeezeProbability?: number;
        smartMoneyScore?: number;
        totalCallOI?: number;
        totalPutOI?: number;
    }
): void {
    if (!ticker) return;
    if (!isWithinMarketHours()) return; // Skip outside market hours

    const item: FlowHistoryItem = {
        ticker,
        timestamp: Date.now(),
        compositeScore: data.compositeScore ?? 0,
        opi: data.opi ?? 0,
        whaleScore: data.whaleScore ?? 0,
        dex: data.dex ?? 0,
        ivSkew: data.ivSkew ?? 0,
        squeezeProbability: data.squeezeProbability ?? 0,
        smartMoneyScore: data.smartMoneyScore ?? 0,
    };

    saveFlowSnapshot(item).catch(() => { });
}

// ====== Alpha Recording ======
// Called from: SSR calculation endpoints (watchlist, command, intel) after V4.6 Alpha Score calculation
export function recordAlphaDaily(
    ticker: string,
    data: {
        alphaScore?: number;
        qualityTier?: string;
        changePct?: number;
        gex?: number;
        pcr?: number;
        // [V4.6] Pillar breakdown — SSR Write-back
        grade?: string;
        momentum?: number;
        structure?: number;
        flow?: number;
        regime?: number;
        catalyst?: number;
        engineVersion?: string;
        price?: number;
    }
): void {
    if (!ticker) return;

    const today = new Date().toISOString().slice(0, 10);
    const item: AlphaHistoryItem = {
        ticker,
        date: today,
        alphaScore: data.alphaScore ?? 0,
        qualityTier: data.qualityTier ?? 'PENDING',
        changePct: data.changePct ?? 0,
        gex: data.gex ?? 0,
        pcr: data.pcr ?? 0,
        // Pillar breakdown (only present when SSR V4.6 calculates)
        grade: data.grade,
        momentum: data.momentum,
        structure: data.structure,
        flow: data.flow,
        regime: data.regime,
        catalyst: data.catalyst,
        engineVersion: data.engineVersion,
        price: data.price,
    };

    saveAlphaDaily(item).catch(() => { });
}

// ====== Sector Recording ======
// Called from: /api/cron/snapshot?sector=*
export function recordSectorDaily(
    sectorId: string,
    data: {
        avgChange?: number;
        gexSum?: number;
        avgPcr?: number;
        alphaScore?: number;
        ranking?: number;
        leadTicker?: string;
        lagTicker?: string;
    }
): void {
    if (!sectorId) return;

    const today = new Date().toISOString().slice(0, 10);
    const item: SectorDailyItem = {
        sectorId,
        date: today,
        avgChange: data.avgChange ?? 0,
        gexSum: data.gexSum ?? 0,
        avgPcr: data.avgPcr ?? 0,
        alphaScore: data.alphaScore ?? 0,
        ranking: data.ranking ?? 0,
        leadTicker: data.leadTicker ?? '',
        lagTicker: data.lagTicker ?? '',
    };

    saveSectorDaily(item).catch(() => { });
}

// ====== Batch GEX Recording (for cron jobs) ======
export function recordBatchGex(
    items: Array<{
        ticker: string;
        gex: number;
        flipLevel?: number | null;
        callWall?: number | null;
        putFloor?: number | null;
        maxPain?: number | null;
        price: number;
        gammaRegime: string;
    }>
): void {
    const gexItems: GexHistoryItem[] = items.map(d => ({
        ticker: d.ticker,
        timestamp: Date.now(),
        gex: d.gex,
        flipLevel: d.flipLevel ?? null,
        callWall: d.callWall ?? null,
        putFloor: d.putFloor ?? null,
        maxPain: d.maxPain ?? null,
        price: d.price,
        gammaRegime: d.gammaRegime,
    }));

    import('./historyStore').then(({ saveBatchGexSnapshots }) => {
        saveBatchGexSnapshots(gexItems).catch(() => { });
    });
}
