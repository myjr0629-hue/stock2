import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { callToss } from '@/lib/trade/executor';
import { getFromCache, setInCache } from '@/services/redisClient';

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

  const buyingPowerUsd = num((bpUsd.data as { result?: { cashBuyingPower?: string } })?.result?.cashBuyingPower);
  const buyingPowerKrw = num((bpKrw.data as { result?: { cashBuyingPower?: string } })?.result?.cashBuyingPower);

  // Real-account compound track: sample total USD NAV (holdings + cash) once
  // per day (latest reading wins) so the console can draw the real compounding
  // curve alongside the paper track. Kept 2 years, best-effort.
  let navHist: { d: string; nav: number }[] = [];
  try {
    const usdTotal = (summary.usdValue ?? 0) + (buyingPowerUsd ?? 0);
    navHist = (await getFromCache<{ d: string; nav: number }[]>('trade:real:navhist')) ?? [];
    if (usdTotal > 0 && holdings.status < 400) {
      const today = new Date().toISOString().slice(0, 10);
      const point = { d: today, nav: Math.round(usdTotal * 100) / 100 };
      const i = navHist.findIndex((x) => x.d === today);
      if (i < 0) navHist.push(point); else navHist[i] = point;
      navHist = navHist.slice(-730);
      await setInCache('trade:real:navhist', navHist, 3 * 365 * 86400);
    }
  } catch { /* history is best-effort — never block the snapshot */ }

  return NextResponse.json({
    ok: holdings.status < 400,
    holdingsStatus: holdings.status,
    rows,
    summary,
    buyingPowerUsd,
    buyingPowerKrw,
    navHist,
    rawError: holdings.status >= 400 ? holdings.data : undefined,
  });
}
