import { NextRequest, NextResponse } from 'next/server';
import { ST_TICKERS, marketSession } from '@/lib/marketing-console/mkt';
import { fetchStructure, extractLevels } from '@/lib/marketing-console/xScan';

// TEMPORARY probe — verifies auto-pick best-ticker ranking. Delete after.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-sug-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  const scored = await Promise.all(
    ST_TICKERS.map(async (ticker) => {
      const s = await fetchStructure(ticker);
      const lv = extractLevels(s);
      if (!lv || typeof lv.price !== 'number' || lv.price <= 0) return null;
      const price = lv.price;
      const gap = typeof lv.maxPain === 'number' ? Math.abs(price - lv.maxPain) / price : 0;
      return { ticker, price, maxPain: lv.maxPain, gapPct: Math.round(gap * 1000) / 10 };
    })
  );
  const ranked = scored.filter(Boolean).sort((a, b) => (b!.gapPct) - (a!.gapPct));
  return NextResponse.json({ ok: true, session: marketSession(), ranked });
}
