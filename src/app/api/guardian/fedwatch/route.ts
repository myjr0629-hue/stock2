import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { WEEK_MS, weekAgoFromRow, withWeekBaseline, type WeekAgo } from '@/lib/fedwatchView';

const REDIS_KEY = 'fedwatch:latest';
const REDIS_FALLBACK_KEY = 'fedwatch:fallback'; // Long-lived fallback for weekends
const TTL_PRIMARY = 72 * 60 * 60;       // 72 hours — survive full weekend
const TTL_FALLBACK = 7 * 24 * 60 * 60;  // 7 days — absolute safety net

// DynamoDB client for permanent fallback
const ddbClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } }
);

// POST — Store FedWatch data (called by scraper script)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (!body || typeof body.noChange !== 'number') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const data = {
            ease: body.ease || 0,
            noChange: body.noChange || 0,
            hike: body.hike || 0,
            targetRate: body.targetRate || null,
            nextMeetingDate: body.nextMeetingDate || null,
            daysUntilFomc: body.daysUntilFomc || null,
            contract: body.contract || null,
            midPrice: body.midPrice || null,
            prevEase: body.prevEase ?? null,
            prevNoChange: body.prevNoChange ?? null,
            prevHike: body.prevHike ?? null,
            scrapedAt: body.scrapedAt || new Date().toISOString(),
            storedAt: new Date().toISOString(),
        };

        // Save to both primary and long-lived fallback
        await Promise.all([
            setInCache(REDIS_KEY, data, TTL_PRIMARY),
            setInCache(REDIS_FALLBACK_KEY, data, TTL_FALLBACK),
        ]);
        console.log('[FedWatch Store] Saved:', data.noChange + '% noChange');
        return NextResponse.json({ ok: true, data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('[FedWatch Store] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// Helper: check if FedWatch data has meaningful content
function hasMeaningfulData(d: Record<string, unknown>): boolean {
    const total = ((d.noChange as number) || 0) + ((d.hike as number) || 0) + ((d.ease as number) || 0);
    return total > 0 || !!d.targetRate || !!d.daysUntilFomc;
}

// ★ [2026-10-08] «1주 변화» 기준 — prev* 는 «직전 스크랩»이 아니라 «1주 전 값»이어야 한다(lib/fedwatchView 머리말).
//   스크랩 아카이브(FEDWATCH:latest 스트림, 스크랩마다 한 행)에서 «7일 이상 된 가장 최근 행»을 읽는다. 기준 행은 몇 시간에 한 번 바뀌므로
//   30분 캐시한다(없음도 10분 — DB 를 매 요청 두드리지 않는다).
const WEEK_CACHE_KEY = 'fedwatch:weekago:v1';
async function loadWeekAgo(nowMs: number = Date.now()): Promise<WeekAgo | null> {
    try {
        const c = await getFromCache<{ none?: boolean } & Partial<WeekAgo>>(WEEK_CACHE_KEY);
        if (c && typeof c === 'object') {
            if (c.none) return null;
            const w = weekAgoFromRow({ ease: c.ease, noChange: c.noChange, hike: c.hike, timestamp: Date.parse(String(c.at ?? '')) }, nowMs);
            if (w) return w;      // 캐시된 기준이 아직 «1주 전»이면 그대로, 아니면(너무 낡음·깨짐) 다시 읽는다
        }
    } catch { /* 캐시 실패는 DB 로 */ }
    try {
        const r = await ddbClient.send(new QueryCommand({
            TableName: 'signum-pattern-db',
            KeyConditionExpression: '#p = :p AND #ts <= :cut',
            ExpressionAttributeNames: { '#p': 'pattern', '#ts': 'timestamp' },
            ExpressionAttributeValues: { ':p': 'FEDWATCH:latest', ':cut': nowMs - WEEK_MS },
            ScanIndexForward: false,
            Limit: 1,
        }));
        const base = weekAgoFromRow(r.Items?.[0], nowMs);
        await setInCache(WEEK_CACHE_KEY, base ?? { none: true }, base ? 30 * 60 : 10 * 60).catch(() => { });
        return base;
    } catch (e: unknown) {
        console.error('[FedWatch GET] week-ago baseline error:', e instanceof Error ? e.message : e);
        return null;     // 기준을 못 읽으면 «—»(0.0% 로 메우지 않는다)
    }
}

const CDN_HEADERS = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };

// GET — Retrieve FedWatch data (called by frontend)
export async function GET() {
    try {
        // 응답 직전에 prev* 를 «1주 전 값»으로 바꾼다(없으면 null)
        const respond = async (payload: Record<string, unknown>) =>
            NextResponse.json(withWeekBaseline(payload, await loadWeekAgo()), { headers: CDN_HEADERS });

        // Tier 1: Primary Redis cache
        const cached = await getFromCache<Record<string, unknown>>(REDIS_KEY);
        if (cached && typeof cached.noChange === 'number' && hasMeaningfulData(cached)) {
            return respond(cached);
        }

        // Tier 2: Long-lived Redis fallback
        const fallback = await getFromCache<Record<string, unknown>>(REDIS_FALLBACK_KEY);
        if (fallback && typeof fallback.noChange === 'number' && hasMeaningfulData(fallback)) {
            return respond({ ...fallback, _source: 'fallback' });
        }

        // Tier 3: DynamoDB permanent fallback — data never expires.
        // Table key is composite (pattern + timestamp): Query newest-first.
        try {
            const ddbResult = await ddbClient.send(new QueryCommand({
                TableName: 'signum-pattern-db',
                KeyConditionExpression: '#p = :p',
                ExpressionAttributeNames: { '#p': 'pattern' },
                ExpressionAttributeValues: { ':p': 'FEDWATCH:latest' },
                ScanIndexForward: false,
                Limit: 1,
            }));
            const ddbData = ddbResult.Items?.[0];
            if (ddbData && typeof ddbData.noChange === 'number' && hasMeaningfulData(ddbData)) {
                // Re-populate Redis from DynamoDB so next calls are fast
                const restored = {
                    ease: ddbData.ease || 0,
                    noChange: ddbData.noChange || 0,
                    hike: ddbData.hike || 0,
                    targetRate: ddbData.targetRate || null,
                    daysUntilFomc: ddbData.daysUntilFomc || null,
                    nextMeetingDate: ddbData.nextMeetingDate || null,
                    scrapedAt: ddbData.scrapedAt || null,
                    prevEase: ddbData.prevEase ?? null,
                    prevNoChange: ddbData.prevNoChange ?? null,
                    prevHike: ddbData.prevHike ?? null,
                };
                await setInCache(REDIS_FALLBACK_KEY, restored, TTL_FALLBACK).catch(() => {});
                return respond({ ...restored, _source: 'dynamodb' });
            }
        } catch (ddbErr) {
            console.error('[FedWatch GET] DynamoDB fallback error:', ddbErr);
        }

        return NextResponse.json({
            ease: 0, noChange: 0, hike: 0,
            targetRate: null, daysUntilFomc: null,
            message: 'No FedWatch data available yet',
        }, { status: 200 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('[FedWatch GET] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
