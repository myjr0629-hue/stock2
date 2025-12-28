// [S-50.0] Generate API - Manual report trigger
// [S-51.5.2] Updated with UTF-8 charset
import { generateReport, ReportType, REPORT_SCHEDULES } from '@/services/reportScheduler';

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ReportType | null;

    if (!type || !['eod', 'pre2h', 'open30m'].includes(type)) {
        return new Response(JSON.stringify({
            error: 'Invalid report type',
            validTypes: Object.keys(REPORT_SCHEDULES),
            usage: 'POST /api/reports/generate?type=eod|pre2h|open30m'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    try {
        const report = await generateReport(type);
        return new Response(JSON.stringify({
            success: true,
            reportId: report.meta.id,
            type: report.meta.type,
            generatedAt: report.meta.generatedAtET,
            message: `Report ${type} generated successfully`
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    } catch (error: any) {
        console.error('[Generate API] Failed:', error);
        return new Response(JSON.stringify({
            error: 'Report generation failed',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}

// Also support GET for easy testing
export async function GET() {
    return new Response(JSON.stringify({
        message: 'Use POST to generate reports',
        availableTypes: Object.entries(REPORT_SCHEDULES).map(([type, info]) => ({
            type,
            description: info.description,
            scheduledTime: `${String(info.hour).padStart(2, '0')}:${String(info.minute).padStart(2, '0')} ET`
        }))
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
}
