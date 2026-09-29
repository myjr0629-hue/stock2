// ============================================================================
// Undercurrent — PRICE: quiet price strip for the story detail sheet
// ----------------------------------------------------------------------------
// GET /api/undercurrent/price?t=AMZN&since=2026-07-10T14:02:00Z
// Returns { price, dayPct, sincePct }:
//   - price/dayPct: current snapshot (last trade; day change vs prev close)
//   - sincePct: "money since the news" — % move from the FIRST bar at/after the
//     story's publishedAt to now. Published off-hours → the reference becomes the
//     next session's first bar, which is exactly what "did money agree?" means.
// Editorial display only (no live ticks). Redis-cached 90s per (ticker, since-minute).
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { isTradeInExtSession } from '@/services/extendedSessionClose';
import { etDateOf } from '@/lib/marketCalendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TTL_SEC = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get('t') || '').toUpperCase().trim();
  if (!/^[A-Z][A-Z.\-]{0,7}$/.test(ticker)) {
    return NextResponse.json({ success: false, error: 'bad ticker' }, { status: 400 });
  }
  const sinceRaw = searchParams.get('since') || '';
  const sinceMs = sinceRaw ? new Date(sinceRaw).getTime() : NaN;
  const hasSince = Number.isFinite(sinceMs) && sinceMs < Date.now() + 5 * 60_000;

  // cache per (ticker, since-minute) so every reader of the same story shares one entry
  const sinceKey = hasSince ? String(Math.floor(sinceMs / 60_000)) : 'none';
  // v2 (2026-09-25): 기준 봉(epoch ms 창이 어댑터에서 버려졌다)·dayPct 기준이 바뀌었다 → 옛 값 폐기
  const cacheKey = `undercurrent:price:v2:${ticker}:${sinceKey}`;
  const cached = await getFromCache<any>(cacheKey).catch(() => null);
  if (cached) return NextResponse.json({ ...cached, _cached: true });

  try {
    const now = Date.now();
    // >7d-old story → daily bars are enough (and much cheaper than minute aggs)
    const useDaily = hasSince && now - sinceMs > 7 * DAY_MS;
    const [snap, aggs] = await Promise.all([
      fetchMassive(
        `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
        {}, false, undefined, { cache: 'no-store' as RequestCache },
      ).catch(() => null),
      hasSince
        ? fetchMassive(
            `/v2/aggs/ticker/${ticker}/range/${useDaily ? '1/day' : '5/minute'}/${Math.floor(sinceMs)}/${now}`,
            { adjusted: 'true', sort: 'asc', limit: '500' },
            false, undefined, { cache: 'no-store' as RequestCache },
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

    const tk = snap?.ticker;
    const price: number | null =
      (typeof tk?.lastTrade?.p === 'number' && tk.lastTrade.p > 0 && tk.lastTrade.p) ||
      (typeof tk?.min?.c === 'number' && tk.min.c > 0 && tk.min.c) ||
      (typeof tk?.day?.c === 'number' && tk.day.c > 0 && tk.day.c) ||
      (typeof tk?.prevDay?.c === 'number' && tk.prevDay.c > 0 && tk.prevDay.c) || null;
    // ★ [2026-09-25] dayPct 는 표시하는 가격(마지막 체결)과 «같은 기준»으로 직접 계산한다.
    //   Intrinio 어댑터의 todaysChangePerc 는 «정규장만»의 등락률이다(Massive 땐 마지막 체결 기준이었다).
    //   그래서 시간외엔 «애프터 체결가 + 정규장 등락률»이 짝지어 나갔다.
    //   기준선: 마지막 체결이 프리마켓 체결이면 마지막 정규장 종가(day.c), 아니면 전일 종가(prevDay.c).
    const ltMs = Number(tk?.lastTrade?.t) > 0 ? Math.round(Number(tk.lastTrade.t) / 1e6) : 0;
    const isPreTrade = ltMs > 0 && isTradeInExtSession(ltMs, etDateOf(ltMs), 'pre');
    const base = isPreTrade
      ? (Number(tk?.day?.c) || Number(tk?.prevDay?.c) || 0)
      : (Number(tk?.prevDay?.c) || 0);
    let dayPct: number | null = null;
    if (price != null && base > 0) {
      dayPct = ((price - base) / base) * 100;
      if (!Number.isFinite(dayPct)) dayPct = null;
    } else if (typeof tk?.todaysChangePerc === 'number' && Number.isFinite(tk.todaysChangePerc)) {
      dayPct = tk.todaysChangePerc;
    }

    // reference = first bar at/after publication (open of that bar = first tradable price)
    let sincePct: number | null = null;
    const firstBar = (aggs?.results || [])[0];
    const ref: number | null =
      (typeof firstBar?.o === 'number' && firstBar.o > 0 && firstBar.o) ||
      (typeof firstBar?.c === 'number' && firstBar.c > 0 && firstBar.c) || null;
    if (price != null && ref != null) {
      sincePct = ((price - ref) / ref) * 100;
      if (!Number.isFinite(sincePct)) sincePct = null;
    }

    if (price == null) return NextResponse.json({ success: false, error: 'no price' }, { status: 503 });

    const body = { success: true, ticker, price, dayPct, sincePct };
    await setInCache(cacheKey, body, TTL_SEC).catch(() => {});
    return NextResponse.json(body);
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
