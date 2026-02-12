'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Zap, Activity } from "lucide-react";

interface PulseCardProps {
    ticker: string;
    price: number;
    change: number;
    whaleIndex: number; // 0-100
    whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    lastBigPrint?: string;
    rank?: number;
}

export function PulseCard({ ticker, price, change, whaleIndex, whaleConfidence, lastBigPrint, rank }: PulseCardProps) {
    const isHighWhale = whaleIndex >= 80;
    const isPositive = change >= 0;

    // EKG Animation Ref
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Pulse Effect Logic
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frameId: number;
        let t = 0;

        // EKG State
        const points: number[] = new Array(100).fill(50); // Center line

        const draw = () => {
            if (!ctx || !canvas) return;

            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Shift points
            points.shift();

            // Generate next point (Spike if High Whale)
            let nextPoint = 50;
            if (isHighWhale && Math.random() > 0.95) {
                // Heartbeat Spike
                nextPoint = Math.random() > 0.5 ? 20 : 80;
            } else {
                // Normal noise
                nextPoint = 50 + (Math.random() - 0.5) * 5;
            }
            points.push(nextPoint);

            // Draw Line
            ctx.beginPath();
            ctx.strokeStyle = isHighWhale ? "#F472B6" : "#475569"; // Pink or Slate
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';

            for (let i = 0; i < points.length - 1; i++) {
                const x1 = (i / points.length) * canvas.width;
                const y1 = (points[i] / 100) * canvas.height;
                const x2 = ((i + 1) / points.length) * canvas.width;
                const y2 = (points[i + 1] / 100) * canvas.height;
                ctx.lineTo(x2, y2);
            }
            ctx.stroke();

            // Glow Effect for High Whale
            if (isHighWhale) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#F472B6";
            } else {
                ctx.shadowBlur = 0;
            }

            frameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(frameId);
    }, [isHighWhale]);

    return (
        <Card className={cn(
            "relative w-full h-32 overflow-hidden bg-[#0a0f18] border-none shadow-2xl group transition-all duration-500",
            isHighWhale ? "ring-1 ring-fuchsia-500/50" : "hover:ring-1 hover:ring-emerald-500/40"
        )}>
            {/* EKG Background Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" width={300} height={100} />

            {/* Rank - Subtle Background */}
            {rank && (
                <div className="absolute top-2 right-4 text-[60px] font-black text-white/5 leading-none pointer-events-none select-none z-0">
                    {rank}
                </div>
            )}

            {/* Content Layer */}
            <div className="absolute inset-0 p-4 flex justify-between items-start z-10">
                {/* Left: Ticker & Whale Info */}
                <div className="flex flex-col h-full justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            {/* Logo Integration */}
                            <div className="w-10 h-10 rounded-full bg-white p-0 shadow-lg shadow-white/5 overflow-hidden flex items-center justify-center flex-shrink-0 relative z-20">
                                <img
                                    src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                    alt={ticker}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement!.style.backgroundColor = '#1e293b'; // slate-800
                                        e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-bold text-slate-400">${ticker[0]}</span>`;
                                    }}
                                />
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-3xl font-black text-white tracking-tighter leading-none font-jakarta">{ticker}</h2>
                                    {isHighWhale && <Activity className="w-4 h-4 text-fuchsia-500 animate-pulse" />}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 tracking-wide mt-0.5 font-jakarta">
                                    {rank ? `RANK #${rank}` : 'UNRANKED'}
                                </div>
                            </div>
                        </div>

                        {lastBigPrint && (
                            <div className="mt-3 text-[10px] font-mono text-fuchsia-300/80 animate-in fade-in slide-in-from-left-2 duration-700 ml-1">
                                ⚡ {lastBigPrint}
                            </div>
                        )}
                    </div>

                    {/* Whale Confidence Badge */}
                    <div className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold w-fit uppercase tracking-wider border ml-1 font-jakarta",
                        isHighWhale
                            ? "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40"
                            : "bg-slate-800 text-slate-500 border-slate-700"
                    )}>
                        WHALE: {whaleIndex}
                    </div>
                </div>

                {/* Right: Price */}
                <div className="text-right z-20">
                    <div className={cn("text-3xl font-black tabular-nums tracking-tighter", isPositive ? "text-emerald-400" : "text-rose-500")}>
                        ${price.toFixed(2)}
                    </div>
                    <div className={cn("text-xs font-bold", isPositive ? "text-emerald-500" : "text-rose-500")}>
                        {isPositive ? "+" : ""}{change.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Neon Flash Overlay (On High Whale) */}
            {isHighWhale && <div className="absolute inset-0 bg-fuchsia-500/5 animate-pulse pointer-events-none" />}
        </Card>
    );
}
