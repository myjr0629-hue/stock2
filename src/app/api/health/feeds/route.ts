// ============================================================================
// /api/health/feeds — silent-degradation monitor
// ----------------------------------------------------------------------------
// The dangerous bugs in this app are SILENT: a self-call fails on a protected
// cron origin, or an AI batch falls back to English, and the app keeps "working"
// while serving empty/wrong data — undetected for days. This endpoint fetches the
// critical user-facing feeds the way a user sees them and flags any that degraded
// (empty money layer, missing macro context, English under Korean, no tickers).
// Poll it (cron/uptime check) → alert when `degraded` is non-empty. Cheap, read-only.
// ============================================================================

import { NextResponse } from 'next/server';
import { publicBase } from '@/lib/net/publicBase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const HANGUL = /[가-힣]/;

async function getJson(url: string, ms = 8000): Promise<any> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const base = publicBase(new URL(req.url).origin);
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // 1) UC feed — the "money layer" (dark pool / max pain / divergence) must be populated.
  const feed = await getJson(`${base}/api/undercurrent/feed?locale=ko&limit=12`);
  {
    const cards: any[] = feed?.cards || [];
    const withMoney = cards.filter((c) => c?.money?.darkPoolPct != null || c?.money?.maxPain != null).length;
    checks['uc.money'] = {
      ok: cards.length > 0 && withMoney >= Math.ceil(cards.length * 0.5),
      detail: `${withMoney}/${cards.length} cards have money`,
    };
  }

  // 2) UC macro — market context (indices / 10Y / sentiment) must be populated.
  const ucMacro = await getJson(`${base}/api/undercurrent/macro?locale=ko`);
  {
    const c = ucMacro?.context || {};
    const present = ['nasdaq', 'yield10Y', 'fearGreed'].filter((k) => c[k] != null).length;
    checks['uc.macro'] = { ok: present >= 2, detail: `${present}/3 context fields present` };
  }

  // 3) Guardian News Pulse — Korean summaries must actually be Korean (not English fallback).
  const digest = await getJson(`${base}/api/guardian/news-digest`);
  {
    const items: any[] = digest?.items || [];
    const ko = items.filter((it) => HANGUL.test(it?.summaryKR || '')).length;
    checks['guardian.newsPulse.ko'] = {
      ok: items.length > 0 && ko === items.length,
      detail: `${ko}/${items.length} items localized (KO)`,
    };
  }

  // 4) Intel snapshot — key-stock tickers must be present.
  const intel = await getJson(`${base}/api/intel/snapshot?sector=m7`);
  {
    const tickers = intel?.snapshot?.tickers;
    const n = Array.isArray(tickers) ? tickers.length : tickers && typeof tickers === 'object' ? Object.keys(tickers).length : 0;
    checks['intel.snapshot'] = { ok: n > 0, detail: `${n} tickers` };
  }

  // 5) Premium metrics — the market-wide money widgets must be present.
  const pm = await getJson(`${base}/api/live/premium-metrics`);
  checks['live.premiumMetrics'] = { ok: !!(pm?.volatilityRegime && pm?.darkPool), detail: pm ? 'present' : 'null' };

  const degraded = Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k);
  return NextResponse.json(
    { ok: degraded.length === 0, degraded, checks, at: new Date().toISOString() },
    { status: degraded.length === 0 ? 200 : 503 },
  );
}
