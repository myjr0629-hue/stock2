// ============================================================================
// /api/cron/13f-cache — DEPRECATED (no-op)
//
// The old reverse-lookup-over-15-mega-funds builder produced thin, wrong data
// (e.g. NVDA showed only 4 holders): mega-funds file a 13F-NT *notice* under the
// parent CIK while real holdings sit under subsidiary CIKs, and the 60s Vercel
// timeout forced a 15-institution / 3-page cap that truncated the giants.
//
// 13-F is a QUARTERLY filing, so a daily Vercel cron was both wasteful and too
// time-constrained to be accurate. Ingestion now runs as the `signum-13f` Lambda
// (full-universe scan of the quarter's 13-F feed → CUSIP reverse-index with
// accurate aggregates), scheduled weekly via EventBridge — no 60s limit.
// See scripts/build-13f-cache.js + scripts/deploy-13f.js.
//
// This route is kept as a harmless no-op (and removed from vercel.json) so it can
// never overwrite the Lambda-built cache with the old thin data.
// ============================================================================

import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        ok: true,
        deprecated: true,
        message: '13-F ingestion moved to the signum-13f Lambda (weekly EventBridge). This Vercel cron is a no-op.',
    });
}
