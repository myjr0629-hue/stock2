import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { pickList } from '@/lib/trade/normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Toss requires status on GET /orders (OPEN|CLOSED) — fetch both: open orders
// for actions, recent closed for history.
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
    open: pickList(open.data),
    closed: pickList(closed.data),
    rawError: open.status >= 400 ? open.data : undefined,
  });
}
