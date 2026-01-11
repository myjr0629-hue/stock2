'use client';

import React, { useEffect, useState } from 'react';
import { cn } from "@/lib/utils";
import { Zap, Crosshair } from "lucide-react";

// [V3.7.3] Surgical UI Integration
interface ExecutionDialProps {
    whaleIndex: number; // 0-100
    whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    alphaScore: number;
    whaleEntryLevel?: number; // [NEW]
    whaleTargetLevel?: number; // [NEW]
    dominantContract?: string; // [NEW]
}

export function ExecutionDial({ whaleIndex, whaleConfidence, alphaScore, whaleEntryLevel, whaleTargetLevel, dominantContract }: ExecutionDialProps) {
    const [fill, setFill] = useState(0);

    // Animate fill on mount
    useEffect(() => {
        const timer = setTimeout(() => setFill(whaleIndex), 300);
        return () => clearTimeout(timer);
    }, [whaleIndex]);

    const isFireReady = whaleIndex >= 85;
    const isLocked = whaleIndex >= 50;

    // Calculate rotation: -90deg (start) to 90deg (end) => 180deg span
    const degrees = (fill / 100) * 180 - 90;

    return (
        <div className="relative w-full h-32 flex flex-col items-center justify-center p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden group">

            {/* Background Grid/Reticle */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute inset-0 border-[0.5px] border-slate-500 rounded-full scale-150" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-px bg-slate-700" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-48 bg-slate-700" />
            </div>

            {/* Gauge SVG */}
            <div className="relative w-40 h-20 overflow-hidden mb-2">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full border-[6px] border-slate-800 border-b-0 border-l-0 border-r-0"
                    style={{ borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', transform: 'rotate(-45deg)' }} />

                {/* Active Arc */}
                <svg className="absolute bottom-0 left-0 w-full h-full overflow-visible" viewBox="0 0 100 50">
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="6"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={isFireReady ? "#ec4899" : "#10b981"} // Pink or Emerald
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray="126" // Approx length of arc
                        strokeDashoffset={126 - (126 * (fill / 100))}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>

                {/* Needle */}
                <div
                    className="absolute bottom-0 left-1/2 w-1 h-20 bg-gradient-to-t from-slate-900 to-slate-400 origin-bottom transition-transform duration-1000 cubic-bezier(0.34, 1.56, 0.64, 1)"
                    style={{ transform: `translateX(-50%) rotate(${degrees}deg)` }}
                >
                    <div className={cn("w-3 h-3 rounded-full absolute -top-1 -left-1", isFireReady ? "bg-fuchsia-500 shadow-[0_0_10px_#d946ef]" : "bg-emerald-500")} />
                </div>
            </div>

            {/* Status Text / Whale Target Display */}
            <div className="text-center z-10">
                <div className="flex flex-col items-center justify-center mb-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                            {dominantContract || 'CONVICTION'}
                        </span>
                        {isFireReady && <Zap className="w-3 h-3 text-fuchsia-500 animate-pulse" />}
                    </div>
                    {/* [V4.7] Korean Context Label */}
                    {!dominantContract && <span className="text-[9px] text-slate-600 font-medium -mt-0.5">AI 확신도 (승률 예상)</span>}
                </div>

                {whaleTargetLevel ? (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <span className="text-[10px] text-emerald-400 font-bold tracking-wider mb-0.5">세력 목표가 (Target)</span>
                        <span className="text-xl font-black text-white font-mono tracking-tight underline decoration-emerald-500/30 decoration-2 underline-offset-4">
                            ${whaleTargetLevel.toFixed(2)}
                        </span>
                        {whaleEntryLevel && (
                            <span className="text-[9px] text-slate-500 mt-1 font-mono">
                                세력 매집가: <span className="text-slate-400">${whaleEntryLevel.toFixed(2)}</span>
                            </span>
                        )}
                    </div>
                ) : (
                    <div className={cn("text-3xl font-black tabular-nums tracking-tighter leading-none mt-1",
                        isFireReady ? "text-fuchsia-400 drop-shadow-[0_0_8px_rgba(232,121,249,0.5)]" : "text-white"
                    )}>
                        {fill.toFixed(0)}
                    </div>
                )}
            </div>

            {/* Ready to Fire Overlay (If no target, or as backup) */}
            {isFireReady && !whaleTargetLevel && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-fuchsia-500 text-slate-950 font-black text-[10px] tracking-widest animate-pulse whitespace-nowrap">
                    READY TO FIRE
                </div>
            )}
        </div>
    );
}
