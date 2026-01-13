import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface GravityGaugeProps {
    score: number;
    loading?: boolean;
    session?: 'PRE' | 'REG' | 'POST' | 'CLOSED'; // [V5.0] Session indicator
}

export default function GravityGauge({ score, loading, session }: GravityGaugeProps) {
    const [animatedScore, setAnimatedScore] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setAnimatedScore(score), 100);
        return () => clearTimeout(timer);
    }, [score]);

    // Calculate Gauge Parameters
    // Scale reduced: Radius 60
    const radius = 60;
    const stroke = 8;
    const normalizedScore = Math.min(Math.max(animatedScore, 0), 100);
    const circumference = 2 * Math.PI * radius;
    // Semi-circle (180 deg) = circumference / 2
    const maxOffset = circumference / 2;
    const offset = maxOffset - (normalizedScore / 100) * maxOffset;

    // Determine Status
    let statusText = "NEUTRAL";
    let statusColor = "#94a3b8"; // slate-400
    if (normalizedScore >= 80) { statusText = "OVERHEATED"; statusColor = "#f43f5e"; } // rose-500
    else if (normalizedScore >= 60) { statusText = "BULLISH"; statusColor = "#34d399"; } // emerald-400
    else if (normalizedScore <= 20) { statusText = "OVERSOLD"; statusColor = "#f43f5e"; }
    else if (normalizedScore <= 40) { statusText = "BEARISH"; statusColor = "#60a5fa"; } // blue-400

    return (
        <div className="flex flex-col items-center justify-center p-4 h-full relative">
            {/* Header */}
            <div className="absolute top-4 left-6 flex items-center gap-2">
                <Activity className="w-3 h-3 text-white opacity-70" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white font-bold opacity-70">Gravity Gauge</span>
                {/* [V5.0] Session Badge */}
                {session && (
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ml-2 ${session === 'PRE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        session === 'REG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            session === 'POST' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                        }`}>
                        {session === 'PRE' ? 'PRE-MKT' :
                            session === 'REG' ? 'LIVE' :
                                session === 'POST' ? 'AFTER' : 'CLOSED'}
                    </span>
                )}
            </div>

            {/* Main Gauge Container */}
            <div className="relative mt-2">
                <svg width="200" height="120" viewBox="0 0 200 120" className="overflow-visible">
                    {/* Defs for Gradients */}
                    <defs>
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#60a5fa" />   {/* Blue (Low) */}
                            <stop offset="50%" stopColor="#34d399" />  {/* Green (Mid) */}
                            <stop offset="100%" stopColor="#f43f5e" /> {/* Red (High) */}
                        </linearGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* TICK MARKS (Speedometer Style) */}
                    {Array.from({ length: 31 }).map((_, i) => {
                        const angle = Math.PI - (i / 30) * Math.PI; // 180 to 0 degrees
                        const cx = 100;
                        const cy = 100;
                        const rInner = 68; // Start of tick
                        const rOuter = i % 5 === 0 ? 76 : 72; // Major/Minor ticks

                        const x1 = cx + rInner * Math.cos(angle);
                        const y1 = cy - rInner * Math.sin(angle); // Y grows down, so minus sin
                        const x2 = cx + rOuter * Math.cos(angle);
                        const y2 = cy - rOuter * Math.sin(angle);

                        return (
                            <line
                                key={i}
                                x1={x1.toFixed(2)} y1={y1.toFixed(2)}
                                x2={x2.toFixed(2)} y2={y2.toFixed(2)}
                                stroke={i % 5 === 0 ? "#475569" : "#1e293b"}
                                strokeWidth={i % 5 === 0 ? 2 : 1}
                            />
                        );
                    })}

                    {/* Background Track */}
                    <path
                        d={`M 40 100 A ${radius} ${radius} 0 0 1 160 100`}
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth={stroke}
                        strokeLinecap="round"
                    />

                    {/* Active Arc */}
                    <path
                        d={`M 40 100 A ${radius} ${radius} 0 0 1 160 100`}
                        fill="none"
                        stroke="url(#gaugeGradient)"
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={maxOffset}
                        strokeDashoffset={offset}
                        className="transition-all duration-1000 ease-out"
                        filter="url(#glow)"
                        opacity={loading ? 0.3 : 1}
                    />
                </svg>

                {/* Central Score Display */}
                <div className="absolute bottom-0 left-0 right-0 top-10 flex flex-col items-center justify-end pb-3">
                    <span className="text-4xl font-mono font-bold tracking-tighter text-white drop-shadow-lg">
                        {loading ? "--" : Math.round(animatedScore)}
                    </span>
                    <span
                        className="text-[9px] font-black uppercase tracking-widest mt-1 px-2 py-0.5 rounded border border-white/10"
                        style={{ color: statusColor, borderColor: `${statusColor}33`, backgroundColor: `${statusColor}11` }}
                    >
                        {statusText}
                    </span>
                </div>
            </div>

            {/* RLSI Full Name Label */}
            <div className="mt-[-5px] mb-3 text-center">
                <div className="text-[9px] uppercase tracking-widest text-slate-200 font-bold opacity-80">
                    Relative Liquid Strength Index
                </div>
            </div>

            {/* RLSI Infographic Legend */}
            <div className="text-center max-w-[220px] border-t border-slate-800/50 pt-3">
                {/* Scale Bar */}
                <div className="flex items-center justify-center gap-0.5 mb-2">
                    <div className="text-[8px] text-slate-500 pr-1">0</div>
                    <div className="w-12 h-1.5 bg-gradient-to-r from-rose-500 to-rose-400 rounded-l"></div>
                    <div className="w-12 h-1.5 bg-gradient-to-r from-slate-500 to-slate-400"></div>
                    <div className="w-12 h-1.5 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-r"></div>
                    <div className="text-[8px] text-slate-500 pl-1">100</div>
                </div>

                {/* Zone Labels */}
                <div className="flex justify-between text-[8px] font-bold mb-2 px-2">
                    <span className="text-rose-400">약세 40-</span>
                    <span className="text-slate-400">중립</span>
                    <span className="text-emerald-400">강세 60+</span>
                </div>

                {/* Data Sources */}
                <div className="flex justify-center gap-2 flex-wrap">
                    <span className="text-[8px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">뉴스</span>
                    <span className="text-[8px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">모멘텀</span>
                    <span className="text-[8px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">섹터</span>
                    <span className="text-[8px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">금리</span>
                </div>
            </div>
        </div>
    );
}
