// ============================================================================
// /api/cron/snapshot — 장마감 후 자동 스냅샷 저장 크론
// Vercel Cron: 0 21 * * 1-5  (UTC 21:00 = ET 16:00 장마감)
// ============================================================================

import { NextResponse } from 'next/server';
import { recordSectorDaily } from '@/lib/aws/historyMiddleware';

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

    const baseUrl = request.url.split('/api/')[0];
    const results: Record<string, any> = {};

    for (const sector of sectors) {
        try {
            console.log(`[Cron/Snapshot] Triggering snapshot for ${sector}...`);

            const res = await fetch(`${baseUrl}/api/intel/snapshot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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

    return NextResponse.json({
        success: allSuccess,
        timestamp: new Date().toISOString(),
        sectors: results,
    }, { status: allSuccess ? 200 : 207 });
}
