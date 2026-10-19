'use client';
/**
 * Mobile Command conviction input selection — ONE selection per ticker page, shared by the metrics card
 * and the PRO AI material (gate 10191903 #3: card 42/D vs AI 58/B when VWAP 102(10/19) → 98(10/16) arrived).
 * Same rule as every card (lib/commandConviction retainConvictionInputs): newer source time wins, a missing
 * value keeps the previous real value with its own date, an explicit null VWAP (stale session) is not carried.
 */
import { useEffect, useMemo } from 'react';
import { normalizeVwap } from '@/lib/vwap';
import { commandConvictionRaw, retainConvictionInputs, type ConvictionSnapshot } from '@/lib/commandConviction';

// Per-ticker conviction input history (browser memory only), survives tab switches.
const mobileConvictionHistory = new Map<string, ConvictionSnapshot>();

export function useMobileConvictionSnapshot(ticker: string, unified: any, price: number | null | undefined,
    sourceVwap: number | null | undefined, vwapDate: string | null | undefined, vwapExplicitNull: boolean,
    netPremium: number | null | undefined): ConvictionSnapshot {
    const vwap = normalizeVwap(sourceVwap);
    const snapshot = useMemo(() => {
        // Absent VWAP carries; an explicit null from the quote (stale-session invalidation) does not.
        const { raw, dates, invalidated } = commandConvictionRaw(unified, price, vwap ?? (vwapExplicitNull ? null : undefined), { netPremium }, { vwap: vwapDate });
        return retainConvictionInputs(ticker, raw, dates, mobileConvictionHistory.get(ticker), invalidated);
    }, [ticker, unified, price, vwap, vwapDate, vwapExplicitNull, netPremium]);
    useEffect(() => {
        const h = mobileConvictionHistory;
        h.delete(ticker); h.set(ticker, snapshot);
        if (h.size > 64) { const oldest = h.keys().next().value; if (oldest !== undefined) h.delete(oldest); }
    }, [ticker, snapshot]);
    return snapshot;
}
