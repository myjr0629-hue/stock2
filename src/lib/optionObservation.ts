/** Source boundary for Alpha option inputs. Zero is a measurement only when its
 * source succeeded. Status-free objects are already-normalized metrics/cache rows;
 * they must preserve missing fields as null, never synthesize numeric defaults.
 */
export function optionSourceSucceeded(source: any, field?: string): boolean {
    if (!source || source.error || source.success === false) return false;
    const status = source.options_status ?? source.status;
    if (status === 'PENDING') return !!field && source.optionObservations?.[field] === true;
    if (status != null) return ['OK', 'READY', 'BULLISH', 'BEARISH', 'NEUTRAL',
        // Normalized short-interest observations carry a risk category in status.
        'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'EXTREME'].includes(status);
    return source.complete !== false;
}

/** Aliases apply only to absent (undefined) fields. Explicit null is authoritative. */
export function optionNumber(source: any, field: string, ...aliases: string[]): number | null {
    if (!optionSourceSucceeded(source, field)) return null;
    for (const key of [field, ...aliases]) {
        const value = key.split('.').reduce((object, part) => object?.[part], source);
        if (value === undefined) continue;
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    return null;
}

export function optionChain(source: any, field = 'rawChain'): any[] {
    if (!optionSourceSucceeded(source, field)) return [];
    return Array.isArray(source[field]) ? source[field] : [];
}
