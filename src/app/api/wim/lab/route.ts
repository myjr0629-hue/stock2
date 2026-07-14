// ============================================================================
// WIM — LAB: real-data demo payload for the concept library.
// ----------------------------------------------------------------------------
// GET /api/wim/lab?t=NVDA — one compact snapshot of REAL institutional metrics
// (from /api/command/unified) + the REAL last-session 5-min chart, so every
// glossary concept can be demonstrated on live material instead of prose.
// Observer data only (numbers, no advice). Redis 15-min SWR per ticker.
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { publicBase } from '@/lib/net/publicBase';
import { serveSWR } from '../../undercurrent/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FRESH_SEC = 15 * 60;

function etDateOf(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
}

export async function GET(request: Request) {
  const { origin: reqOrigin, searchParams } = new URL(request.url);
  const origin = publicBase(reqOrigin);
  const ticker = (searchParams.get('t') || 'NVDA').toUpperCase().trim();
  if (!/^[A-Z][A-Z.\-]{0,7}$/.test(ticker)) {
    return NextResponse.json({ success: false, error: 'bad ticker' }, { status: 400 });
  }
  const refresh = searchParams.get('refresh') === '1';
  const cacheKey = `wim:lab:v1:${ticker}`;

  const generate = async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const from = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
    const [uRes, aggs] = await Promise.all([
      fetch(`${origin}/api/command/unified?t=${ticker}&lang=en`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchMassive(`/v2/aggs/ticker/${ticker}/range/5/minute/${from}/${today}`, { adjusted: 'true', sort: 'asc', limit: '5000' }, false, undefined, { cache: 'no-store' as RequestCache }).catch(() => null),
    ]);
    const u = uRes?.unified || uRes || {};
    const s = u.structure || {};
    const vol = u.volatility || {};
    const sma = u.sma || {};
    const inst = u.institutional || {};
    const sqz = u.squeeze || {};

    // last-session bars (pre-open "today" has none — same rule as /api/wim/today)
    const barsAll = (aggs?.results || []) as { c?: number; vw?: number; t?: number }[];
    const lastDay = barsAll.length && typeof barsAll[barsAll.length - 1].t === 'number'
      ? etDateOf(barsAll[barsAll.length - 1].t as number) : null;
    const bars = lastDay ? barsAll.filter((b) => typeof b.t === 'number' && etDateOf(b.t) === lastDay) : [];
    const closes = bars.map((b) => b.c).filter((x): x is number => typeof x === 'number' && x > 0);
    const vwaps = bars.map((b) => b.vw).filter((x): x is number => typeof x === 'number' && x > 0);
    if (closes.length < 8 && !s.netGex) throw new Error('no lab data');

    const num = (x: any): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      success: true,
      ticker,
      price: closes.length ? closes[closes.length - 1] : null,
      spark: closes.length >= 8 ? { closes, vwap: vwaps.length === closes.length ? vwaps : null } : null,
      gex: { netGex: num(s.netGex), gammaFlip: num(s.gammaFlipLevel), regime: s.gammaRegime || null },
      levels: { callWall: num(s.levels?.callWall), putFloor: num(s.levels?.putFloor), maxPain: num(s.maxPain) },
      pcr: num(s.pcRatio),
      darkPoolPct: num(inst.darkPool?.percent),
      blockCount: num(inst.blockTrade?.count),
      shortVolPct: num(inst.shortVolume?.percent),
      smartFlow: num(u.smartFlow),
      vol: { regime: vol.regime || null, regimeScore: num(vol.regimeScore), iv: num(vol.iv) },
      squeeze: { siPercent: num(sqz.siPercent), daysToCover: num(sqz.daysToCover), riskScore: num(sqz.riskScore), status: sqz.status || null },
      sma: { sma50: num(sma.sma50), sma200: num(sma.sma200), cross: sma.cross || null, phase: sma.phase || null },
      alpha: { score: num(u.alpha?.score), grade: u.alpha?.grade || null },
      fund: { score: num(u.fundamentals?.score), grade: u.fundamentals?.grade || null, sector: u.fundamentals?.sector || null },
    };
  };

  try {
    const res = await serveSWR({ key: cacheKey, freshSec: FRESH_SEC, refresh, generate });
    if (!res) return NextResponse.json({ success: false, error: 'unavailable' }, { status: 503 });
    return NextResponse.json({ ...res.body, _stale: res.stale });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
  }
}
