// [Admin] Heartbeat API — 모든 방문자가 30초마다 호출
// Redis에 세션 키를 SET + 5분 TTL로 등록
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// 5분 TTL — 5분 동안 하트비트 없으면 자동 만료
const SESSION_TTL = 300;
const DAILY_COUNTER_TTL = 86400; // 24시간

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const sessionId = body.sessionId || 'anon-' + Math.random().toString(36).slice(2, 10);
        const isLoggedIn = !!body.userId;
        const userId = body.userId || null;
        const tier = body.tier || 'free';
        const page = body.page || '/';

        // 1) 세션 키 등록 (visitor:{sessionId})
        const sessionKey = `visitor:${sessionId}`;
        const sessionData = JSON.stringify({
            userId,
            isLoggedIn,
            tier,
            page,
            lastSeen: new Date().toISOString(),
        });
        await redis.setex(sessionKey, SESSION_TTL, sessionData);

        // 2) 오늘 일간 방문자 카운터 (중복 방지 — SET)
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `visitors:daily:${today}`;
        await redis.sadd(dailyKey, sessionId);
        // TTL은 한 번만 설정 (이미 있으면 무시)
        const ttl = await redis.ttl(dailyKey);
        if (ttl < 0) {
            await redis.expire(dailyKey, DAILY_COUNTER_TTL);
        }

        return NextResponse.json({ ok: true, sessionId });
    } catch (e) {
        console.error('[Heartbeat] Error:', e);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
