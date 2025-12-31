// [S-50.0] Archive API - List and retrieve archived reports
// [S-51.5.2] Updated with @upstash/redis and UTF-8 charset
import { listArchives, loadReport } from '@/lib/storage/reportStore';
import { ReportType } from '@/services/reportScheduler';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const type = searchParams.get('type') as ReportType | null;

    try {
        // If date provided, return specific report
        if (date) {
            let targetType = type;

            // Auto-resolve type if missing: final > revised > draft > eod > morning
            if (!targetType) {
                const priority: ReportType[] = ['final', 'revised', 'draft', 'eod', 'morning', 'pre', 'open'];
                for (const t of priority) {
                    const exists = await loadReport(date, t);
                    if (exists) {
                        targetType = t;
                        break;
                    }
                }
            }

            if (!targetType) {
                return new Response(JSON.stringify({
                    error: 'No report found for date',
                    date
                }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }

            const report = await loadReport(date, targetType);
            if (!report) {
                return new Response(JSON.stringify({
                    error: 'Report not found',
                    date,
                    type: targetType
                }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                });
            }
            return new Response(JSON.stringify(report), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }

        // Otherwise, list all archived reports
        const archives = await listArchives();
        return new Response(JSON.stringify({
            count: archives.length,
            archives
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    } catch (e) {
        console.error('[Archive API] Error:', e);
        return new Response(JSON.stringify({
            error: 'Failed to fetch archives',
            message: (e as Error).message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}
