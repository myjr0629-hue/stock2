import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getFromCache } from '@/services/redisClient';
import { selectTodayEconomicEvent } from '@/lib/todayPicks/summary';

export const dynamic = 'force-dynamic';

// FMP is already fetched by cron/economic-calendar (4h, Redis TTL 6h).
// This route only reads that US-only snapshot; no supplier call or Redis write.
const readCalendar = unstable_cache(
  async () => getFromCache<{ events?: unknown }>('fmp:econ-calendar'),
  ['today-summary-fmp-calendar-v1'],
  { revalidate: 15 * 60 },
);

export async function GET() {
  try {
    const cached = await readCalendar();
    // Select outside the cache so the ET date changes immediately at midnight.
    return NextResponse.json({ economicEvent: selectTodayEconomicEvent(cached?.events, Date.now()), source: 'FMP' },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ economicEvent: null, source: 'FMP' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
