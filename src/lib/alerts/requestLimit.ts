/** 기존 feat/watchlist-alerts의 api.ts·store-dynamo.ts 요청 제한만 재사용한다.
 * 같은 표·R# 키·원자적 조건부 ADD·TTL을 쓰며 새 저장소를 만들지 않는다.
 * 설정/표/제한 조회 실패 시 호출자가 무료로 응답한다. */
import crypto from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoClient } from '@/lib/aws/dynamoClient';

export const RATE_WINDOW_SEC = 600;
export const RATE_LIMIT_PER_IP = 30;
export const RATE_LIMIT_PER_ID = 12; // 기존 기기 제한을 RevenueCat ID에 적용
export const RATE_LIMIT_PROVIDER = 30; // 같은 기존 카운터로 공급사 총량도 제한

export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
    const xff = headers.get('x-forwarded-for');
    if (xff) {
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
    }
    return headers.get('x-real-ip')?.trim() || null;
}
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);

export async function allowProVerification(headers: { get(name: string): string | null }, id: string): Promise<boolean> {
    return rateLimited([
        [`guru:ip:${hash('sg-wl-ip:' + (clientIpFrom(headers) || 'unknown'))}`, RATE_LIMIT_PER_IP],
        [`guru:id:${hash(id)}`, RATE_LIMIT_PER_ID],
    ]);
}

export async function allowProviderVerification(): Promise<boolean> {
    return rateLimited([['guru:provider', RATE_LIMIT_PROVIDER]]);
}

async function rateLimited(buckets: [string, number][]): Promise<boolean> {
    const db = getDynamoClient();
    if (!db) return false;
    const nowMs = Date.now();
    const window = Math.floor(nowMs / 1000 / RATE_WINDOW_SEC);
    for (const [bucket, limit] of buckets) {
        try {
            await db.send(new UpdateCommand({
                TableName: process.env.WATCHLIST_ALERTS_TABLE || 'signum-watchlist-alerts',
                Key: { pk: `R#${bucket}#${window}`, sk: 'R' },
                UpdateExpression: 'ADD n :one SET #ttl = if_not_exists(#ttl, :ttl), kind = :k',
                ConditionExpression: 'attribute_not_exists(n) OR n < :limit',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: { ':one': 1, ':limit': limit,
                    ':ttl': Math.floor(nowMs / 1000) + RATE_WINDOW_SEC * 2, ':k': 'rate' },
            }), { abortSignal: AbortSignal.timeout(3000) });
        } catch {
            return false;
        }
    }
    return true;
}
