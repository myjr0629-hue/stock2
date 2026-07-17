import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { pickList, pickNum, pickStr, PX_PATTERNS, CHG_PATTERNS, NAME_PATTERNS } from '@/lib/trade/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Real account snapshot, normalized server-side (shapes are undocumented —
// see normalize.ts): holdings rows + USD buying power.
export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const [holdings, buyingPower] = await Promise.all([
    callToss({ path: '/api/v1/holdings' }),
    callToss({ path: '/api/v1/buying-power', query: { currency: 'USD' } }),
  ]);

  const rows = pickList(holdings.data).map((h) => ({
    symbol: pickStr(h, [/^symbol$/i, /^ticker$/i, /code/i]),
    name: pickStr(h, NAME_PATTERNS),
    qty: pickNum(h, [/^quantity$/i, /qty|amount$/i], 0, 1e9),
    avg: pickNum(h, [/average|avg|purchase/i], 0, 1e7),
    px: pickNum(h, PX_PATTERNS, 0, 1e7),
    evalAmt: pickNum(h, [/eval|marketvalue|value$/i], 0, 1e10),
    plPct: pickNum(h, [/profitlossrate|plrate|returnrate|(profit|return).*(rate|pct)/i, ...CHG_PATTERNS], -100, 10000),
  })).filter((r) => r.symbol);

  return NextResponse.json({
    ok: holdings.status < 400,
    holdingsStatus: holdings.status,
    rows,
    buyingPower: pickNum(buyingPower.data, [/buyingpower|orderable|available|amount|cash/i], 0, 1e10),
    rawError: holdings.status >= 400 ? holdings.data : undefined,
  });
}
