import { Company, LensId, LensResult, LENS_IDS, Snapshot } from './types';
import { evaluateLenses } from './rules';
import { publicationHolds } from './guards';
import type { SourceCache } from './sources';
import type { PublicationStore } from './store';

export const HEAD_KEY = 'guru:lens:v1:head';
export const lensKey = (id: LensId, date: string) => `guru:lens:v1:${id}:${date}`;
export const metaKey = (date: string) => `guru:lens:v1:meta:${date}`;
export interface Head {
    current: string;
    previous: string | null;
    asOf?: string;
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
        asOf: companies.map((c) => c.priceDate).filter(Boolean).sort()[0] ?? '',
        financialYear: companies[0]?.year ?? now.getUTCFullYear() - 1,
        universeCount: companies.length,
        includedCount: companies.length,
        excluded: [],
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
/** Quarantine whole tickers, then recalculate ranks/percentiles on the included universe. */
export function preparePublication(
    candidate: Snapshot,
    companies: Company[],
    previous: Snapshot | null,
    expectedCount = 495,
) {
    const diagnostics = publicationHolds(companies, candidate, previous, expectedCount);
    const reasons = new Map<string, NonNullable<Snapshot['excluded']>[number]['reasons']>();
    for (const { ticker, code, detail } of diagnostics) {
        if (!ticker) continue;
        const list = reasons.get(ticker) ?? [];
        list.push({ code, detail });
        reasons.set(ticker, list);
    }
    const excluded = [...reasons].sort(([a], [b]) => a.localeCompare(b))
        .map(([ticker, reasons]) => ({ ticker, reasons }));
    const included = companies.filter((c) => !reasons.has(c.ticker));
    const snapshot: Snapshot = {
        ...candidate,
        ...(excluded.length ? makeSnapshot(included, candidate.calls, new Date(candidate.generatedAt)) : {}),
        date: candidate.date,
        universeCount: companies.length,
        includedCount: included.length,
        excluded,
        // Keep identity history for excluded tickers as well as included ones.
        companies: candidate.companies,
    };
    // Keep malformed-input safeguards. Pass-count changes must use the recalculated result.
    const global = [
        ...diagnostics.filter((h) => !h.ticker && h.code !== 'pass_count'),
        ...publicationHolds(companies, snapshot, previous, expectedCount).filter((h) => !h.ticker),
    ];
    if (excluded.length > expectedCount * 0.2)
        global.push({ code: 'exclusion_ratio', detail: `${excluded.length}/${expectedCount} > 20%` });
    const holds = [...new Map(global.map((h) => [JSON.stringify(h), h])).values()];
    return { snapshot, holds };
}
/** Distributed lease + atomic multi-key publication in one authoritative store. */
export async function publishSnapshot(
    cache: PublicationStore,
    candidate: Snapshot,
    companies: Company[],
    previous: Snapshot | null,
    expectedHead: Head | null,
    expectedCount = 495,
) {
    const { snapshot: next, holds } = preparePublication(candidate, companies, previous, expectedCount);
    const report = {
        universeCount: next.universeCount,
        includedCount: next.includedCount!,
        excluded: next.excluded!,
        passCounts: Object.fromEntries(LENS_IDS.map((id) => [id, next.lenses[id].passCount])),
    };
    if (holds.length) return { ...report, published: false as const, reason: 'held', holds };
    if ((previous && next.asOf <= previous.asOf) ||
        (expectedHead?.asOf && next.asOf <= expectedHead.asOf))
        return { ...report, published: false as const, reason: 'older_generation', holds: [] };
    const owner = await cache.acquire();
    if (!owner) return { ...report, published: false as const, reason: 'publication_locked', holds: [] };
    try {
        for (const id of LENS_IDS) {
            if (!await cache.save(lensKey(id, next.date), {
                date: next.date, result: next.lenses[id],
            } satisfies StoredLens, owner))
                return { ...report, published: false as const, reason: 'write_failed', holds: [] };
        }
        const { lenses: _, ...meta } = next;
        if (!await cache.save(metaKey(next.date), meta, owner))
            return { ...report, published: false as const, reason: 'write_failed', holds: [] };
        const reason = await cache.commit(next, previous?.date ?? null, expectedHead, owner);
        return { ...report, published: reason === 'published', reason, holds: [] };
    } finally {
        // A release error cannot turn a completed commit into a failed publication.
        // The lease expires; compare-and-delete cannot remove another owner's lease.
        try { await cache.release(owner); } catch { /* lease TTL bounds recovery */ }
    }
}
export async function readSnapshot(
    cache: Pick<SourceCache, 'read'>,
    observedHead?: Head | null,
): Promise<Snapshot | null> {
    const head = observedHead === undefined ? await cache.read<Head>(HEAD_KEY) : observedHead;
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
        const includedCount = meta.includedCount ?? meta.universeCount;
        const excluded = meta.excluded ?? [];
        if (
            !Number.isInteger(includedCount) || includedCount < 0 ||
            !Array.isArray(excluded) ||
            includedCount + excluded.length !== meta.universeCount ||
            excluded.some((e) => !e || typeof e.ticker !== 'string' || !meta.companies[e.ticker] ||
                !Array.isArray(e.reasons) || !e.reasons.length ||
                e.reasons.some((r) => !r || typeof r.code !== 'string' || typeof r.detail !== 'string')) ||
            new Set(excluded.map((e) => e.ticker)).size !== excluded.length
        ) continue;
        const excludedTickers = new Set(excluded.map((e) => e.ticker));
        const values = await Promise.all(LENS_IDS.map((id) => cache.read<StoredLens>(lensKey(id, date))));
        if (
            values.some(
                (v, i) =>
                    !v ||
                    v.date !== date ||
                    v.result?.definition?.id !== LENS_IDS[i] ||
                    !Array.isArray(v.result.rows) ||
                    v.result.rows.some(
                        (row) => !row || typeof row.ticker !== 'string' || typeof row.passed !== 'boolean' ||
                            !meta.companies[row.ticker] || excludedTickers.has(row.ticker),
                    ) ||
                    v.result.rows.length !== includedCount ||
                    new Set(v.result.rows.map((row) => row.ticker)).size !== includedCount ||
                    v.result.passCount !== v.result.rows.filter((row) => row.passed).length,
            )
        )
            continue;
        return {
            ...meta,
            // Legacy generations can still serve as the last healthy fallback.
            asOf: meta.asOf ?? Object.values(meta.companies).map((c) => c.priceDate).filter(Boolean).sort()[0] ?? '',
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
        asOf: s.asOf,
        financialYear: s.financialYear,
        universeCount: s.universeCount,
        includedCount: s.includedCount ?? s.universeCount,
        excluded: s.excluded ?? [],
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
