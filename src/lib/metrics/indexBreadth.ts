import { metric, positive } from './contract';
export interface BreadthHistory { dates: string[]; closes: Record<string, (number | null)[]> }
/** True SMA20: twenty aligned, valid closes per constituent; at least half of the universe covered. */
export function indexBreadth(tickers: readonly string[], history: BreadthHistory | null) {
    const universe = [...new Set(tickers)];
    const dates = history?.dates.slice(-20) ?? [];
    const aligned = dates.length === 20 && dates.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (i === 0 || d > dates[i - 1]));
    const missing: string[] = [];
    let above = 0, covered = 0;
    for (const ticker of universe) {
        const series = history?.closes[ticker];
        const closes = series?.slice(-20);
        if (!aligned || !closes || series!.length !== history!.dates.length || closes.length !== 20 || !closes.every(positive)) {
            missing.push(ticker);
            continue;
        }
        covered++;
        if (closes[19]! > closes.reduce<number>((sum, v) => sum + v!, 0) / 20) above++;
    }
    const ratio = universe.length > 0 ? covered / universe.length : 0;
    const result = metric({ id: 'index_breadth_sma20/v1', kind: 'derived', unit: 'fraction_0_1',
        basis: 'constituents_above_SMA20', period: '20_trading_observations', denominator: 'covered_constituents' },
    { dates, above, covered, universe: universe.length }, { history: aligned, universe: universe.length > 0, coverage: ratio >= .5 },
    () => Math.round(above / covered * 1000) / 1000);
    return { pctAbove20: result.value, covered, universe: universe.length, asOf: dates.at(-1) ?? null,
        metric: { ...result, coverage: { available: covered, required: universe.length, ratio, minimum: .5, missing } } };
}
