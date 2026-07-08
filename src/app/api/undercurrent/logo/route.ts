// ============================================================================
// Undercurrent — ticker logo proxy
// ----------------------------------------------------------------------------
// GET /api/undercurrent/logo?t=NVDA → the company's branding icon (square),
// fetched once from Massive ticker reference (branding.icon_url) and cached in
// Redis as base64 for 7 days. The raw branding URL requires our API key, so it
// must never reach the client — this proxy keeps the key server-side.
// 404 (cached 24h as NONE) when the ticker has no branding → client falls back
// to a monogram. ETFs and unknown tickers simply 404.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_KEY = (t: string) => `uc:logo:v1:${t}`;
const HIT_TTL = 60 * 60 * 24 * 7;   // 7d for found logos
const MISS_TTL = 60 * 60 * 24;      // 24h for "no logo" (retry daily)
const MAX_BYTES = 300_000;          // sanity cap — branding icons are a few KB

interface CachedLogo { b64: string; ct: string }

export async function GET(req: NextRequest) {
  const t = (req.nextUrl.searchParams.get('t') || '').toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(t)) {
    return NextResponse.json({ error: 'bad ticker' }, { status: 400 });
  }

  try {
    const cached = await getFromCache<CachedLogo | 'NONE'>(CACHE_KEY(t));
    if (cached === 'NONE') return miss();
    if (cached && typeof cached === 'object' && cached.b64) return hit(cached);

    // 1) ticker reference → branding.icon_url (square icon; logo_url is often wide)
    const ref = await fetchMassive(`/v3/reference/tickers/${t}`, {}, true).catch(() => null);
    const iconUrl: string | undefined = ref?.results?.branding?.icon_url || ref?.results?.branding?.logo_url;
    if (!iconUrl || !iconUrl.startsWith('https://')) {
      await setInCache(CACHE_KEY(t), 'NONE', MISS_TTL).catch(() => {});
      return miss();
    }

    // 2) fetch the asset itself (needs auth; key stays server-side)
    const key = process.env.MASSIVE_API_KEY || '';
    const res = await fetch(iconUrl, {
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      cache: 'no-store',
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.startsWith('image/')) {
      await setInCache(CACHE_KEY(t), 'NONE', MISS_TTL).catch(() => {});
      return miss();
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      await setInCache(CACHE_KEY(t), 'NONE', MISS_TTL).catch(() => {});
      return miss();
    }

    const entry: CachedLogo = { b64: buf.toString('base64'), ct };
    await setInCache(CACHE_KEY(t), entry, HIT_TTL).catch(() => {});
    return hit(entry);
  } catch {
    // transient failure — 404 WITHOUT caching NONE so the next request retries
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
  }
}

function hit(entry: CachedLogo) {
  return new NextResponse(new Uint8Array(Buffer.from(entry.b64, 'base64')), {
    status: 200,
    headers: {
      'Content-Type': entry.ct,
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

function miss() {
  return new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
