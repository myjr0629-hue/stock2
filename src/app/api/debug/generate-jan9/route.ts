
import { NextResponse } from 'next/server';
import { generateReport } from '@/services/reportScheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log("API: Starting Manual Generation for 2026-01-09...");
        // Generate EOD report for Jan 9
        const report = await generateReport('eod', true, '2026-01-09');

        return NextResponse.json({
            success: true,
            id: report.meta.id,
            itemCount: report.items.length,
            generatedAtET: report.meta.generatedAtET,
            report // Return full report so I can see it
        });
    } catch (e: any) {
        console.error("API Generation Failed:", e);
        return NextResponse.json({
            success: false,
            error: e.message,
            stack: e.stack
        }, { status: 500 });
    }
}
