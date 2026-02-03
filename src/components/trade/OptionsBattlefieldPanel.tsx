"use client";

import { useMemo } from "react";

interface PriceLevel {
    price: number;
    gex: number;      // GEX value in millions
    label?: string;   // "CALL WALL", "PUT FLOOR", "CURRENT", etc.
    type?: "resistance" | "support" | "current" | "neutral";
}

interface OptionsBattlefieldProps {
    symbol: string;
    currentPrice: number;
    levels: PriceLevel[];
    maxPain?: number;
    expiryDate?: string;
}

/**
 * Options Battlefield Panel
 * GEX Heat Map visualization showing price levels and gamma exposure
 */
export function OptionsBattlefieldPanel({
    symbol,
    currentPrice,
    levels,
    maxPain,
    expiryDate,
}: OptionsBattlefieldProps) {
    // Sort levels by price descending
    const sortedLevels = useMemo(() => {
        return [...levels].sort((a, b) => b.price - a.price);
    }, [levels]);

    // Find max GEX for normalization
    const maxGex = useMemo(() => {
        return Math.max(...levels.map(l => Math.abs(l.gex)), 1);
    }, [levels]);

    // Get bar color based on type
    const getBarColor = (level: PriceLevel) => {
        if (level.type === "resistance") return "from-rose-600/80 to-rose-500/60";
        if (level.type === "support") return "from-emerald-600/80 to-emerald-500/60";
        if (level.type === "current") return "from-cyan-500/80 to-cyan-400/60";
        // Neutral: based on GEX sign
        if (level.gex > 0) return "from-amber-600/60 to-amber-500/40";
        return "from-slate-600/60 to-slate-500/40";
    };

    const getBorderColor = (level: PriceLevel) => {
        if (level.type === "resistance") return "border-rose-500/50 shadow-rose-500/20";
        if (level.type === "support") return "border-emerald-500/50 shadow-emerald-500/20";
        if (level.type === "current") return "border-cyan-500/50 shadow-cyan-500/30";
        return "border-slate-700/50";
    };

    const formatPrice = (price: number) => `$${price.toFixed(0)}`;

    return (
        <div className="relative bg-gradient-to-br from-[#0a0a1a]/95 to-[#0f1428]/95 backdrop-blur-xl rounded-2xl border border-[#1a2744] shadow-2xl overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative px-6 py-4 border-b border-[#1a2744]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-gradient-to-b from-rose-400 via-amber-400 to-emerald-400 rounded-full" />
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                                Options Battlefield
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                GEX Heat Map Analytics
                            </p>
                        </div>
                    </div>
                    <div className="text-lg font-mono font-bold text-white">
                        {symbol}
                    </div>
                </div>
            </div>

            {/* GEX Levels Grid */}
            <div className="relative px-6 py-5">
                <div className="space-y-2">
                    {sortedLevels.map((level, index) => {
                        const barWidth = (Math.abs(level.gex) / maxGex) * 100;
                        const isCurrentPrice = level.type === "current" ||
                            Math.abs(level.price - currentPrice) < 0.5;

                        return (
                            <div
                                key={index}
                                className={`relative flex items-center gap-4 py-2 px-3 rounded-lg border transition-all
                                    ${isCurrentPrice ? 'bg-cyan-500/5' : 'bg-transparent'}
                                    ${getBorderColor(level)}
                                    ${isCurrentPrice ? 'shadow-lg' : ''}
                                `}
                            >
                                {/* Price label */}
                                <div className="w-14 text-sm font-mono font-bold text-white">
                                    {formatPrice(level.price)}
                                </div>

                                {/* GEX Bar */}
                                <div className="flex-1 h-6 bg-[#0f1428] rounded overflow-hidden border border-[#1a2744]">
                                    <div
                                        className={`h-full bg-gradient-to-r ${getBarColor(level)} rounded transition-all duration-500`}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>

                                {/* Current price indicator */}
                                {isCurrentPrice && (
                                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-400/50 animate-pulse" />
                                )}

                                {/* Label */}
                                <div className="w-24 text-right">
                                    {level.label && (
                                        <span className={`text-[10px] font-bold uppercase tracking-wider
                                            ${level.type === "resistance" ? "text-rose-400" : ""}
                                            ${level.type === "support" ? "text-emerald-400" : ""}
                                            ${level.type === "current" ? "text-cyan-400" : ""}
                                            ${!level.type ? "text-slate-500" : ""}
                                        `}>
                                            {level.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer Stats */}
            <div className="relative px-6 py-4 border-t border-[#1a2744] flex items-center gap-6">
                {maxPain !== undefined && (
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                            <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="8" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Max Pain</div>
                            <div className="text-sm font-mono font-bold text-amber-400">
                                {formatPrice(maxPain)}
                            </div>
                        </div>
                    </div>
                )}

                {expiryDate && (
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg bg-slate-500/10 border border-slate-500/30 flex items-center justify-center">
                            <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Expiry</div>
                            <div className="text-sm font-mono font-bold text-slate-300">
                                {expiryDate}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default OptionsBattlefieldPanel;
