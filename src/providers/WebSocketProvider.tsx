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

interface OptionsTradeUpdate {
    contract: string;
    underlying: string;
    expiry: string;
    strike: number;
    optionType: string; // 'C' or 'P'
    price: number;
    size: number;
    premium: number;
    tradeType: string; // 'NORMAL', 'SWEEP', 'BLOCK'
    ts: number;
}

interface OptionsQuoteUpdate {
    contract: string;
    underlying: string;
    expiry: string;
    strike: number;
    optionType: string;
    bid: number;
    ask: number;
    mid: number;
    spread: number;
    iv: number | null;    // decimal e.g. 0.3542
    ivPct: number | null; // percentage e.g. 35.42
    ts: number;
}

interface LuldUpdate {
    ticker: string;
    upperLimit: number;
    lowerLimit: number;
    indicator: number;
    ts: number;
}

interface WebSocketContextType {
    connected: boolean;
    guardianConnected: boolean;
    prices: Map<string, PriceUpdate>;
    quotes: Map<string, QuoteUpdate>;
    optionsTrades: OptionsTradeUpdate[];
    optionsQuotes: Map<string, OptionsQuoteUpdate>;
    luldEvents: LuldUpdate[];
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
    optionsTrades: [],
    optionsQuotes: new Map(),
    luldEvents: [],
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
const MAX_OPTIONS_TRADES = 100;
const MAX_LULD_EVENTS = 20;

// [FIX] Check if market is active (PRE 4AM - POST 8PM ET, weekdays only)
// Prevents WS reconnection loops during off-market hours that cause:
// setConnected(true→false) toggle → useLivePrice re-evaluate → activeExtPrice flicker → chart re-render
function isMarketActive(): boolean {
    try {
        const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
        const et = new Date(etStr);
        const dow = et.getDay();
        if (dow === 0 || dow === 6) return false; // Weekend
        const mins = et.getHours() * 60 + et.getMinutes();
        return mins >= 240 && mins < 1200; // 4:00 AM - 8:00 PM ET (covers PRE+REG+POST)
    } catch { return true; } // Fail-open: allow connection if timezone check fails
}

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
    const [optionsTrades, setOptionsTrades] = useState<OptionsTradeUpdate[]>([]);
    const [optionsQuotes, setOptionsQuotes] = useState<Map<string, OptionsQuoteUpdate>>(new Map());
    const [luldEvents, setLuldEvents] = useState<LuldUpdate[]>([]);
    const [gexData, setGexData] = useState<Map<string, GexUpdate>>(new Map());
    const [alerts, setAlerts] = useState<AlertUpdate[]>([]);
    const [rlsi, setRlsi] = useState<number | null>(null);

