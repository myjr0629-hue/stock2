import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Orders per Toss spec: status=OPEN returns ALL pending orders (result.orders[]).
// status=CLOSED is documented as "현재 400 closed-not-supported" — call it, but
// treat that failure as an empty history rather than an error.
interface TossOrders { result?: { orders?: Record<string, unknown>[] } }

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const [open, closed] = await Promise.all([
    callToss({ path: '/api/v1/orders', query: { status: 'OPEN' } }),
    callToss({ path: '/api/v1/orders', query: { status: 'CLOSED', limit: '10' } }),
  ]);
  return NextResponse.json({
    ok: open.status < 400,
    openStatus: open.status,
    open: (open.data as TossOrders)?.result?.orders ?? [],
    closed: closed.status < 400 ? ((closed.data as TossOrders)?.result?.orders ?? []) : [],
    closedSupported: closed.status < 400,
    rawError: open.status >= 400 ? open.data : undefined,
  });
}
