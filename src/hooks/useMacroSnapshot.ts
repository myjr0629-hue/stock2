import { useState, useEffect } from 'react';
import { MarketStatusResult } from '@/services/marketStatusProvider';

export interface MacroFactor {
    level: number | null;
    chgPct?: number | null;
    chgAbs?: number | null;
    label: string;
    source: string; // "MASSIVE" | "FAIL"
    status: "OK" | "UNAVAILABLE";
    symbolUsed: string;
}

// [V45.0] Advanced Macro Indicators
export interface YieldCurveData {
    us2y: number;
    us10y: number;
    spread2s10s: number;
    trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL';
}

export interface RealYieldData {
    us10y: number;
    inflationExpectation: number;
    realYield: number;
    stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
}

export interface MacroSnapshot {
    asOfET: string;
    marketStatus: MarketStatusResult;
    factors: {
        nasdaq100: MacroFactor;
        vix: MacroFactor;
        us10y: MacroFactor;
        dxy: MacroFactor;
    };
    // [V45.0] Advanced Macro Indicators
    yieldCurve?: YieldCurveData;
    realYield?: RealYieldData;
}

// Initial state with "safe" defaults
const INITIAL_SNAPSHOT: MacroSnapshot = {
    asOfET: "",
    marketStatus: {
        market: "closed",
        asOfET: "",
        serverTime: "",
        source: "FALLBACK",
        cacheAgeSec: 0,
        nextOpen: "",
        nextClose: "",
        isHoliday: false,
        session: "closed"
    },
    factors: {
        nasdaq100: { level: null, label: "NASDAQ 100", source: "FAIL", status: "UNAVAILABLE", symbolUsed: "" },
        vix: { level: null, label: "VIX", source: "FAIL", status: "UNAVAILABLE", symbolUsed: "" },
        us10y: { level: null, label: "US10Y", source: "FAIL", status: "UNAVAILABLE", symbolUsed: "" },
        dxy: { level: null, label: "DXY", source: "FAIL", status: "UNAVAILABLE", symbolUsed: "" }
    }
};

export function useMacroSnapshot() {
    const [snapshot, setSnapshot] = useState<MacroSnapshot>(INITIAL_SNAPSHOT);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSnapshot = async () => {
        try {
            const res = await fetch('/api/market/macro', { next: { revalidate: 30 } });
            if (!res.ok) throw new Error('Failed to fetch macro SSOT');
            const data: MacroSnapshot = await res.json();
            setSnapshot(data);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setError((err as Error).message);
            // Keep previous data on error if available
        }
    };

    useEffect(() => {
        fetchSnapshot();
        const interval = setInterval(fetchSnapshot, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    return { snapshot, loading, error };
}
