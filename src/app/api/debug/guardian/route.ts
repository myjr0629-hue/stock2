
import { NextResponse } from 'next/server';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

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
