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

    /**
     * 긴 창을 그릴 때 5분 해상도를 다 보내면 8,600포인트(≈1.5MB)가 된다.
     * 차트에 필요한 것보다 훨씬 많다. 균등 간격으로 솎되
     * **마지막 포인트는 반드시 남긴다** — 「지금 값」이 잘리면 안 된다.
     */
    function downsample<T>(rows: T[], max = 600): T[] {
        if (rows.length <= max) return rows;
        const step = rows.length / max;
        const out: T[] = [];
        for (let i = 0; i < max - 1; i++) out.push(rows[Math.floor(i * step)]);
        out.push(rows[rows.length - 1]);
        return out;
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
                data = downsample(merged.data);
                meta = {
                    liveCount: live.length,
                    backfilled: merged.filled,
                    // 솎아냈으면 솎았다고 말한다 — 조용한 절단은 「이게 전부」로 읽힌다
                    ...(merged.data.length !== data.length && { sampledFrom: merged.data.length }),
                };
                break;
            }

            case 'rlsi': {
                const rows = await getRlsiHistory(days);
                data = downsample(rows);
                if (rows.length !== data.length) meta = { sampledFrom: rows.length };
                break;
            }

            case 'sector':
                if (!sectorId) return NextResponse.json({ error: 'sectorId required' }, { status: 400 });
                data = await getSectorHistory(sectorId, days);
                break;

            case 'alpha':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getAlphaHistory(ticker, days);
                break;

            case 'flow': {
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                const rows = await getFlowHistory(ticker, days);
                data = downsample(rows);
                if (rows.length !== data.length) meta = { sampledFrom: rows.length };
                break;
            }

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
