// ============================================================================
// /api/cron/snapshot — 장마감 후 자동 스냅샷 저장 크론
// Vercel Cron: 평일 21:42~22:00 UTC, 섹터당 2분 간격.
// 11/6 실측: close_price가 21:28~21:31Z에 공식 종가로 전환(21종목); 전환 상한 + 캐시 최대 10분 뒤 21:42Z 시작.
// EST 16:42 ET, EDT 17:42 ET: 두 계절 모두 마감 + 40분 이후다(2027-03-14 경계에 다시 옮길 필요 없음).
// 리포트(cross-sector-brief, Vercel v4 + Lambda v3 EventBridge)는 22:04Z, 첫 마감 푸시는 22:10Z(리포트 생성 실측 48초~2분57초 + 여유).
// ============================================================================

import { NextResponse } from 'next/server';
import { recordSectorDaily } from '@/lib/aws/historyMiddleware';
import { setInCache } from '@/services/redisClient';
import { publicBase } from '@/lib/net/publicBase';

const SECTORS = ['m7', 'physical_ai', 'silicon_core', 'power_matrix', 'bio_pulse', 'cyber_shield', 'orbit_defense', 'quantum_edge', 'fintech_pulse', 'cloud_fortress'];

export async function GET(request: Request) {
    // [Security] CRON_SECRET 검증
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const secretParam = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
        const isParamValid = secretParam === cronSecret;

        if (!isHeaderValid && !isParamValid) {
            console.warn('[Cron/Snapshot] Unauthorized request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    // 특정 섹터만 지정 가능 (선택)
    const sectorParam = searchParams.get('sector');
    const sectors = sectorParam ? [sectorParam] : SECTORS;

    const baseUrl = publicBase(request.url.split('/api/')[0]);
    const results: Record<string, any> = {};

    for (const sector of sectors) {
        try {
            console.log(`[Cron/Snapshot] Triggering snapshot for ${sector}...`);

            const res = await fetch(`${baseUrl}/api/intel/snapshot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // [T51c] 저장 POST 는 운영에서 CRON_SECRET 만 받는다(intel/snapshot · snapshotPostAuthorized)
                    ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
                    // Bypass Vercel Deployment Protection for internal server-to-server calls
                    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                        ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                        : {}),
                },
                body: JSON.stringify({ sector }),
            });

            const data = await res.json();
            results[sector] = {
                success: res.ok,
                status: res.status,
                ...data,
            };

            // [Phase 2] Record sector daily to DynamoDB (fire-and-forget)
            if (res.ok && data) {
                recordSectorDaily(sector, {
                    avgChange: data.avgChange ?? data.avgChangePct ?? 0,
                    leadTicker: data.leadTicker || data.topGainer || '',
                    lagTicker: data.lagTicker || data.topLoser || '',
                });
            }

            console.log(`[Cron/Snapshot] ${sector}: ${res.ok ? '✅' : '❌'} ${JSON.stringify(data)}`);
        } catch (e: any) {
            console.error(`[Cron/Snapshot] ${sector} failed:`, e);
            results[sector] = { success: false, error: e.message };
        }
    }

    const allSuccess = Object.values(results).every((r: any) => r.success);

    // Record that today's closing sector reports are FULLY swept, so the closing push
    // can verify real reports exist before notifying. The crons run one sector every
    // 2min (21:42→22:00 UTC); cloud_fortress is last, so its success means the whole
    // sweep is done. Only stamp the marker then (or on a full no-param sweep) — a
    // mid-sweep or failed run leaves the marker stale and the push is skipped rather
    // than firing on a partial report set.
    const LAST_SECTOR = SECTORS[SECTORS.length - 1]; // cloud_fortress
    const sweepComplete = sectorParam
        ? (sectorParam === LAST_SECTOR && results[LAST_SECTOR]?.success)
        : allSuccess;
    if (sweepComplete) {
        try {
            const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            await setInCache('push:report-ready:closing', etDate, 60 * 60 * 8);
        } catch { /* non-fatal */ }
    }

    return NextResponse.json({
        success: allSuccess,
        timestamp: new Date().toISOString(),
        sectors: results,
    }, { status: allSuccess ? 200 : 207 });
}
