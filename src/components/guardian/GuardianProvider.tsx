"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Re-using types from unifiedDataStream (or similar shape)
// We might want to import them if they are shared, or define flexible types here.

interface RLSIResult {
    score: number;
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    components: any;
    timestamp: string;
}

interface GuardianContextType {
    data: any | null; // Full snapshot
    rlsi: RLSIResult | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    verdict: any;
    refresh: (force?: boolean) => void;
    loading: boolean;
}

const GuardianContext = createContext<GuardianContextType>({
    data: null,
    rlsi: null,
    marketStatus: 'WAIT', // Default safety
    verdict: null,
    refresh: () => { },
    loading: false,
});

export function GuardianProvider({ children }: { children: React.ReactNode }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const pathname = usePathname();

    // Extract locale from pathname (e.g., /en/intel-guardian -> 'en')
    const locale = pathname?.split('/')[1] || 'ko';
    const validLocale = ['ko', 'en', 'ja'].includes(locale) ? locale : 'ko';

    const refresh = async (force: boolean = false) => {
        // Only show loading spinner on initial load or forced refresh
        // Background polling updates data silently without flicker
        if (!data || force) {
            setLoading(true);
        }
        try {
            // Using existing API endpoint with locale
            const res = await fetch(`/api/debug/guardian?force=${force}&locale=${validLocale}`);
            const json = await res.json();
            if (json.success && json.data) {
                setData(json.data);
            }
        } catch (err) {
            console.error("GuardianProvider fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // Poll every 60s
        const interval = setInterval(refresh, 60000);
        return () => clearInterval(interval);
    }, [validLocale]); // Re-fetch when locale changes

    const value = {
        data,
        rlsi: data?.rlsi || null,
        marketStatus: data?.marketStatus || 'WAIT',
        verdict: data?.verdict || null,
        refresh,
        loading
    };

    return (
        <GuardianContext.Provider value={value}>
            {children}
        </GuardianContext.Provider>
    );
}

export const useGuardian = () => useContext(GuardianContext);
