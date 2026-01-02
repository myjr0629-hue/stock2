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
    if (!strikes.length) return <div className="h-40 flex items-center justify-center text-slate-500 text-sm">No structure data</div>;

    // Filter to ±15% range around current price to zoom in
    const center = currentPrice || strikes[Math.floor(strikes.length / 2)];
    const rangeMin = center * 0.85;
    const rangeMax = center * 1.15;

    const visibleIndices = strikes.map((k, i) => ({ k, i })).filter(({ k }) => k >= rangeMin && k <= rangeMax);
    if (visibleIndices.length === 0) return <div className="h-40 flex items-center justify-center text-slate-500 text-sm">Out of range</div>;

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
                    <defs>
                        <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#064e3b" stopOpacity="0.3" />
                        </linearGradient>
                        <linearGradient id="putGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#881337" stopOpacity="0.3" />
                        </linearGradient>
                        <filter id="glowCall" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {/* Horizontal Base Line */}
                    <line x1="0" y1={chartHeight} x2={svgWidth} y2={chartHeight} stroke="#334155" strokeWidth="1" />

                    {filteredStrikes.map((strike, i) => {
                        const x = i * spacing + 10;
                        const callH = Math.max(2, (filteredCalls[i] / maxVal) * (chartHeight - 40));
                        const putH = Math.max(2, (filteredPuts[i] / maxVal) * (chartHeight - 40));
                        const isPinStrike = maxPain && Math.abs(strike - maxPain) < 1;

                        return (
                            <g key={strike} className="group hover:opacity-100 transition-opacity">
                                {/* Grid Vertical Line - Faint */}
                                <line x1={x + 10} y1={0} x2={x + 10} y2={chartHeight} stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />

                                {/* Interactive Hover Zone (Invisible) */}
                                <rect x={x} y={0} width={spacing} height={chartHeight} fill="transparent" />

                                {/* Bars with Gradient */}
                                <rect x={x + 2} y={chartHeight - callH} width={7} height={callH} fill="url(#callGradient)" rx="2" className="transition-all duration-300 hover:brightness-125" />
                                <rect x={x + 11} y={chartHeight - putH} width={7} height={putH} fill="url(#putGradient)" rx="2" className="transition-all duration-300 hover:brightness-125" />

                                {/* Label */}
                                <text x={x + 10} y={chartHeight + 20} textAnchor="middle" fontSize="9" fill={isPinStrike ? "#fbbf24" : "#64748b"} fontWeight={isPinStrike ? "bold" : "normal"} className="font-mono tabular-nums">
                                    {strike}
                                </text>
                            </g>
                        );
                    })}

                    {/* OVERLAY LEVELS - Premium Badges */}
                    {[
                        { val: callWall, label: "CALL WALL", color: "#6366f1", offset: -25 },
                        { val: putFloor, label: "PUT FLOOR", color: "#f43f5e", offset: -10 },
                        { val: maxPain, label: "PIN ZONE", color: "#f59e0b", offset: -40 }
                    ].map((lv, idx) => {
                        if (!lv.val) return null;
                        const x = getX(lv.val);
                        if (x < 0 || x > svgWidth) return null;

                        return (
                            <g key={lv.label} className="transition-all duration-500">
                                <line x1={x} y1={0} x2={x} y2={chartHeight} stroke={lv.color} strokeWidth="1" strokeDasharray="4 2" opacity={0.6} />
                                <rect x={x - 30} y={lv.offset} width={60} height={14} rx="4" fill="#0f172a" stroke={lv.color} strokeWidth="1" opacity={0.9} />
                                <text x={x} y={lv.offset + 10} textAnchor="middle" fontSize="8" fontWeight="bold" fill={lv.color} className="tracking-tighter uppercase">
                                    {lv.label}
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
                                            stroke="#10b981" strokeWidth="1" opacity={0.8}
                                        />

                                        {/* Label Badge */}
                                        <g transform={`translate(${x}, -55)`}>
                                            <rect x="-35" y="0" width="70" height="16" rx="4" fill="#10b981" stroke="#064e3b" strokeWidth="1" />
                                            <text x="0" y="11" textAnchor="middle" fontSize="8" fontWeight="black" fill="#022c22" className="tracking-tighter uppercase">
                                                PRICE ${currentPrice.toFixed(1)}
                                            </text>

                                        </g>
                                        <circle cx={x} cy={chartHeight} r="3" fill="#10b981" className="animate-pulse" />
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
                    <span>Calls (Open Interest)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-rose-500 rounded-sm opacity-70"></div>
                    <span>Puts (Open Interest)</span>
                </div>
            </div>
        </div>
    );
}
