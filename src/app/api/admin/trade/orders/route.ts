import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Live order list from Toss (open + recent).
export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const r = await callToss({ path: '/api/v1/orders' });
  return NextResponse.json({ ok: r.status < 400, status: r.status, orders: r.data });
}
