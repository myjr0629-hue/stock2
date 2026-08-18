
import { NextResponse } from 'next/server';
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
    // ⛔⛔ 여기에 requireDebugAuth() 를 넣지 마라. 넣었다가 프로덕션을 끊었다.
    //
    // 경로가 /api/debug/ 아래라 «디버그 엔드포인트»처럼 보이지만, 실제로는
    // **가디언 화면의 데이터 공급원**이다 — src/components/guardian/GuardianProvider.tsx
    // 의 refresh() 가 이걸 부른다. 2026-08-18 에 감사 지적(S1-11)만 보고 가드를
    // 넣었더니 403 → 프로바이더가 0 으로 폴백 → RLSI 0 · 지표 전부 «---» ·
    // Breadth 50/50 으로 가디언 페이지가 통째로 죽었다(대표가 실기기에서 발견).
    //
    // «같은 디렉터리의 다른 라우트엔 다 가드가 있다»는 건 이 라우트가 그들과
    // 같은 성격이라는 뜻이 아니었다. 소비자를 안 보고 디렉터리 이름만 봤다.
    //
    // 공개가 맞는 이유: 앱에 계정·로그인이 없고 가디언 화면은 전 사용자에게
    // 무료로 열려 있다. 즉 이 값들은 이미 앱 UI 로 공개되는 것과 같다.
    // ★ 페이월이 실제로 생기는 날에는 «가드»가 아니라 «앱 인증»으로 풀어야 한다.
    //   그때까지 이 라우트는 공개다.

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
