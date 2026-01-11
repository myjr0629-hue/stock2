// [S-50.4] Cron API Endpoint - Auto-report generation
// Secured with CRON_SECRET for Vercel Cron

import { NextResponse } from 'next/server';
import { generateReport, ReportType, getArchivedReport } from '@/services/reportScheduler';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ReportType | null;

    // [P0] Validate type - 3 fixed reports + legacy morning + [Phase 37] 3-Stage Protocol
    if (!type || !['eod', 'pre', 'open', 'morning', 'draft', 'revised', 'final'].includes(type)) {
        return NextResponse.json({ error: 'Invalid type. Use: eod, pre, open, draft, revised, final' }, { status: 400 });
    }

    // [P0] Security: Check CRON_SECRET - supports both header and query param
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const secretParam = searchParams.get('secret');

    if (process.env.NODE_ENV === 'production' && cronSecret) {
        const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
        const isParamValid = secretParam === cronSecret;

        if (!isHeaderValid && !isParamValid) {
            console.warn('[Cron] Unauthorized cron request - invalid secret');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    // Get today's date in ET
    const todayET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const todayDate = new Date(todayET);
    const defaultMarketDate = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

    // Check for duplicate (avoid regenerating same report)
    const force = searchParams.get('force') === 'true';
    const targetDateParam = searchParams.get('date'); // [S-56.5] Support manual date override
    const marketDate = targetDateParam || defaultMarketDate;

    const existing = (!force && !targetDateParam) ? getArchivedReport(marketDate, type) : null;

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
        console.log(`[Cron] Generating ${type} report for ${marketDate}... (force=${force})`);
        const report = await generateReport(type, force, targetDateParam || undefined);

        const metaAny = report.meta as any;
        return NextResponse.json({
            success: true,
            reportId: report.meta.id,
            type: report.meta.type,
            generatedAt: report.meta.generatedAtET,
            diagnostics: {
                buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "local",
                routeVersionTag: "S-56.4.6e",
                savedTo: metaAny.diagnostics?.savedTo || report.meta.optionsStatus?.state,
                finalOptionsState: report.meta.optionsStatus?.state,
                purgedKeys: metaAny.diagnostics?.purgedKeys,
                rolledBack: metaAny.diagnostics?.rolledBack
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
