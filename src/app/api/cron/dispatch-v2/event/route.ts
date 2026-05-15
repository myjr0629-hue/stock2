// ============================================================================
// Dispatch V2 — Event (실시간 이벤트 발행)
// event-detect에서 호출 | 즉시 발행
// ============================================================================

import { NextResponse } from 'next/server';
import { prepareEvent, type EventInput } from '@/lib/marketing-v2/prepare/event';
import { checkAuth, parseParams, dispatchToAll, buildResponse } from '../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const { dryRun, draft, date } = parseParams(request);
  const startTime = Date.now();

  try {
    // 이벤트 데이터를 URL 파라미터로 받을 수 있음
    const eventInput: EventInput | undefined = searchParams.get('type') ? {
      type: searchParams.get('type') || 'unknown',
      ticker: searchParams.get('ticker') || 'SPY',
      event: searchParams.get('event') || '',
      magnitude: Number(searchParams.get('magnitude')) || 0,
      details: searchParams.get('details') || '',
    } : undefined;

    console.log(`[DispatchV2/Event] Starting... type=${eventInput?.type || 'redis'} dryRun=${dryRun}`);

    const pkg = await prepareEvent({ date, dryRun, event: eventInput });
    const results = await dispatchToAll(pkg, { dryRun, draft });

    return buildResponse('event', results, pkg, startTime);
  } catch (err: any) {
    console.error('[DispatchV2/Event] Error:', err);
    return NextResponse.json({ error: err.message, slot: 'event' }, { status: 500 });
  }
}
