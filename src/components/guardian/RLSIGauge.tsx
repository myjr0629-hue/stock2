
"use client";

import React from "react";
import { motion } from "framer-motion";

interface RLSIGaugeProps {
    score: number;
    loading?: boolean;
}

export default function RLSIGauge({ score, loading = false }: RLSIGaugeProps) {
    // 0-100 Score mapped to 0-180 degrees (Semi-circle)
    // Actually -90 (Start) to 90 (End) is easier for rotation transform
    // Let's say 0 score = -90deg, 100 score = 90deg.
    // Angle = (Score / 100) * 180 - 90
    const angle = loading ? -90 : Math.max(-90, Math.min(90, (score / 100) * 180 - 90));

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center">
            {/* SVG GAUGE */}
            <svg viewBox="0 0 200 120" className="w-[80%] max-w-[300px] overflow-visible">
                {/* Defs for gradients */}
                <defs>
                    <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="gradYellow" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#b45309" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="gradGreen" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#065f46" stopOpacity="0.4" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Background Arc Track (Dark) */}
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e293b" strokeWidth="15" strokeLinecap="round" />

                {/* ZONES */}
                {/* Red Zone (0-30): -90 to -36 deg */}
                {/* SVG Arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y */}
                {/* 0-30% of 180deg = 54deg. Start at 180 (Left). End at 180-54 = 126? */}
                {/* Converting to coordinates is harder. Let's use stroke-dasharray approach. */}
                {/* Total Length of circle r=80 is 2*PI*80 = 502. Semi-circle = 251. */}

                {/* RED (0-30%) */}
                {/* Start 0, Length 30% of 251 = 75.3 */}
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#ef4444" strokeWidth="15" strokeLinecap="round" strokeDasharray="251" strokeDashoffset={251 * (1 - 0.3)} className="opacity-30" />

                {/* YELLOW (30-70%) - This is complex with single path overlay. 
                    Better to rotate separate segments.
                */}

                {/* Simplified Arcs with predefined paths for exact sectors */}
                {/* Sector 1: Danger (0-30) */}
                <path d="M 20 100 A 80 80 0 0 1 54 44" fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="butt" className="opacity-50" />
                {/* Sector 2: Neutral (30-70) */}
                <path d="M 58 39 A 80 80 0 0 1 142 39" fill="none" stroke="#f59e0b" strokeWidth="12" strokeLinecap="butt" className="opacity-50" />
                {/* Sector 3: Safe (70-100) */}
                <path d="M 146 44 A 80 80 0 0 1 180 100" fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="butt" className="opacity-50" />

                {/* Ticks */}
                {Array.from({ length: 11 }).map((_, i) => {
                    const tickAngle = (i / 10) * 180 - 90;
                    const isMajor = i % 5 === 0;
                    return (
                        <g key={i} transform={`translate(100, 100) rotate(${tickAngle})`}>
                            <line x1="0" y1="-88" x2="0" y2={isMajor ? "-95" : "-92"} stroke={isMajor ? "white" : "#64748b"} strokeWidth={isMajor ? 2 : 1} />
                        </g>
                    );
                })}

                {/* NEEDLE */}
                <motion.g
                    initial={{ rotate: -90 }}
                    animate={{ rotate: angle }}
                    transition={{ type: "spring", stiffness: 50, damping: 15 }}
                    style={{ originX: "100px", originY: "100px" }} // Rotate around center
                >
                    <g transform="translate(100, 100)"> {/* Center is 100,100 */}
                        {/* Needle Line */}
                        <line x1="0" y1="0" x2="0" y2="-75" stroke="white" strokeWidth="3" strokeLinecap="round" filter="url(#glow)" />
                        {/* Pivot Point */}
                        <circle cx="0" cy="0" r="6" fill="#0f172a" stroke="white" strokeWidth="3" />
                        <circle cx="0" cy="0" r="2" fill="#10b981" />
                    </g>
                </motion.g>

                {/* Labels */}
                <text x="25" y="115" fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">0</text>
                <text x="100" y="30" fill="#f59e0b" fontSize="10" fontWeight="bold" textAnchor="middle">50</text>
                <text x="175" y="115" fill="#10b981" fontSize="10" fontWeight="bold" textAnchor="middle">100</text>
            </svg>

            {/* VALUE DISPLAY */}
            <div className="absolute bottom-10 flex flex-col items-center">
                <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Health Index</span>
                <span className={`text-4xl font-black tabular-nums tracking-tighter ${score >= 70 ? 'text-emerald-400' : score <= 30 ? 'text-rose-400' : 'text-amber-400'
                    }`}>
                    {score}/100
                </span>
            </div>
        </div>
    );
}
