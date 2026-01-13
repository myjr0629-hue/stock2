"use client";

import React, { memo } from 'react';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign } from 'lucide-react';

/**
 * MacroIndicators - Displays VIX and DXY from Engine Data
 * 
 * VIX: VIXY × 0.604 = Real VIX level (~15.12)
 * DXY: UUP × 3.63 = Real DXY level (~99.07)
 * 
 * Used in Guardian page for TACTICAL INSIGHT and Regime Analysis.
 */
export const MacroIndicators = memo(() => {
    const { snapshot, loading } = useMacroSnapshot();

    const vix = snapshot?.factors?.vix;
    const dxy = snapshot?.factors?.dxy;

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

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-pulse text-slate-500 text-xs">Loading Macro...</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col justify-center gap-3">
            {/* VIX Indicator */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${vix?.level ? getVixColor(vix.level) : 'border-slate-700'}`}>
                <div className="flex items-center gap-2">
                    <Activity size={14} className="opacity-70" />
                    <span className="text-xs font-black uppercase tracking-wider">VIX</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-lg font-black tabular-nums">
                        {vix?.level?.toFixed(2) || '—'}
                    </span>
                    {vix?.chgPct !== undefined && vix.chgPct !== null && (
                        <span className={`text-[10px] font-bold ${vix.chgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {vix.chgPct >= 0 ? '+' : ''}{vix.chgPct.toFixed(2)}%
                        </span>
                    )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider opacity-70">
                    {vix?.level ? getVixLabel(vix.level) : ''}
                </span>
            </div>

            {/* DXY Indicator */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-sky-500/30 bg-sky-500/10">
                <div className="flex items-center gap-2">
                    <DollarSign size={14} className="text-sky-400 opacity-70" />
                    <span className="text-xs font-black text-sky-400 uppercase tracking-wider">DXY</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-sky-300 tabular-nums">
                        {dxy?.level?.toFixed(2) || '—'}
                    </span>
                    {dxy?.chgPct !== undefined && dxy.chgPct !== null && (
                        <span className={`text-[10px] font-bold ${dxy.chgPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {dxy.chgPct >= 0 ? '+' : ''}{dxy.chgPct.toFixed(2)}%
                        </span>
                    )}
                </div>
                <span className="text-[9px] font-black text-sky-400/70 uppercase tracking-wider">
                    USD INDEX
                </span>
            </div>
        </div>
    );
});

MacroIndicators.displayName = 'MacroIndicators';

export default MacroIndicators;
