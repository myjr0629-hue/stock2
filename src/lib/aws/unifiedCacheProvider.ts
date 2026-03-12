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
        // DynamoDB item size limit is 400KB — unified data is typically 5-20KB
        await client.send(new PutCommand({
            TableName: TABLES.UNIFIED_CACHE,
            Item: {
                pk: `${ticker}:${locale}`,
                data: data,
                timestamp: Date.now(),
                updatedAt: new Date().toISOString(),
            },
        }));
        return true;
    } catch (e: any) {
        console.warn(`[DynamoDB/UnifiedCache] put(${ticker}:${locale}) failed:`, e.message);
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
        const result = await client.send(new GetCommand({
            TableName: TABLES.UNIFIED_CACHE,
            Key: { pk: `${ticker}:${locale}` },
        }));

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
        console.warn(`[DynamoDB/UnifiedCache] get(${ticker}:${locale}) failed:`, e.message);
        return null;
    }
}
