import { NextResponse } from 'next/server';
import { isScorecardWeek } from '@/lib/earnings/earningsScorecard';
import { cashSessionPhaseAt } from '@/lib/marketCalendar';
import { readEarningsScorecard } from '@/services/earningsScorecardService';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const week = new URL(req.url).searchParams.get('week');
  if (!isScorecardWeek(week)) {
    return NextResponse.json({ error: 'week must be a valid ET Monday (YYYY-MM-DD)' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const nowMs = Date.now();
  try {
    const data = await readEarningsScorecard(week, nowMs);
    const ttl = cashSessionPhaseAt(nowMs) === 'regular' ? 300 : 3600;
    return NextResponse.json(data, { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${ttl}` } });
  } catch {
    return NextResponse.json({ error: 'scorecard_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
