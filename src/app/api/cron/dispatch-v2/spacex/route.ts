// ============================================================================
// Dispatch V2 — SpaceX (SpaceX IPO 분석)
// KST 03:00 (ET 14:00) 장중 | 전체 채널 + Pinterest
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareSpacex } from '@/lib/marketing-v2/prepare/spacex';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, draft, date, region } = parseParams(request);
  const startTime = Date.now();

  try {
    console.log(`[DispatchV2/SpaceX] Starting... region=${region} dryRun=${dryRun}`);

    const pkg = await prepareSpacex({ date, dryRun });
    const results = await dispatchToAll(pkg, { dryRun, draft, region });

    return buildResponse('spacex', results, pkg, startTime, region);
  } catch (err: any) {
    console.error('[DispatchV2/SpaceX] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'spacex' }, { status: 500 });
  }
}
