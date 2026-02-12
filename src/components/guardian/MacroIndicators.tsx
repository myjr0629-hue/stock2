"use client";

import React, { memo } from 'react';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, GitBranch, Percent } from 'lucide-react';

/**
 * MacroIndicators - Guardian Macro Intelligence Panel
 * 
 * [V45.0] Displays:
 * - VIX: Fear Index (VIXY proxy)
 * - DXY: Dollar Strength (UUP proxy)
 * - 2s10s: Yield Curve Spread (Recession indicator)
 * - Real Yield: 10Y - Inflation Expectations (Policy stance)
 */
export const MacroIndicators = memo(() => {
    const { snapshot, loading } = useMacroSnapshot();

    const vix = snapshot?.factors?.vix;
    const dxy = snapshot?.factors?.dxy;
    const yieldCurve = snapshot?.yieldCurve;
    const realYield = snapshot?.realYield;

    const getVixColor = (level: number) => {
        if (level >= 30) return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
        if (level >= 20) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    };

    const getVixLabel = (level: number) => {
        if (level >= 30) return 'PANIC';
        if (level >= 20) return 'FEAR';
        return 'STABLE';
    };

    const getSpreadColor = (spread: number, trend: string) => {
        if (trend === 'INVERTED' || spread < 0) return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
        if (trend === 'FLATTENING') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    };

    const getRealYieldColor = (stance: string) => {
        if (stance === 'TIGHT') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
        if (stance === 'LOOSE') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-pulse text-slate-500 text-xs">Loading Macro...</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-2">
            {/* Row 1: VIX + DXY */}
            <div className="grid grid-cols-2 gap-2">
                {/* VIX Indicator */}
                <div className={`flex flex-col p-2 rounded-lg border ${vix?.level ? getVixColor(vix.level) : 'border-slate-700'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <Activity size={10} className="opacity-70" />
                        <span className="text-[11px] font-black uppercase tracking-wider opacity-70">VIX</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-base font-black tabular-nums">
                            {vix?.level?.toFixed(1) || '—'}
                        </span>
                        <span className="text-[11px] font-bold uppercase">
                            {vix?.level ? getVixLabel(vix.level) : ''}
                        </span>
                    </div>
                </div>

                {/* DXY Indicator */}
                <div className="flex flex-col p-2 rounded-lg border border-sky-500/30 bg-sky-500/10">
                    <div className="flex items-center gap-1 mb-1">
                        <DollarSign size={10} className="text-sky-400 opacity-70" />
                        <span className="text-[11px] font-black text-sky-400 uppercase tracking-wider opacity-70">DXY</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-base font-black text-sky-300 tabular-nums">
                            {dxy?.level?.toFixed(1) || '—'}
                        </span>
                        <span className="text-[11px] font-bold text-sky-400/70 uppercase">USD</span>
                    </div>
                </div>
            </div>

            {/* Row 2: 2s10s Yield Curve + Real Yield */}
            <div className="grid grid-cols-2 gap-2">
                {/* 2s10s Yield Curve */}
                <div className={`flex flex-col p-2 rounded-lg border ${yieldCurve ? getSpreadColor(yieldCurve.spread2s10s, yieldCurve.trend) : 'border-slate-700'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <GitBranch size={10} className="opacity-70" />
                        <span className="text-[11px] font-black uppercase tracking-wider opacity-70">2s10s</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-base font-black tabular-nums">
                            {yieldCurve ? (yieldCurve.spread2s10s > 0 ? '+' : '') + yieldCurve.spread2s10s.toFixed(2) + '%' : '—'}
                        </span>
                        <span className="text-[11px] font-bold uppercase">
                            {yieldCurve?.trend || ''}
                        </span>
                    </div>
                </div>

                {/* Real Yield */}
                <div className={`flex flex-col p-2 rounded-lg border ${realYield ? getRealYieldColor(realYield.stance) : 'border-slate-700'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <Percent size={10} className="opacity-70" />
                        <span className="text-[11px] font-black uppercase tracking-wider opacity-70">REAL</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-base font-black tabular-nums">
                            {realYield ? (realYield.realYield > 0 ? '+' : '') + realYield.realYield.toFixed(2) + '%' : '—'}
                        </span>
                        <span className="text-[11px] font-bold uppercase">
                            {realYield?.stance || ''}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

MacroIndicators.displayName = 'MacroIndicators';

export default MacroIndicators;

