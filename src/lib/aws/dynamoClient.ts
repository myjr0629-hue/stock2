/**
 * [Phase 1] AWS DynamoDB Client for SIGNUM HQ
 * Connects to DynamoDB tables created in Phase 0
 * 
 * Tables: signum-gex-history, signum-rlsi-history, signum-sector-daily,
 *         signum-alpha-history, signum-flow-history, signum-iv-surface,
 *         signum-economic-calendar, signum-pattern-db
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';

let docClient: DynamoDBDocumentClient | null = null;

export function getDynamoClient(): DynamoDBDocumentClient | null {
    if (docClient) return docClient;

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
        console.warn('[DynamoDB] AWS credentials not configured');
        return null;
    }

    try {
        const client = new DynamoDBClient({
            region: REGION,
            credentials: { accessKeyId, secretAccessKey },
        });
        docClient = DynamoDBDocumentClient.from(client, {
            marshallOptions: { removeUndefinedValues: true },
        });
        console.log('[DynamoDB] Client initialized');
        return docClient;
    } catch (e) {
        console.error('[DynamoDB] Init failed:', e);
        return null;
    }
}

// ====== Generic Helpers ======

export async function putItem(tableName: string, item: Record<string, any>): Promise<boolean> {
    const client = getDynamoClient();
    if (!client) return false;

    try {
        await client.send(new PutCommand({ TableName: tableName, Item: item }));
        return true;
    } catch (e) {
        console.error(`[DynamoDB] putItem(${tableName}) failed:`, e);
        return false;
    }
}

export async function queryItems<T>(
    tableName: string,
    keyCondition: string,
    expressionValues: Record<string, any>,
    options?: { limit?: number; scanForward?: boolean; expressionNames?: Record<string, string> }
): Promise<T[]> {
    const client = getDynamoClient();
    if (!client) return [];

    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: keyCondition,
            ExpressionAttributeValues: expressionValues,
            ...(options?.expressionNames && { ExpressionAttributeNames: options.expressionNames }),
            Limit: options?.limit || 100,
            ScanIndexForward: options?.scanForward ?? false, // newest first by default
        }));
        return (result.Items || []) as T[];
    } catch (e) {
        console.error(`[DynamoDB] query(${tableName}) failed:`, e);
        return [];
    }
}

export async function batchPutItems(tableName: string, items: Record<string, any>[]): Promise<boolean> {
    const client = getDynamoClient();
    if (!client || items.length === 0) return false;

    try {
        // DynamoDB batch limit = 25 items
        for (let i = 0; i < items.length; i += 25) {
            const batch = items.slice(i, i + 25);
            await client.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: batch.map(item => ({ PutRequest: { Item: item } })),
                },
            }));
        }
        return true;
    } catch (e) {
        console.error(`[DynamoDB] batchPut(${tableName}) failed:`, e);
        return false;
    }
}

// Table name constants
export const TABLES = {
    GEX_HISTORY: 'signum-gex-history',
    RLSI_HISTORY: 'signum-rlsi-history',
    SECTOR_DAILY: 'signum-sector-daily',
    ALPHA_HISTORY: 'signum-alpha-history',
    FLOW_HISTORY: 'signum-flow-history',
    IV_SURFACE: 'signum-iv-surface',
    ECONOMIC_CALENDAR: 'signum-economic-calendar',
    PATTERN_DB: 'signum-pattern-db',
} as const;
