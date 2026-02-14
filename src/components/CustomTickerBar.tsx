"use client";

import React, { memo, useRef, useEffect, useState } from 'react';
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

/**
 * CustomTickerBar — TradingView-style ticker bar with tick flash
 * 
 * Features:
 * - Real-time market session detection per asset
 * - TradingView-style green/red flash on price change
 * - Pulsing live dot for active markets
 */
export const CustomTickerBar = memo(() => {
    const { snapshot, loading } = useMacroSnapshot();
    const prevValuesRef = useRef<Record<string, { value: number | null; change: number | null }>>({});
    const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({});

    /**
     * isMarketLive — checks if a given market is currently in a live trading session.
     * All times are evaluated in US Eastern Time (ET).
     */
    const isMarketLive = (key: string): boolean => {
        if (key === 'btc') return true;

        const now = new Date();
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
        const et = new Date(etStr);
        const day = et.getDay();
        const h = et.getHours();
        const m = et.getMinutes();
        const timeDecimal = h + m / 60;

        if (key === 'vix' || key === 'spx') {
            if (day === 0 || day === 6) return false;
            return timeDecimal >= 9.5 && timeDecimal < 16.25;
        }

        if (day === 6) return false;
        if (day === 0) return timeDecimal >= 18;
        if (day === 5) return timeDecimal < 17;
        return timeDecimal < 17 || timeDecimal >= 18;
    };

    const items: TickerItem[] = [
        {
            key: 'nq',
            label: 'NASDAQ 100',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100.svg',
            value: snapshot.factors.nasdaq100.level,
            change: snapshot.factors.nasdaq100.chgPct ?? null,
            isLive: snapshot.factors.nasdaq100.status === 'OK' && isMarketLive('nq')
        },
        {
            key: 'spx',
            label: 'S&P 500',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/s-and-p-500.svg',
            value: snapshot.factors.spx.level,
            change: snapshot.factors.spx.chgPct ?? null,
            isLive: snapshot.factors.spx.status === 'OK' && isMarketLive('spx')
        },
        {
            key: 'us10y',
            label: 'US 10Y',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/country/US.svg',
            value: snapshot.factors.us10y.level,
            change: snapshot.factors.us10y.chgPct ?? null,
            isYield: true,
            isLive: snapshot.factors.us10y.status === 'OK' && isMarketLive('us10y')
        },
        {
            key: 'vix',
            label: 'VIX',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/cboe-global-markets.svg',
            value: snapshot.factors.vix.level,
            change: snapshot.factors.vix.chgPct ?? null,
            isLive: snapshot.factors.vix.status === 'OK' && isMarketLive('vix')
        },
        {
            key: 'btc',
            label: 'Bitcoin',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
            value: snapshot.factors.btc.level,
            change: snapshot.factors.btc.chgPct ?? null,
            isLive: snapshot.factors.btc.status === 'OK' && isMarketLive('btc')
        },
        {
            key: 'gold',
            label: 'Gold',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/metal/gold.svg',
            value: snapshot.factors.gold.level,
            change: snapshot.factors.gold.chgPct ?? null,
            isLive: snapshot.factors.gold.status === 'OK' && isMarketLive('gold')
        },
        {
            key: 'oil',
            label: 'Oil',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/crude-oil.svg',
            value: snapshot.factors.oil.level,
            change: snapshot.factors.oil.chgPct ?? null,
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
                // Detect value change (price tick)
                if (item.value !== prev.value) {
                    newFlashes[item.key] = item.value > prev.value ? 'up' : 'down';
                    hasAnyFlash = true;
                }
                // Also detect change% shift (e.g. when price same but % changes due to rounding)
                else if (item.change !== null && prev.change !== null && item.change !== prev.change) {
                    newFlashes[item.key] = item.change > prev.change ? 'up' : 'down';
                    hasAnyFlash = true;
                }
            }
        }

        // Save current values for next comparison
        const snapshot: Record<string, { value: number | null; change: number | null }> = {};
        for (const item of items) {
            snapshot[item.key] = { value: item.value, change: item.change };
        }
        prevValuesRef.current = snapshot;

        if (!hasAnyFlash) return;

        // Apply flash
        setFlashStates(prev => ({ ...prev, ...newFlashes }));

        // Clear flash after 700ms (TradingView-style quick fade)
        const timer = setTimeout(() => {
            setFlashStates(prev => {
                const cleared = { ...prev };
                for (const key of Object.keys(newFlashes)) {
                    cleared[key] = null;
                }
                return cleared;
            });
        }, 700);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot, loading]);

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
                    {[1, 2, 3, 4, 5, 6, 7].map(i => (
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
            {/* Inline CSS for tick-flash keyframes */}
            <style>{`
                @keyframes tickFlashUp {
                    0% { background-color: rgba(8, 153, 129, 0.35); }
                    100% { background-color: transparent; }
                }
                @keyframes tickFlashDown {
                    0% { background-color: rgba(242, 54, 69, 0.35); }
                    100% { background-color: transparent; }
                }
                .tick-flash-up {
                    animation: tickFlashUp 0.7s ease-out forwards;
                }
                .tick-flash-down {
                    animation: tickFlashDown 0.7s ease-out forwards;
                }
            `}</style>
            <div className="h-full flex items-center justify-evenly gap-0">
                {items.map((item, idx) => {
                    const flash = flashStates[item.key];
                    const flashClass = flash === 'up' ? 'tick-flash-up' : flash === 'down' ? 'tick-flash-down' : '';

                    return (
                        <div
                            key={item.key}
                            className={`flex items-center gap-[6px] h-full px-4 transition-colors ${flashClass}`}
                            style={{
                                borderRight: idx < items.length - 1 ? '1px solid #2a2e39' : 'none'
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

                            {/* Value — flash text color briefly */}
                            <span
                                className="tabular-nums shrink-0"
                                style={{
                                    fontSize: '12px',
                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
                                    fontWeight: 400,
                                    color: flash === 'up' ? '#26a69a' : flash === 'down' ? '#ef5350' : '#d1d4dc',
                                    transition: 'color 0.3s ease'
                                }}
                            >
                                {formatValue(item)}
                            </span>

                            {/* Change % */}
                            {item.change !== null && (
                                <span
                                    className="tabular-nums shrink-0"
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
