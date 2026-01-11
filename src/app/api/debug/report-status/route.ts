
import { NextResponse } from 'next/server';
import { getLatestReport, getGlobalLatestReport } from '@/services/reportScheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
    const TYPES = ['morning', 'pre', 'open', 'draft', 'final', 'eod', 'revised'] as const;
    const candidates = [];

    // 1. Fetch all candidates individually to see what's actually there
    for (const type of TYPES) {
        try {
            const report = await getLatestReport(type);
            if (type === 'eod') {
                console.log("DEBUG EOD REPORT:", JSON.stringify(report?.meta, null, 2));
            }
            candidates.push({
                type,
                found: !!report,
                id: report?.meta?.id,
                date: report?.meta?.date,
                generatedAt: report?.meta?.generatedAtET,
                timestamp: report?.meta?.generatedAtET ? new Date(report.meta.generatedAtET).getTime() : 0,
                rawMeta: report?.meta // Add raw meta to response
            });
        } catch (e: any) {
            candidates.push({ type, error: e.message });
        }
    }

    // 2. Run the actual resolver
    const resolved = await getGlobalLatestReport();

    return NextResponse.json({
        candidates,
        winner: {
            id: resolved?.meta?.id,
            date: resolved?.meta?.date,
            generatedAt: resolved?.meta?.generatedAtET,
            type: resolved?.meta?.type
        },
        serverTime: new Date().toISOString()
    });
}
