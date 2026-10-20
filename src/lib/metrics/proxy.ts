import { finite, metric, positive } from './contract';
/** Caller must explicitly opt into proxyValue. The observed target value remains null. */
export function spyIndexProxy(spyValue?: number | null) {
    const scaled = metric({ id: 'spy_sp500_proxy/v1', kind: 'estimate', unit: 'index_points_proxy',
        basis: 'SPY_times_10', period: 'same_SPY_snapshot', denominator: 'one_SPY_share' }, { spyValue },
    { spyValue: positive(spyValue) }, () => spyValue! * 10);
    return { ...scaled, value: null, proxyValue: scaled.value,
        status: scaled.value === null ? 'missing' as const : 'proxy' as const,
        proxy: { source: 'SPY', target: 'SP500', multiplier: 10 }, observedValue: null };
}

/** Explicit source-unit conversion; never infer percent vs decimal from magnitude. */
export function ivPercent(value: unknown, sourceUnit: 'decimal' | 'percent') {
    return metric({ id: 'iv_percent/v1', kind: 'derived', unit: 'percent', basis: `source_${sourceUnit}`,
        period: 'source_option_expiry', denominator: '100_percent' }, { value, sourceUnit },
    { value: finite(value) && value > 0 }, () => sourceUnit === 'decimal' ? (value as number) * 100 : value as number);
}
