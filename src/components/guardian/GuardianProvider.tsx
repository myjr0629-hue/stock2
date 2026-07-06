"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useMarketStatus } from '@/hooks/useMarketStatus';

// ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═
// TYPES
// ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═

interface RLSIResult {
    score: number;
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    components: any;
    timestamp: string;
}

interface GuardianAlert {
    id: string;
    severity: 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO';
    title: string;
    description: string;
    metrics: Record<string, number>;
    color: string;
    timestamp?: string;
}

interface GuardianContextType {
    data: any | null;
    rlsi: RLSIResult | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    verdict: any;
    alerts: GuardianAlert[];
    refresh: (force?: boolean) => void;
    loading: boolean;
    connectionMode: 'websocket' | 'polling' | 'connecting';
}

const GuardianContext = createContext<GuardianContextType>({
    data: null,
    rlsi: null,
    marketStatus: 'WAIT',
    verdict: null,
    alerts: [],
    refresh: () => { },
    loading: false,
    connectionMode: 'connecting',
});

// ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═
// EC2 WEBSOCKET HUB URL
// ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═

// [FIX] Force domain URL — raw IP in env causes SSL mismatch via Cloudflare
const WS_HUB_URL = 'wss://ws.signumhq.com/guardian';

// ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═
// PROVIDER
// ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═

