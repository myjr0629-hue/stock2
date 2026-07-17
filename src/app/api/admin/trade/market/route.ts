import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Symbol workbench data — parsed EXACTLY per the Toss OpenAPI spec (v1.2.4):
// prices → result[0].lastPrice (NO change field → derive vs prev 1d close)
// candles → result.candles[] {closePrice,...} (newest first)
// trades → result[] {price, volume, timestamp}
// price-limits → result.{upperLimitPrice, lowerLimitPrice}
// stocks → result[0].{name, market, status}
// sellable-quantity → result.sellableQuantity
// warnings → result[] {warningType, ...}
// Fused with SIGNUM options-structure levels.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: '심볼 형식 오류' }, { status: 400 });
  }

  const [price, candles1m, candles1d, trades, limits, info, sellable, warnings, structure] = await Promise.all([
    callToss({ path: '/api/v1/prices', query: { symbols: symbol } }),
    callToss({ path: '/api/v1/candles', query: { symbol, interval: '1m', count: '60' } }),
    callToss({ path: '/api/v1/candles', query: { symbol, interval: '1d', count: '2' } }),
    callToss({ path: '/api/v1/trades', query: { symbol, count: '12' } }),
    callToss({ path: '/api/v1/price-limits', query: { symbol } }),
    callToss({ path: '/api/v1/stocks', query: { symbols: symbol } }),
    callToss({ path: '/api/v1/sellable-quantity', query: { symbol } }),
    callToss({ path: `/api/v1/stocks/${symbol}/warnings` }),
    fetch(`${SITE}/api/live/options/structure?t=${symbol}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const px = num((price.data as { result?: { lastPrice?: string }[] })?.result?.[0]?.lastPrice);

  // change% vs previous daily close (prices carries no change field per spec)
  const dRows = (candles1d.data as { result?: { candles?: { closePrice?: string; timestamp?: string }[] } })?.result?.candles ?? [];
  const prevClose = dRows.length >= 2 ? num(dRows[1]?.closePrice) : null;
  const chgPct = px != null && prevClose != null && prevClose > 0 ? ((px - prevClose) / prevClose) * 100 : null;

  // 1m sparkline closes — spec returns newest-first; reverse to oldest→newest
  const mRows = (candles1m.data as { result?: { candles?: { closePrice?: string }[] } })?.result?.candles ?? [];
  const closes = mRows.map((c) => num(c.closePrice)).filter((v): v is number => v != null).reverse();

  const tradeRows = ((trades.data as { result?: { price?: string; volume?: string; timestamp?: string }[] })?.result ?? [])
    .slice(0, 12).map((t) => ({ px: num(t.price), qty: num(t.volume), at: t.timestamp ?? null }));

  const lim = (limits.data as { result?: { upperLimitPrice?: string | null; lowerLimitPrice?: string | null } })?.result;
  const stock = (info.data as { result?: { name?: string; market?: string; status?: string }[] })?.result?.[0];

  const s = structure as { underlyingPrice?: number; gex?: { maxPain?: number; gammaFlipLevel?: number; callWall?: number; putFloor?: number }; maxPain?: number; gammaFlipLevel?: number } | null;
  const levels = s ? {
    price: s.underlyingPrice ?? null,
    maxPain: s.gex?.maxPain ?? s.maxPain ?? null,
    gammaFlip: s.gex?.gammaFlipLevel ?? s.gammaFlipLevel ?? null,
    callWall: s.gex?.callWall ?? null,
    putFloor: s.gex?.putFloor ?? null,
  } : null;

  const warnList = ((warnings.data as { result?: { warningType?: string }[] })?.result ?? [])
    .map((w) => w.warningType).filter(Boolean);

  return NextResponse.json({
    ok: true, symbol,
    quote: { px, chgPct, prevClose, name: stock?.name ?? null, market: stock?.market ?? null, priceStatus: price.status },
    closes,
    trades: tradeRows,
    limits: { upper: num(lim?.upperLimitPrice), lower: num(lim?.lowerLimitPrice) },
    sellable: num((sellable.data as { result?: { sellableQuantity?: string } })?.result?.sellableQuantity),
    warnings: warnList,
    levels,
  });
}
