import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { calculateAlphaScore, explainAlphaSnapshot } from '@/services/alphaEngine';
import { type OptionMetrics } from '@/lib/optionMetrics';
import { mgetFromCache } from '@/services/redisClient';
import { ensureXsScores, xsSnapshotOverride } from '@/services/xsScores';
import { shownRegularSessionDate } from '@/lib/marketCalendar';
import { alphaRegularQuote, alphaSessionVwap, alphaMacroInputs } from '@/lib/alphaEvidence';
import { readImpliedMoveFields } from '@/lib/impliedMove';

/** Prefer the published alphaSnapshot, retaining the response's own alpha on cache misses. */
export async function readOptionAlpha(tickers: string[], metrics: Map<string, OptionMetrics>, fallbacks?: Map<string, any>): Promise<Map<string, any>> {
    if (!tickers.length) return new Map();
    tickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    const analysis = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    if (!Object.keys(analysis).length) await ensureXsScores();
    const now = Date.now(), date = shownRegularSessionDate(now);
    // Read stored inputs once for every consumer. No provider calls, refresh, or cache writes.
    const perTicker = tickers.flatMap(t => [`flow:ticker:v6:${t}`, `flow:ticker:nochain:v6:${t}`,
        `chart:v5:${t}:1d`, `vwap:minutes:${t}:${date}`]);
    const rows = await mgetFromCache<any>([...perTicker, 'macro:snapshot:v5', 'yahoo:vix', 'yahoo:vix3m',
        'flow:ticker:v6:QQQ', 'flow:ticker:nochain:v6:QQQ']).catch(() => []);
    const macro = alphaMacroInputs(rows[perTicker.length]?.data, rows[perTicker.length + 1], rows[perTicker.length + 2]);
    const qqq = rows.slice(perTicker.length + 3).map(q => alphaRegularQuote(q, now)).find(Boolean);
    if (macro.ndxChangePct === null && qqq) macro.ndxChangePct = qqq.changePct;
    return new Map(tickers.map((t, i) => {
        // A cold/missing analysis cache must not erase an alpha already computed for this response.
        const a = analysis[t]?.alphaSnapshot ? analysis[t] : fallbacks?.get(t);
        const m = metrics.get(t);
        // Compare observations from all existing sources; source priority must not hide a newer batch.
        const candidates: { regular: NonNullable<ReturnType<typeof alphaRegularQuote>>;
            observedAt: number; quote?: any; vwap?: number | null }[] = [];
        for (const quote of rows.slice(i * 4, i * 4 + 2)) {
            const regular = alphaRegularQuote(quote, now), observedAt = Number(quote?.tsServer);
            if (regular && Number.isFinite(observedAt) && observedAt > 0 && observedAt <= now) {
                candidates.push({ regular, observedAt, quote });
            }
        }
        for (const source of [a, fallbacks?.get(t)]) {
            const saved = source?.alphaQuote;
            if (saved?.sessionDate !== date
                || typeof saved.price !== 'number' || !Number.isFinite(saved.price) || saved.price <= 0
                || typeof saved.prevClose !== 'number' || !Number.isFinite(saved.prevClose) || saved.prevClose <= 0
                || typeof saved.changePct !== 'number' || !Number.isFinite(saved.changePct)
                || typeof saved.observedAt !== 'number' || !Number.isFinite(saved.observedAt)
                || saved.observedAt <= 0 || saved.observedAt > now) continue;
            candidates.push({ regular: { price: saved.price, prevClose: saved.prevClose,
                changePct: (saved.price - saved.prevClose) / saved.prevClose * 100, sessionDate: date },
                observedAt: saved.observedAt,
                vwap: typeof source.vwap === 'number' && Number.isFinite(source.vwap) && source.vwap > 0 ? source.vwap : null });
        }
        candidates.sort((a, b) => b.observedAt - a.observedAt);
        const selected = candidates[0], regular = selected?.regular;
        const vwap = alphaSessionVwap(selected?.quote, rows[i * 4 + 2], rows[i * 4 + 3], now)
            ?? selected?.vwap ?? null;
        const input = {
            gex: m?.gex ?? null, squeezeScore: m?.squeezeScore ?? null, pcr: m?.pcr ?? null,
            whaleIndex: a?.whaleIndex ?? null, darkPoolPct: a?.darkPoolPct ?? null,
            shortVolPct: a?.shortVolPct ?? null, relVol: a?.relVol ?? null,
            impliedMovePct: readImpliedMoveFields(a, now).impliedMovePct
                ?? readImpliedMoveFields(fallbacks?.get(t), now).impliedMovePct,
        };
        let snapshot = a?.alphaSnapshot;
        if (snapshot && regular) {
            const result = calculateAlphaScore({ ticker: t, session: 'REG', ...regular, ...input, ...macro,
                vwap, rsi14: a?.rsi ?? null, return3D: a?.return3d ?? null,
                callWall: a?.callWall ?? null, putFloor: a?.putFloor ?? null,
                gammaFlipLevel: a?.gammaFlipLevel ?? null, atmIv: a?.iv ?? null,
                ivSkew: a?.ivSkew != null && Math.abs(a.ivSkew) <= 2 ? a.ivSkew : null,
                netFlow: a?.netPremium ?? null, blockTrades: null,
            });
            // XS owns the published score; V8 pillars are diagnostics, rebuilt from the regular session.
            snapshot = { ...snapshot, pillars: result.pillars, dataCompleteness: result.dataCompleteness,
                evidenceAsOf: new Date(selected.observedAt).toISOString(), evidenceSession: date,
                evidenceInputs: { ...regular, ...input, ...macro, vwap, blockTrades: null } };
        }
        return [t, explainAlphaSnapshot(snapshot ? xsSnapshotOverride(t, snapshot) : null, input)];
    }));
}
