"use client";

import React from 'react';

interface RealityCheckProps {
    nasdaqChange: number;
    guardianScore: number;
    divergenceCase?: 'A' | 'B' | 'C' | 'D' | 'N';
}

export function RealityCheck({ nasdaqChange, guardianScore, divergenceCase = 'N' }: RealityCheckProps) {
    // Normalization logic
    const nasdaqNormalized = Math.max(0, Math.min(100, (nasdaqChange + 2) * 25)); // -2% to +2% -> 0 to 100

    // Insight Message Logic
    let message = "시장과 내부가 평범하게 움직입니다.";
    let messageColor = "text-slate-400";
    let borderColor = "border-slate-800";
    let bgPulse = "";

    if (divergenceCase === 'A') { // False Rally
        message = "⚠️ 지수는 상승 중이나 내부는 썩었습니다. [함정 주의]";
        messageColor = "text-rose-400";
        borderColor = "border-rose-500";
        bgPulse = "animate-pulse";
    } else if (divergenceCase === 'B') { // Hidden Opportunity
        message = "💎 지수는 하락 중이나 내부는 튼튼합니다. [매집 기회]";
        messageColor = "text-emerald-400";
        borderColor = "border-emerald-500";
        bgPulse = "animate-pulse";
    } else if (divergenceCase === 'C') { // Crash Warning (Both Drop)
        // Not explicitly A/B in unifiedDataStream yet, but if score is super low and index dropping?
        // Let's stick to what's passed.
    } else if (divergenceCase === 'D') { // Deep Freeze
        message = "❄️ 시장이 완전히 얼어붙었습니다. [관망 권장]";
        messageColor = "text-sky-400";
        borderColor = "border-sky-500";
    }

    return (
        <div className="w-full h-full flex flex-col justify-center">
            {/* Header */}
            <div className="flex justify-between items-end mb-2">
                <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">MARKET TRUTH DETECTOR</h3>
                <div className="text-[8px] font-bold text-slate-600 tracking-wider">DIVERGENCE ANALYZER</div>
            </div>

            {/* Message Box (Compact) */}
            <div className={`w - full py - 1.5 px - 3 mb - 3 rounded border ${borderColor} bg - slate - 900 / 50 flex items - center justify - center text - center`}>
                <span className={`text - [10px] font - bold ${messageColor} ${bgPulse} whitespace - nowrap`}>
                    {message}
                </span>
            </div>

            {/* Comparison Bars */}
            <div className="space-y-3">
                {/* 1. PRICE (NOISE) */}
                <div>
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                        <span>PRICE ACTION <span className="text-slate-600">(NOISE)</span></span>
                        <span className={nasdaqChange > 0 ? "text-emerald-400" : "text-rose-400"}>
                            NASDAQ {nasdaqChange > 0 ? "+" : ""}{nasdaqChange.toFixed(2)}%
                        </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h - full rounded - full ${nasdaqChange > 0 ? 'bg-rose-500' : 'bg-rose-500'} opacity - 80`}
                            style={{ width: `${nasdaqNormalized}% `, backgroundColor: nasdaqChange >= 0 ? '#f43f5e' : '#f43f5e' }}
                        ></div>
                    </div>
                </div>

                {/* 2. LIQUIDITY (TRUTH) */}
                <div>
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                        <span>LIQUIDITY FLOW <span className="text-emerald-500">(TRUTH)</span></span>
                        <span className="text-cyan-400">SCORE {guardianScore}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                        <div
                            className="h-full rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000"
                            style={{ width: `${guardianScore}% ` }}
                        ></div>
                        {/* Marker for simple average/median? No, keep clean. */}
                    </div>
                </div>
            </div>

            <div className="mt-2 text-[8px] text-slate-600 text-right">
                * Real-time divergence check vs 20d avg
            </div>
        </div>
    );
}
