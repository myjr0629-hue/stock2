// ============================================================================
// Dispatch V2 — Morning (프리마켓 브리핑)
// KST 21:00 (ET 08:00) | 전체 채널 발행
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareMorning } from '@/lib/marketing-v2/prepare/morning';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, draft, date, region } = parseParams(request);
  const startTime = Date.now();

  try {
    console.log(`[DispatchV2/Morning] Starting... region=${region} dryRun=${dryRun}`);

    const pkg = await prepareMorning({ date, dryRun });
    const results = await dispatchToAll(pkg, { dryRun, draft, region });

    return buildResponse('morning', results, pkg, startTime, region);
  } catch (err: any) {
    console.error('[DispatchV2/Morning] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'morning' }, { status: 500 });
  }
}