    // ═══════════════════════════════════════════════════════════
    // LOSSLESS COALESCING — every WS message is applied to a working-copy
    // ref immediately (zero data loss / full accuracy), but React state is
    // committed at most once per FLUSH_MS. Without this, the firehose of
    // option trades/quotes re-rendered every consumer (incl. the huge Flow
    // page) on EVERY message — thousands of renders that saturated the main
    // thread and made taps unreliable on iOS WKWebView. 10Hz is visually
    // real-time; the underlying numbers committed are exact.
    // ═══════════════════════════════════════════════════════════
    const FLUSH_MS = 100;
    const pricesRef = useRef<Map<string, PriceUpdate>>(new Map());
    const quotesRef = useRef<Map<string, QuoteUpdate>>(new Map());
    const optionsTradesRef = useRef<OptionsTradeUpdate[]>([]);
    const optionsQuotesRef = useRef<Map<string, OptionsQuoteUpdate>>(new Map());
    const luldRef = useRef<LuldUpdate[]>([]);
    const gexRef = useRef<Map<string, GexUpdate>>(new Map());
    const alertsRef = useRef<AlertUpdate[]>([]);
    const rlsiRef = useRef<number | null>(null);
    const dirtyRef = useRef<Set<string>>(new Set());
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleFlush = useCallback(() => {
        if (flushTimerRef.current) return; // a flush is already pending
        flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            const d = dirtyRef.current;
            dirtyRef.current = new Set();
            // Commit a fresh immutable snapshot of each dirtied stream — exactly
            // the same values the per-message setState would have produced.
            if (d.has('prices')) setPrices(new Map(pricesRef.current));
            if (d.has('quotes')) setQuotes(new Map(quotesRef.current));
            if (d.has('optionsTrades')) setOptionsTrades(optionsTradesRef.current.slice());
            if (d.has('optionsQuotes')) setOptionsQuotes(new Map(optionsQuotesRef.current));
            if (d.has('luld')) setLuldEvents(luldRef.current.slice());
            if (d.has('gex')) setGexData(new Map(gexRef.current));
            if (d.has('alerts')) setAlerts(alertsRef.current.slice());
            if (d.has('rlsi')) setRlsi(rlsiRef.current);
        }, FLUSH_MS);
    }, []);

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
                        pricesRef.current.set(msg.ticker, {
                            ticker: msg.ticker,
                            price: msg.price || 0,
                            changePct: msg.changePct || 0,
                            volume: msg.volume || 0,
                            ts: now,
                        });
                        dirtyRef.current.add('prices');
                        scheduleFlush();
                    }

                    if (msg.type === 'quote') {
                        quotesRef.current.set(msg.ticker, {
                            ticker: msg.ticker,
                            bid: msg.bid || 0,
                            bidSize: msg.bidSize || 0,
                            ask: msg.ask || 0,
                            askSize: msg.askSize || 0,
                            spread: msg.spread || 0,
                            ts: now,
                        });
                        dirtyRef.current.add('quotes');
                        scheduleFlush();
                    }

                    if (msg.type === 'optionsTrade') {
                        optionsTradesRef.current = [
                            {
                                contract: msg.contract,
                                underlying: msg.underlying,
                                expiry: msg.expiry,
                                strike: msg.strike,
                                optionType: msg.optionType,
                                price: msg.price,
                                size: msg.size,
                                premium: msg.premium,
                                tradeType: msg.tradeType,
                                ts: now,
                            },
                            ...optionsTradesRef.current.slice(0, MAX_OPTIONS_TRADES - 1),
                        ];
                        dirtyRef.current.add('optionsTrades');
                        scheduleFlush();
                    }

                    if (msg.type === 'optionsQuote') {
                        optionsQuotesRef.current.set(msg.contract, {
                            contract: msg.contract,
                            underlying: msg.underlying,
                            expiry: msg.expiry,
                            strike: msg.strike,
                            optionType: msg.optionType,
                            bid: msg.bid || 0,
                            ask: msg.ask || 0,
                            mid: msg.mid || 0,
                            spread: msg.spread || 0,
                            iv: msg.iv,
                            ivPct: msg.ivPct,
                            ts: now,
                        });
                        dirtyRef.current.add('optionsQuotes');
                        scheduleFlush();
                    }

                    if (msg.type === 'luld') {
                        luldRef.current = [
                            {
                                ticker: msg.ticker,
                                upperLimit: msg.upperLimit,
                                lowerLimit: msg.lowerLimit,
                                indicator: msg.indicator,
                                ts: msg.ts || now,
                            },
                            ...luldRef.current.slice(0, MAX_LULD_EVENTS - 1),
                        ];
                        dirtyRef.current.add('luld');
                        scheduleFlush();
                    }
                } catch { /* invalid JSON */ }
            };

            ws.onclose = () => {
                setConnected(false);
                priceWsRef.current = null;

                // [FIX] Don't reconnect during off-market hours (prevents state toggle → chart flicker)
                if (!isMarketActive()) return;
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
                            gexRef.current.set(msg.ticker, {
                                ticker: msg.ticker,
                                gex: msg.gex || 0,
                                gammaState: msg.gammaState || 'NEUTRAL',
                                ts: now,
                            });
                            dirtyRef.current.add('gex');
                            scheduleFlush();
                            break;

                        case 'alerts':
                            alertsRef.current = [
                                { ticker: msg.ticker, type: msg.alertType, message: msg.message, ts: now },
                                ...alertsRef.current.slice(0, MAX_ALERTS - 1),
                            ];
                            dirtyRef.current.add('alerts');
                            scheduleFlush();
                            break;

                        case 'rlsi':
                            if (typeof msg.rlsi === 'number') {
                                rlsiRef.current = msg.rlsi;
                                dirtyRef.current.add('rlsi');
                                scheduleFlush();
                            }
                            break;

                        // Guardian WS might also send prices for guardian-specific tickers
                        case 'prices':
                            pricesRef.current.set(msg.ticker, {
                                ticker: msg.ticker,
                                price: msg.price || 0,
                                changePct: msg.changePct || 0,
                                volume: msg.volume || 0,
                                ts: now,
                            });
                            dirtyRef.current.add('prices');
                            scheduleFlush();
                            break;
                    }
                } catch { /* invalid JSON */ }
            };

            ws.onclose = () => {
                setGuardianConnected(false);
                guardianWsRef.current = null;

                // [FIX] Don't reconnect during off-market hours (prevents state toggle → chart flicker)
                if (!isMarketActive()) return;
                if (guardianReconnectCount.current < MAX_RECONNECT) {
                    const delay = RECONNECT_DELAY * Math.pow(1.5, guardianReconnectCount.current);
                    guardianReconnectCount.current++;
                    guardianReconnectTimer.current = setTimeout(connectGuardianWs, delay);
                }
            };

            ws.onerror = () => ws.close();
        } catch { /* WebSocket not supported */ }
    }, []);

    // Connect both on mount (only during market hours)
    useEffect(() => {
        // [FIX] Skip initial WS connection during off-market hours
        // Periodically recheck so WS auto-connects when market opens
        if (isMarketActive()) {
            connectPriceWs();
            connectGuardianWs();
        }
        const marketCheckInterval = setInterval(() => {
            if (isMarketActive() && !priceWsRef.current) connectPriceWs();
            if (isMarketActive() && !guardianWsRef.current) connectGuardianWs();
        }, 60000); // Check every 60s if market has opened
        return () => {
            clearInterval(marketCheckInterval);
            if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
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
            connected, guardianConnected, prices, quotes,
            optionsTrades, optionsQuotes, luldEvents,
            gexData, alerts, rlsi,
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
