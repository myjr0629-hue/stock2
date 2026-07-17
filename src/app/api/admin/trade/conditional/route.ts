import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss, getTradeKill, bumpTradeCount, tradeJournal, TRADE_MAX_ORDER_USD } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Conditional orders (stop-loss / take-profit / OCO / OTO). Same gate chain as
// regular orders: operator → kill switch → notional cap → daily count → executor.

export async function GET(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  const status = req.nextUrl.searchParams.get('status') === 'CLOSED' ? 'CLOSED' : 'OPEN';
  const r = await callToss({ path: '/api/v1/conditional-orders', query: { status } });
  // Toss envelope: { result: { conditionalOrders: [...] } } — unwrap to a plain array
  const raw = r.data as { result?: { conditionalOrders?: unknown[] } } | unknown[] | null;
  const list = Array.isArray(raw) ? raw : (raw?.result?.conditionalOrders ?? []);
  return NextResponse.json({ ok: r.status < 400, status: r.status, list });
}

interface Leg { orderSide?: 'BUY' | 'SELL'; triggerPrice?: string; orderPrice?: string }
interface CondReq {
  action?: 'create' | 'cancel';
  conditionalOrderId?: string;
  symbol?: string;
  type?: 'SINGLE' | 'OCO' | 'OTO';
  orderType?: 'LIMIT' | 'MARKET';
  quantity?: string;
  expireDate?: string;
  first?: Leg;
  second?: Leg;
}

export async function POST(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  let b: CondReq;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  if (b.action === 'cancel') {
    if (!b.conditionalOrderId) return NextResponse.json({ ok: false, error: 'conditionalOrderId 필요' }, { status: 400 });
    const r = await callToss({ path: `/api/v1/conditional-orders/${encodeURIComponent(b.conditionalOrderId)}`, method: 'DELETE' });
    await tradeJournal({ at: Date.now(), who: gate.admin.email, action: 'cond-cancel', detail: b.conditionalOrderId });
    return NextResponse.json({ ok: r.status < 400, status: r.status, result: r.data });
  }

  if (await getTradeKill()) return NextResponse.json({ ok: false, error: '🔴 킬스위치 ON' }, { status: 423 });
  const symbol = (b.symbol || '').toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) return NextResponse.json({ ok: false, error: '심볼 형식 오류' }, { status: 400 });
  const qty = Number(b.quantity);
  if (!(qty > 0)) return NextResponse.json({ ok: false, error: '수량 오류' }, { status: 400 });
  if (!b.first?.orderSide || !b.first?.triggerPrice) return NextResponse.json({ ok: false, error: '조건(트리거) 누락' }, { status: 400 });

  // notional cap over every leg
  for (const leg of [b.first, b.second].filter(Boolean) as Leg[]) {
    const px = Number(leg.orderPrice ?? leg.triggerPrice);
    if (!(px > 0)) return NextResponse.json({ ok: false, error: '가격 오류' }, { status: 400 });
    if (qty * px > TRADE_MAX_ORDER_USD) {
      return NextResponse.json({ ok: false, error: `한도 $${TRADE_MAX_ORDER_USD} 초과 ($${(qty * px).toFixed(0)})` }, { status: 422 });
    }
  }
  const cnt = await bumpTradeCount();
  if (!cnt.ok) return NextResponse.json({ ok: false, error: '일일 주문 한도 도달' }, { status: 429 });

  const clientOrderId = `sgc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const body: Record<string, unknown> = {
    clientOrderId, symbol, type: b.type || 'SINGLE', orderType: b.orderType || 'LIMIT',
    quantity: String(b.quantity), first: b.first,
  };
  if (b.expireDate) body.expireDate = b.expireDate;
  if (b.second) body.second = b.second;

  const r = await callToss({ path: '/api/v1/conditional-orders', method: 'POST', body });
  const ok = r.status < 400;
  await tradeJournal({
    at: Date.now(), who: gate.admin.email, action: 'cond-create',
    detail: `${symbol} ${b.type || 'SINGLE'} ${b.first.orderSide}@trig${b.first.triggerPrice} ×${qty} → ${ok ? 'OK' : `실패(${r.status})`}`,
    clientOrderId,
  });
  return NextResponse.json({ ok, status: r.status, clientOrderId, result: r.data });
}
