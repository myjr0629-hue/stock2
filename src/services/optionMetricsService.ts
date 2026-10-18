/** Read-only output boundary. No vendor calls, cache writes, refresh or recomputation. */
import { mgetFromCache } from '@/services/redisClient';
import { canonicalShareClass } from '@/lib/tickerSymbol';
import { optionExpirationFloor } from '@/lib/marketCalendar';
import { optionMetrics, type OptionMetrics } from '@/lib/optionMetrics';

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
export async function readOptionMetrics(tickers: string[]): Promise<Map<string, OptionMetrics>> {
    const asked = [...new Set(tickers.map(t => t.trim().toUpperCase()).filter(Boolean))];
    if (!asked.length) return new Map();
    const canonical = [...new Set(asked.map(canonicalShareClass))];
    const versions = await mgetFromCache<any>(canonical.map(t => `structure:v2:${t}`)).catch(() => canonical.map(() => null));
    // Bound DynamoDB fan-out for large watchlists and fast-all requests.
    const rows = new Map<string, any>();
    for (let i = 0; i < canonical.length; i += 10) {
        await Promise.all(canonical.slice(i, i + 10).map(async t => { rows.set(t, await latestOiRow(t)); }));
    }
    const byCanonical = new Map<string, OptionMetrics>();
    const floor = optionExpirationFloor();
    canonical.forEach((t, i) => {
        const s = versions[i]?.data;
        const usable = s && s.options_status !== 'NO_MARKET' && typeof s.expiration === 'string' && s.expiration >= floor;
        byCanonical.set(t, optionMetrics(usable ? s : null, rows.get(t)));
    });
    return new Map(asked.map(t => [t, byCanonical.get(canonicalShareClass(t))!]));
}
