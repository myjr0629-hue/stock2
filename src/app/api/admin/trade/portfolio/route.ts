import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Real account snapshot via the executor: holdings + USD buying power.
export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const [holdings, buyingPower] = await Promise.all([
    callToss({ path: '/api/v1/holdings' }),
    callToss({ path: '/api/v1/buying-power', query: { currency: 'USD' } }),
  ]);

  return NextResponse.json({
    ok: holdings.status < 500,
    holdings: holdings.data,
    holdingsStatus: holdings.status,
    buyingPower: buyingPower.data,
    buyingPowerStatus: buyingPower.status,
  });
}
