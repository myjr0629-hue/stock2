import { NextRequest, NextResponse } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const REDIS_KEY = 'fedwatch:latest';
const REDIS_FALLBACK_KEY = 'fedwatch:fallback'; // Long-lived fallback for weekends
const TTL_PRIMARY = 72 * 60 * 60;       // 72 hours — survive full weekend
const TTL_FALLBACK = 7 * 24 * 60 * 60;  // 7 days — absolute safety net

// Permanent archive — table key is composite (pattern HASH + timestamp RANGE),
// so every put appends a row; readers Query newest-first.
const ddbClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } }
);

// POST — Store FedWatch data (called by scraper script/Lambda)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (!body || typeof body.noChange !== 'number') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // Read previous data to preserve delta tracking
        const prev = await getFromCache<{ ease?: number; noChange?: number; hike?: number }>(REDIS_KEY);

        const data = {
            ease: body.ease || 0,
            noChange: body.noChange || 0,
            hike: body.hike || 0,
            // Delta tracking: store previous values for UI arrows
            prevEase: prev?.ease ?? undefined,
            prevNoChange: prev?.noChange ?? undefined,
            prevHike: prev?.hike ?? undefined,
            targetRate: body.targetRate || null,
            nextMeetingDate: body.nextMeetingDate || null,
            daysUntilFomc: body.daysUntilFomc || null,
            contract: body.contract || null,
            midPrice: body.midPrice || null,
            scrapedAt: body.scrapedAt || new Date().toISOString(),
            storedAt: new Date().toISOString(),
            source: 'scraper',
        };

        // Save to both primary and long-lived fallback
        await Promise.all([
            setInCache(REDIS_KEY, data, TTL_PRIMARY),
            setInCache(REDIS_FALLBACK_KEY, data, TTL_FALLBACK),
        ]);

        // DynamoDB archive: latest stream + per-day history. Non-fatal — Redis
        // is the serving path; a DDB failure must not fail the store call.
        const ts = Date.now();
        const dateKey = new Date().toISOString().slice(0, 10);
        await Promise.all([
            ddbClient.send(new PutCommand({
                TableName: 'signum-pattern-db',
                Item: { pattern: 'FEDWATCH:latest', timestamp: ts, ...data },
            })),
            ddbClient.send(new PutCommand({
                TableName: 'signum-pattern-db',
                Item: { pattern: `FEDWATCH:${dateKey}`, timestamp: ts, ...data },
            })),
        ]).catch((e: unknown) => {
            console.error('[FedWatch Store] DDB archive error:', e instanceof Error ? e.message : e);
        });

        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
