// ============================================================================
// /api/cron/mkt-autopilot — quality-gated marketing autopilot (originals).
// Fires at jittered ET windows; the engine self-limits (killswitch, deadman,
// per-channel mode, cap, ≥90-min interval, session gate, skeleton dedup). Posts
// NOTHING until a channel mode is flipped off→shadow/live in the console, so
// deploying this cron cannot itself publish anything.
// ============================================================================

import { NextResponse } from 'next/server';
import { runAutopilotOriginals, runAutopilotReplies } from '@/lib/marketing-console/autopilot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Bedrock generation on the hot path

export async function GET(request: Request) {
  // CRON_SECRET auth — same contract as the other cron routes.
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = authHeader === `Bearer ${cronSecret}` || secretParam === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Originals first, then replies (each self-gates; a failure in one doesn't
    // block the other).
    const [originals, replies] = await Promise.all([
      runAutopilotOriginals().catch((e) => [{ channel: 'originals', mode: 'off' as const, action: 'fail' as const, ok: false, detail: (e as Error).message }]),
      runAutopilotReplies().catch((e) => [{ channel: 'replies', mode: 'off' as const, action: 'fail' as const, ok: false, detail: (e as Error).message }]),
    ]);
    const results = [...originals, ...replies];
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      posted: results.filter((r) => r.ok).length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
