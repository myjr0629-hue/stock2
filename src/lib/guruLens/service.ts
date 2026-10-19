/** Production adapters. Publication reads and writes use the same authoritative store. */
import { getAuthoritativeCache, getFromCache, setAuthoritativeCache } from '../../services/redisClient';
import { getDarkPoolBatchChecked } from '../../services/darkPool';
import { readImpliedMoveRows } from '../../services/impliedMoveService';
import { collectCompanies, SourceCache } from './sources';
import { makeSnapshot, publishSnapshot, readSnapshot, HEAD_KEY, Head } from './pipeline';
import { readBadges } from './badges';

export const readonlyCache = { read: getFromCache };
// Authoritative reads distinguish a real missing head (first publication) from a Redis outage.
const strictCache: SourceCache = {
    read: async <T>(key: string) => {
        const r = await getAuthoritativeCache<T>(key);
        if (!r.ok) throw new Error('cache_unavailable');
        return r.value;
    },
    write: setAuthoritativeCache,
};
export async function runGuruLens(now = new Date()) {
    const head = await strictCache.read<Head>(HEAD_KEY);
    const previous = await readSnapshot(strictCache, head);
    if (head && !previous) return { published: false, reason: 'previous_snapshot_unreadable' };
    const { companies, calls, failures } = await collectCompanies(strictCache, now);
    const next = makeSnapshot(companies, calls, now);
    const result = await publishSnapshot(strictCache, next, companies, previous, head);
    return {
        ...result,
        date: next.date,
        universeCount: companies.length,
        calls,
        failures,
        passCounts: Object.fromEntries(Object.entries(next.lenses).map(([id, l]) => [id, l.passCount])),
    };
}
export async function currentBadges(tickers: string[]) {
    return readBadges(tickers, {
        read: getFromCache,
        darkPool: async (ts) => {
            const r = await getDarkPoolBatchChecked(ts);
            return r.ok ? r.map : {};
        },
        implied: readImpliedMoveRows,
    });
}
