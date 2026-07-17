import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { pickList, pickNum, pickStr, PX_PATTERNS, CHG_PATTERNS } from '@/lib/trade/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// US market rankings (trading amount / gainers / losers) — symbol discovery
// for the workbench. type enum from the Toss spec.
const TYPES = new Set(['MARKET_TRADING_AMOUNT', 'MARKET_TRADING_VOLUME', 'TOP_GAINERS', 'TOP_LOSERS']);

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const type = req.nextUrl.searchParams.get('type') || 'MARKET_TRADING_AMOUNT';
  if (!TYPES.has(type)) return NextResponse.json({ ok: false, error: 'type 오류' }, { status: 400 });

  const r = await callToss({
    path: '/api/v1/rankings',
    query: { type, marketCountry: 'US', duration: 'realtime', count: '12' },
  });
  const rows = pickList(r.data).map((x) => ({
    symbol: pickStr(x, [/^symbol$/i, /^ticker$/i, /code/i]),
    name: pickStr(x, [/name/i]),
    px: pickNum(x, PX_PATTERNS, 0.01, 1e6),
    chgPct: pickNum(x, CHG_PATTERNS, -90, 90),
  })).filter((x) => x.symbol && /^[A-Z]{1,6}$/.test(String(x.symbol)));

  return NextResponse.json({ ok: r.status < 400, status: r.status, type, rows });
}
