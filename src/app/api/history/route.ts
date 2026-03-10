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

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const ticker = searchParams.get('ticker');
    const sectorId = searchParams.get('sectorId');
    const days = parseInt(searchParams.get('days') || '30');

    try {
        let data: any[] = [];

        switch (type) {
            case 'gex':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getGexHistory(ticker, days);
                break;

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
            query: { ticker, sectorId, days },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
