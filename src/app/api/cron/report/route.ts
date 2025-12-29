// [S-50.4] Cron API Endpoint - Auto-report generation
// Secured with CRON_SECRET for Vercel Cron

import { NextResponse } from 'next/server';
import { generateReport, ReportType, getArchivedReport } from '@/services/reportScheduler';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ReportType | null;

    // Validate type
    if (!type || !['eod', 'pre2h', 'open30m'].includes(type)) {
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Security: Check CRON_SECRET in production
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        if (authHeader !== `Bearer ${cronSecret}`) {
            console.warn('[Cron] Unauthorized cron request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    // Get today's date in ET
    const todayET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const todayDate = new Date(todayET);
    const marketDate = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

    // Check for duplicate (avoid regenerating same report)
    const force = searchParams.get('force') === 'true';
    const existing = !force ? getArchivedReport(marketDate, type) : null;

    if (existing) {
        console.log(`[Cron] Report ${marketDate}-${type} already exists, skipping`);
        return NextResponse.json({
            skipped: true,
            reason: 'Report already exists',
            existingId: existing.meta.id
        });
    }

    // Generate report
    try {
        console.log(`[Cron] Generating ${type} report for ${marketDate}...`);
        const report = await generateReport(type);

        return NextResponse.json({
            success: true,
            reportId: report.meta.id,
            type: report.meta.type,
            generatedAt: report.meta.generatedAtET,
            diagnostics: {
                buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "local",
                routeVersionTag: "S-56.4.6e",
                savedTo: report.meta?.diagnostics?.savedTo || report.meta.optionsStatus?.state,
                purgedKeys: report.meta?.diagnostics?.purgedKeys,
                rolledBack: report.meta?.diagnostics?.rolledBack
            }
        });
    } catch (error: any) {
        console.error('[Cron] Report generation failed:', error);
        return NextResponse.json({
            error: 'Generation failed',
            message: error.message,
            diagnostics: {
                buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local",
                routeVersionTag: "S-56.4.6e"
            }
        }, { status: 500 });
    }
}
