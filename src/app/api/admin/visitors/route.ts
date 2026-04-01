// [Admin] Visitors API — 관리자만 접근 가능
// 현재 접속자 수 + 회원/비회원 구분 반환
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

export async function GET(req: NextRequest) {
    // 관리자 인증 — 쿼리 파라미터 또는 헤더에서 이메일 확인
    const email = req.nextUrl.searchParams.get('email') || req.headers.get('x-admin-email') || '';
    if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1) 현재 접속자 — visitor:* 키 스캔
        const activeVisitors: { userId: string | null; isLoggedIn: boolean; tier: string; page: string; lastSeen: string }[] = [];
        let cursor = 0;
        do {
            const result = await redis.scan(cursor, { match: 'visitor:*', count: 100 });
            cursor = Number(result[0]);
            const keys = result[1] as string[];

            for (const key of keys) {
                const raw = await redis.get(key);
                if (raw) {
                    try {
                        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        activeVisitors.push(data);
                    } catch { }
                }
            }
        } while (cursor !== 0);

        // 2) 분류
        const members = activeVisitors.filter(v => v.isLoggedIn);
        const guests = activeVisitors.filter(v => !v.isLoggedIn);

        // 3) 티어별 분류
        const tierCounts: Record<string, number> = {};
        members.forEach(m => {
            const t = m.tier || 'free';
            tierCounts[t] = (tierCounts[t] || 0) + 1;
        });

        // 4) 페이지별 분류 (현재 어디 보고 있는지)
        const pageCounts: Record<string, number> = {};
        activeVisitors.forEach(v => {
            const p = v.page || '/';
            pageCounts[p] = (pageCounts[p] || 0) + 1;
        });

        // 5) 오늘 총 방문자 수
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = `visitors:daily:${today}`;
        const todayTotal = await redis.scard(dailyKey);

        return NextResponse.json({
            now: new Date().toISOString(),
            active: {
                total: activeVisitors.length,
                members: members.length,
                guests: guests.length,
                tierBreakdown: tierCounts,
            },
            today: {
                totalVisitors: todayTotal || 0,
            },
            pages: pageCounts,
            // 상세 (관리자용)
            details: members.map(m => ({
                userId: m.userId,
                tier: m.tier,
                page: m.page,
                lastSeen: m.lastSeen,
            })),
        });
    } catch (e) {
        console.error('[Admin/Visitors] Error:', e);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
