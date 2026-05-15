// ============================================================================
// Dispatch V2 — Spotlight (종목 심층 분석)
// M7 주목 종목 분석 — 모든 채널 draft 발행 (체인 트윗 조합용)
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareSpotlight } from '@/lib/marketing-v2/prepare/spotlight';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, date, ticker, region } = parseParams(request);
  const startTime = Date.now();

  try {
    console.log(`[DispatchV2/Spotlight] Starting... ticker=${ticker || 'auto'} region=${region} dryRun=${dryRun}`);

    const pkg = await prepareSpotlight({ date, dryRun, ticker });

    // 모든 채널 draft=true로 발행 (사용자가 체인 트윗 조합 후 수동 발행)
    const results = await dispatchToAll(pkg, { dryRun, draft: true, region });

    return buildResponse('spotlight', results, pkg, startTime, region);
  } catch (err: any) {
    console.error('[DispatchV2/Spotlight] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'spotlight' }, { status: 500 });
  }
}
