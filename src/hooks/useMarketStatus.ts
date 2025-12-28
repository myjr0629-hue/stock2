
"use client";

import { useState, useEffect } from "react";
import { MarketStatusResult } from "@/services/marketStatusProvider";

// Define a safe initial state to prevent hydration mismatches
const INITIAL_STATUS: MarketStatusResult = {
    market: "closed",
    session: "closed",
    isHoliday: false,
    serverTime: new Date().toISOString(),
    asOfET: "-",
    source: "FALLBACK",
    cacheAgeSec: 0
};

export function useMarketStatus() {
    const [status, setStatus] = useState<MarketStatusResult>(INITIAL_STATUS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchStatus = async () => {
            try {
                // Determine base URL properly
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const res = await fetch(`${baseUrl}/api/market/status`, {
                    next: { revalidate: 30 } // Client-side hint
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();

                if (isMounted) {
                    setStatus(data);
                    setLoading(false);
                    setError(null);
                }
            } catch (err: any) {
                if (isMounted) {
                    console.error("[useMarketStatus] Poll failed:", err);
                    setError(err.message);
                    setLoading(false);
                    // Keep previous status on error to prevent UI flicker
                }
            }
        };

        // Initial Fetch
        fetchStatus();

        // Poll every 60s (matches server cache)
        const interval = setInterval(fetchStatus, 60000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return { status, loading, error };
}
