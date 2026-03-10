// ===========================================================================
// useWebSocket — Real-time data hook via EC2 WebSocket Hub
// Subscribes to ticker-specific price/GEX/alert updates via ElastiCache Pub/Sub
// ===========================================================================

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface WebSocketMessage {
    type: 'prices' | 'gex' | 'alerts' | 'subscribed';
    ticker?: string;
    [key: string]: any;
}

interface UseWebSocketOptions {
    tickers: string[];
    enabled?: boolean;
    onPrice?: (data: { ticker: string; price: number; changePct: number; volume: number }) => void;
    onGex?: (data: { ticker: string; gex: number; gammaState: string }) => void;
    onAlert?: (data: { ticker: string; type: string; message: string }) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://3.236.193.97:8080';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket({ tickers, enabled = true, onPrice, onGex, onAlert }: UseWebSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttempts = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [connected, setConnected] = useState(false);

    const connect = useCallback(() => {
        if (!enabled || tickers.length === 0) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                reconnectAttempts.current = 0;

                // Subscribe to tickers
                ws.send(JSON.stringify({ type: 'subscribe', tickers }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg: WebSocketMessage = JSON.parse(event.data);

                    switch (msg.type) {
                        case 'prices':
                            onPrice?.({
                                ticker: msg.ticker || '',
                                price: msg.price || 0,
                                changePct: msg.changePct || 0,
                                volume: msg.volume || 0,
                            });
                            break;
                        case 'gex':
                            onGex?.({
                                ticker: msg.ticker || '',
                                gex: msg.gex || 0,
                                gammaState: msg.gammaState || 'NEUTRAL',
                            });
                            break;
                        case 'alerts':
                            onAlert?.({
                                ticker: msg.ticker || '',
                                type: msg.alertType || 'INFO',
                                message: msg.message || '',
                            });
                            break;
                    }
                } catch { /* invalid JSON */ }
            };

            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;

                // Auto-reconnect with backoff
                if (enabled && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
                    const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current);
                    reconnectAttempts.current++;
                    reconnectTimer.current = setTimeout(connect, delay);
                }
            };

            ws.onerror = () => {
                ws.close();
            };
        } catch {
            // WebSocket construction failed
        }
    }, [enabled, tickers, onPrice, onGex, onAlert]);

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

    // Re-subscribe when tickers change
    useEffect(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN && tickers.length > 0) {
            wsRef.current.send(JSON.stringify({ type: 'subscribe', tickers }));
        }
    }, [tickers]);

    return { connected };
}
