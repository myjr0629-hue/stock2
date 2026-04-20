
import { NextResponse } from 'next/server';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

// [S-56.4] Route Segment Config
export const maxDuration = 60; // Allow 60s for AI generation (Hobby Limit)
export const dynamic = 'force-dynamic';

// [FIX] No auth guard — this is a PRODUCTION data pipeline, not debug-only.
// Consumers: GuardianProvider.tsx (frontend), EC2 Worker, cron/harvest-history.
// No vendor names or API keys are exposed in the response (computed RLSI/sector/verdict data only).

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';
        const locale = (searchParams.get('locale') || 'ko') as 'ko' | 'en' | 'ja';

        const context = await GuardianDataHub.getGuardianSnapshot(force, locale);

        return NextResponse.json({
            success: true,
            data: context
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
