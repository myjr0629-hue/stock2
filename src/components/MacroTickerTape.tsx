"use client";

import React, { useEffect, useState, memo } from 'react';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';

interface MacroItem {
    label: string;
    value: number | null;
    change: number | null;
    source: 'ENGINE' | 'TRADINGVIEW';
}

/**
 * MacroTickerTape - Hybrid Ticker Component
 * 
 * Displays macro indicators with ENGINE data for VIX/DXY (accurate synthetic values)
 * and TradingView embed for NQ/SPX/BTC (which are already accurate).
 * 
 * This solves the problem where TradingView shows raw ETF prices (VIXY $25, UUP $27)
 * instead of actual index levels (VIX ~15, DXY ~99).
 */
export const MacroTickerTape = memo(() => {
    const { snapshot, loading } = useMacroSnapshot();
    const [items, setItems] = useState<MacroItem[]>([]);

    useEffect(() => {
        if (snapshot?.factors) {
            const factors = snapshot.factors;
            setItems([
                {
                    label: 'VIX',
                    value: factors.vix?.level ?? null,
                    change: factors.vix?.chgPct ?? null,
                    source: 'ENGINE'
                },
                {
                    label: 'DXY',
                    value: factors.dxy?.level ?? null,
                    change: factors.dxy?.chgPct ?? null,
                    source: 'ENGINE'
                },
                {
                    label: 'NQ',
                    value: factors.nasdaq100?.level ?? null,
                    change: factors.nasdaq100?.chgPct ?? null,
                    source: 'ENGINE'
                }
            ]);
        }
    }, [snapshot]);

    if (loading || items.length === 0) {
        return (
            <div className="w-full h-[30px] bg-slate-950 border-b border-slate-800 flex items-center justify-center">
                <div className="animate-pulse flex items-center gap-8">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-8 h-3 bg-slate-800 rounded" />
                            <div className="w-12 h-3 bg-slate-700 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-[30px] bg-slate-950 border-b border-slate-800 overflow-hidden">
            <div className="h-full flex items-center animate-scroll-x">
                {/* Duplicate items for seamless scroll */}
                {[...items, ...items, ...items].map((item, idx) => (
                    <div
                        key={`${item.label}-${idx}`}
                        className="flex items-center gap-2 px-4 shrink-0"
                    >
                        {/* Label */}
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            {item.label}
                        </span>

                        {/* Value */}
                        <span className="text-xs font-bold text-white tabular-nums">
                            {item.value !== null ? item.value.toFixed(2) : '—'}
                        </span>

                        {/* Change */}
                        {item.change !== null && (
                            <span className={`text-[10px] font-bold tabular-nums ${item.change >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                }`}>
                                {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                            </span>
                        )}

                        {/* Separator */}
                        <span className="text-slate-700 ml-2">|</span>
                    </div>
                ))}
            </div>
        </div>
    );
});

MacroTickerTape.displayName = 'MacroTickerTape';

export default MacroTickerTape;
