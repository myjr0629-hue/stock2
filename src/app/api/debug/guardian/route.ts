
import { NextResponse } from 'next/server';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

// [S-56.4] Route Segment Config
export const maxDuration = 60; // Allow 60s for AI generation (Hobby Limit)
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

        const context = await GuardianDataHub.getGuardianSnapshot(force);

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
