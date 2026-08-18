
import { NextResponse } from 'next/server';
import { requireDebugAuth } from '@/lib/debugAuth';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

// Some AI-brief fields are baked with mojibake upstream (the EC2 Redis proxy mangles
// multi-byte UTF-8 into U+FFFD before generation reads it). getFromCache now prefers
// the clean Upstash copy, but fields corrupted at generation exist in both stores —
// strip the replacement chars here so the app never renders garbled text.
function stripMojibake<T>(v: T): T {
    if (typeof v === 'string') return (v.indexOf('\uFFFD') !== -1 ? v.replace(/\uFFFD/g, '') : v) as T;
    if (Array.isArray(v)) return v.map(stripMojibake) as unknown as T;
    if (v && typeof v === 'object') {
        const o: Record<string, unknown> = {};
        for (const k in v) o[k] = stripMojibake((v as Record<string, unknown>)[k]);
        return o as T;
    }
    return v;
}

// [S-56.4] Route Segment Config
export const maxDuration = 60; // Allow 60s for AI generation (Hobby Limit)
export const dynamic = 'force-dynamic';

// [FIX] No auth guard — this is a PRODUCTION data pipeline, not debug-only.
// Consumers: GuardianProvider.tsx (frontend), EC2 Worker, cron/harvest-history.
// No vendor names or API keys are exposed in the response (computed RLSI/sector/verdict data only).

export async function GET(request: Request) {
    // ⛔ 이 라우트는 rlsi/gexIndex/regime 등 «유료 상품의 내부 계산값»을 통째로
    //    반환한다. 같은 디렉터리의 다른 라우트는 전부 가드가 있는데 여기만 빠져
    //    있었고, 2026-08-10 감사에서 지적된 뒤 8일간 무인증 200(28KB)으로 열려
    //    있었다(2026-08-18 실측). 가드는 «전부에» 있어야 한다.
    const authError = requireDebugAuth();
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';
        const locale = (searchParams.get('locale') || 'ko') as 'ko' | 'en' | 'ja';

        const context = await GuardianDataHub.getGuardianSnapshot(force, locale);

        return NextResponse.json({
            success: true,
            data: stripMojibake(context)
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
