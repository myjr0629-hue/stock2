// ============================================================================
// /api/cron/mkt-replies — REPLIES only (Bluesky cold replies + X self-reply).
// Split from originals so replies can run frequently (fresh posts get timely
// answers) with their own 60s budget. Self-gated (killswitch, deadman, mode,
// REPLY_CAP/day, dedup, grounded lint).
// ============================================================================

import { NextResponse } from 'next/server';
import { runAutopilotReplies } from '@/lib/marketing-console/autopilot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = authHeader === `Bearer ${cronSecret}` || secretParam === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = await runAutopilotReplies();
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), posted: results.filter((r) => r.ok).length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
