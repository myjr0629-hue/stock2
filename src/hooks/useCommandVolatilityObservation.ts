'use client';
import { useEffect, useMemo, useState } from 'react';
import { resolveCommandVolatilityObservation, type CommandVolatilityObservation } from '@/lib/commandVolatilityObservation';

/** Same edition-selection state as the desktop Command card (LiveTickerDashboard):
 * failed polls are not observations, the newer source time wins, and a missing score keeps
 * the previous real edition with its own source date (lib/metrics/observation.ts). */
export function useCommandVolatilityObservation(ticker: string, unified: any, initialUnified: any): CommandVolatilityObservation | null {
    const [last, setLast] = useState<CommandVolatilityObservation | null>(() =>
        resolveCommandVolatilityObservation(ticker, initialUnified));
    const observation = useMemo(() => resolveCommandVolatilityObservation(ticker, unified,
        last?.ticker === ticker ? last : resolveCommandVolatilityObservation(ticker, initialUnified)),
    [ticker, unified, last, initialUnified]);
    useEffect(() => {
        setLast(previous => resolveCommandVolatilityObservation(ticker, unified,
            previous?.ticker === ticker ? previous : resolveCommandVolatilityObservation(ticker, initialUnified)));
    }, [ticker, unified, initialUnified]);
    return observation;
}
