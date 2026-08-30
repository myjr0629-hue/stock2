/**
 * [Phase 1] History Store — Write/Read market history data to DynamoDB
 * 
 * Safe additive layer: Does NOT modify existing Upstash Redis behavior.
 * All writes are fire-and-forget (don't block response if DynamoDB fails).
 */

import { putItem, queryItems, batchPutItems, getDynamoClient, TABLES } from './dynamoClient';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

// ====== GEX History ======

export interface GexHistoryItem {
    ticker: string;
    timestamp: number;
    gex: number;
    flipLevel: number | null;
    callWall: number | null;
    putFloor: number | null;
    maxPain: number | null;
    price: number;
    gammaRegime: string;
}

export async function saveGexSnapshot(data: GexHistoryItem): Promise<void> {
    await putItem(TABLES.GEX_HISTORY, data).catch(() => { });
}

export async function getGexHistory(ticker: string, days = 30): Promise<GexHistoryItem[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return queryItems<GexHistoryItem>(
        TABLES.GEX_HISTORY,
        'ticker = :t AND #ts > :since',
        { ':t': ticker, ':since': since },
        { limit: 1000, scanForward: true, maxItems: 20000, expressionNames: { '#ts': 'timestamp' } }
    );
}

// ====== RLSI History ======

export interface RlsiHistoryItem {
    pk: string; // 'MARKET'
    timestamp: number;
    rlsi: number;
    momentum: number;
    participation: number;
    priceTrend: number;
    rotation: number;
    sentiment: number;
    regime: string;
    // [V2.0] Extended fields
    version?: string;           // 'V2.0'
    marketRegime?: string;      // RISK_ON | RISK_OFF | ROTATION | PANIC | NEUTRAL
    gammaScore?: number;        // 0-100 (Gamma Structure component)
    gexIndex?: number;          // -100 to +100
    squeezeRisk?: number;       // 0-100
    volatilityScore?: number;   // 0-100
    liquidityScore?: number;    // 0-100
    breadthMcClellan?: number;  // 0-100 (Breadth + McClellan)
    mcClellanOsc?: number;      // Raw McClellan Oscillator
    crossAssetMomentum?: number;// 0-100
    zScore?: number | null;     // Standard deviations from 20-period mean
    zSignal?: string | null;    // EXTREME_FEAR_REVERSAL | OVERHEATED | etc.
    gammaAdjustment?: number;   // Points contributed by gamma
    vix?: number;
    yieldPenalty?: number;
}

export async function saveRlsiSnapshot(data: Omit<RlsiHistoryItem, 'pk'>): Promise<void> {
    await putItem(TABLES.RLSI_HISTORY, { pk: 'MARKET', ...data }).catch(() => { });
}

export async function getRlsiHistory(days = 30): Promise<RlsiHistoryItem[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return queryItems<RlsiHistoryItem>(
        TABLES.RLSI_HISTORY,
        'pk = :pk AND #ts > :since',
        { ':pk': 'MARKET', ':since': since },
        { limit: 1000, scanForward: true, maxItems: 20000, expressionNames: { '#ts': 'timestamp' } }
    );
}

// ====== Sector Daily ======

export interface SectorDailyItem {
    sectorId: string;
    date: string; // YYYY-MM-DD
    avgChange: number;
    gexSum: number;
    avgPcr: number;
    alphaScore: number;
    ranking: number;
    leadTicker: string;
    lagTicker: string;
}

export async function saveSectorDaily(data: SectorDailyItem): Promise<void> {
    await putItem(TABLES.SECTOR_DAILY, data).catch(() => { });
}

export async function getSectorHistory(sectorId: string, days = 30): Promise<SectorDailyItem[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return queryItems<SectorDailyItem>(
        TABLES.SECTOR_DAILY,
        'sectorId = :s AND #d > :since',
        { ':s': sectorId, ':since': since },
        { limit: 90, scanForward: true, maxItems: 400, expressionNames: { '#d': 'date' } }
    );
}

// ====== Alpha History ======

