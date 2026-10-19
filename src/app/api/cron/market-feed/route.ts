import { NextResponse } from 'next/server';
import { checkEc2Handoff } from '@/lib/cron/ec2Handoff';

/**
 * [V8.0] Market Data → Redis Writer (Cron)
 *
 * 2026-10-20 — 수집·보정·기록 본체는 src/services/jobs/marketFeedJob.ts 로 옮겼고, 주 실행자는 EC2 워커다
 *   (scripts/ec2-cron/market-feed-worker.ts, 30초 간격). 이 라우트는 «복귀 경로»로 남는다:
 *   · EC2 성공 표식이 120초 안이면 즉시 200(건너뜀 — Vercel 비용 0 에 가깝게)
 *   · 표식이 없거나 낡았으면 예전과 똑같이 전부 실행 · EC2 가 일부만 실패했으면 그것만 채운다
 *   · 끄기: Vercel 환경변수 CRON_EC2_JOBS=off → 항상 예전처럼 실행
 */
export async function GET(request: Request) {
    const handoff = await checkEc2Handoff('market-feed');
    if (handoff.action === 'skip') {
        return NextResponse.json({ skipped: 'ec2', reason: handoff.reason, ec2AgeSec: handoff.ageSec, ts: new Date().toISOString() });
    }

    const { runMarketFeed, FEAR_GREED_ID } = await import('@/services/jobs/marketFeedJob');
    const baseUrl = request.url.split('/api/')[0];
    const r = handoff.action === 'partial'
        ? await runMarketFeed({
            only: handoff.only.filter((s) => s !== FEAR_GREED_ID),
            fearGreed: handoff.only.includes(FEAR_GREED_ID),
            vixCheck: handoff.only.includes('^VIX'),
            newsBaseUrl: baseUrl,
        })
        : await runMarketFeed({ newsBaseUrl: baseUrl });

    return NextResponse.json({
        ok: r.ok,
        fail: r.fail,
        results: r.results,
        vixTriggered: r.vixTriggered,
        handoff: handoff.action === 'partial' ? `partial:${handoff.only.join(',')}` : handoff.reason,
        ts: r.ts,
    });
}
