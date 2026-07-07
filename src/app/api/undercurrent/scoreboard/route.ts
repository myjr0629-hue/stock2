// ============================================================================
// Undercurrent — divergence SCOREBOARD (the trust loop)  [v1]
// ----------------------------------------------------------------------------
// Feed generation records every divergence signal (ticker, ET date, money
// mood, price). This route resolves each signal once THREE trading closes
// exist after the signal date: did the MONEY read or the NEWS narrative win?
//   verdict: 'money' | 'news' | 'flat' (|move| < 1%)
// Returns the cumulative record + recent verdicts + signals still tracking.
// GET /api/undercurrent/scoreboard
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SIGNALS_KEY = 'undercurrent:scoreboard:signals:v1';
const VIEW_KEY = 'undercurrent:scoreboard:view:v1';
const VIEW_TTL = 30 * 60;

interface Signal {
    ticker: string; dateET: string; mood: string;
    newsSentiment: string | null; priceAtSignal: number; title: string;
    resolved: boolean;
    verdict?: 'money' | 'news' | 'flat';
    movePct?: number;      // D+3 close vs price at signal
    d1Pct?: number;        // first close after signal vs price at signal
    resolvedAt?: string;
}

function judge(mood: string, movePct: number): 'money' | 'news' | 'flat' {
    if (Math.abs(movePct) < 1) return 'flat';
    const moneyDown = mood === 'cautious';
    const moneyUp = mood === 'bullish';
    if ((moneyDown && movePct < 0) || (moneyUp && movePct > 0)) return 'money';
    if (moneyDown || moneyUp) return 'news';
    return 'flat'; // neutral-mood divergence — no directional call to score
}

export async function GET() {
    try {
        const cachedView = await getFromCache<any>(VIEW_KEY);
        if (cachedView) return NextResponse.json({ ...cachedView, _cached: true });

        const doc = (await getFromCache<Signal[]>(SIGNALS_KEY)) || [];
        const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

        // Resolve pending signals that now have >= 3 post-signal trading closes
        const unresolved = doc.filter((s) => !s.resolved && s.priceAtSignal > 0);
        let mutated = false;
        for (const s of unresolved.slice(0, 25)) { // cap vendor calls per pass
            if (s.dateET >= todayET) continue; // same-day: nothing to resolve yet
            try {
                const aggs = await fetchMassive(
                    `/v2/aggs/ticker/${s.ticker}/range/1/day/${s.dateET}/${todayET}`,
                    { adjusted: 'true', sort: 'asc', limit: '10' }
                );
                const bars = (aggs?.results || []).filter((b: any) => {
                    const d = new Date(b.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                    return d > s.dateET && b.c > 0;
                });
                if (bars.length >= 3) {
                    const d3 = bars[2].c;
                    const d1 = bars[0].c;
                    s.movePct = ((d3 - s.priceAtSignal) / s.priceAtSignal) * 100;
                    s.d1Pct = ((d1 - s.priceAtSignal) / s.priceAtSignal) * 100;
                    s.verdict = judge(s.mood, s.movePct);
                    s.resolved = true;
                    s.resolvedAt = new Date().toISOString();
                    mutated = true;
                }
            } catch { /* keep pending; retry next pass */ }
        }
        if (mutated) await setInCache(SIGNALS_KEY, doc.slice(-200), 60 * 60 * 24 * 45);

        const resolved = doc.filter((s) => s.resolved && s.verdict);
        const record = {
            money: resolved.filter((s) => s.verdict === 'money').length,
            news: resolved.filter((s) => s.verdict === 'news').length,
            flat: resolved.filter((s) => s.verdict === 'flat').length,
            pending: doc.filter((s) => !s.resolved).length,
        };
        const recent = resolved
            .sort((a, b) => (b.resolvedAt || '').localeCompare(a.resolvedAt || ''))
            .slice(0, 8)
            .map((s) => ({
                ticker: s.ticker, dateET: s.dateET, mood: s.mood,
                movePct: +(s.movePct ?? 0).toFixed(2), verdict: s.verdict, title: s.title,
            }));
        const tracking = doc
            .filter((s) => !s.resolved)
            .sort((a, b) => b.dateET.localeCompare(a.dateET))
            .slice(0, 10)
            .map((s) => ({ ticker: s.ticker, dateET: s.dateET, mood: s.mood }));

        const view = { success: true, record, recent, tracking, generatedAt: new Date().toISOString() };
        setInCache(VIEW_KEY, view, VIEW_TTL).catch(() => {});
        return NextResponse.json(view);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
    }
}
