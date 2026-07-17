import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// FAST lane (polled every ~4s): price + orderbook + recent trades only.
// Heavy/slow data (candles, stock info, levels, warnings) lives in /market.
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: '심볼 형식 오류' }, { status: 400 });
  }

  const [price, book, trades] = await Promise.all([
    callToss({ path: '/api/v1/prices', query: { symbols: symbol } }),
    callToss({ path: '/api/v1/orderbook', query: { symbol } }),
    callToss({ path: '/api/v1/trades', query: { symbol, count: '10' } }),
  ]);

  const px = num((price.data as { result?: { lastPrice?: string }[] })?.result?.[0]?.lastPrice);
  const ob = (book.data as { result?: { asks?: { price?: string; volume?: string }[]; bids?: { price?: string; volume?: string }[] } })?.result;
  const asks = (ob?.asks ?? []).slice(0, 3).map((x) => ({ px: num(x.price), vol: num(x.volume) }));
  const bids = (ob?.bids ?? []).slice(0, 3).map((x) => ({ px: num(x.price), vol: num(x.volume) }));
  const tradeRows = ((trades.data as { result?: { price?: string; volume?: string; timestamp?: string }[] })?.result ?? [])
    .slice(0, 10).map((t) => ({ px: num(t.price), qty: num(t.volume), at: t.timestamp ?? null }));

  return NextResponse.json({
    ok: price.status < 400, symbol, px, asks, bids, trades: tradeRows,
    rateLimited: price.status === 429 || book.status === 429,
    at: Date.now(),
  });
}
