import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// US rankings per Toss spec: result.rankings[] with price.lastPrice and
// price.changeRate as a DECIMAL FRACTION (0.0125 = 1.25%) → ×100 for display.
// TOP_GAINERS / TOP_LOSERS do not support duration=realtime → use 1d.
const TYPES = new Set(['MARKET_TRADING_AMOUNT', 'MARKET_TRADING_VOLUME', 'TOP_GAINERS', 'TOP_LOSERS']);

interface TossRankings { result?: { rankings?: { symbol?: string; price?: { lastPrice?: string; changeRate?: string | null } }[] } }

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const type = req.nextUrl.searchParams.get('type') || 'MARKET_TRADING_AMOUNT';
  if (!TYPES.has(type)) return NextResponse.json({ ok: false, error: 'type 오류' }, { status: 400 });
  const duration = type.startsWith('TOP_') ? '1d' : 'realtime';

  const r = await callToss({
    path: '/api/v1/rankings',
    query: { type, marketCountry: 'US', duration, count: '12' },
  });
  const rows = ((r.data as TossRankings)?.result?.rankings ?? []).map((x) => ({
    symbol: x.symbol ?? null,
    px: Number.isFinite(Number(x.price?.lastPrice)) ? Number(x.price!.lastPrice) : null,
    chgPct: x.price?.changeRate != null && Number.isFinite(Number(x.price.changeRate)) ? Number(x.price.changeRate) * 100 : null,
  })).filter((x) => x.symbol && /^[A-Z]{1,6}$/.test(String(x.symbol)));

  return NextResponse.json({ ok: r.status < 400, status: r.status, type, rows });
}
