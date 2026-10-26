/** Server row values used by the web related-ticker merge. No clock or I/O. */
interface RelatedRow {
    price: number;
    change: number;
    prevClose?: number;
    asOf?: number | null;
    session?: string | null;
    closeSession?: string | null;
}

const validAsOf = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

export function mergeRelatedRow<T extends RelatedRow>(oldItem: T | null | undefined, newItem: T, isRegularSession: boolean): T {
    const hasLiveOldData = !!oldItem && (oldItem.price > 0 || Math.abs(oldItem.change) > 0);
    const oldOfficial = !!oldItem && oldItem.price > 0 && !!oldItem.closeSession;
    const newOfficial = newItem.price > 0 && !!newItem.closeSession;
    // Outside REG, official close provenance wins over extended trade time in
    // either arrival order. Within the same basis, retain the asOf guard.
    const keepOfficial = !isRegularSession && oldOfficial && !newOfficial;
    const takeOfficial = !isRegularSession && newOfficial && !oldOfficial;
    // Compare only two server calculation times. A missing time must not block
    // the existing denominator backfill (T12 gate 10250519).
    if (hasLiveOldData && (keepOfficial || (!takeOfficial && validAsOf(oldItem.asOf) && validAsOf(newItem.asOf) && newItem.asOf < oldItem.asOf))) {
        return {
            ...newItem,
            price: oldItem.price,
            change: oldItem.change,
            prevClose: oldItem.prevClose,
            asOf: oldItem.asOf,
            session: oldItem.session,
            closeSession: oldItem.closeSession,
        };
    }
    // stalePriceRepair marks official rows with closeSession. A positive-price
    // official row may be flat; a failed price:0 row still gets V2 protection.
    const officialFlat = newItem.price > 0 && !!newItem.closeSession;
    return {
        ...newItem,
        price: (hasLiveOldData && newItem.price === 0) ? oldItem.price : newItem.price,
        change: (hasLiveOldData && newItem.change === 0 && !officialFlat) ? oldItem.change : newItem.change,
        prevClose: newItem.prevClose || oldItem?.prevClose,
        // A failed row without a calculation time must not erase the stale-response guard.
        asOf: (hasLiveOldData && newItem.price === 0 && !validAsOf(newItem.asOf)) ? oldItem.asOf : newItem.asOf,
    };
}
