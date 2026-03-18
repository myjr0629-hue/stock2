// ===========================================================================
// WebSocket Provider — Global real-time data context
// TWO WebSocket connections:
//   1. Guardian WS: RLSI / GEX / Alerts (wss://ws.signumhq.com/guardian)
//   2. Price WS:    Live stock prices   (wss://ws.signumhq.com)
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

interface QuoteUpdate {
    ticker: string;
    bid: number;
    bidSize: number;
    ask: number;
    askSize: number;
    spread: number;
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
    connected: boolean;           // Price WS connected
    guardianConnected: boolean;   // Guardian WS connected
    prices: Map<string, PriceUpdate>;
    quotes: Map<string, QuoteUpdate>;
    gexData: Map<string, GexUpdate>;
    alerts: AlertUpdate[];
    rlsi: number | null;
    subscribe: (tickers: string[]) => void;
    getPrice: (ticker: string) => PriceUpdate | undefined;
    getQuote: (ticker: string) => QuoteUpdate | undefined;
    getGex: (ticker: string) => GexUpdate | undefined;
}

const WebSocketContext = createContext<WebSocketContextType>({
    connected: false,
    guardianConnected: false,
    prices: new Map(),
    quotes: new Map(),
    gexData: new Map(),
    alerts: [],
    rlsi: null,
    subscribe: () => { },
    getPrice: () => undefined,
    getQuote: () => undefined,
    getGex: () => undefined,
});

// ── Configuration ──
const PRICE_WS_URL = 'wss://ws.signumhq.com';           // Root path → price-ws (port 8084)
const GUARDIAN_WS_URL = 'wss://ws.signumhq.com/guardian'; // /guardian → guardian-ws (port 8082)
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT = 10;
const MAX_ALERTS = 50;

// ── Provider ──
export function WebSocketProvider({ children }: { children: ReactNode }) {
    // Price WS refs
    const priceWsRef = useRef<WebSocket | null>(null);
    const priceReconnectCount = useRef(0);
    const priceReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subscribedTickers = useRef<Set<string>>(new Set());

    // Guardian WS refs
    const guardianWsRef = useRef<WebSocket | null>(null);
    const guardianReconnectCount = useRef(0);
    const guardianReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Shared state
    const [connected, setConnected] = useState(false);
    const [guardianConnected, setGuardianConnected] = useState(false);
    const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
    const [quotes, setQuotes] = useState<Map<string, QuoteUpdate>>(new Map());
    const [gexData, setGexData] = useState<Map<string, GexUpdate>>(new Map());
    const [alerts, setAlerts] = useState<AlertUpdate[]>([]);
    const [rlsi, setRlsi] = useState<number | null>(null);

    // ═══════════════════════════════════════════════════════════
    // PRICE WEBSOCKET — Real-time stock prices via Polygon
    // ═══════════════════════════════════════════════════════════
    const connectPriceWs = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (priceWsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(PRICE_WS_URL);
            priceWsRef.current = ws;

            ws.onopen = () => {
                console.log('[WS] ✅ Price WebSocket connected');
                setConnected(true);
                priceReconnectCount.current = 0;

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

                    if (msg.type === 'prices') {
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
                    }

                    if (msg.type === 'quote') {
                        setQuotes(prev => {
                            const next = new Map(prev);
                            next.set(msg.ticker, {
                                ticker: msg.ticker,
                                bid: msg.bid || 0,
                                bidSize: msg.bidSize || 0,
                                ask: msg.ask || 0,
                                askSize: msg.askSize || 0,
                                spread: msg.spread || 0,
                                ts: now,
                            });
                            return next;
                        });
                    }
                } catch { /* invalid JSON */ }
            };

            ws.onclose = () => {
                setConnected(false);
                priceWsRef.current = null;

                if (priceReconnectCount.current < MAX_RECONNECT) {
                    const delay = RECONNECT_DELAY * Math.pow(1.5, priceReconnectCount.current);
                    priceReconnectCount.current++;
                    priceReconnectTimer.current = setTimeout(connectPriceWs, delay);
                }
            };

            ws.onerror = () => ws.close();
        } catch { /* WebSocket not supported */ }
    }, []);

    // ═══════════════════════════════════════════════════════════
    // GUARDIAN WEBSOCKET — RLSI / GEX / Alerts
    // ═══════════════════════════════════════════════════════════
    const connectGuardianWs = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (guardianWsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(GUARDIAN_WS_URL);
            guardianWsRef.current = ws;

            ws.onopen = () => {
                console.log('[WS] ✅ Guardian WebSocket connected');
                setGuardianConnected(true);
                guardianReconnectCount.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    const now = Date.now();

                    switch (msg.type) {
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

                        // Guardian WS might also send prices for guardian-specific tickers
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
                    }
                } catch { /* invalid JSON */ }
            };

            ws.onclose = () => {
                setGuardianConnected(false);
                guardianWsRef.current = null;

                if (guardianReconnectCount.current < MAX_RECONNECT) {
                    const delay = RECONNECT_DELAY * Math.pow(1.5, guardianReconnectCount.current);
                    guardianReconnectCount.current++;
                    guardianReconnectTimer.current = setTimeout(connectGuardianWs, delay);
                }
            };

            ws.onerror = () => ws.close();
        } catch { /* WebSocket not supported */ }
    }, []);

    // Connect both on mount
    useEffect(() => {
        connectPriceWs();
        connectGuardianWs();
        return () => {
            if (priceReconnectTimer.current) clearTimeout(priceReconnectTimer.current);
            if (guardianReconnectTimer.current) clearTimeout(guardianReconnectTimer.current);
            if (priceWsRef.current) { priceWsRef.current.close(); priceWsRef.current = null; }
            if (guardianWsRef.current) { guardianWsRef.current.close(); guardianWsRef.current = null; }
        };
    }, [connectPriceWs, connectGuardianWs]);

    // Subscribe to tickers on Price WS (additive, deduped)
    const subscribe = useCallback((tickers: string[]) => {
        const newTickers: string[] = [];
        tickers.forEach(t => {
            if (!subscribedTickers.current.has(t)) {
                subscribedTickers.current.add(t);
                newTickers.push(t);
            }
        });

        if (newTickers.length > 0 && priceWsRef.current?.readyState === WebSocket.OPEN) {
            priceWsRef.current.send(JSON.stringify({ type: 'subscribe', tickers: newTickers }));
        }
    }, []);

    const getPrice = useCallback((ticker: string) => prices.get(ticker), [prices]);
    const getQuote = useCallback((ticker: string) => quotes.get(ticker), [quotes]);
    const getGex = useCallback((ticker: string) => gexData.get(ticker), [gexData]);

    return (
        <WebSocketContext.Provider value={{
            connected, guardianConnected, prices, quotes, gexData, alerts, rlsi,
            subscribe, getPrice, getQuote, getGex
        }}>
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
