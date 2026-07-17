import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { pickNum, pickStr, pickList, PX_PATTERNS, CHG_PATTERNS, NAME_PATTERNS } from '@/lib/trade/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Everything about ONE symbol, normalized server-side: Toss quote + candles
// (sparkline) + trades + price-limits + stock info + sellable + warnings,
// fused with SIGNUM options-structure levels.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ ok: false, error: '심볼 형식 오류' }, { status: 400 });
  }

  const [price, candles, trades, limits, info, sellable, warnings, structure] = await Promise.all([
    callToss({ path: '/api/v1/prices', query: { symbols: symbol } }),
    callToss({ path: '/api/v1/candles', query: { symbol, interval: '1m', count: '60' } }),
    callToss({ path: '/api/v1/trades', query: { symbol, count: '12' } }),
    callToss({ path: '/api/v1/price-limits', query: { symbol } }),
    callToss({ path: '/api/v1/stocks', query: { symbols: symbol } }),
    callToss({ path: '/api/v1/sellable-quantity', query: { symbol } }),
    callToss({ path: `/api/v1/stocks/${symbol}/warnings` }),
    fetch(`${SITE}/api/live/options/structure?t=${symbol}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  // normalized quote
  const px = pickNum(price.data, PX_PATTERNS, 0.01, 1e6);
  const chgPct = pickNum(price.data, CHG_PATTERNS, -80, 80);
  const name = pickStr(info.data, NAME_PATTERNS) ?? pickStr(price.data, NAME_PATTERNS);

  // sparkline closes (oldest→newest)
  const candleRows = pickList(candles.data);
  const closes = candleRows
    .map((c) => pickNum(c, [/^close$/i, /price/i], 0.01, 1e6))
    .filter((v): v is number => v != null);

  // recent trades (price + qty + time-ish)
  const tradeRows = pickList(trades.data).slice(0, 12).map((t) => ({
    px: pickNum(t, PX_PATTERNS, 0.01, 1e6),
    qty: pickNum(t, [/quantity|volume|qty|size/i], 0, 1e9),
    at: pickStr(t, [/time|at|date/i]),
  }));

  const upper = pickNum(limits.data, [/upper|max|high|ceil/i], 0.01, 1e6);
  const lower = pickNum(limits.data, [/lower|min|low|floor/i], 0.01, 1e6);

  const s = structure as { underlyingPrice?: number; gex?: { maxPain?: number; gammaFlipLevel?: number; callWall?: number; putFloor?: number }; maxPain?: number; gammaFlipLevel?: number } | null;
  const levels = s ? {
    price: s.underlyingPrice ?? null,
    maxPain: s.gex?.maxPain ?? s.maxPain ?? null,
    gammaFlip: s.gex?.gammaFlipLevel ?? s.gammaFlipLevel ?? null,
    callWall: s.gex?.callWall ?? null,
    putFloor: s.gex?.putFloor ?? null,
  } : null;

  const warnList = pickList(warnings.data).map((w) => pickStr(w, [/title|message|name|type/i])).filter(Boolean);

  return NextResponse.json({
    ok: true, symbol,
    quote: { px, chgPct, name, priceStatus: price.status },
    closes,
    trades: tradeRows,
    limits: { upper, lower },
    sellable: pickNum(sellable.data, [/sellable|quantity|qty/i], 0, 1e9),
    warnings: warnList,
    levels,
  });
}
