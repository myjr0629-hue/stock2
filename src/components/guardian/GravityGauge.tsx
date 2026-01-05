"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface GravityGaugeProps {
    score: number;
    loading?: boolean;
}

export default function GravityGauge({ score, loading }: GravityGaugeProps) {
    const [displayScore, setDisplayScore] = useState(0);

    useEffect(() => {
        if (loading) return;
        setDisplayScore(score);
    }, [score, loading]);

    // Calculate rotation: 0 score = -90deg, 100 score = +90deg
    const rotation = (displayScore / 100) * 180 - 90;

    // Status & Directive Logic
    const getStatus = (s: number) => {
        if (s >= 75) return {
            text: "OPTIMAL",
            directive: "DEPLOY CAPITAL",
            color: "text-emerald-400",
            border: "border-emerald-500/30",
            bg: "bg-emerald-500/10"
        };
        if (s >= 50) return {
            text: "STABLE",
            directive: "ACCUMULATE",
            color: "text-cyan-400",
            border: "border-cyan-500/30",
            bg: "bg-cyan-500/10"
        };
        if (s >= 25) return {
            text: "CAUTION",
            directive: "HEDGE POSITIONS",
            color: "text-amber-400",
            border: "border-amber-500/30",
            bg: "bg-amber-500/10"
        };
        return {
            text: "CRITICAL",
            directive: "SECURE CASH",
            color: "text-rose-500",
            border: "border-rose-500/30",
            bg: "bg-rose-500/10"
        };
    };

    const status = getStatus(displayScore);

    return (
        <div className="relative w-full aspect-[2/1] flex flex-col items-center justify-end">

            {/* BACKGROUND ARC (Clean HUD) */}
            <div className="absolute bottom-0 w-full h-[200%] overflow-hidden opacity-30">
                <div className="w-full h-full rounded-full border-[1.5rem] border-slate-800 relative"
                    style={{ clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)' }}>
                </div>
            </div>

            {/* TICK MARKS & LABELS (Precision & Visibility Fixed) */}
            <div className="absolute bottom-0 left-1/2 w-full h-full -translate-x-1/2 pointer-events-none z-10">
                {[0, 20, 40, 60, 80, 100].map((t) => {
                    const angle = (t / 100) * 180 - 90;
                    return (
                        <div
                            key={t}
                            className="absolute bottom-0 left-1/2 w-0.5 h-[95%] origin-bottom"
                            style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
                        >
                            {/* Tick Line (At the outer rim) */}
                            <div className="absolute top-0 w-full h-3 bg-slate-500"></div>

                            {/* Label (Slightly inside) */}
                            <div
                                className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-300"
                                style={{ transform: `translateX(-50%) rotate(${-angle}deg)` }}
                            >
                                {t}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* COLORED ZONES (Subtle) */}
            <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="none">
                {/* Danger Zone */}
                <path d="M 20 100 A 80 80 0 0 1 45 45" fill="none" stroke="#f43f5e" strokeWidth="2" strokeOpacity="0.5" strokeDasharray="2 2" />
                {/* Optimal Zone */}
                <path d="M 155 45 A 80 80 0 0 1 180 100" fill="none" stroke="#10b981" strokeWidth="2" strokeOpacity="0.5" strokeDasharray="2 2" />
            </svg>

            {/* NEEDLE (Tactical) */}
            <div className="absolute bottom-0 w-full h-full flex items-end justify-center overflow-hidden pb-0">
                <motion.div
                    className="w-0.5 h-[85%] bg-white origin-bottom relative z-10 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    initial={{ rotate: -90 }}
                    animate={{ rotate: rotation }}
                    transition={{ type: "spring", stiffness: 50, damping: 15 }}
                >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-6 bg-white rounded-full"></div>
                </motion.div>

                {/* Pivot */}
                <div className="absolute bottom-0 w-12 h-6 bg-slate-800 border-t border-slate-600 rounded-t-full z-20 shadow-xl"></div>
            </div>

            {/* READOUT (Head-Up Display) */}
            <div className="absolute bottom-2 z-30 flex flex-col items-center">
                <div className={`text-3xl font-mono font-black tracking-tighter ${status.color} drop-shadow-md`}>
                    {loading ? "---" : displayScore.toFixed(0)}
                </div>

                {/* DIRECTIVE BADGE */}
                <div className={`mt-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase border ${status.border} ${status.bg} ${status.color} backdrop-blur-sm`}>
                    {loading ? "OFFLINE" : status.directive}
                </div>
            </div>
        </div>
    );
}