export interface AlphaHistoryItem {
    ticker: string;
    date: string; // YYYY-MM-DD
    alphaScore: number;
    qualityTier: string;
    changePct: number;
    gex: number;
    pcr: number;
    // [V4.6] Pillar breakdown — SSR Write-back
    grade?: string;          // S/A/B/C/D/F
    momentum?: number;       // 0-25 pillar score
    structure?: number;      // 0-25
    flow?: number;           // 0-25
    regime?: number;         // 0-15
    catalyst?: number;       // 0-10
    engineVersion?: string;  // '5.0.0'
    price?: number;
    // [V5.0] Full input vector — enables future engine re-calculation (V6.0+)
    rsi14?: number | null;
    atmIv?: number | null;
    darkPoolPct?: number | null;
    whaleIndex?: number | null;
    squeezeScore?: number | null;
    relVol?: number | null;
    shortVolPct?: number | null;
    callWall?: number | null;
    putFloor?: number | null;
    gammaFlipLevel?: number | null;
    return3D?: number | null;
    netPremium?: number | null;
    ivSkew?: number | null;
    impliedMovePct?: number | null;
}

export async function saveAlphaDaily(data: AlphaHistoryItem): Promise<void> {
    const client = getDynamoClient();
    if (!client) return;

    try {
        if (data.qualityTier === 'SSR_V46') {
            // SSR_V46 always overwrites — this is the authoritative source
            await client.send(new PutCommand({
                TableName: TABLES.ALPHA_HISTORY,
                Item: data,
            }));
        } else {
            // Non-SSR (LIVE/Lambda) — only write if NO SSR_V46 record exists for today
            await client.send(new PutCommand({
                TableName: TABLES.ALPHA_HISTORY,
                Item: data,
                ConditionExpression: 'attribute_not_exists(qualityTier) OR qualityTier <> :ssr',
                ExpressionAttributeValues: { ':ssr': 'SSR_V46' },
            }));
        }
    } catch (e: any) {
        // ConditionalCheckFailedException = SSR_V46 already exists, skip silently
        if (e?.name === 'ConditionalCheckFailedException') return;
        // Other errors — log but don't throw
    }
}

export async function getAlphaHistory(ticker: string, days = 30): Promise<AlphaHistoryItem[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return queryItems<AlphaHistoryItem>(
        TABLES.ALPHA_HISTORY,
        'ticker = :t AND #d > :since',
        { ':t': ticker, ':since': since },
        { limit: 90, scanForward: true, maxItems: 400, expressionNames: { '#d': 'date' } }
    );
}

// ====== Flow History ======

export interface FlowHistoryItem {
    ticker: string;
    timestamp: number;
    compositeScore: number;
    opi: number;
    whaleScore: number;
    dex: number;
    ivSkew: number;
    squeezeProbability: number;
    smartMoneyScore: number;
}

export async function saveFlowSnapshot(data: FlowHistoryItem): Promise<void> {
    await putItem(TABLES.FLOW_HISTORY, data).catch(() => { });
}

export async function getFlowHistory(ticker: string, days = 7): Promise<FlowHistoryItem[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return queryItems<FlowHistoryItem>(
        TABLES.FLOW_HISTORY,
        'ticker = :t AND #ts > :since',
        { ':t': ticker, ':since': since },
        { limit: 500, scanForward: true, maxItems: 20000, expressionNames: { '#ts': 'timestamp' } }
    );
}

// ====== Batch Helpers ======

export async function saveBatchGexSnapshots(items: GexHistoryItem[]): Promise<void> {
    await batchPutItems(TABLES.GEX_HISTORY, items).catch(() => { });
}

export async function saveBatchAlphaDaily(items: AlphaHistoryItem[]): Promise<void> {
    await batchPutItems(TABLES.ALPHA_HISTORY, items).catch(() => { });
}

export async function saveBatchSectorDaily(items: SectorDailyItem[]): Promise<void> {
    await batchPutItems(TABLES.SECTOR_DAILY, items).catch(() => { });
}
