import { Company, LensId, LensResult, LENS_IDS, Snapshot } from './types';
import { evaluateLenses } from './rules';
import { publicationHolds } from './guards';
import { SourceCache } from './sources';

export const HEAD_KEY = 'guru:lens:v1:head';
export const lensKey = (id: LensId, date: string) => `guru:lens:v1:${id}:${date}`;
export const metaKey = (date: string) => `guru:lens:v1:meta:${date}`;
export interface Head {
    current: string;
    previous: string | null;
}
export interface StoredLens {
    date: string;
    result: LensResult;
}
export type SnapshotMeta = Omit<Snapshot, 'lenses'>;
export function makeSnapshot(companies: Company[], calls: Snapshot['calls'], now = new Date()): Snapshot {
    const generatedAt = now.toISOString();
    return {
        version: 1,
        date: generatedAt,
        generatedAt,
        financialYear: companies[0]?.year ?? now.getUTCFullYear() - 1,
        universeCount: companies.length,
        companies: Object.fromEntries(
            companies.map((c) => [
                c.ticker,
                { cik: c.cik, reportedCik: c.reportedCik, priceDate: c.priceDate },
            ]),
        ),
        calls,
        lenses: evaluateLenses(companies),
    };
}
/** Immutable generations first, one head last. Any partial write leaves the old head intact. */
export async function publishSnapshot(
    cache: SourceCache,
    next: Snapshot,
    companies: Company[],
    previous: Snapshot | null,
    expectedCount = 495,
) {
    const holds = publicationHolds(companies, next, previous, expectedCount);
    if (holds.length) return { published: false as const, reason: 'held', holds };
    // Repeated same timestamp or stale run must not overwrite a published generation.
    if (previous && next.date <= previous.date)
        return { published: false as const, reason: 'older_generation', holds: [] };
    for (const id of LENS_IDS) {
        if (
            !(await cache.write(lensKey(id, next.date), {
                date: next.date,
                result: next.lenses[id],
            } satisfies StoredLens))
        )
            return { published: false as const, reason: 'write_failed', holds: [] };
    }
    const { lenses: _, ...meta } = next;
    if (!(await cache.write(metaKey(next.date), meta)))
        return { published: false as const, reason: 'write_failed', holds: [] };
    // Recheck concurrent publication after the slow writes. No lock based on GET→SET is claimed.
    const head = await cache.read<Head>(HEAD_KEY);
    if ((head?.current ?? null) !== (previous?.date ?? null))
        return { published: false as const, reason: 'head_changed', holds: [] };
    if (
        !(await cache.write(HEAD_KEY, {
            current: next.date,
            previous: previous?.date ?? null,
        } satisfies Head))
    )
        return { published: false as const, reason: 'write_failed', holds: [] };
    return { published: true as const, reason: 'published', holds: [] };
}
export async function readSnapshot(cache: Pick<SourceCache, 'read'>): Promise<Snapshot | null> {
    const head = await cache.read<Head>(HEAD_KEY);
    for (const date of [head?.current, head?.previous]) {
        if (!date) continue;
        const meta = await cache.read<SnapshotMeta>(metaKey(date));
        if (
            !meta ||
            meta.date !== date ||
            meta.version !== 1 ||
            !meta.companies ||
            !Number.isInteger(meta.universeCount)
        )
            continue;
        const values = await Promise.all(LENS_IDS.map((id) => cache.read<StoredLens>(lensKey(id, date))));
        if (
            values.some(
                (v, i) =>
                    !v ||
                    v.date !== date ||
                    v.result?.definition?.id !== LENS_IDS[i] ||
                    !Array.isArray(v.result.rows) ||
                    v.result.rows.some(
                        (row) => !row || typeof row.ticker !== 'string' || typeof row.passed !== 'boolean',
                    ) ||
                    v.result.rows.length !== meta.universeCount ||
                    v.result.passCount !== v.result.rows.filter((row) => row.passed).length,
            )
        )
            continue;
        return {
            ...meta,
            lenses: Object.fromEntries(values.map((v, i) => [LENS_IDS[i], v!.result])) as Snapshot['lenses'],
        };
    }
    return null;
}
/** Reverse lookup includes every passing stock, independent of any top-N ranking. */
export function selectSnapshot(s: Snapshot, lens?: LensId, ticker?: string) {
    const ids = lens ? [lens] : LENS_IDS;
    const lenses = ids.map((id) => {
        const l = s.lenses[id];
        return { ...l, rows: ticker ? l.rows.filter((r) => r.ticker === ticker) : l.rows };
    });
    const passedLenses = ticker
        ? ids.filter((id) => s.lenses[id].rows.some((r) => r.ticker === ticker && r.passed))
        : undefined;
    return {
        version: s.version,
        date: s.date,
        generatedAt: s.generatedAt,
        financialYear: s.financialYear,
        universeCount: s.universeCount,
        basis: {
            financial: 'SEC CY annual frames',
            prices: Object.fromEntries(
                Object.entries(s.companies)
                    .filter(([t]) => !ticker || t === ticker)
                    .map(([t, c]) => [t, c.priceDate]),
            ),
        },
        lenses,
        ...(ticker ? { ticker, passedLenses } : {}),
    };
}
