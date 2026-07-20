// ============================================================================
// /api/dividends — Polygon/Massive dividends proxy for the Radar dividend tab.
// Returns normalized upcoming/recent distributions + a DERIVED yield (Polygon
// never returns yield: annualized cash × frequency ÷ price). ETFs are tickers,
// so SCHD/JEPI/QYLD work the same as stocks. 6h SWR cache (dividends change
// slowly). Public info only. ?t=SCHD  ·  ?probe=1 dumps raw fields for QA.
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { serveSWR } from '../undercurrent/shared';

export const maxDuration = 30;

// frequency codes → payouts per year (Polygon: 0/1/2/4/12/24/52)
const FREQ_PER_YEAR: Record<number, number> = { 0: 0, 1: 1, 2: 2, 4: 4, 6: 6, 12: 12, 24: 24, 52: 52 };
const FREQ_LABEL: Record<number, string> = { 1: 'annual', 2: 'semi-annual', 4: 'quarterly', 6: 'bi-monthly', 12: 'monthly', 24: 'semi-monthly', 52: 'weekly', 0: 'one-time' };

interface RawDiv {
  cash_amount?: number; ex_dividend_date?: string; pay_date?: string; record_date?: string;
  declaration_date?: string; frequency?: number; dividend_type?: string; distribution_type?: string;
  ticker?: string; currency?: string;
}

async function lastPrice(ticker: string): Promise<number | null> {
  try {
    const r: any = await fetchMassive(`/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`, { adjusted: 'true' }, true);
    const c = r?.results?.[0]?.c;
    return typeof c === 'number' && c > 0 ? c : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get('t') || '').toUpperCase().replace(/[^A-Z.]/g, '');
  const probe = searchParams.get('probe') === '1';
  if (!ticker) return NextResponse.json({ success: false, error: 'no ticker' }, { status: 400 });

  const generate = async () => {
    const raw: any = await fetchMassive('/v3/reference/dividends', { ticker, limit: '16', order: 'desc', sort: 'ex_dividend_date' }, true);
    const list: RawDiv[] = Array.isArray(raw?.results) ? raw.results : [];
    if (probe) return { ticker, count: list.length, rawSample: list.slice(0, 3), keys: list[0] ? Object.keys(list[0]) : [] } as any;

    const price = await lastPrice(ticker);
    const items = list.map((d) => ({
      cash: typeof d.cash_amount === 'number' ? d.cash_amount : null,
      exDate: d.ex_dividend_date || null,
      payDate: d.pay_date || null,
      recordDate: d.record_date || null,
      declaredDate: d.declaration_date || null,
      freq: typeof d.frequency === 'number' ? d.frequency : null,
      freqLabel: typeof d.frequency === 'number' ? (FREQ_LABEL[d.frequency] || null) : null,
      type: d.distribution_type || d.dividend_type || null,
      currency: d.currency || 'USD',
    }));

    const latest = items.find((x) => x.cash != null) || null;
    const perYear = latest?.freq != null ? (FREQ_PER_YEAR[latest.freq] ?? 0) : 0;
    const annual = latest?.cash != null && perYear > 0 ? latest.cash * perYear : null;
    const yieldPct = annual != null && price != null ? (annual / price) * 100 : null;

    const now = Date.now();
    const ttmSum = items
      .filter((x) => x.cash != null && x.exDate && (now - Date.parse(x.exDate)) <= 372 * 86_400_000)
      .reduce((s, x) => s + (x.cash as number), 0);
    const ttmYieldPct = ttmSum > 0 && price != null ? (ttmSum / price) * 100 : null;

    return {
      success: true, ticker, price,
      current: {
        cash: latest?.cash ?? null, freq: latest?.freq ?? null, freqLabel: latest?.freqLabel ?? null,
        annualPerShare: annual, yieldPct, ttmPerShare: ttmSum || null, ttmYieldPct, type: latest?.type ?? null,
        nextExDate: items.find((x) => x.exDate && Date.parse(x.exDate) >= now)?.exDate ?? null,
        lastExDate: latest?.exDate ?? null, payDate: latest?.payDate ?? null,
      },
      history: items,
      generatedAt: new Date().toISOString(),
    } as any;
  };

  try {
    if (probe) return NextResponse.json(await generate());
    const res = await serveSWR({ key: `div:v1:${ticker}`, freshSec: 6 * 3600, refresh: searchParams.get('refresh') === '1', generate });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable' }, { status: 503 });
    return NextResponse.json({ ...res.body, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
