/** Display IV level only. An ATM fallback never becomes IV30, a rank, or a skew curve. */
export function commandIvLevel(iv30: unknown, atmDecimal: unknown, volatilityPercent: unknown, batchPercent: unknown): number | null {
    const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
    const value = positive(iv30) ? iv30 : positive(atmDecimal) ? atmDecimal * 100
        : positive(volatilityPercent) ? volatilityPercent : positive(batchPercent) ? batchPercent : null;
    return value === null ? null : Math.round(value * 100) / 100;
}
