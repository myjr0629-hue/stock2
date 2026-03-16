// DynamoDB History Query Utility for Session Grid Phase B
// Provides GEX regime change detection + M7 relative comparison

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        }
    }),
    { marshallOptions: { removeUndefinedValues: true } }
);

const GEX_TABLE = 'signum-gex-history';

export interface GexSnapshot {
    ticker: string;
    timestamp: number;
    gex: number;
    price: number;
    pcr: number;
    gammaRegime: string;
    maxPain?: number;
    callWall?: number;
    putFloor?: number;
    squeezeScore?: number;
}

export interface HistoryContext {
    prevGex: number | null;
    prevRegime: string | null;
    regimeChanged: boolean;
    gexDelta: number | null;          // gex change from previous session
    pcrTrend: 'rising' | 'falling' | 'stable' | null;
    isOnlyShortGamma: boolean;        // only short gamma in sector
    isOnlyLongGamma: boolean;         // only long gamma in sector
    shortGammaCount: number;          // how many in sector are short gamma
    totalCount: number;
}

/**
 * Get recent GEX history for a ticker (last N snapshots)
 */
async function getRecentHistory(ticker: string, limit: number = 3): Promise<GexSnapshot[]> {
    try {
        const result = await client.send(new QueryCommand({
            TableName: GEX_TABLE,
            KeyConditionExpression: 'ticker = :t',
            ExpressionAttributeValues: { ':t': ticker },
            ScanIndexForward: false, // newest first
            Limit: limit,
        }));
        return (result.Items || []) as GexSnapshot[];
    } catch {
        return [];
    }
}

/**
 * Build history context for a single ticker within its sector group
 */
export async function buildHistoryContext(
    ticker: string,
    currentRegime: string,
    sectorTickers: { ticker: string; gammaRegime: string }[]
): Promise<HistoryContext> {
    const ctx: HistoryContext = {
        prevGex: null,
        prevRegime: null,
        regimeChanged: false,
        gexDelta: null,
        pcrTrend: null,
        isOnlyShortGamma: false,
        isOnlyLongGamma: false,
        shortGammaCount: 0,
        totalCount: sectorTickers.length,
    };

    try {
        // 1. Get previous snapshots for regime change detection
        const history = await getRecentHistory(ticker, 10);

        if (history.length >= 2) {
            // history[0] = most recent (current), history[1] = previous
            const prev = history[1];
            ctx.prevGex = prev.gex;
            ctx.prevRegime = prev.gammaRegime;
            ctx.gexDelta = history[0].gex - prev.gex;

            // [FIX] Regime change detection — compare by TRADING DAY, not intraday snapshots
            // Intraday snapshots frequently oscillate between regimes, causing false "regime changed" signals
            // Only flag a regime change when the PREVIOUS DAY's dominant regime differs from current
            const currentDay = new Date(history[0].timestamp).toISOString().slice(0, 10);
            const prevDaySnapshots = history.filter(h => {
                const d = new Date(h.timestamp).toISOString().slice(0, 10);
                return d !== currentDay;
            });
            if (prevDaySnapshots.length > 0) {
                // Use the most recent snapshot from the previous trading day
                const prevDayRegime = prevDaySnapshots[0].gammaRegime;
                ctx.prevRegime = prevDayRegime;
                ctx.regimeChanged = prevDayRegime !== currentRegime;
            } else {
                // All snapshots are from the same day — no cross-day comparison possible
                ctx.regimeChanged = false;
            }

            // PCR trend detection (need 3 points)
            if (history.length >= 3 && history[0].pcr && history[1].pcr && history[2].pcr) {
                const pcrs = [history[2].pcr, history[1].pcr, history[0].pcr]; // old→new
                if (pcrs[2] > pcrs[1] && pcrs[1] > pcrs[0]) {
                    ctx.pcrTrend = 'falling'; // descending = more calls
                } else if (pcrs[2] < pcrs[1] && pcrs[1] < pcrs[0]) {
                    ctx.pcrTrend = 'rising'; // ascending = more puts
                } else {
                    ctx.pcrTrend = 'stable';
                }
            }
        }

        // 2. M7 relative comparison
        const shortGammas = sectorTickers.filter(t => t.gammaRegime === 'SHORT');
        ctx.shortGammaCount = shortGammas.length;

        if (currentRegime === 'SHORT' && shortGammas.length === 1) {
            ctx.isOnlyShortGamma = true;
        }
        if (currentRegime === 'LONG' && shortGammas.length === sectorTickers.length - 1) {
            ctx.isOnlyLongGamma = true;
        }
    } catch {
        // Silently fail - history is supplementary
    }

    return ctx;
}

/**
 * Generate history-based analysis string
 */
export function generateHistoryInsight(ctx: HistoryContext, ss: (key: string, params?: any) => string): string {
    const parts: string[] = [];

    // Regime change is most critical
    if (ctx.regimeChanged && ctx.prevRegime) {
        if (ctx.prevRegime === 'LONG' && ctx.prevGex !== null) {
            parts.push(ss('histRegimeToShort') ||
                `⚠️ 감마 레짐 전환: 롱감마→숏감마. 변동성 환경 변화.`);
        } else if (ctx.prevRegime === 'SHORT') {
            parts.push(ss('histRegimeToLong') ||
                `✅ 감마 레짐 전환: 숏감마→롱감마. 안정 환경 복귀.`);
        }
    }

    // M7 relative positioning
    if (ctx.isOnlyShortGamma) {
        parts.push(ss('histOnlyShortGamma') ||
            `🔴 섹터 내 유일한 숏감마 — 상대적 변동성 리스크.`);
    } else if (ctx.isOnlyLongGamma) {
        parts.push(ss('histOnlyLongGamma') ||
            `🟢 섹터 내 유일한 롱감마 — 상대적 안정.`);
    } else if (ctx.shortGammaCount > 0 && ctx.totalCount > 0) {
        const ratio = ctx.shortGammaCount / ctx.totalCount;
        if (ratio >= 0.7) {
            parts.push(ss('histMostShortGamma', { count: ctx.shortGammaCount, total: ctx.totalCount }) ||
                `⚡ 섹터 ${ctx.shortGammaCount}/${ctx.totalCount} 숏감마 — 전반적 변동성 확대.`);
        }
    }

    // PCR trend
    if (ctx.pcrTrend === 'rising') {
        parts.push(ss('histPcrRising') || `PCR 연속 상승 — 풋 수요 증가 추세.`);
    } else if (ctx.pcrTrend === 'falling') {
        parts.push(ss('histPcrFalling') || `PCR 연속 하락 — 콜 수요 증가 추세.`);
    }

    return parts.join(' ');
}
