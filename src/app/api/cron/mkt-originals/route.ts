// ============================================================================
// /api/cron/mkt-originals — ORIGINAL posts only (X-US / X-JP / Bluesky).
// Split from replies so each runs INDEPENDENTLY with its own 60s budget — a slow
// or failing reply pass can never starve or cut off posting, and vice versa.
// Self-gated (killswitch, deadman, per-channel mode, cap, ≥90-min interval,
// session window, skeleton dedup, grounded lint). Posts nothing until a channel
// mode is off→shadow/live.
// ============================================================================

import { NextResponse } from 'next/server';
import { runAutopilotOriginals } from '@/lib/marketing-console/autopilot';

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
    const results = await runAutopilotOriginals();
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), posted: results.filter((r) => r.ok).length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
