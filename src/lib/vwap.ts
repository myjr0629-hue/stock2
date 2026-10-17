/** A missing/invalid VWAP is never a zero-dollar price. */
export function normalizeVwap(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Only an omitted field may fall back; explicit null invalidates older sources. */
export function selectVwap(...sources: unknown[]): number | null {
    return normalizeVwap(sources.find(value => value !== undefined));
}

/** Preserve a measured zero distance; only calculate with valid positive prices. */
export function vwapDistancePct(price: unknown, vwap: unknown, reportedDistance?: unknown): number | null {
    const validVwap = normalizeVwap(vwap);
    if (validVwap === null || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
    if (typeof reportedDistance === 'number' && Number.isFinite(reportedDistance)) return reportedDistance;
    const distance = ((price - validVwap) / validVwap) * 100;
    return Number.isFinite(distance) ? distance : null;
}
