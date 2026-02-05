import { NextResponse } from 'next/server';
import { getStockChartData, Range } from '@/services/stockApi';
import { getBuildId } from '@/services/buildIdSSOT'; // [S-56.4.6e]

// [S-78] Edge cache for 30 seconds - faster chart load while maintaining accuracy
export const revalidate = 30;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = searchParams.get('range') || '1d';

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    try {
        const data = await getStockChartData(symbol, range as Range);

        // [S-53.5] Extract sessionMaskDebug from data if present
        const sessionMaskDebug = (data as any).sessionMaskDebug || null;
        const buildId = getBuildId();

        // [S-55.10a] Enforce SSOT: Overwrite sessionMaskDebug.buildId with API buildId
        if (sessionMaskDebug) {
            sessionMaskDebug.buildId = buildId;
        }

        // [S-52.2.3] Inject build metadata for staleness detection
        const response = {
            data,
            meta: {
                buildId,
                timestampISO: new Date().toISOString(),
                sessionMaskDebug // [S-53.5] Chart session masking diagnostic
            },
            range,
            symbol,
            count: data.length
        };

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                // [S-78] Allow edge cache (CDN cache) but prevent browser cache
                'Cache-Control': 's-maxage=30, stale-while-revalidate=10'
            }
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }
}
