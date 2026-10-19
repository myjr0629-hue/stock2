import { prevTradingDate } from './marketCalendar';
export interface LargestOpening { type: 'call' | 'put'; strike: number; expiry: string; added: number; oi: number; notional: number }
export interface OpeningTotals {
    largest?: LargestOpening | null;
    contracts: number; notional: number; side: 'call' | 'put';
    callContracts: number; putContracts: number; callNotional: number; putNotional: number;
}
export interface OpeningSource {
    openingBasis?: string | null;
    openingByExpiry?: Record<string, { callContracts: number; putContracts: number; callNotional: number; putNotional: number; largest?: LargestOpening | null }> | null;
}
/** 종목 전체, 만기 남은 계약의 Σ max(ΔOI,0). 콜/풋 상계 없음. 명목=ΔOI×100×행사가. */
export function summarizeWhaleOpening(v: OpeningSource | null | undefined, isExpired: (e: unknown) => boolean, dates?: { date?: unknown; prevDate?: unknown }): OpeningTotals | null {
    if (dates && (typeof dates.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dates.date) || dates.prevDate !== prevTradingDate(dates.date))) return null;
    if (v?.openingBasis !== 'all-contracts-positive-oi-v1' || !v.openingByExpiry) return null;
    let largest: LargestOpening | null = null;
    const sum = { callContracts: 0, putContracts: 0, callNotional: 0, putNotional: 0 };
    for (const [e, x] of Object.entries(v.openingByExpiry)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return null;
        if (isExpired(e)) continue;
        if (!x || typeof x !== 'object') return null;
        if (x.largest && (!largest || x.largest.added > largest.added || (x.largest.added === largest.added && (x.largest.notional > largest.notional || (x.largest.notional === largest.notional && x.largest.expiry < largest.expiry))))) largest = x.largest;
        for (const k of Object.keys(sum) as (keyof typeof sum)[]) {
            if (typeof x?.[k] !== 'number' || !Number.isFinite(x[k]) || x[k] < 0) return null;
            sum[k] += x[k];
        }
    }
    return { ...sum, largest, contracts: sum.callContracts + sum.putContracts, notional: sum.callNotional + sum.putNotional,
        side: sum.callNotional >= sum.putNotional ? 'call' : 'put' };
}
export function openingSideTotal(o: OpeningTotals | null | undefined): number | null {
    const value = o ? o.side === 'call' ? o.callContracts : o.putContracts : null;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function whaleOpeningLabel(side: 'call' | 'put', loc: string): string {
    return loc === 'ko' ? `고래 신규 ${side === 'call' ? '콜' : '풋'}` : loc === 'ja' ? `大口新規${side === 'call' ? 'コール' : 'プット'}` : `New whale ${side === 'call' ? 'calls' : 'puts'}`;
}
