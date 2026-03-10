// ===========================================================================
// WebSocket Provider — Global real-time data context
// Single WebSocket connection shared across all pages
// Provides live price/GEX/alert updates to any component
// ===========================================================================

'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

// ── Types ──
interface PriceUpdate {
    ticker: string;
    price: number;
    changePct: number;
    volume: number;
    ts: number;
}

interface GexUpdate {
    ticker: string;
    gex: number;
    gammaState: string;
    ts: number;
}

interface AlertUpdate {
    ticker: string;
    type: string;
    message: string;
    ts: number;
}

interface WebSocketContextType {
    connected: boolean;
    prices: Map<string, PriceUpdate>;
    gexData: Map<string, GexUpdate>;
    alerts: AlertUpdate[];
    rlsi: number | null;
    subscribe: (tickers: string[]) => void;
    getPrice: (ticker: string) => PriceUpdate | undefined;
    getGex: (ticker: string) => GexUpdate | undefined;
}

const WebSocketContext = createContext<WebSocketContextType>({
    connected: false,
    prices: new Map(),
    gexData: new Map(),
    alerts: [],
    rlsi: null,
    subscribe: () => { },
    getPrice: () => undefined,
    getGex: () => undefined,
});

// ── Configuration ──
const WS_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://3.236.193.97:8080';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 10;
const MAX_ALERTS = 50;

// ── Provider ──
export function WebSocketProvider({ children }: { children: ReactNode }) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCount = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subscribedTickers = useRef<Set<string>>(new Set());

    const [connected, setConnected] = useState(false);
    const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
    const [gexData, setGexData] = useState<Map<string, GexUpdate>>(new Map());
    const [alerts, setAlerts] = useState<AlertUpdate[]>([]);
    const [rlsi, setRlsi] = useState<number | null>(null);

    const connect = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                reconnectCount.current = 0;

                // Re-subscribe all tickers
                if (subscribedTickers.current.size > 0) {
                    ws.send(JSON.stringify({
                        type: 'subscribe',
                        tickers: [...subscribedTickers.current],
                    }));
                }
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    const now = Date.now();

                    switch (msg.type) {
                        case 'prices':
                            setPrices(prev => {
                                const next = new Map(prev);
                                next.set(msg.ticker, {
                                    ticker: msg.ticker,
                                    price: msg.price || 0,
                                    changePct: msg.changePct || 0,
                                    volume: msg.volume || 0,
                                    ts: now,
                                });
                                return next;
                            });
                            break;

                        case 'gex':
                            setGexData(prev => {
                                const next = new Map(prev);
                                next.set(msg.ticker, {
                                    ticker: msg.ticker,
                                    gex: msg.gex || 0,
                                    gammaState: msg.gammaState || 'NEUTRAL',
                                    ts: now,
                                });
                                return next;
                            });
                            break;

                        case 'alerts':
                            setAlerts(prev => [
                                { ticker: msg.ticker, type: msg.alertType, message: msg.message, ts: now },
                                ...prev.slice(0, MAX_ALERTS - 1),
                            ]);
                            break;

                        case 'rlsi':
                            if (typeof msg.rlsi === 'number') {
                                setRlsi(msg.rlsi);
                            }
                            break;
                    }
                } catch { /* invalid JSON */ }
            };

            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;

                if (reconnectCount.current < MAX_RECONNECT) {
                    const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectCount.current);
                    reconnectCount.current++;
                    reconnectTimer.current = setTimeout(connect, delay);
                }
            };

            ws.onerror = () => ws.close();
        } catch { /* WebSocket not supported */ }
    }, []);

    // Connect on mount
    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    // Subscribe to tickers (additive, deduped)
    const subscribe = useCallback((tickers: string[]) => {
        const newTickers: string[] = [];
        tickers.forEach(t => {
            if (!subscribedTickers.current.has(t)) {
                subscribedTickers.current.add(t);
                newTickers.push(t);
            }
        });

        if (newTickers.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'subscribe', tickers: newTickers }));
        }
    }, []);

    const getPrice = useCallback((ticker: string) => prices.get(ticker), [prices]);
    const getGex = useCallback((ticker: string) => gexData.get(ticker), [gexData]);

    return (
        <WebSocketContext.Provider value={{ connected, prices, gexData, alerts, rlsi, subscribe, getPrice, getGex }}>
            {children}
        </WebSocketContext.Provider>
    );
}

// ── Hook for pages/components ──
export function useRealtimeData(tickers?: string[]) {
    const ctx = useContext(WebSocketContext);

    // Auto-subscribe when tickers are provided
    useEffect(() => {
        if (tickers && tickers.length > 0) {
            ctx.subscribe(tickers);
        }
    }, [tickers?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    return ctx;
}

// Re-export for convenience
export { WebSocketContext };
