/**
 * XS-2.0 display override — switches the shipped "Context Score" number to the
 * XS engine's daily cross-sectional score wherever V8 computes one (approved
 * 2026-08-07). V8's pillars/why narrative stay as structural diagnostics; only
 * score / grade / engineVersion are replaced. Tickers absent from the XS map
 * (outside its universe, or a stale/zombie listing) keep their V8 score.
 *
 * Source: Redis `cache:xs:scores` = { date, scores: { TICKER: 0..100 } },
 * republished by the signum-xs Lambda every weekday 22:10 UTC.
 * Rollback: set env XS_DISPLAY=off (no deploy needed beyond env change).
 */
import { getFromCache } from '@/services/redisClient';
import { ALPHA_V3_CONFIG } from '@/services/engineConfig';

type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

const KEY = 'cache:xs:scores';
const REFRESH_MS = 10 * 60 * 1000;

let map: Record<string, number> | null = null;
let asOf = '';
let loadedAt = 0;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
    try {
        const doc = await getFromCache<{ date: string; scores: Record<string, number> }>(KEY);
        if (doc && doc.scores && Object.keys(doc.scores).length > 100) {
            map = doc.scores;
            asOf = doc.date;
        }
    } catch { /* keep the previous map on transient Redis errors */ }
    loadedAt = Date.now();
    loading = null;
}

/** Kick a background refresh when the in-memory map is cold or stale. */
export function primeXsScores(): void {
    if (Date.now() - loadedAt > REFRESH_MS && !loading) loading = load();
}

function gradeFor(score: number): Grade {
    const g = ALPHA_V3_CONFIG.GRADE_THRESHOLDS;
    if (score >= g.S) return 'S';
    if (score >= g.A) return 'A';
    if (score >= g.B) return 'B';
    if (score >= g.C) return 'C';
    if (score >= g.D) return 'D';
    return 'F';
}

/** Await a fresh map when called from an async context (read-side override). */
export async function ensureXsScores(): Promise<void> {
    primeXsScores();
    if (loading) await loading;
}

/**
 * Override for cached alphaSnapshot objects (written by the harvest Lambda,
 * which stamps V8 values — the second supply line beside calculateAlphaScore).
 */
export function xsSnapshotOverride<T extends { score?: number; grade?: string; engineVersion?: string }>(ticker: string, snap: T): T {
    if (process.env.XS_DISPLAY === 'off') return snap;
    const s = map?.[ticker.toUpperCase()];
    if (typeof s !== 'number' || !Number.isFinite(s)) return snap;
    return {
        ...snap,
        score: Math.round(s * 10) / 10,
        grade: gradeFor(s),
        engineVersion: `XS-2.0.0/${asOf}+v8struct`,
    };
}

/** Synchronous override applied at the single V8 result chokepoint. */
export function xsOverride<T extends { score: number; grade: Grade; ticker: string; engineVersion: string }>(result: T): T {
    primeXsScores();
    if (process.env.XS_DISPLAY === 'off') return result;
    const s = map?.[result.ticker];
    if (typeof s !== 'number' || !Number.isFinite(s)) return result;
    return {
        ...result,
        score: Math.round(s * 10) / 10,
        grade: gradeFor(s),
        engineVersion: `XS-2.0.0/${asOf}+v8struct`,
    };
}
