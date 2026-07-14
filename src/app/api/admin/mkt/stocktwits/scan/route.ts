import { NextResponse } from 'next/server';
import { requireMktAdmin, ST_TICKERS } from '@/lib/marketing-console/mkt';
import { scanStocktwits } from '@/lib/marketing-console/stocktwits';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Real Stocktwits stream scan (public read). Write is manual (no write API).
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  try {
    const msgs = await scanStocktwits(ST_TICKERS.slice(0, 5), 8);
    return NextResponse.json({ ok: true, count: msgs.length, messages: msgs.slice(0, 15) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
