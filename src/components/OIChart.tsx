"use client";

import React from 'react';

interface OIChartProps {
    strikes: number[];
    callsOI: (number | null)[];
    putsOI: (number | null)[];
    currentPrice: number | null;
    maxPain: number | null;
    callWall?: number | null;
    putFloor?: number | null;
}

export function OIChart({ strikes, callsOI, putsOI, currentPrice, maxPain, callWall, putFloor }: OIChartProps) {
    if (!strikes.length) return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No structure data</div>;

    // Filter to ±15% range around current price to zoom in
    const center = currentPrice || strikes[Math.floor(strikes.length / 2)];
    const rangeMin = center * 0.85;
    const rangeMax = center * 1.15;

    const visibleIndices = strikes.map((k, i) => ({ k, i })).filter(({ k }) => k >= rangeMin && k <= rangeMax);
    if (visibleIndices.length === 0) return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Out of range</div>;

    const filteredStrikes = visibleIndices.map(v => strikes[v.i]);
    const filteredCalls = visibleIndices.map(v => callsOI[v.i] || 0);
    const filteredPuts = visibleIndices.map(v => putsOI[v.i] || 0);

    const maxVal = Math.max(...filteredCalls, ...filteredPuts, 1);
    const chartHeight = 160;
    const svgHeight = 220;
    const spacing = 40;
    const svgWidth = filteredStrikes.length * spacing;

    const getX = (strike: number) => {
        const idx = filteredStrikes.findIndex(s => Math.abs(s - strike) < 0.01);
        if (idx !== -1) return idx * spacing + 20;
        // Linear interpolation if not exact strike
        const lowIdx = [...filteredStrikes].reverse().findIndex(s => s <= strike);
        const hiIdx = filteredStrikes.findIndex(s => s >= strike);
        if (lowIdx === -1 || hiIdx === -1) return -100;
        const realLowIdx = filteredStrikes.length - 1 - lowIdx;
        const lowS = filteredStrikes[realLowIdx];
        const hiS = filteredStrikes[hiIdx];
        if (lowS === hiS) return realLowIdx * spacing + 20;
        const pct = (strike - lowS) / (hiS - lowS);
        return (realLowIdx + pct) * spacing + 20;
    };

    return (
        <div className="w-full overflow-x-auto custom-scrollbar">
            <div className="h-[240px] relative mt-2" style={{ width: Math.max(svgWidth, 500) }}>
                <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                    {/* Horizontal Grid */}
                    <line x1="0" y1={chartHeight} x2={svgWidth} y2={chartHeight} stroke="#e2e8f0" strokeWidth="1" />

                    {filteredStrikes.map((strike, i) => {
                        const x = i * spacing + 10;
                        const callH = (filteredCalls[i] / maxVal) * (chartHeight - 40);
                        const putH = (filteredPuts[i] / maxVal) * (chartHeight - 40);

                        return (
                            <g key={strike}>
                                {/* Grid line */}
                                <line x1={x + 10} y1={0} x2={x + 10} y2={chartHeight} stroke="#f8fafc" strokeWidth="1" />

                                {/* Bars */}
                                <rect x={x + 2} y={chartHeight - callH} width={7} height={callH} fill="#10b981" rx="1.5" opacity={0.7} />
                                <rect x={x + 11} y={chartHeight - putH} width={7} height={putH} fill="#f43f5e" rx="1.5" opacity={0.7} />

                                {/* Label */}
                                <text x={x + 10} y={chartHeight + 20} textAnchor="middle" fontSize="9" fill="#94a3b8" className="font-mono tabular-nums">
                                    {strike}
                                </text>
                            </g>
                        );
                    })}

                    {/* OVERLAY LEVELS */}
                    {[
                        { val: callWall, label: "CALL WALL", color: "rgba(99, 102, 241, 0.5)", textColor: "#6366f1", offset: -25 },
                        { val: putFloor, label: "PUT FLOOR", color: "rgba(244, 63, 94, 0.5)", textColor: "#f43f5e", offset: -10 },
                        { val: maxPain, label: "PIN ZONE", color: "rgba(245, 158, 11, 0.5)", textColor: "#f59e0b", offset: -40 }
                    ].map((lv, idx) => {
                        if (!lv.val) return null;
                        const x = getX(lv.val);
                        if (x < 0 || x > svgWidth) return null;

                        return (
                            <g key={lv.label} className="transition-all duration-500">
                                <line x1={x} y1={0} x2={x} y2={chartHeight} stroke={lv.textColor} strokeWidth="1.5" strokeDasharray="4 2" opacity={0.6} />
                                <rect x={x - 35} y={lv.offset + idx * 0} width={70} height={14} rx="4" fill="white" stroke={lv.textColor} strokeWidth="1" opacity={0.9} />
                                <text x={x} y={lv.offset + 10} textAnchor="middle" fontSize="8" fontWeight="bold" fill={lv.textColor} className="tracking-tighter uppercase">
                                    {lv.label} ${lv.val}
                                </text>
                            </g>
                        );
                    })}

                    {/* Current Price Line & Context */}
                    {currentPrice && (
                        <g className="transition-all duration-500">
                            {(() => {
                                const x = getX(currentPrice);
                                if (x < 0 || x > svgWidth) return null;

                                const isPinNearby = maxPain && Math.abs(currentPrice - maxPain) <= (currentPrice * 0.02);

                                return (
                                    <>
                                        {/* Reference Line */}
                                        <line
                                            x1={x} y1={0} x2={x} y2={chartHeight}
                                            stroke="#0f172a" strokeWidth="1" opacity={isPinNearby ? 0.6 : 0.3}
                                        />

                                        {/* Label Badge */}
                                        <g transform={`translate(${x}, -55)`}>
                                            <rect x="-35" y="0" width="70" height="14" rx="4" fill="white" stroke="#0f172a" strokeWidth="1" opacity={0.6} />
                                            <text x="0" y="10" textAnchor="middle" fontSize="7" fontWeight="black" fill="#0f172a" className="tracking-tighter uppercase">
                                                PRICE ${currentPrice.toFixed(1)}
                                            </text>
                                            {isPinNearby && (
                                                <text x="0" y="22" textAnchor="middle" fontSize="6" fontWeight="black" fill="#f59e0b" className="tracking-widest uppercase animate-pulse">
                                                    Inside Magnet
                                                </text>
                                            )}
                                        </g>

                                        {/* Foot indicator */}
                                        <circle cx={x} cy={chartHeight} r="2.5" fill="#0f172a" opacity={0.5} />
                                    </>
                                );
                            })()}
                        </g>
                    )}
                </svg>
            </div>

            <div className="flex justify-center flex-wrap gap-x-6 gap-y-2 text-[10px] mt-4 font-bold uppercase tracking-wider text-slate-500">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm opacity-70"></div>
                    <span>Calls</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-rose-500 rounded-sm opacity-70"></div>
                    <span>Puts</span>
                </div>
                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                    <div className="w-3 h-0.5 bg-indigo-500 opacity-50 border-t border-dashed border-indigo-500"></div>
                    <span className="text-indigo-600">Call Wall</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-rose-500 opacity-50 border-t border-dashed border-rose-500"></div>
                    <span className="text-rose-600">Put Floor</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-amber-500 opacity-50 border-t border-dashed border-amber-500"></div>
                    <span className="text-amber-600">Pin Zone</span>
                </div>
            </div>
        </div>
    );
}
