import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Everything about ONE symbol in a single call: Toss live quote/orderbook/
// sellable/warnings + SIGNUM options-structure levels (our own edge data).
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: '심볼 형식 오류' }, { status: 400 });
  }

  const [price, orderbook, sellable, warnings, structure] = await Promise.all([
    callToss({ path: '/api/v1/prices', query: { symbols: symbol } }),
    callToss({ path: '/api/v1/orderbook', query: { symbol } }),
    callToss({ path: '/api/v1/sellable-quantity', query: { symbol } }),
    callToss({ path: `/api/v1/stocks/${symbol}/warnings` }),
    fetch(`${SITE}/api/live/options/structure?t=${symbol}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const s = structure as { underlyingPrice?: number; gex?: { maxPain?: number; gammaFlipLevel?: number; callWall?: number; putFloor?: number }; maxPain?: number; gammaFlipLevel?: number } | null;
  const levels = s ? {
    price: s.underlyingPrice ?? null,
    maxPain: s.gex?.maxPain ?? s.maxPain ?? null,
    gammaFlip: s.gex?.gammaFlipLevel ?? s.gammaFlipLevel ?? null,
    callWall: s.gex?.callWall ?? null,
    putFloor: s.gex?.putFloor ?? null,
  } : null;

  return NextResponse.json({
    ok: true, symbol,
    price: price.data, priceStatus: price.status,
    orderbook: orderbook.data,
    sellable: sellable.data,
    warnings: warnings.data,
    levels,
  });
}
