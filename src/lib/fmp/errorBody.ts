/** FMP sometimes answers a quota/key/plan problem with a JSON object instead of the
 *  expected list. That is a provider failure, not «no data», and must never be cached. */
export function isFmpErrorBody(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    return ['Error Message', 'error', 'Error'].some((k) => k in (data as Record<string, unknown>));
}