export function GuardianProvider({ children }: { children: React.ReactNode }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState<GuardianAlert[]>([]);
    const [connectionMode, setConnectionMode] = useState<'websocket' | 'polling' | 'connecting'>('connecting');
    const pathname = usePathname();
    const { status: mktStatus } = useMarketStatus();
    const prevSessionRef = useRef<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pingTimerRef = useRef<NodeJS.Timeout | null>(null);

    const locale = pathname?.split('/')[1] || 'ko';
    const validLocale = ['ko', 'en', 'ja'].includes(locale) ? locale : 'ko';

    // ?�?� Helper: Merge snapshot preserving AI verdict ?�?�
    const mergeSnapshot = useCallback((newData: any) => {
        setData((prev: any) => {
            if (newData.verdict && !newData.verdict.realityInsight && prev?.verdict?.realityInsight) {
                newData.verdict.realityInsight = prev.verdict.realityInsight;
                newData.verdict.title = prev.verdict.title || newData.verdict.title;
                newData.verdict.description = prev.verdict.description || newData.verdict.description;
            }
            // [MAP FLAP FIX] The 30s poll / WS snapshots sometimes deliver a DEGRADED
            // payload with no sectors (verified live: /api/debug/guardian returning
            // success:true with sectors:0, verdictTargetId:null). Wholesale replacement
            // then wiped the Flow Topography Map bubbles + Sector Intel until the next
            // good snapshot — the intermittent appear/disappear seen on web AND app.
            // A degraded payload must never erase good sector data we already have.
            if ((!Array.isArray(newData.sectors) || newData.sectors.length === 0) && prev?.sectors?.length) {
                newData.sectors = prev.sectors;
            }
            if (!newData.verdictTargetId && prev?.verdictTargetId) {
                newData.verdictTargetId = prev.verdictTargetId;
            }
            return newData;
        });
        setLoading(false);
    }, []);

    // ?�?� Polling Refresh (fallback) ?�?�
    const refresh = useCallback(async (force: boolean = false) => {
        if (!data || force) setLoading(true);
        try {
            const res = await fetch(`/api/debug/guardian?force=${force}&locale=${validLocale}`);
            const json = await res.json();
            if (json.success && json.data) {
                mergeSnapshot(json.data);
            }
        } catch (err) {
            console.error("[Guardian] Fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [data, validLocale, mergeSnapshot]);

    // ?�?� WebSocket Connection ?�?�
    const connectWebSocket = useCallback(() => {
        // Don't reconnect if already connected
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const url = `${WS_HUB_URL}?locale=${validLocale}`;
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[Guardian] ?�� WebSocket connected');
                setConnectionMode('websocket');
                // Start ping keepalive
                pingTimerRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 30000);
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    if (msg.type === 'initial_snapshot' && msg.data) {
                        console.log('[Guardian] ?�� Received initial snapshot via WebSocket');
                        mergeSnapshot(msg.data);
                    }

                    if (msg.type === 'snapshot_update' && msg.data) {
                        console.log('[Guardian] ?�� Received real-time update via WebSocket');
                        mergeSnapshot(msg.data);
                    }

                    if (msg.type === 'alert' && msg.data) {
                        console.log('[Guardian] ?�� Alert:', msg.data.title);
                        setAlerts(prev => {
                            // Deduplicate by alert ID, keep max 5
                            const filtered = prev.filter(a => a.id !== msg.data.id);
                            return [{ ...msg.data, timestamp: msg.timestamp }, ...filtered].slice(0, 5);
                        });
                    }

                    if (msg.type === 'alerts' && msg.data) {
                        // Batch alerts from initial connection
                        setAlerts(msg.data.slice(0, 5));
                    }

                    if (msg.type === 'pong') {
                        // Keepalive acknowledged
                    }
                } catch (e) {
                    console.warn('[Guardian] WS message parse error:', e);
                }
            };

            ws.onclose = (e) => {
                console.log(`[Guardian] WebSocket closed (code: ${e.code})`);
                wsRef.current = null;
                if (pingTimerRef.current) clearInterval(pingTimerRef.current);

                // Fallback to polling mode
                setConnectionMode('polling');

                // Attempt reconnect after 10 seconds
                reconnectTimerRef.current = setTimeout(() => {
                    console.log('[Guardian] Attempting WebSocket reconnect...');
                    connectWebSocket();
                }, 10000);
            };

            ws.onerror = (e) => {
                console.warn('[Guardian] WebSocket error ??will fallback to polling');
                // onclose will fire after onerror
            };

        } catch (e) {
            console.warn('[Guardian] WebSocket init failed ??using polling');
            setConnectionMode('polling');
        }
    }, [validLocale, mergeSnapshot]);

    // ?�?� Lifecycle: Connect WebSocket, fallback to polling ?�?�
    useEffect(() => {
        // First: immediate API fetch for fast initial load
        refresh();

        // Then: try WebSocket connection for real-time updates
        const wsTimer = setTimeout(() => connectWebSocket(), 1000);

        return () => {
            clearTimeout(wsTimer);
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        };
    }, [validLocale]);

    // ?�?� Auto-refresh on market session change ?�?�
    useEffect(() => {
        const currentSession = mktStatus.session;
        const prevSession = prevSessionRef.current;

        if (prevSession !== null && prevSession !== 'regular' && currentSession === 'regular') {
            console.log('[Guardian] Market session changed to REG ??auto-refreshing');
            refresh(true);
        }
        prevSessionRef.current = currentSession;
    }, [mktStatus.session]);

    // 🔄 Auto-Refresh — 30s polling for all sessions 🔄
    // Guarantees real-time data freshness regardless of WebSocket status
    useEffect(() => {
        const intervalMs = 30 * 1000; // 30s for ALL sessions
        const session = data?.rlsi?.session || 'INIT';
        console.log(`[Guardian] Auto-refresh active: ${session} → 30s interval`);
        
        const interval = setInterval(() => {
            refresh();
        }, intervalMs);

        return () => clearInterval(interval);
    }, [data?.rlsi?.session, validLocale]);

    const value = useMemo(() => ({
        data,
        rlsi: data?.rlsi || null,
        marketStatus: data?.marketStatus || 'WAIT',
        verdict: data?.verdict || null,
        alerts,
        refresh,
        loading,
        connectionMode,
    }), [data, loading, alerts, connectionMode]);

    return (
        <GuardianContext.Provider value={value}>
            {children}
        </GuardianContext.Provider>
    );
}

export const useGuardian = () => useContext(GuardianContext);
