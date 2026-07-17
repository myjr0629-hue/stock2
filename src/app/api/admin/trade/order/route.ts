import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import {
  callToss, getTradeKill, bumpTradeCount, tradeJournal,
  TRADE_MAX_ORDER_USD, TRADE_MAX_ORDERS_DAY,
} from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Manual order create/cancel. Every order passes: operator gate → kill switch →
// notional cap → daily count → idempotency key → executor (its own guards) → Toss.
// US symbols only (this console's scope): 1-5 uppercase letters.
const SYMBOL_RE = /^[A-Z]{1,6}(\.[A-Z])?$/;

interface OrderReq {
  action?: 'create' | 'cancel';
  orderId?: string;          // cancel
  symbol?: string;
  side?: 'BUY' | 'SELL';
  orderType?: 'LIMIT' | 'MARKET';
  quantity?: string;         // shares (decimal only for US MARKET SELL)
  price?: string;            // LIMIT
  orderAmount?: string;      // USD amount (US MARKET BUY)
  estPx?: string;            // client-estimated price for MARKET+quantity cap check
}

export async function POST(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  let b: OrderReq;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  // ── cancel ────────────────────────────────────────────────────────────────
  if (b.action === 'cancel') {
    if (!b.orderId) return NextResponse.json({ ok: false, error: 'orderId 필요' }, { status: 400 });
    const r = await callToss({ path: `/api/v1/orders/${encodeURIComponent(b.orderId)}/cancel`, method: 'POST', body: {} });
    await tradeJournal({ at: Date.now(), who: gate.admin.email, action: 'order-cancel', detail: b.orderId, orderId: b.orderId });
    return NextResponse.json({ ok: r.status < 400, status: r.status, result: r.data });
  }

  // ── create ────────────────────────────────────────────────────────────────
  if (await getTradeKill()) {
    return NextResponse.json({ ok: false, error: '🔴 트레이드 킬스위치 ON — 주문 차단됨' }, { status: 423 });
  }
  const symbol = (b.symbol || '').toUpperCase().trim();
  if (!SYMBOL_RE.test(symbol)) return NextResponse.json({ ok: false, error: '심볼 형식 오류 (미국 티커만)' }, { status: 400 });
  if (b.side !== 'BUY' && b.side !== 'SELL') return NextResponse.json({ ok: false, error: 'side 오류' }, { status: 400 });
  if (b.orderType !== 'LIMIT' && b.orderType !== 'MARKET') return NextResponse.json({ ok: false, error: 'orderType 오류' }, { status: 400 });

  // notional cap (client estimate; executor re-verifies)
  const amt = b.orderAmount != null ? Number(b.orderAmount) : null;
  const qty = b.quantity != null ? Number(b.quantity) : null;
  const px = b.price != null ? Number(b.price) : (b.estPx != null ? Number(b.estPx) : null);
  const notional = amt != null ? amt : (qty != null && px != null ? qty * px : null);
  if (notional == null || !(notional > 0)) return NextResponse.json({ ok: false, error: '주문 금액 산정 불가 (금액 또는 수량+가격 필요)' }, { status: 400 });
  if (notional > TRADE_MAX_ORDER_USD) {
    return NextResponse.json({ ok: false, error: `1회 한도 $${TRADE_MAX_ORDER_USD} 초과 ($${notional.toFixed(0)})` }, { status: 422 });
  }
  const cnt = await bumpTradeCount();
  if (!cnt.ok) return NextResponse.json({ ok: false, error: `일일 주문 한도 도달 (${TRADE_MAX_ORDERS_DAY})` }, { status: 429 });

  const clientOrderId = `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const body: Record<string, unknown> = { clientOrderId, symbol, side: b.side, orderType: b.orderType };
  if (amt != null) body.orderAmount = String(b.orderAmount);
  if (qty != null) body.quantity = String(b.quantity);
  if (b.orderType === 'LIMIT' && b.price != null) body.price = String(b.price);
  if (b.estPx != null) body.estPx = String(b.estPx);

  const r = await callToss({ path: '/api/v1/orders', method: 'POST', body });
  const ok = r.status < 400;
  const orderId = (r.data as { result?: { orderId?: string }; orderId?: string })?.result?.orderId
    ?? (r.data as { orderId?: string })?.orderId;
  await tradeJournal({
    at: Date.now(), who: gate.admin.email,
    action: b.side === 'BUY' ? 'order-buy' : 'order-sell',
    detail: `${symbol} ${b.orderType}${amt != null ? ` $${amt}` : ''}${qty != null ? ` ×${qty}` : ''}${b.price ? ` @${b.price}` : ''} → ${ok ? 'OK' : `실패(${r.status})`}`,
    orderId, clientOrderId,
  });
  return NextResponse.json({ ok, status: r.status, orderId, clientOrderId, result: r.data, dailyCount: cnt.count });
}
