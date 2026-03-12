/**
 * DynamoDB Flow Cache Provider
 * 
 * Stores COMPLETE flow data (realtime-metrics + dark-pool + whale trades)
 * permanently in DynamoDB. This is the Tier 2 fallback when Redis misses.
 * 
 * Table: signum-flow-history
 * Key: pk = ticker, sk = timestamp
 * 
 * Read key pattern: "FLOW_CACHE:{ticker}" (GetCommand with pk)
 * 
 * Write: Called from warm-flow cron after building flow data
 * Read: Called from flow/unified route as Tier 2 (after Redis miss)
 */

import { getDynamoClient, TABLES } from './dynamoClient';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Store complete flow unified data in DynamoDB (permanent)
 * Data survives Redis restarts, server redeployments, everything.
 */
export async function putFlowCache(ticker: string, data: any): Promise<boolean> {
    const client = getDynamoClient();
    if (!client) return false;

    try {
        await client.send(new PutCommand({
            TableName: TABLES.FLOW_HISTORY,
            Item: {
                ticker: `FLOW_CACHE:${ticker}`,
                timestamp: Date.now(),
                data: data,
                updatedAt: new Date().toISOString(),
                _type: 'flow-unified-cache',
            },
        }));
        return true;
    } catch (e: any) {
        console.warn(`[DynamoDB/FlowCache] put(${ticker}) failed:`, e.message);
        return false;
    }
}

/**
 * Get complete flow data from DynamoDB
 * Returns null if not found or data is too old
 * @param maxAgeMs - Maximum age in milliseconds (default: 10 minutes)
 */
export async function getFlowCache(ticker: string, maxAgeMs = 600000): Promise<any | null> {
    const client = getDynamoClient();
    if (!client) return null;

    try {
        const result = await client.send(new QueryCommand({
            TableName: TABLES.FLOW_HISTORY,
            KeyConditionExpression: 'ticker = :tk',
            ExpressionAttributeValues: { ':tk': `FLOW_CACHE:${ticker}` },
            ScanIndexForward: false,
            Limit: 1,
        }));

        if (!result.Items || result.Items.length === 0) return null;

        const item = result.Items[0];
        const age = Date.now() - (item.timestamp || 0);

        // Reject if too old
        if (age > maxAgeMs) return null;

        return {
            ...item.data,
            timestamp: item.timestamp,
            _source: 'dynamodb-flow',
            _ageMs: age,
        };
    } catch (e: any) {
        console.warn(`[DynamoDB/FlowCache] get(${ticker}) failed:`, e.message);
        return null;
    }
}
