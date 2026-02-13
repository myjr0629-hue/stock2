"use client";

import React from 'react';
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { useGuardian } from "@/components/guardian/GuardianProvider";

interface OracleHeaderProps {
    nasdaq: number;
    rlsi: number;
    verdictTitle: string;
    isDivergent: boolean;
    timestamp: string;
}

export function OracleHeader({ }: OracleHeaderProps) {
    const { snapshot } = useMacroSnapshot();
    const { rlsi } = useGuardian();

    // CNN Fear & Greed data from RLSI components
    const fgScore = rlsi?.components?.sentimentScore ?? 0;
    const fgSource = rlsi?.components?.sentimentSource ?? '';

    // F&G status
    const getFgStatus = (score: number) => {
        if (score >= 75) return { label: 'EXTREME GREED', color: '#34d399', glow: 'from-emerald-500/40 to-teal-500/40' };
        if (score >= 55) return { label: 'GREED', color: '#86efac', glow: 'from-emerald-400/30 to-green-500/30' };
        if (score >= 45) return { label: 'NEUTRAL', color: '#94a3b8', glow: 'from-slate-500/20 to-slate-600/20' };
        if (score >= 25) return { label: 'FEAR', color: '#f59e0b', glow: 'from-amber-500/30 to-orange-500/30' };
        return { label: 'EXTREME FEAR', color: '#f43f5e', glow: 'from-rose-500/40 to-rose-600/40' };
    };

    // VIX data
    const vixFactor = snapshot?.factors?.vix;
    const vix = vixFactor?.level ?? 0;
    const vixChg = vixFactor?.chgPct ?? 0;

    // DXY data
    const dxyFactor = snapshot?.factors?.dxy;
    const dxy = dxyFactor?.level ?? 0;
    const dxyChg = dxyFactor?.chgPct ?? 0;

    // VIX status
    const getVixStatus = (v: number) => {
        if (v > 30) return { label: 'EXTREME', color: '#f43f5e', glow: 'from-rose-500/40 to-rose-600/40' };
        if (v > 20) return { label: 'ELEVATED', color: '#f59e0b', glow: 'from-amber-500/30 to-orange-500/30' };
        if (v > 15) return { label: 'NORMAL', color: '#94a3b8', glow: 'from-slate-500/20 to-slate-600/20' };
        return { label: 'LOW', color: '#34d399', glow: 'from-emerald-500/30 to-teal-500/30' };
    };

    // DXY status
    const getDxyStatus = (d: number) => {
        if (d > 105) return { label: 'STRONG', color: '#f43f5e', glow: 'from-rose-500/30 to-pink-500/30' };
        if (d > 100) return { label: 'FIRM', color: '#f59e0b', glow: 'from-amber-500/25 to-yellow-500/25' };
        if (d > 95) return { label: 'NEUTRAL', color: '#94a3b8', glow: 'from-slate-500/20 to-slate-600/20' };
        return { label: 'WEAK', color: '#34d399', glow: 'from-emerald-500/30 to-teal-500/30' };
    };

    const fgStatus = getFgStatus(fgScore);
    const vixStatus = getVixStatus(vix);
    const dxyStatus = getDxyStatus(dxy);

    return (
        <div className="w-full h-10 bg-[#0a0e14]/90 backdrop-blur-md border-b border-slate-800/50 flex items-center justify-between px-6 select-none z-50">
            {/* LEFT: STATUS */}
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
                <span className="text-[11px] font-black tracking-[0.2em] text-emerald-400">
                    GUARDIAN EYE : ONLINE
                </span>
            </div>

            {/* CENTER: F&G, VIX & DXY Glassmorphism Pills */}
            <div className="flex items-center gap-3">
                {/* CNN Fear & Greed Pill */}
                <div className="relative group">
                    <div className={`absolute -inset-0.5 bg-gradient-to-r ${fgStatus.glow} rounded-lg blur opacity-60 group-hover:opacity-100 transition`} />
                    <div className="relative flex items-center gap-2.5 px-3.5 py-1 bg-slate-900/80 backdrop-blur-xl rounded-lg border border-white/10">
                        <span className="text-[11px] text-white font-bold tracking-wider">Fear & Greed</span>
                        <span className="text-sm font-bold font-mono tabular-nums" style={{ color: fgStatus.color }}>
                            {fgScore > 0 ? fgScore.toFixed(1) : '—'}
                        </span>
                        <span className="text-[11px] font-black tracking-wider border-l border-white/15 pl-2" style={{ color: fgStatus.color }}>
                            {fgStatus.label}
                        </span>
                    </div>
                </div>

                {/* VIX Pill */}
                <div className="relative group">
                    <div className={`absolute -inset-0.5 bg-gradient-to-r ${vixStatus.glow} rounded-lg blur opacity-60 group-hover:opacity-100 transition`} />
                    <div className="relative flex items-center gap-2.5 px-3.5 py-1 bg-slate-900/80 backdrop-blur-xl rounded-lg border border-white/10">
                        <span className="text-[11px] text-white font-bold tracking-wider">VIX</span>
                        <span className="text-sm font-bold font-mono tabular-nums" style={{ color: vixStatus.color }}>
                            {vix > 0 ? vix.toFixed(1) : '—'}
                        </span>
                        {vixChg !== 0 && (
                            <span className={`text-[11px] font-bold font-mono ${vixChg >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {vixChg >= 0 ? '+' : ''}{vixChg.toFixed(1)}%
                            </span>
                        )}
                        <span className="text-[11px] font-black tracking-wider border-l border-white/15 pl-2" style={{ color: vixStatus.color }}>
                            {vixStatus.label}
                        </span>
                    </div>
                </div>

                {/* DXY Pill */}
                <div className="relative group">
                    <div className={`absolute -inset-0.5 bg-gradient-to-r ${dxyStatus.glow} rounded-lg blur opacity-60 group-hover:opacity-100 transition`} />
                    <div className="relative flex items-center gap-2.5 px-3.5 py-1 bg-slate-900/80 backdrop-blur-xl rounded-lg border border-white/10">
                        <span className="text-[11px] text-white font-bold tracking-wider">DXY</span>
                        <span className="text-sm font-bold font-mono tabular-nums" style={{ color: dxyStatus.color }}>
                            {dxy > 0 ? dxy.toFixed(1) : '—'}
                        </span>
                        {dxyChg !== 0 && (
                            <span className={`text-[11px] font-bold font-mono ${dxyChg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {dxyChg >= 0 ? '+' : ''}{dxyChg.toFixed(1)}%
                            </span>
                        )}
                        <span className="text-[11px] font-black tracking-wider border-l border-white/15 pl-2" style={{ color: dxyStatus.color }}>
                            {dxyStatus.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* RIGHT: VERSION */}
            <div className="text-[11px] text-slate-600 font-black tracking-widest uppercase opacity-50">
                V8.2 CORE ACTIVE
            </div>
        </div>
    );
}

