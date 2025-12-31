
"use client";

import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { Activity, ArrowUp, ArrowDown, Zap } from "lucide-react";

export function MacroTickerTape() {
    const { snapshot, loading } = useMacroSnapshot();

    const { nasdaq100, us10y, vix, dxy } = snapshot.factors;

    // Helper to render change
    const renderChange = (chg: number | undefined | null, isInverse = false) => {
        if (chg === undefined || chg === null) return <span className="text-slate-500">-</span>;
        const val = chg;
        const isPos = val > 0;
        const isNeg = val < 0;

        const color = isPos ? "text-emerald-400" : isNeg ? "text-rose-400" : "text-slate-400";
        const Icon = isPos ? ArrowUp : isNeg ? ArrowDown : null;

        return (
            <span className={`flex items-center gap-1 text-xs font-bold ${color}`}>
                {Icon && <Icon className="w-3 h-3" />}
                {Math.abs(val).toFixed(2)}%
            </span>
        );
    };

    // VIX Logic
    const vixLevel = vix.level ?? 0;
    const vixLabel = vixLevel >= 30 ? "PANIC" : vixLevel >= 20 ? "FEAR" : "CALM";
    const vixColor = vixLevel >= 20 ? "text-rose-400" : "text-emerald-400";

    return (
        <div className="w-full h-12 border-b border-white/5 bg-[#0F172A]/80 backdrop-blur-md flex items-center justify-center overflow-hidden relative z-40">

            <div className="flex items-center gap-6 md:gap-12 opacity-90">

                {/* Nasdaq 100 (Futures) */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 font-bold tracking-wider">NASDAQ 100 (SYN)</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white font-mono">
                                {nasdaq100.level?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "---"}
                            </span>
                            {renderChange(nasdaq100.chgPct)}
                        </div>
                    </div>
                </div>

                {/* Separator */}
                <div className="h-6 w-px bg-white/10" />

                {/* US 10Y Yield */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 font-bold tracking-wider">US 10Y YIELD</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white font-mono">
                                {us10y.level?.toFixed(2) ?? "---"}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Separator */}
                <div className="h-6 w-px bg-white/10" />

                {/* VIX (Dynamic Label) */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className={`text-[10px] font-bold tracking-wider ${vixLevel >= 20 ? "text-rose-400" : "text-emerald-400"}`}>
                            VIX ({vixLabel})
                        </span>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-black font-mono ${vixColor}`}>
                                {vix.level?.toFixed(2) ?? "---"}
                            </span>
                            {renderChange(vix.chgPct)}
                        </div>
                    </div>
                </div>

                {/* Separator */}
                <div className="h-6 w-px bg-white/10" />

                {/* DXY (Dollar) */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 font-bold tracking-wider">DOLLAR (DXY)</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white font-mono">
                                {dxy?.level?.toFixed(2) ?? "---"}
                            </span>
                            {renderChange(dxy?.chgPct)}
                        </div>
                    </div>
                </div>

                {/* Live Status */}
                <div className="hidden lg:flex items-center gap-2 ml-8 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 tracking-widest">ENGINE LIVE</span>
                </div>

            </div>
        </div>
    );
}
