import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { getUnifiedMetrics, getXsRow, getXsReport, expectFromScore, readStructure, verdictLabel } from '@/lib/trade/fusion';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// BEST PICKS — the engine's top-10 of the day, each fused with its measured
// decile expectation and live options structure. This is the selection surface
// the operator trades FROM: every row deep-links into the order ticket.
interface PickRow {
  rank: number; symbol: string; score: number;
  price: number | null;
  expect: ReturnType<typeof expectFromScore>;
  struct: ReturnType<typeof readStructure>;
  label: ReturnType<typeof verdictLabel>;
  z: Record<string, number> | null;
}

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const rep = await getXsReport();
  if (!rep?.top10?.length) {
    return NextResponse.json({ ok: true, rows: [], engineDate: rep?.date ?? null, labeled: rep?.labeled ?? null });
  }

  const cacheKey = `trade:picks:${rep.date}`;
  const cached = await getFromCache<PickRow[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ ok: true, rows: cached, engineDate: rep.date ?? null, labeled: rep.labeled ?? null, cached: true });
  }

  const rows = (await Promise.all(rep.top10.slice(0, 10).map(async (entry, i) => {
    const [symbol, scoreStr] = String(entry).split(':');
    const score = Number(scoreStr);
    if (!symbol || !Number.isFinite(score)) return null;
    const [metrics, xs] = await Promise.all([getUnifiedMetrics(symbol), getXsRow(symbol)]);
    const struct = readStructure(metrics?.price ?? null, metrics);
    const expect = expectFromScore(score, rep);
    return {
      rank: i + 1, symbol, score,
      price: metrics?.price ?? null,
      expect, struct, label: verdictLabel(score, struct, expect),
      z: xs.z,
    } satisfies PickRow;
  }))).filter((r): r is PickRow => r !== null);

  await setInCache(cacheKey, rows, 600);
  return NextResponse.json({ ok: true, rows, engineDate: rep.date ?? null, labeled: rep.labeled ?? null });
}
