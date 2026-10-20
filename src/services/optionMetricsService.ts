/** Read-only output boundary. No vendor calls, cache writes, refresh or recomputation. */
import { mgetFromCache } from '@/services/redisClient';
import { canonicalShareClass } from '@/lib/tickerSymbol';
import { optionExpirationFloor } from '@/lib/marketCalendar';
import { optionMetrics, optionRegimeInputs, type OptionMetrics, type OptionRegimeInputs } from '@/lib/optionMetrics';
import { etPhase } from '@/lib/cache/intelFastCache';

type Snapshot = { structure: any; oiRow: any; cacheable: boolean };
type CachedSnapshot = { snapshot: Snapshot; scope: string; expiresAt: number };
// Opt-in, per warm server instance. No Redis/Dynamo writes; never extend TTL on a hit.
const snapshots = new Map<string, CachedSnapshot>();
const flights = new Map<string, Promise<Snapshot>>();
const MAX_SNAPSHOTS = 1000;

async function latestOiRow(ticker: string): Promise<any> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        return await Promise.race([
            getLatestGex(ticker).catch(() => null),
            new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 4000); }),
        ]);
    } catch { return null; }
    finally { if (timer) clearTimeout(timer); }
}
async function readSnapshots(canonical: string[]): Promise<Map<string, Snapshot>> {
    const versions = await mgetFromCache<any>(canonical.map(t => `structure:v2:${t}`))
        .catch(() => canonical.map(() => null));
    // Redis resolves null for both failures and key misses. Do not retain an uncertain
    // batch; a returned wrapper with no data is a successful read and may be cached.
    const cacheable = versions.length === canonical.length && versions.every(version => version != null);
    // Bound DynamoDB fan-out for large watchlists and fast-all requests.
    const rows = new Map<string, any>();
    for (let i = 0; i < canonical.length; i += 10) {
        await Promise.all(canonical.slice(i, i + 10).map(async t => { rows.set(t, await latestOiRow(t)); }));
    }
    return new Map(canonical.map((t, i) => [t, { structure: versions[i]?.data, oiRow: rows.get(t), cacheable }]));
}

async function readCachedSnapshots(canonical: string[]): Promise<Map<string, Snapshot>> {
    const startedAt = Date.now();
    const phase = etPhase(startedAt);
    const scope = `${phase.key}:${optionExpirationFloor(startedAt)}`;
    // Source updates become visible on the next request after <= 1 minute (20s while active).
    // Anchor expiry before I/O so slow reads cannot prolong the freshness bound.
    const ttl = phase.open ? 20_000 : 60_000;
    for (const [ticker, entry] of snapshots) {
        if (entry.scope !== scope || entry.expiresAt <= startedAt) snapshots.delete(ticker);
    }
    const waiting = new Map<string, Promise<Snapshot>>();
    const missing: string[] = [];
    for (const ticker of canonical) {
        const hit = snapshots.get(ticker);
        const flight = flights.get(`${scope}:${ticker}`);
        if (hit) waiting.set(ticker, Promise.resolve(hit.snapshot));
        else if (flight) waiting.set(ticker, flight);
        else missing.push(ticker);
    }
    if (missing.length) {
        const batch = readSnapshots(missing);
        for (const ticker of missing) {
            const key = `${scope}:${ticker}`;
            const flight = batch.then(rows => {
                const snapshot = rows.get(ticker)!;
                // Null also represents upstream failure; retry it soon, without serving old values.
                const expiresAt = startedAt + (snapshot.oiRow ? ttl : 5_000);
                if (snapshot.cacheable && expiresAt > Date.now()) {
                    if (snapshots.size >= MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!);
                    snapshots.set(ticker, { snapshot, scope, expiresAt });
                }
                return snapshot;
            }).finally(() => { flights.delete(key); });
            flights.set(key, flight);
            waiting.set(ticker, flight);
        }
    }
    return new Map(await Promise.all([...waiting].map(async ([ticker, value]) => [ticker, await value] as const)));
}

export type OptionEdition = { metrics: OptionMetrics; regime: OptionRegimeInputs };
/** Metrics and the remaining VOL REGIME inputs from ONE read of the same structure:v2 edition. */
export async function readOptionEditions(tickers: string[], options: { cache?: boolean } = {}): Promise<Map<string, OptionEdition>> {
    const asked = [...new Set(tickers.map(t => t.trim().toUpperCase()).filter(Boolean))];
    if (!asked.length) return new Map();
    const canonical = [...new Set(asked.map(canonicalShareClass))];
    const rows = await (options.cache ? readCachedSnapshots(canonical) : readSnapshots(canonical));
    const byCanonical = new Map<string, OptionEdition>();
    const now = Date.now();
    const floor = optionExpirationFloor(now);
    canonical.forEach(t => {
        const { structure: s, oiRow } = rows.get(t)!;
        const usable = s && s.options_status !== 'NO_MARKET' && typeof s.expiration === 'string' && s.expiration >= floor;
        // Re-evaluate expiry and OI age even on a hit; return fresh objects to every caller.
        byCanonical.set(t, { metrics: optionMetrics(usable ? s : null, oiRow, now), regime: usable ? optionRegimeInputs(s) : null });
    });
    return new Map(asked.map(t => [t, byCanonical.get(canonicalShareClass(t))!]));
}

export async function readOptionMetrics(tickers: string[], options: { cache?: boolean } = {}): Promise<Map<string, OptionMetrics>> {
    const editions = await readOptionEditions(tickers, options);
    return new Map([...editions].map(([t, e]) => [t, e.metrics]));
}
