// ============================================================================
// Undercurrent cache warmer — the PUSH half of the UC freshness fix.
// ----------------------------------------------------------------------------
// UC data was pull-only (generate-on-visit): with thin traffic every app launch
// showed hours-old cache, then made the user wait ~20-40s for the refresh swap
// — and en/ja were colder than ko (per-locale keys). This cron regenerates the
// feed (all 3 locales) + macro (all 3 locales) on a schedule so Redis always
// holds a ≤15min copy for EVERY locale → launches are instant AND current, and
// the client's _stale bg-refresh path almost never fires.
//
// Order matters: ko FIRST and awaited — its refresh=1 rebuilds the shared feed
// CORE (news + money probe, see feedCore.ts). en/ja then reuse that fresh core
// (AI-only, fast), so the whole cycle costs ONE news+money build. macro has no
// shared core (one small AI call per locale) — plain parallel warm.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // orchestrator: ko feed (~50s worst) + parallel wave (~30s)

const LOCALES = ['ko', 'en', 'ja'] as const;

async function warm(baseUrl: string, path: string): Promise<{ ok: boolean; ms: number; note?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(58_000), // within the target route's maxDuration 60
      cache: 'no-store',
      headers: {
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
          : {}),
      },
    });
    const body = await res.json().catch(() => null);
    return {
      ok: res.ok && body?.success !== false,
      ms: Date.now() - t0,
      ...(res.ok ? {} : { note: `HTTP ${res.status}` }),
    };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, note: e?.message || 'fetch failed' };
  }
}

export async function GET(req: NextRequest) {
  // Security: CRON_SECRET check (same pattern as the other cron routes)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get('secret');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isParamValid = secretParam === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startTime = Date.now();
  const baseUrl = req.url.split('/api/')[0];
  const out: Record<string, { ok: boolean; ms: number; note?: string }> = {};

  // 1) feed ko — awaited alone so the shared core is rebuilt exactly once
  out['feed:ko'] = await warm(baseUrl, '/api/undercurrent/feed?locale=ko&limit=12&refresh=1');

  // 2) feed en/ja (reuse the fresh core) + macro ×3 — all parallel
  const wave = await Promise.all([
    ...(['en', 'ja'] as const).map((l) => warm(baseUrl, `/api/undercurrent/feed?locale=${l}&limit=12&refresh=1`)),
    ...LOCALES.map((l) => warm(baseUrl, `/api/undercurrent/macro?locale=${l}&refresh=1`)),
  ]);
  out['feed:en'] = wave[0];
  out['feed:ja'] = wave[1];
  LOCALES.forEach((l, i) => { out[`macro:${l}`] = wave[2 + i]; });

  const failures = Object.entries(out).filter(([, v]) => !v.ok).map(([k]) => k);
  const summary = { success: failures.length === 0, failures, targets: out, totalMs: Date.now() - startTime };
  console.log(`[Cron/UCWarm] ${summary.success ? '✅' : '⚠️'} ${JSON.stringify({ failures, totalMs: summary.totalMs })}`);
  // Always 200: partial failures self-heal next cycle (SWR keeps last-known-good),
  // and a 5xx would only make Vercel cron noise without changing behavior.
  return NextResponse.json(summary);
}
