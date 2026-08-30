/**
 * [Phase 1] History API — Read historical data from DynamoDB
 * 
 * GET /api/history?type=gex&ticker=NVDA&days=30
 * GET /api/history?type=rlsi&days=30
 * GET /api/history?type=sector&sectorId=m7&days=30
 * GET /api/history?type=alpha&ticker=NVDA&days=30
 * GET /api/history?type=flow&ticker=NVDA&days=7
 */

import { NextResponse } from 'next/server';
import { getGexHistory, getRlsiHistory, getSectorHistory, getAlphaHistory, getFlowHistory } from '@/lib/aws/historyStore';
import { mergeGexHistory, type BackfillPoint } from '@/lib/gexBackfillMerge';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const ticker = searchParams.get('ticker');
    const sectorId = searchParams.get('sectorId');
    const days = parseInt(searchParams.get('days') || '30');

    // GEX 복원 시계열 — 라이브 수집이 멈춘 기간을 벤더 EOD 로 메운다.
    // 실패해도 라이브만으로 응답한다(복원은 «보강»이지 «의존»이 아니다).
    async function readGexBackfill(sym: string): Promise<BackfillPoint[]> {
        const proxy = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
        const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        try {
            const res = await fetch(`${proxy}/get?key=${encodeURIComponent('intrinio:gex:bf:' + sym)}`, {
                headers: { Authorization: `Bearer ${key}` }, signal: ctrl.signal, cache: 'no-store',
            });
            if (!res.ok) return [];
            const raw = await res.json();
            const val = typeof raw?.result === 'string' ? JSON.parse(raw.result) : raw?.result;
            return Array.isArray(val?.points) ? val.points : [];
        } catch {
            return [];
        } finally {
            clearTimeout(timer);
        }
    }

    try {
        let data: any[] = [];
        let meta: Record<string, any> = {};

        switch (type) {
            case 'gex': {
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                const sym = ticker.toUpperCase();
                const [live, bf] = await Promise.all([
                    getGexHistory(sym, days),
                    readGexBackfill(sym),
                ]);
                const since = Date.now() - days * 24 * 60 * 60 * 1000;
                const merged = mergeGexHistory(sym, live, bf, since);
                data = merged.data;
                meta = { liveCount: live.length, backfilled: merged.filled };
                break;
            }

            case 'rlsi':
                data = await getRlsiHistory(days);
                break;

            case 'sector':
                if (!sectorId) return NextResponse.json({ error: 'sectorId required' }, { status: 400 });
                data = await getSectorHistory(sectorId, days);
                break;

            case 'alpha':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getAlphaHistory(ticker, days);
                break;

            case 'flow':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getFlowHistory(ticker, days);
                break;

            default:
                return NextResponse.json({
                    error: 'type required',
                    validTypes: ['gex', 'rlsi', 'sector', 'alpha', 'flow'],
                    usage: '/api/history?type=gex&ticker=NVDA&days=30',
                }, { status: 400 });
        }

        return NextResponse.json({
            type,
            count: data.length,
            data,
            ...meta,
            query: { ticker, sectorId, days },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
