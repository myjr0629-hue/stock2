// [S-51.2] Performance API - Get engine performance summary
// [S-51.5.2] Updated with @upstash/redis and UTF-8 charset
import { getPerformanceRecords, getPerformanceSummaryFromRecords } from '@/lib/storage/reportStore';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');

        // Get performance records from storage (Redis in Vercel, FS locally)
        const records = await getPerformanceRecords();
        const summary = getPerformanceSummaryFromRecords(records, limit);

        // Get recent records for detail view
        const recentRecords = records.slice(0, limit).map(r => ({
            date: r.date,
            reportType: r.reportType,
            sessionType: r.sessionType,
            tickers: r.tickers.map(t => ({
                symbol: t.symbol,
                rank: t.rank,
                baseline: t.baselinePrice,
                alphaScore: t.alphaScore
            })),
            hasReturns: r.calculated || false
        }));

        return new Response(JSON.stringify({
            ok: true,
            summary,
            recentRecords,
            noTradeCount: 0
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    } catch (e) {
        console.error('[Performance API] Error:', e);
        return new Response(JSON.stringify({
            ok: false,
            error: (e as Error).message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}
