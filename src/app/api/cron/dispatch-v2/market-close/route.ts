// ============================================================================
// Dispatch V2 — Market Close (장마감 리포트)
// ?region=en  → KST 06:00 (ET 17:00) 미국 장마감 EN only
// ?region=asia → KST 08:00 (ET 19:00) 아시아 브리핑 KO/JA only
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareClose } from '@/lib/marketing-v2/prepare/close';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, draft, date, region } = parseParams(request);
  const startTime = Date.now();

  try {
    const label = region === 'asia' ? 'Asia Close' : 'US Close';
    console.log(`[DispatchV2/MarketClose] Starting ${label}... region=${region} dryRun=${dryRun}`);

    const pkg = await prepareClose({ date, dryRun });
    const results = await dispatchToAll(pkg, { dryRun, draft, region });

    return buildResponse('close', results, pkg, startTime, region);
  } catch (err: any) {
    console.error('[DispatchV2/MarketClose] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'close' }, { status: 500 });
  }
}
