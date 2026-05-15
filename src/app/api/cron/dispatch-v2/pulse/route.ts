// ============================================================================
// Dispatch V2 — Pulse (장중 실시간 시세)
// KST 23:30 (ET 10:30) | 전체 채널 발행
// ============================================================================

import { NextResponse } from 'next/server';
import { preparePulse } from '@/lib/marketing-v2/prepare/pulse';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, draft, date, region } = parseParams(request);
  const startTime = Date.now();

  try {
    console.log(`[DispatchV2/Pulse] Starting... region=${region} dryRun=${dryRun}`);

    const pkg = await preparePulse({ date, dryRun });
    const results = await dispatchToAll(pkg, { dryRun, draft, region });

    return buildResponse('pulse', results, pkg, startTime, region);
  } catch (err: any) {
    console.error('[DispatchV2/Pulse] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'pulse' }, { status: 500 });
  }
}
