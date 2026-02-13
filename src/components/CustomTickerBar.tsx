"use client";

import React, { memo } from 'react';
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
 * CustomTickerBar — TradingView-style static ticker bar
 * 
 * Displays US 10Y, S&P 500, Bitcoin, Gold with real logos.
 * Data from Yahoo Finance via /api/market/macro (Redis-cached).
 * Replaces TradingView embed — same container size (30px height).
 */
export const CustomTickerBar = memo(() => {
    const { snapshot, loading } = useMacroSnapshot();

    // Assets that trade outside regular US hours (futures + crypto)
    const ALWAYS_LIVE_KEYS = new Set(['nq', 'btc', 'gold', 'oil']);

    const items: TickerItem[] = [
        {
            key: 'nq',
            label: 'NASDAQ 100',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/nasdaq-100.svg',
            value: snapshot.factors.nasdaq100.level,
            change: snapshot.factors.nasdaq100.chgPct ?? null,
            isLive: snapshot.factors.nasdaq100.status === 'OK' && ALWAYS_LIVE_KEYS.has('nq')
        },
        {
            key: 'spx',
            label: 'S&P 500',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/indices/s-and-p-500.svg',
            value: snapshot.factors.spx.level,
            change: snapshot.factors.spx.chgPct ?? null,
            isLive: snapshot.factors.spx.status === 'OK' && ALWAYS_LIVE_KEYS.has('spx')
        },
        {
            key: 'us10y',
            label: 'US 10Y',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/country/US.svg',
            value: snapshot.factors.us10y.level,
            change: snapshot.factors.us10y.chgPct ?? null,
            isYield: true,
            isLive: snapshot.factors.us10y.status === 'OK' && ALWAYS_LIVE_KEYS.has('us10y')
        },
        {
            key: 'vix',
            label: 'VIX',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/cboe-global-markets.svg',
            value: snapshot.factors.vix.level,
            change: snapshot.factors.vix.chgPct ?? null,
            isLive: snapshot.factors.vix.status === 'OK' && ALWAYS_LIVE_KEYS.has('vix')
        },
        {
            key: 'btc',
            label: 'Bitcoin',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg',
            value: snapshot.factors.btc.level,
            change: snapshot.factors.btc.chgPct ?? null,
            isLive: snapshot.factors.btc.status === 'OK' && ALWAYS_LIVE_KEYS.has('btc')
        },
        {
            key: 'gold',
            label: 'Gold',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/metal/gold.svg',
            value: snapshot.factors.gold.level,
            change: snapshot.factors.gold.chgPct ?? null,
            isLive: snapshot.factors.gold.status === 'OK' && ALWAYS_LIVE_KEYS.has('gold')
        },
        {
            key: 'oil',
            label: 'Oil',
            logoUrl: 'https://s3-symbol-logo.tradingview.com/crude-oil.svg',
            value: snapshot.factors.oil.level,
            change: snapshot.factors.oil.chgPct ?? null,
            isLive: snapshot.factors.oil.status === 'OK' && ALWAYS_LIVE_KEYS.has('oil')
        }
    ];

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
            <div className="h-full flex items-center justify-evenly gap-0">
                {items.map((item, idx) => (
                    <div
                        key={item.key}
                        className="flex items-center gap-[6px] h-full px-4"
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
                                // Fallback: hide broken image
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

                        {/* Value */}
                        <span
                            className="tabular-nums shrink-0"
                            style={{
                                fontSize: '12px',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
                                fontWeight: 400,
                                color: '#d1d4dc'
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
                ))}
            </div>
        </div>
    );
});

CustomTickerBar.displayName = 'CustomTickerBar';

export default CustomTickerBar;
