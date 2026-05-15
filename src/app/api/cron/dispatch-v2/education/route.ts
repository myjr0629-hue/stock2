// ============================================================================
// Dispatch V2 — Education (교육 콘텐츠)
// KST 04:30 (ET 15:30) US 오후 | 전체 채널 + IG Carousel + Pinterest
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareEducation } from '@/lib/marketing-v2/prepare/education';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { dryRun, draft, date, topic, region } = parseParams(request);
  const startTime = Date.now();

  try {
    console.log(`[DispatchV2/Education] Starting... topic=${topic || 'auto'} region=${region} dryRun=${dryRun}`);

    const pkg = await prepareEducation({ date, dryRun, topic });
    const results = await dispatchToAll(pkg, { dryRun, draft, region });

    return buildResponse('education', results, pkg, startTime, region);
  } catch (err: any) {
    console.error('[DispatchV2/Education] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'education' }, { status: 500 });
  }
}
