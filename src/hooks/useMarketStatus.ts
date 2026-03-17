
"use client";

import { useState, useEffect } from "react";
import { MarketStatusResult } from "@/services/marketStatusProvider";

// Compute initial session from client clock to prevent polling freeze on mount
// This is a best-effort estimate; the API will correct it within seconds
function computeInitialSession(): MarketStatusResult {
    const now = new Date();
    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
    const et = new Date(etStr);
    const h = et.getHours();
    const m = et.getMinutes();
    const etMins = h * 60 + m;
    const dow = et.getDay();
    const isWE = dow === 0 || dow === 6;
    let session: 'pre' | 'regular' | 'post' | 'closed' = 'closed';
    let market: 'open' | 'closed' = 'closed';
    if (!isWE) {
        if (etMins >= 240 && etMins < 570) { session = 'pre'; market = 'open'; }
        else if (etMins >= 570 && etMins < 960) { session = 'regular'; market = 'open'; }
        else if (etMins >= 960 && etMins < 1200) { session = 'post'; market = 'open'; }
    }
    return {
        market,
        session,
        isHoliday: false,
        serverTime: now.toISOString(),
        asOfET: '-',
        source: 'FALLBACK',
        cacheAgeSec: 0
    };
}

const INITIAL_STATUS: MarketStatusResult = computeInitialSession();

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
        const interval = setInterval(fetchStatus, 30000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return { status, loading, error };
}
