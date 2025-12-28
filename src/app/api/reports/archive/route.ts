// [S-50.0] Archive API - List and retrieve archived reports
// [S-51.5.2] Updated with @upstash/redis and UTF-8 charset
import { listArchives, loadReport } from '@/lib/storage/reportStore';
import { ReportType } from '@/services/reportScheduler';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const type = searchParams.get('type') as ReportType | null;

    try {
        // If date and type provided, return specific report
        if (date && type) {
            const report = await loadReport(date, type);
            if (!report) {
                return new Response(JSON.stringify({
                    error: 'Report not found',
                    date,
                    type
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
