// [S-52.2.3] Market Status API - Force Dynamic + Build Metadata
import { NextResponse } from 'next/server';
import { getMarketStatusSSOT } from '@/services/marketStatusProvider';
import { getBuildMeta } from '@/services/buildMeta';

// [S-52.2.3] Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const status = await getMarketStatusSSOT();
        const response = {
            ...status,
            meta: getBuildMeta(request.headers as any)
        };
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store, max-age=0, must-revalidate'
            }
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    }
}
