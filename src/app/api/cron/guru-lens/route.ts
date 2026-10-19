import { NextRequest, NextResponse } from 'next/server';
import { runGuruLens } from '@/lib/guruLens/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(req: NextRequest) {
    // Fail closed in every environment. Never accept a secret in URL parameters.
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    try {
        const result = await runGuruLens();
        return NextResponse.json(result, {
            status: result.published ? 200 : 202,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch {
        return NextResponse.json(
            { published: false, reason: 'pipeline_failed', previousPreserved: true },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
