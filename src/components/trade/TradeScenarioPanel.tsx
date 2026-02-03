"use client";

import { useMemo } from "react";

interface TradeScenarioProps {
    symbol: string;
    currentPrice: number;
    entryZone: [number, number];
    targetPrice: number;
    riskLine: number;
    atmIv?: number;
    callWall?: number;
    putFloor?: number;
    maxPain?: number;
    expiryDate?: string;
}

/**
 * Premium Trade Scenario Panel
 * Glassmorphism + Infographic style
 * Displays conditional scenario based on mathematical analysis
 */
export function TradeScenarioPanel({
    symbol,
    currentPrice,
    entryZone,
    targetPrice,
    riskLine,
    atmIv = 0.30,
    callWall,
    putFloor,
    maxPain,
    expiryDate,
}: TradeScenarioProps) {
    // Calculate derived values
    const calculations = useMemo(() => {
        const [entryLow, entryHigh] = entryZone;
        const entryMid = (entryLow + entryHigh) / 2;

        // Target and Risk percentages
        const targetPct = ((targetPrice - currentPrice) / currentPrice) * 100;
        const riskPct = ((riskLine - currentPrice) / currentPrice) * 100;

        // Risk/Reward ratio
        const reward = Math.abs(targetPrice - entryMid);
        const risk = Math.abs(entryMid - riskLine);
        const rrRatio = risk > 0 ? reward / risk : 0;

        // 3-day expected move (IV-based)
        // IV is annualized, convert to 3-day
        const dailyIv = atmIv / Math.sqrt(252);
        const threeDayIv = dailyIv * Math.sqrt(3);
        const expectedMove = currentPrice * threeDayIv;
        const expectedMovePct = threeDayIv * 100;

        const range68Low = currentPrice - expectedMove;
        const range68High = currentPrice + expectedMove;

        // Entry position indicator (0-100%)
        const entryRange = entryHigh - entryLow;
        const priceInEntry = Math.min(100, Math.max(0,
            ((currentPrice - entryLow) / entryRange) * 100
        ));

        // Is price inside entry zone?
        const isInsideEntry = currentPrice >= entryLow && currentPrice <= entryHigh;

        return {
            entryLow,
            entryHigh,
            entryMid,
            targetPct,
            riskPct,
            rrRatio,
            expectedMove,
            expectedMovePct,
            range68Low,
            range68High,
            priceInEntry,
            isInsideEntry,
        };
    }, [currentPrice, entryZone, targetPrice, riskLine, atmIv]);

    const formatPrice = (price: number) => `$${price.toFixed(2)}`;
    const formatPct = (pct: number, showSign = true) => {
        const sign = showSign && pct > 0 ? "+" : "";
        return `${sign}${pct.toFixed(1)}%`;
    };

    return (
        <div className="relative bg-gradient-to-br from-[#0a0a1a]/95 to-[#0f1428]/95 backdrop-blur-xl rounded-2xl border border-[#1a2744] shadow-2xl overflow-hidden">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative px-6 py-4 border-b border-[#1a2744]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-cyan-600 rounded-full" />
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                                Trade Scenario
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                Mathematical analysis based on current conditions
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-mono font-bold text-white">
                            {symbol}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                            {calculations.isInsideEntry ? "Inside Zone" : "Outside Zone"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Entry Range Section */}
            <div className="relative px-6 py-5 border-b border-[#1a2744]/50">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3 font-medium">
                    Entry Range
                </div>

                {/* Entry Range Bar */}
                <div className="relative h-10 bg-[#0f1428] rounded-lg overflow-hidden border border-[#1a2744]">
                    {/* Gradient fill for entry zone */}
                    <div
                        className="absolute inset-y-0 bg-gradient-to-r from-cyan-500/20 to-cyan-400/30"
                        style={{ left: '10%', right: '10%' }}
                    />

                    {/* Current price marker */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-400/50 z-10"
                        style={{ left: `${10 + (calculations.priceInEntry * 0.8)}%` }}
                    />

                    {/* Price labels */}
                    <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-mono">
                        <span className="text-slate-400">{formatPrice(calculations.entryLow)}</span>
                        <span className="text-cyan-400 font-bold">{formatPrice(currentPrice)}</span>
                        <span className="text-slate-400">{formatPrice(calculations.entryHigh)}</span>
                    </div>
                </div>

                <div className="flex justify-between mt-2 text-[9px] text-slate-600 uppercase tracking-wider">
                    <span>Entry Start</span>
                    <span>Current</span>
                    <span>Entry End</span>
                </div>
            </div>

            {/* Price Levels Section */}
            <div className="relative px-6 py-5 border-b border-[#1a2744]/50">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-4 font-medium">
                    Price Levels
                </div>

                <div className="space-y-3">
                    {/* Target */}
                    <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="12,2 22,20 2,20" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">Target</div>
                                <div className="text-sm font-mono font-bold text-emerald-400">
                                    {formatPrice(targetPrice)}
                                </div>
                            </div>
                        </div>
                        <div className="text-sm font-mono font-bold text-emerald-400">
                            {formatPct(calculations.targetPct)}
                        </div>
                    </div>

                    {/* Divider line */}
                    <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

                    {/* Current */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">Current</div>
                                <div className="text-sm font-mono font-bold text-white">
                                    {formatPrice(currentPrice)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Divider line */}
                    <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

                    {/* Risk Line */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                                <svg className="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="12,22 22,4 2,4" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-xs text-slate-400 uppercase tracking-wide">Risk Line</div>
                                <div className="text-sm font-mono font-bold text-rose-400">
                                    {formatPrice(riskLine)}
                                </div>
                            </div>
                        </div>
                        <div className="text-sm font-mono font-bold text-rose-400">
                            {formatPct(calculations.riskPct)}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3-Day Expected Range */}
            <div className="relative px-6 py-5 border-b border-[#1a2744]/50">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
                        3-Day Expected Range
                    </div>
                    <div className="text-[10px] text-slate-600">
                        68% Probability
                    </div>
                </div>

                {/* Range bar */}
                <div className="relative h-8 bg-[#0f1428] rounded-lg overflow-hidden border border-[#1a2744]">
                    <div className="absolute inset-y-0 left-[15%] right-[15%] bg-gradient-to-r from-cyan-500/10 via-cyan-500/20 to-cyan-500/10" />

                    {/* Current price dot */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-lg" />

                    {/* Labels */}
                    <div className="absolute inset-0 flex items-center justify-between px-4">
                        <span className="text-[10px] font-mono text-slate-500">
                            {formatPrice(calculations.range68Low)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                            {formatPrice(calculations.range68High)}
                        </span>
                    </div>
                </div>

                <div className="text-center mt-2 text-[10px] text-slate-600">
                    ATM IV: {(atmIv * 100).toFixed(0)}% → ±{calculations.expectedMovePct.toFixed(1)}% (3D)
                </div>
            </div>

            {/* Stats Row */}
            <div className="relative px-6 py-4 grid grid-cols-3 gap-4">
                {/* R:R Ratio */}
                <div className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">R:R Ratio</div>
                    <div className="text-lg font-mono font-bold text-white">
                        1:{calculations.rrRatio.toFixed(1)}
                    </div>
                </div>

                {/* Max Pain */}
                {maxPain && (
                    <div className="text-center border-l border-r border-[#1a2744]">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Max Pain</div>
                        <div className="text-lg font-mono font-bold text-amber-400">
                            {formatPrice(maxPain)}
                        </div>
                    </div>
                )}

                {/* Expiry */}
                {expiryDate && (
                    <div className="text-center">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Expiry</div>
                        <div className="text-lg font-mono font-bold text-slate-300">
                            {expiryDate}
                        </div>
                    </div>
                )}
            </div>

            {/* Disclaimer */}
            <div className="relative px-6 py-3 bg-[#0a0a14] border-t border-[#1a2744]">
                <p className="text-[9px] text-slate-600 text-center leading-relaxed">
                    This scenario is based on current options data. Not financial advice.
                    Market conditions change in real-time. Trade at your own risk.
                </p>
            </div>
        </div>
    );
}

export default TradeScenarioPanel;
