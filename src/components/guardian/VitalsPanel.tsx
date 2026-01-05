
import React from 'react';
import { Shield, Activity, Zap, TrendingUp } from 'lucide-react';

interface VitalsPanelProps {
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    mode: 'STANDARD' | 'HEDGE'; // Currently always standard but prepared for future
    rvol?: {
        ndx: { rvol: number };
        dow: { rvol: number };
    };
    loading?: boolean;
}

export function VitalsPanel({ marketStatus, mode = 'STANDARD', rvol, loading = false }: VitalsPanelProps) {

    // Status Color Logic
    const getStatusColor = (s: string) => {
        if (s === 'GO') return 'text-emerald-400';
        if (s === 'STOP') return 'text-rose-400';
        return 'text-amber-400';
    };

    // RVOL Formatting Logic
    const formatRvol = (val: number) => {
        if (!val && val !== 0) return { text: "---", color: "text-slate-500", label: "NO DATA" };
        const pct = Math.round(val * 100);
        let color = "text-slate-400";
        let label = "NORMAL";

        if (val >= 1.25) { color = "text-emerald-400"; label = "EXPLOSIVE AC"; } // Accumulation
        else if (val >= 1.1) { color = "text-emerald-200"; label = "ACTIVE"; }
        else if (val <= 0.75) { color = "text-rose-400"; label = "LOW LIQUIDITY"; }
        else if (val <= 0.9) { color = "text-slate-500"; label = "QUIET"; }

        return { text: `${pct}%`, color, label };
    };

    const ndxRvol = formatRvol(rvol?.ndx?.rvol || 0);
    const dowRvol = formatRvol(rvol?.dow?.rvol || 0);

    return (
        <div className="w-full h-full flex flex-col justify-center gap-4">
            {/* Top Row: System Status */}
            <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-3">
                {/* 1. Market Status */}
                <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                        <Shield className="w-3 h-3" />
                        MARKET PERMISSION
                    </div>
                    <div className={`text-xl font-black ${getStatusColor(marketStatus)}`}>
                        {loading ? "..." : marketStatus}
                    </div>
                    <div className="text-[8px] text-slate-600 font-mono">
                        {marketStatus === 'GO' ? 'ALGO TRADING ACTIVE' : marketStatus === 'STOP' ? 'DEFENSIVE MODE' : 'AWAITING SIGNAL'}
                    </div>
                </div>

                {/* 2. Operation Mode */}
                <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                        <Zap className="w-3 h-3" />
                        OPERATION MODE
                    </div>
                    <div className="text-xl font-black text-slate-300">
                        {mode}
                    </div>
                    <div className="text-[8px] text-slate-600 font-mono">
                        RISK PROTOCOL: ALPHA
                    </div>
                </div>
            </div>

            {/* Bottom Row: RVOL (Flow Power) */}
            <div className="grid grid-cols-2 gap-4">
                {/* NASDAQ RVOL */}
                <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                        <Activity className="w-3 h-3 text-cyan-500" />
                        NASDAQ FLOW
                    </div>
                    <div className={`text-xl font-black font-mono ${ndxRvol.color}`}>
                        {loading ? "..." : ndxRvol.text}
                    </div>
                    <div className={`text-[8px] font-bold tracking-wider ${ndxRvol.color}`}>
                        [{ndxRvol.label}]
                    </div>
                </div>

                {/* DOW RVOL */}
                <div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                        <TrendingUp className="w-3 h-3 text-indigo-500" />
                        DOW JONES FLOW
                    </div>
                    <div className={`text-xl font-black font-mono ${dowRvol.color}`}>
                        {loading ? "..." : dowRvol.text}
                    </div>
                    <div className={`text-[8px] font-bold tracking-wider ${dowRvol.color}`}>
                        [{dowRvol.label}]
                    </div>
                </div>
            </div>
        </div>
    );
}
