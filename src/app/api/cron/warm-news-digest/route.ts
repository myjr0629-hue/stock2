// ============================================================================
// Guardian News Digest — Cron Warm Route (5-minute tick; 실제 갱신 주기는 페이싱 조절기가 정한다 — lib/ai/creditPacing)
// Calls the news-digest API to pre-warm Redis cache
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { pacingKnobs, effectiveDigestIntervalMin, BASELINE_KNOBS } from '@/lib/ai/creditPacing';

export const maxDuration = 60; // 60s timeout for Gemini analysis

export async function GET(req: NextRequest) {
    // Security: CRON_SECRET check
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const { searchParams } = new URL(req.url);
    const secretParam = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
        const isParamValid = secretParam === cronSecret;
        if (!isHeaderValid && !isParamValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const startTime = Date.now();
    try {
        // ★2026-10-10 페이싱 — 크론은 5분마다 깨지만, 마지막 갱신이 «조절기가 정한 주기» 안이면 건너뛴다(기본 15분 = 예전 동작).
        //   기본 주기보다 앞당긴 갱신(= 증가분)은 pace=1 로 불러 크레딧으로만 만들고, 크레딧이 안 되면 AWS 로 넘기지 않는다.
        const knobs = await pacingKnobs();
        const intervalMin = effectiveDigestIntervalMin(knobs, startTime);
        const last = await getFromCache<{ generatedAt?: string }>('guardian:news:digest:v2').catch(() => null);
        const lastMs = last?.generatedAt ? Date.parse(last.generatedAt) : NaN;
        const ageMin = Number.isFinite(lastMs) ? (startTime - lastMs) / 60000 : Infinity;
        const TICK_TOLERANCE_MIN = 1.5;   // 크론 지터·생성 시간(~25초)만큼 일찍 와도 «주기가 됐다»고 본다
        if (ageMin < intervalMin - TICK_TOLERANCE_MIN) {
            return NextResponse.json({ success: true, skipped: 'interval', ageMin: Math.round(ageMin * 10) / 10, intervalMin });
        }
        const extra = ageMin < BASELINE_KNOBS.digestIntervalMin - TICK_TOLERANCE_MIN;
        const baseUrl = req.url.split('/api/')[0];
        const res = await fetch(`${baseUrl}/api/guardian/news-digest?refresh=1${extra ? '&pace=1' : ''}`, {
            signal: AbortSignal.timeout(55000), // 55s (within 60s maxDuration)
            headers: {
                ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                    : {}),
            },
        });

        const data = await res.json();
        const latency = Date.now() - startTime;

        console.log(`[Cron/NewsDigest] ✅ Refreshed ${data.items?.length || 0} items in ${latency}ms`);

        return NextResponse.json({
            success: true,
            items: data.items?.length || 0,
            latencyMs: latency,
            generatedAt: data.generatedAt,
        });
    } catch (e: any) {
        console.error('[Cron/NewsDigest] ❌ Failed:', e);
        return NextResponse.json({
            success: false,
            error: e.message,
            latencyMs: Date.now() - startTime,
        }, { status: 500 });
    }
}
