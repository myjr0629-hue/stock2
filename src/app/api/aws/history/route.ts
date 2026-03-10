// ===========================================================================
// /api/aws/history — DynamoDB History Data API
// Returns GEX, Alpha, Sector, Flow, RLSI time-series data from DynamoDB
// ===========================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
    getGexHistory,
    getAlphaHistory,
    getSectorHistory,
    getFlowHistory,
    getRlsiHistory,
} from '@/lib/aws/historyStore';

export const revalidate = 60; // Cache for 60 seconds

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // gex | alpha | sector | flow | rlsi
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const sector = searchParams.get('sector');
    const days = parseInt(searchParams.get('days') || '30');

    if (!type) {
        return NextResponse.json({ error: 'type required (gex|alpha|sector|flow|rlsi)' }, { status: 400 });
    }

    try {
        let data: any[] = [];

        switch (type) {
            case 'gex':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getGexHistory(ticker, days);
                break;
            case 'alpha':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getAlphaHistory(ticker, days);
                break;
            case 'sector':
                if (!sector) return NextResponse.json({ error: 'sector required' }, { status: 400 });
                data = await getSectorHistory(sector, days);
                break;
            case 'flow':
                if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });
                data = await getFlowHistory(ticker, days);
                break;
            case 'rlsi':
                data = await getRlsiHistory(days);
                break;
            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        return NextResponse.json({
            type,
            ticker: ticker || sector || 'MARKET',
            days,
            count: data.length,
            data,
        });
    } catch (e: any) {
        console.error(`[AWS History] Error:`, e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
