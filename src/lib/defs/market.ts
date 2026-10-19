/** Shared definitions. No localized UI copy belongs in this registry. */
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Signed price displacement, denominator = max pain. Positive = price above max pain. */
export function maxPainGapPct(price: unknown, maxPain: unknown): number | null {
    return finite(price) && price > 0 && finite(maxPain) && maxPain > 0
        ? (price - maxPain) / maxPain * 100 : null;
}
/** Read the server's 30-day summary; never sum the truncated transaction list. */
export function insider30d(summary: any) {
    const net = finite(summary?.net30d) ? summary.net30d : null;
    const count = (v: unknown) => finite(v) && Number.isInteger(v) && v >= 0 ? v : null;
    const buyCount = count(summary?.buyCount), sellCount = count(summary?.sellCount);
    return { net, buyCount, sellCount, count: buyCount === null || sellCount === null ? null : buyCount + sellCount };
}
/** Standard floor-trader pivots. */
export function floorPivots(high: number, low: number, close: number) {
    const pp = (high + low + close) / 3;
    return { pp, r1: 2 * pp - low, s1: 2 * pp - high,
        r2: pp + high - low, s2: pp - (high - low),
        r3: high + 2 * (pp - low), s3: low - 2 * (high - pp) };
}
