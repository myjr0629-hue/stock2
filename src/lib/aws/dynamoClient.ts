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

/**
 * 조회.
 *
 * ⚠️ DynamoDB 의 `Limit` 은 「상위 N 건만 주고 **나머지는 버린다**」는 뜻이다.
 *    ScanIndexForward=true(오름차순) + Limit 1000 이면 **가장 오래된 1000건**만
 *    돌아오고 최신 데이터는 조용히 사라진다. 실제로 그랬다(2026-08-30 실측):
 *      /api/history?type=gex&NVDA&days=30 → 마지막 포인트 08-20
 *      /api/history?type=gex&NVDA&days=3  → 마지막 포인트 08-30 (수집은 멀쩡)
 *    차트가 「최근 30일」이라 말하면서 열흘 전에서 끊긴 선을 그리고 있었고,
 *    이걸 「수집이 멈췄다」로 오진할 뻔했다.
 *
 *    그래서 여기서 **페이지를 끝까지 넘긴다**. `limit` 은 이제 「한 페이지 크기」이고
 *    총량 상한은 `maxItems` 다(기본 5,000 — 폭주 방지).
 */
export async function queryItems<T>(
    tableName: string,
    keyCondition: string,
    expressionValues: Record<string, any>,
    options?: {
        limit?: number; scanForward?: boolean; expressionNames?: Record<string, string>;
        /** 총량 상한. 넘으면 그만 가져온다 (기본 5000) */
        maxItems?: number;
    }
): Promise<T[]> {
    const client = getDynamoClient();
    if (!client) return [];

    // ★★ [2026-09-04] `limit` 을 «페이지 크기»로만 쓰고 총량은 maxItems(5000)까지
    //   계속 페이징하고 있었다. 그래서 `getLatestGex(limit:1)` 이 **1건씩 수백 번**
    //   왕복했고, 호출부의 2.5~3초 타임아웃에 걸려 조용히 null 이 됐다.
    //   증상: 인텔의 AWS 폴백이 need=5 filled=0 err=없음 — 「대상은 골랐는데
    //   전부 못 채웠고 에러도 없다」. DynamoDB 엔 11분 전 값이 멀쩡히 있었다.
    //   → limit 을 준 호출은 그만큼만 받는다(그게 호출부의 의도다).
    const pageSize = options?.limit || 100;
    const maxItems = options?.maxItems ?? (options?.limit ?? 5000);
    const out: T[] = [];
    let startKey: Record<string, any> | undefined;

    try {
        do {
            const result: any = await client.send(new QueryCommand({
                TableName: tableName,
                KeyConditionExpression: keyCondition,
                ExpressionAttributeValues: expressionValues,
                ...(options?.expressionNames && { ExpressionAttributeNames: options.expressionNames }),
                Limit: Math.min(pageSize, maxItems - out.length),
                ScanIndexForward: options?.scanForward ?? false, // newest first by default
                ...(startKey && { ExclusiveStartKey: startKey }),
            }));
            out.push(...((result.Items || []) as T[]));
            startKey = result.LastEvaluatedKey;
        } while (startKey && out.length < maxItems);
        return out;
    } catch (e) {
        console.error(`[DynamoDB] query(${tableName}) failed:`, e);
        // 부분이라도 받은 것은 돌려준다 — 빈 배열은 「데이터 없음」으로 읽힌다
        return out;
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
    UNIFIED_CACHE: 'signum-unified-cache',
    BACKTEST: 'signum-backtest',
} as const;
