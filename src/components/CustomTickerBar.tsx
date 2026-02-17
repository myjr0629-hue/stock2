"use client";

import React, { memo, useRef, useEffect, useState, useCallback } from 'react';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';

interface TickerItem {
    key: string;
    label: string;
    logoUrl: string;
    value: number | null;
    change: number | null;
    isYield?: boolean; // For US10Y — show % suffix on value
    isLive?: boolean; // Show pulsing dot for actively trading assets
}

// ── Symbol map for individual ticker polling ──
const TICKER_SYMBOLS: Record<string, string> = {
    nq: 'NQ=F', spx: 'ES=F', us10y: '^TNX', vix: '^VIX',
    rut: 'RTY=F', btc: 'BTC-USD', gold: 'GC=F', oil: 'CL=F'
};
const TICKER_KEYS = Object.keys(TICKER_SYMBOLS);
const POLL_INTERVAL_MS = 7000; // 7s between each ticker fetch

/**
 * CustomTickerBar — TradingView-style ticker bar with tick flash
 * 
 * Features:
 * - Random-order individual ticker polling (7s intervals)
 * - TradingView-style green/red background flash on price change
 * - Pulsing live dot for active markets
 */
export const CustomTickerBar = memo(() => {
    const { snapshot, loading } = useMacroSnapshot();
    const prevValuesRef = useRef<Record<string, { value: number | null; change: number | null }>>({});
    const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({});
    const [tickerOverrides, setTickerOverrides] = useState<Record<string, { value: number; change: number }>>({});
    const pollQueueRef = useRef<string[]>([]);

    /**
     * isMarketLive — checks if a given market is currently in a live trading session.
     * All times are evaluated in US Eastern Time (ET).
     *
     * Data source → trading hours mapping:
     * - BTC (BTC-USD):    Crypto — 24/7/365
     * - VIX (^VIX):       CBOE extended hours — 3:00 AM–4:15 PM ET weekdays
     * - US10Y (^TNX):     Bond market — 8:00 AM–5:15 PM ET weekdays
     * - NQ (NQ=F):        CME Equity Index futures
     * - SPX (ES=F):       CME Equity Index futures   ← NOT cash index!
     * - RUT (RTY=F):      CME Equity Index futures   ← NOT cash index!
     * - Gold (GC=F):      CME/COMEX futures
     * - Oil (CL=F):       CME/NYMEX futures
     *
     * CME Globex normal hours: Sun 18:00 → Fri 17:00 ET (1hr break 17:00-18:00 Mon-Thu)
     * CME holiday hours: halt early then reopen 18:00 ET
     *   - Equity Index (NQ, ES, RTY): halt 13:00
     *   - Energy (CL): halt 13:00
     *   - Gold (GC/COMEX): halt 13:45
     */
    const isMarketLive = (key: string): boolean => {
        if (key === 'btc') return true; // Crypto: 24/7/365

        const isHoliday = snapshot.marketStatus?.isHoliday || false;

        const now = new Date();
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
        const et = new Date(etStr);
        const day = et.getDay(); // 0=Sun .. 6=Sat
        const h = et.getHours();
        const m = et.getMinutes();
        const timeDecimal = h + m / 60;

        // ── VIX (^VIX) — CBOE extended hours ──
        // CBOE calculates VIX from ~3:00 AM to 4:15 PM ET on trading days.
        if (key === 'vix') {
            if (day === 0 || day === 6) return false;
            if (isHoliday) return timeDecimal >= 3 && timeDecimal < 13; // holiday early close ~1pm
            return timeDecimal >= 3 && timeDecimal < 16.25;
        }

        // ── US10Y (^TNX) — Bond market ──
        // SIFMA bond hours: 8:00 AM – 5:15 PM ET weekdays, fully closed holidays
        if (key === 'us10y') {
            if (isHoliday || day === 0 || day === 6) return false;
            return timeDecimal >= 8 && timeDecimal < 17.25;
        }

        // ── CME Futures (NQ=F, ES=F, RTY=F, GC=F, CL=F) ──
        // All remaining keys: nq, spx, rut, gold, oil → CME Globex hours

        // Holiday schedule: halt early, reopen at 18:00 ET
        if (isHoliday) {
            if (day === 0 || day === 6) return false;
            const haltTime = key === 'gold' ? 13.75 : 13; // Gold 13:45, others 13:00
            return timeDecimal < haltTime || timeDecimal >= 18;
        }

        // Normal CME Globex: Sun 18:00 → Fri 17:00 (1hr daily break 17:00-18:00)
        if (day === 6) return false;                       // Saturday: closed all day
        if (day === 0) return timeDecimal >= 18;           // Sunday: opens 18:00
        if (day === 5) return timeDecimal < 17;            // Friday: closes 17:00
        return timeDecimal < 17 || timeDecimal >= 18;      // Mon-Thu: 1hr break 17-18
    };

    // Helper: use override value if available (from individual polling), else snapshot
    const v = (key: string, snapshotVal: number | null) => tickerOverrides[key]?.value ?? snapshotVal;
    const c = (key: string, snapshotChg: number | null) => tickerOverrides[key]?.change ?? snapshotChg;

    const items: TickerItem[] = [
        {
            key: 'nq',
            label: 'NASDAQ 100',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100.svg',
            value: v('nq', snapshot.factors.nasdaq100.level),
            change: c('nq', snapshot.factors.nasdaq100.chgPct ?? null),
            isLive: snapshot.factors.nasdaq100.status === 'OK' && isMarketLive('nq')
        },
        {
            key: 'spx',
            label: 'S&P 500',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/s-and-p-500.svg',
            value: v('spx', snapshot.factors.spx.level),
            change: c('spx', snapshot.factors.spx.chgPct ?? null),
            isLive: snapshot.factors.spx.status === 'OK' && isMarketLive('spx')
        },
        {
            key: 'us10y',
            label: 'US 10Y',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/country/US.svg',
            value: v('us10y', snapshot.factors.us10y.level),
            change: c('us10y', snapshot.factors.us10y.chgPct ?? null),
            isYield: true,
            isLive: snapshot.factors.us10y.status === 'OK' && isMarketLive('us10y')
        },
        {
            key: 'vix',
            label: 'VIX',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/cboe-global-markets.svg',
            value: v('vix', snapshot.factors.vix.level),
            change: c('vix', snapshot.factors.vix.chgPct ?? null),
            isLive: snapshot.factors.vix.status === 'OK' && isMarketLive('vix')
        },
        {
            key: 'rut',
            label: 'Russell 2K',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/russell-2000.svg',
            value: v('rut', snapshot.factors.rut.level),
            change: c('rut', snapshot.factors.rut.chgPct ?? null),
            isLive: snapshot.factors.rut.status === 'OK' && isMarketLive('rut')
        },
        {
            key: 'btc',
            label: 'Bitcoin',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
            value: v('btc', snapshot.factors.btc.level),
            change: c('btc', snapshot.factors.btc.chgPct ?? null),
            isLive: snapshot.factors.btc.status === 'OK' && isMarketLive('btc')
        },
        {
            key: 'gold',
            label: 'Gold',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/metal/gold.svg',
            value: v('gold', snapshot.factors.gold.level),
            change: c('gold', snapshot.factors.gold.chgPct ?? null),
            isLive: snapshot.factors.gold.status === 'OK' && isMarketLive('gold')
        },
        {
            key: 'oil',
            label: 'Oil',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/crude-oil.svg',
            value: v('oil', snapshot.factors.oil.level),
            change: c('oil', snapshot.factors.oil.chgPct ?? null),
            isLive: snapshot.factors.oil.status === 'OK' && isMarketLive('oil')
        }
    ];

    // ─────── Tick Flash Detection ───────
    // Compare current values with previous render, trigger flash on change
    useEffect(() => {
        if (loading) return;

        const newFlashes: Record<string, 'up' | 'down' | null> = {};
        let hasAnyFlash = false;

        for (const item of items) {
            const prev = prevValuesRef.current[item.key];
            if (prev && item.value !== null && prev.value !== null) {
                if (item.value !== prev.value) {
                    newFlashes[item.key] = item.value > prev.value ? 'up' : 'down';
                    hasAnyFlash = true;
                } else if (item.change !== null && prev.change !== null && item.change !== prev.change) {
                    newFlashes[item.key] = item.change > prev.change ? 'up' : 'down';
                    hasAnyFlash = true;
                }
            }
        }

        // Save current values for next comparison
        const vals: Record<string, { value: number | null; change: number | null }> = {};
        for (const item of items) {
            vals[item.key] = { value: item.value, change: item.change };
        }
        prevValuesRef.current = vals;

        if (!hasAnyFlash) return;

        // Apply flash immediately (individual polling already staggers naturally)
        setFlashStates(prev => ({ ...prev, ...newFlashes }));

        // Clear each flash after 900ms
        const timer = setTimeout(() => {
            setFlashStates(prev => {
                const next = { ...prev };
                for (const key of Object.keys(newFlashes)) next[key] = null;
                return next;
            });
        }, 900);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot, tickerOverrides, loading]);

    // ─────── Random-Order Individual Ticker Polling ───────
    // Polls one ticker every 7s in random order. When the queue is empty,
    // re-shuffles all 8 and starts again. Creates a continuous live-data feel.
    useEffect(() => {
        if (loading) return;

        const fetchNextTicker = async () => {
            // Refill & shuffle when queue is empty
            if (pollQueueRef.current.length === 0) {
                const shuffled = [...TICKER_KEYS];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                pollQueueRef.current = shuffled;
            }

            const key = pollQueueRef.current.shift()!;
            const symbol = TICKER_SYMBOLS[key];

            try {
                const res = await fetch(`/api/market/ticker?s=${encodeURIComponent(symbol)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.price != null) {
                    setTickerOverrides(prev => ({
                        ...prev,
                        [key]: { value: data.price, change: data.changePct }
                    }));
                }
            } catch {
                // Silently skip on error — next cycle will retry
            }
        };

        // Start first fetch after a short delay
        const initialTimer = setTimeout(fetchNextTicker, 2000);
        const interval = setInterval(fetchNextTicker, POLL_INTERVAL_MS);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
        };
    }, [loading]);

    const formatValue = (item: TickerItem): string => {
        if (item.value === null) return '—';
        if (item.isYield) return item.value.toFixed(3) + '%';
        if (item.key === 'btc') return item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatChange = (change: number | null): string => {
        if (change === null) return '';
        const sign = change >= 0 ? '+' : '';
        return `${sign}${change.toFixed(2)}%`;
    };

    if (loading) {
        return (
            <div className="w-full h-[30px] bg-[#131722] flex items-center justify-center">
                <div className="flex items-center gap-10">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-[18px] h-[18px] rounded-full bg-[#2a2e39] animate-pulse" />
                            <div className="w-14 h-3 bg-[#2a2e39] rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-[30px] bg-[#131722] overflow-hidden relative z-40">
            {/* TradingView-style tick flash: background pulse + text color */}
            <style>{`
                @keyframes tvFlashUpBg {
                    0% { background-color: rgba(38,166,154,0.35); }
                    100% { background-color: transparent; }
                }
                @keyframes tvFlashDownBg {
                    0% { background-color: rgba(239,83,80,0.35); }
                    100% { background-color: transparent; }
                }
                @keyframes tvFlashUpText {
                    0% { color: #4aedc4; }
                    50% { color: #26a69a; }
                    100% { color: #d1d4dc; }
                }
                @keyframes tvFlashDownText {
                    0% { color: #ff7b7b; }
                    50% { color: #ef5350; }
                    100% { color: #d1d4dc; }
                }
                @keyframes tvFlashUpPct {
                    0% { color: #4aedc4; }
                    100% { color: #089981; }
                }
                @keyframes tvFlashDownPct {
                    0% { color: #ff7b7b; }
                    100% { color: #f23645; }
                }
                .tv-flash-up-bg {
                    animation: tvFlashUpBg 0.9s ease-out forwards;
                }
                .tv-flash-down-bg {
                    animation: tvFlashDownBg 0.9s ease-out forwards;
                }
                .tv-flash-up-text {
                    animation: tvFlashUpText 0.9s ease-out forwards;
                }
                .tv-flash-down-text {
                    animation: tvFlashDownText 0.9s ease-out forwards;
                }
                .tv-flash-up-pct {
                    animation: tvFlashUpPct 0.9s ease-out forwards;
                }
                .tv-flash-down-pct {
                    animation: tvFlashDownPct 0.9s ease-out forwards;
                }
            `}</style>
            <div className="h-full flex items-center justify-evenly gap-0">
                {items.map((item, idx) => {
                    const flash = flashStates[item.key];

                    return (
                        <div
                            key={item.key}
                            className={`flex items-center gap-[6px] h-full px-4 ${flash === 'up' ? 'tv-flash-up-bg' : flash === 'down' ? 'tv-flash-down-bg' : ''}`}
                            style={{
                                borderRight: idx < items.length - 1 ? '1px solid #2a2e39' : 'none',
                                transition: 'background-color 0.15s'
                            }}
                        >
                            {/* Live Pulse Dot */}
                            {item.isLive && (
                                <span className="relative flex h-[6px] w-[6px] shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-emerald-500" />
                                </span>
                            )}

                            {/* Logo */}
                            <img
                                src={item.logoUrl}
                                alt={item.label}
                                width={18}
                                height={18}
                                className="rounded-full shrink-0"
                                style={{ minWidth: 18 }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />

                            {/* Label */}
                            <span
                                className="shrink-0"
                                style={{
                                    fontSize: '12px',
                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
                                    fontWeight: 700,
                                    color: '#d1d4dc',
                                    letterSpacing: '0.02em'
                                }}
                            >
                                {item.label}
                            </span>

                            {/* Value — TradingView-style text + background flash */}
                            <span
                                className={`tabular-nums shrink-0 ${flash === 'up' ? 'tv-flash-up-text' : flash === 'down' ? 'tv-flash-down-text' : ''}`}
                                style={{
                                    fontSize: '12px',
                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
                                    fontWeight: 400,
                                    color: '#d1d4dc'
                                }}
                            >
                                {formatValue(item)}
                            </span>

                            {/* Change % — brighter flash then settle to base color */}
                            {item.change !== null && (
                                <span
                                    className={`tabular-nums shrink-0 ${flash === 'up' ? 'tv-flash-up-pct' : flash === 'down' ? 'tv-flash-down-pct' : ''}`}
                                    style={{
                                        fontSize: '12px',
                                        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
                                        fontWeight: 400,
                                        color: item.change >= 0 ? '#089981' : '#f23645'
                                    }}
                                >
                                    {formatChange(item.change)}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

CustomTickerBar.displayName = 'CustomTickerBar';

export default CustomTickerBar;
