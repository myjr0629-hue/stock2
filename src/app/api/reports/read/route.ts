import { NextResponse } from 'next/server';
import { loadReport, loadLatest } from '@/lib/storage/reportStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const type = searchParams.get('type');

    try {
        let report;

        if (date && type) {
            // [13.1] Fetch specific historical report
            report = await loadReport(date, type);
        } else if (type) {
            // Fetch latest of specific type
            report = await loadLatest(type);
        } else {
            // Default latest EOD if nothing specified
            report = await loadLatest('eod');
        }

        if (!report) {
            return NextResponse.json({ error: 'Report not found' }, { status: 404 });
        }

        return NextResponse.json(report);
    } catch (error) {
        console.error('[API] Read report failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
