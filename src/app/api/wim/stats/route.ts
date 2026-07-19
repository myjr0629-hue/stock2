// ============================================================================
// WIM global answer stats — "학습자 N%가 맞혔어요" social proof (A급 ②).
// One redis map per ET day {unitId: [tried, correct]}. Read-modify-write:
// lost increments under a race are acceptable for a display stat. No auth —
// counters only, inputs validated and capped; wrong numbers can only ever
// mis-render a percentage, never touch product data.
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

type DayStats = Record<string, [number, number]>;
const KEY = (d: string) => `wim:stat:${d}`;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TTL = 3 * 86_400; // a day's stats matter for ~a day; keep 3 for D+1 views
const MIN_N_FOR_PCT = 5; // below this the % is noise — client shows "early solve"

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const u = typeof body?.u === 'string' ? body.u : '';
    const d = typeof body?.d === 'string' ? body.d : '';
    if (!u || u.length > 80 || !DAY_RE.test(d)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const key = KEY(d);
    const cur = (await getFromCache<DayStats>(key)) || {};
    const [t, c] = cur[u] || [0, 0];
    if (t < 200_000 && Object.keys(cur).length < 400) {
      cur[u] = [t + 1, c + (body?.ok === true ? 1 : 0)];
      await setInCache(key, cur, TTL);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const u = sp.get('u') || '';
  const d = sp.get('d') || '';
  if (!u || !DAY_RE.test(d)) return NextResponse.json({ n: 0, pct: null });
  const cur = (await getFromCache<DayStats>(KEY(d))) || {};
  const [t, c] = cur[u] || [0, 0];
  return NextResponse.json({ n: t, pct: t >= MIN_N_FOR_PCT ? Math.round((c / t) * 100) : null });
}
