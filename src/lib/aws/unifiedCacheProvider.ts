/**
 * [Phase 3] DynamoDB Unified Cache Provider
 * 
 * Stores COMPLETE unified data for all 300 tickers permanently in DynamoDB.
 * This is the "never expires" data source — unlike Redis which has TTL.
 * 
 * Table: signum-unified-cache
 * Key: pk = "TICKER:LOCALE" (e.g., "NVDA:ko")
 * 
 * Write: Called from warm-command cron after building unified data
 * Read: Called from command/unified route as Tier 2 (after Redis miss)
 */

import { getDynamoClient, TABLES } from './dynamoClient';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Store complete unified data in DynamoDB (permanent, no TTL)
 * Data survives Redis restarts, server redeployments, everything.
 */
export async function putUnifiedCache(ticker: string, locale: string, data: any): Promise<boolean> {
    const client = getDynamoClient();
    if (!client) return false;

    try {
        // Store with language-independent key (data) + locale info for overview
        await client.send(new PutCommand({
            TableName: TABLES.UNIFIED_CACHE,
            Item: {
                pk: ticker,  // Language-independent key
                data: data,
                locale: locale,
                timestamp: Date.now(),
                updatedAt: new Date().toISOString(),
            },
        }));
        return true;
    } catch (e: any) {
        console.warn(`[DynamoDB/UnifiedCache] put(${ticker}) failed:`, e.message);
        return false;
    }
}

/**
 * Get complete unified data from DynamoDB
 * Returns null if not found or data is too old
 * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 */
export async function getUnifiedCache(ticker: string, locale: string, maxAgeMs = 86400000): Promise<any | null> {
    const client = getDynamoClient();
    if (!client) return null;

    try {
        // [FIX] Use ConsistentRead for freshness-sensitive data (price, changePct)
        // AWS DynamoDB default is eventually consistent — recent writes may not be visible
        let result = await client.send(new GetCommand({
            TableName: TABLES.UNIFIED_CACHE,
            Key: { pk: ticker },
            ConsistentRead: true,
        }));

        // Fallback: try old key format (TICKER:locale) for migration
        if (!result.Item) {
            result = await client.send(new GetCommand({
                TableName: TABLES.UNIFIED_CACHE,
                Key: { pk: `${ticker}:${locale}` },
            }));
        }

        if (!result.Item) return null;

        const item = result.Item;
        const age = Date.now() - (item.timestamp || 0);

        // Reject if too old (default 24h)
        if (age > maxAgeMs) return null;

        return {
            ...item.data,
            timestamp: item.timestamp,
            _source: 'dynamodb-unified',
            _ageMs: age,
        };
    } catch (e: any) {
        console.warn(`[DynamoDB/UnifiedCache] get(${ticker}) failed:`, e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════
// [v7.2] getUnifiedSnapshot() — Standardized read service
// Fallback: Memory LRU → Redis → DynamoDB
// Returns data with normalized freshness metadata
// ═══════════════════════════════════════════════════════════════════

export interface UnifiedSnapshot {
    data: Record<string, any>;
    _source: 'memory-lru' | 'cache' | 'dynamodb-unified' | 'dynamodb-gapfill' | 'unavailable';
    _asOf: string;    // ISO timestamp of data creation
    _ageSec: number;  // age in seconds
    _isStale: boolean; // older than 30 minutes
    _isPartial: boolean; // fewer than 5 core fields
    _fieldCount: number;
    _latencyMs: number;
}

const CORE_FIELDS = ['structure','analyst','fundamentals','earnings','sma','volatility','squeeze','institutional','related'] as const;
const STALE_THRESHOLD_SEC = 1800; // 30 minutes

export async function getUnifiedSnapshot(
    ticker: string,
    locale: string = 'en'
): Promise<UnifiedSnapshot> {
    const start = Date.now();

    // Tier 1: Redis (~5ms)
    try {
        const { getFromCache } = await import('@/services/redisClient');
        const cached = await getFromCache<any>(`cmd:data:${ticker}`).catch(() => null);
        if (cached && cached.timestamp) {
            const ageSec = Math.round((Date.now() - cached.timestamp) / 1000);
            const fc = CORE_FIELDS.filter(f => !!cached[f]).length;
            return {
                data: cached,
                _source: 'cache',
                _asOf: new Date(cached.timestamp).toISOString(),
                _ageSec: ageSec,
                _isStale: ageSec > STALE_THRESHOLD_SEC,
                _isPartial: fc < 5,
                _fieldCount: fc,
                _latencyMs: Date.now() - start,
            };
        }
    } catch { /* Redis unavailable */ }

    // Tier 3: DynamoDB (~50ms)
    const dynData = await getUnifiedCache(ticker, locale);
    if (dynData) {
        const ageSec = Math.round((dynData._ageMs || 0) / 1000);
        const fc = CORE_FIELDS.filter(f => !!dynData[f]).length;
        return {
            data: dynData,
            _source: 'dynamodb-unified',
            _asOf: new Date(dynData.timestamp || Date.now()).toISOString(),
            _ageSec: ageSec,
            _isStale: ageSec > STALE_THRESHOLD_SEC,
            _isPartial: fc < 5,
            _fieldCount: fc,
            _latencyMs: Date.now() - start,
        };
    }

    // All miss
    return {
        data: {},
        _source: 'unavailable',
        _asOf: new Date().toISOString(),
        _ageSec: 0,
        _isStale: false,
        _isPartial: true,
        _fieldCount: 0,
        _latencyMs: Date.now() - start,
    };
}
