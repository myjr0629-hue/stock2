import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Real account snapshot — parsed EXACTLY per the Toss OpenAPI spec (v1.2.4):
// holdings → result.{totalPurchaseAmount, marketValue, profitLoss, dailyProfitLoss, items[]}
// buying-power → result.cashBuyingPower
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

interface TossHoldingItem {
  symbol?: string; name?: string; marketCountry?: string; currency?: string;
  quantity?: string; lastPrice?: string; averagePurchasePrice?: string;
  marketValue?: { purchaseAmount?: string; amount?: string };
  profitLoss?: { amount?: string; rate?: string };
  dailyProfitLoss?: { amount?: string; rate?: string };
}
interface TossHoldings {
  result?: {
    marketValue?: { amount?: { krw?: string; usd?: string | null } };
    profitLoss?: { rate?: string; amount?: { krw?: string; usd?: string | null } };
    dailyProfitLoss?: { rate?: string };
    items?: TossHoldingItem[];
  };
}

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const [holdings, bpUsd, bpKrw] = await Promise.all([
    callToss({ path: '/api/v1/holdings' }),
    callToss({ path: '/api/v1/buying-power', query: { currency: 'USD' } }),
    callToss({ path: '/api/v1/buying-power', query: { currency: 'KRW' } }),
  ]);

  const h = (holdings.data as TossHoldings)?.result;
  const rows = (h?.items ?? []).map((it) => ({
    symbol: it.symbol ?? null,
    name: it.name ?? null,
    currency: it.currency ?? 'USD',
    qty: num(it.quantity),
    px: num(it.lastPrice),
    avg: num(it.averagePurchasePrice),
    evalAmt: num(it.marketValue?.amount),
    plPct: num(it.profitLoss?.rate) != null ? Number(it.profitLoss!.rate) * 100 : null,
    dayPct: num(it.dailyProfitLoss?.rate) != null ? Number(it.dailyProfitLoss!.rate) * 100 : null,
  }));

  const summary = {
    usdValue: num(h?.marketValue?.amount?.usd),
    krwValue: num(h?.marketValue?.amount?.krw),
    plRate: num(h?.profitLoss?.rate) != null ? Number(h!.profitLoss!.rate) * 100 : null,
    dayRate: num(h?.dailyProfitLoss?.rate) != null ? Number(h!.dailyProfitLoss!.rate) * 100 : null,
  };

  return NextResponse.json({
    ok: holdings.status < 400,
    holdingsStatus: holdings.status,
    rows,
    summary,
    buyingPowerUsd: num((bpUsd.data as { result?: { cashBuyingPower?: string } })?.result?.cashBuyingPower),
    buyingPowerKrw: num((bpKrw.data as { result?: { cashBuyingPower?: string } })?.result?.cashBuyingPower),
    rawError: holdings.status >= 400 ? holdings.data : undefined,
  });
}
