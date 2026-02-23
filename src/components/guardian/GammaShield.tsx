'use client';

import React from 'react';
import type { GammaShieldData } from '@/services/guardian/gammaShieldEngine';
import { Shield, Zap, AlertTriangle, TrendingUp } from 'lucide-react';

interface Props {
    data: GammaShieldData | null | undefined;
    isMarketActive: boolean;
}

// === GEX Gauge Colors ===
function getGexColor(index: number): string {
    if (index >= 40) return 'text-emerald-400';
    if (index >= 20) return 'text-emerald-300';
    if (index >= -20) return 'text-slate-300';
    if (index >= -40) return 'text-amber-400';
    return 'text-red-400';
}

function getGexBarGradient(index: number): string {
    if (index >= 40) return 'from-emerald-500 to-emerald-400';
    if (index >= 20) return 'from-emerald-500/80 to-emerald-400/80';
    if (index >= -20) return 'from-slate-500 to-slate-400';
    if (index >= -40) return 'from-amber-500 to-amber-400';
    return 'from-red-600 to-red-400';
}

function getGexBgGlow(index: number): string {
    if (index >= 40) return 'shadow-[0_0_30px_rgba(52,211,153,0.15)]';
    if (index >= 20) return 'shadow-[0_0_20px_rgba(52,211,153,0.08)]';
    if (index >= -20) return '';
    if (index >= -40) return 'shadow-[0_0_20px_rgba(245,158,11,0.12)]';
    return 'shadow-[0_0_30px_rgba(239,68,68,0.2)]';
}

// === Squeeze Colors ===
function getSqueezeColor(level: string): string {
    switch (level) {
        case 'EXTREME': return 'text-red-400';
        case 'HIGH': return 'text-amber-400';
        case 'MEDIUM': return 'text-yellow-300';
        default: return 'text-emerald-400';
    }
}

function getSqueezeBadgeBg(level: string): string {
    switch (level) {
        case 'EXTREME': return 'bg-red-500/20 border-red-500/40';
        case 'HIGH': return 'bg-amber-500/20 border-amber-500/40';
        case 'MEDIUM': return 'bg-yellow-500/15 border-yellow-500/30';
        default: return 'bg-emerald-500/15 border-emerald-500/30';
    }
}

function getSqueezeRingColor(level: string): string {
    switch (level) {
        case 'EXTREME': return 'stroke-red-400';
        case 'HIGH': return 'stroke-amber-400';
        case 'MEDIUM': return 'stroke-yellow-300';
        default: return 'stroke-emerald-400';
    }
}

// === Squeeze Ring SVG ===
function SqueezeRing({ value, level }: { value: number; level: string }) {
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
        <svg className="w-[76px] h-[76px] -rotate-90" viewBox="0 0 76 76">
            {/* Background ring */}
            <circle cx="38" cy="38" r={radius} fill="none"
                stroke="rgba(148,163,184,0.1)" strokeWidth="5" />
            {/* Value ring */}
            <circle cx="38" cy="38" r={radius} fill="none"
                className={getSqueezeRingColor(level)}
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
            />
        </svg>
    );
}

// === Trigger Band Visualization ===
function TriggerBand({
    support, current, resistance
}: { support: number | null; current: number | null; resistance: number | null }) {
    if (!support || !current || !resistance || resistance <= support) {
        return (
            <div className="text-[12px] text-slate-500 font-jakarta text-center">
                데이터 수집 중...
            </div>
        );
    }

    const range = resistance - support;
    const position = Math.max(0, Math.min(100, ((current - support) / range) * 100));

    return (
        <div className="flex flex-col gap-1.5">
            {/* Resistance */}
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-jakarta text-red-400/70 tracking-wide">RESISTANCE</span>
                <span className="text-[13px] font-black font-jakarta text-red-400 tabular-nums">
                    {resistance.toLocaleString()}
                </span>
            </div>

            {/* Visual bar */}
            <div className="relative h-[28px] rounded-md bg-slate-800/60 border border-slate-700/40 overflow-hidden">
                {/* Gradient background */}
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/8 via-transparent to-red-500/8" />

                {/* Current position indicator */}
                <div
                    className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center transition-all duration-700"
                    style={{ bottom: `${position}%`, transform: `translateX(-50%) translateY(50%)` }}
                >
                    <div className="w-2.5 h-2.5 rotate-45 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
                </div>

                {/* Current price label */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[13px] font-black font-jakarta text-white/90 tabular-nums bg-slate-900/60 px-2 py-0.5 rounded">
                        {current.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Support */}
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-jakarta text-emerald-400/70 tracking-wide">SUPPORT</span>
                <span className="text-[13px] font-black font-jakarta text-emerald-400 tabular-nums">
                    {support.toLocaleString()}
                </span>
            </div>
        </div>
    );
}

// === Main Component ===
export default function GammaShield({ data, isMarketActive }: Props) {
    if (!data) {
        return (
            <div className="bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-700/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <span className="text-[13px] font-black font-jakarta tracking-wider text-slate-300">
                        GAMMA SHIELD
                    </span>
                </div>
                <div className="flex items-center justify-center h-[120px] text-[12px] text-slate-500 font-jakarta">
                    {isMarketActive ? '옵션 데이터 수집 중...' : 'Regular Session Only'}
                </div>
            </div>
        );
    }

    const { gexIndex, gexLevel, gexLabel, squeezeRisk, squeezeLevel, supportWall, resistanceWall, currentPrice, confidence } = data;

    return (
        <div className={`
            bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-800/30
            backdrop-blur-xl rounded-xl
            border border-slate-700/30
            ${getGexBgGlow(gexIndex)}
            transition-all duration-500
        `}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 ${gexIndex >= 0 ? 'text-cyan-400' : 'text-amber-400'}`} />
                    <span className="text-[13px] font-black font-jakarta tracking-[0.08em] text-slate-200">
                        GAMMA SHIELD
                    </span>
                    <span className={`text-[10px] font-bold font-jakarta px-1.5 py-0.5 rounded-sm border ${confidence === 'HIGH' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : confidence === 'MEDIUM' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-slate-400 border-slate-500/30 bg-slate-500/10'}`}>
                        {confidence}
                    </span>
                </div>
                <span className={`text-[10px] font-bold font-jakarta px-2 py-0.5 rounded border ${isMarketActive ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 animate-pulse' : 'text-slate-500 border-slate-600/30 bg-slate-600/10'}`}>
                    {isMarketActive ? '● LIVE' : 'STANDBY'}
                </span>
            </div>

            {/* Content Grid — 3 columns */}
            <div className="grid grid-cols-3 gap-3 px-4 pb-4">

                {/* Column 1: GEX Pressure Index */}
                <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-bold font-jakarta tracking-[0.12em] text-slate-400 uppercase">
                        Gamma Pressure
                    </span>

                    {/* Big Number */}
                    <div className={`text-[28px] font-black font-jakarta tabular-nums leading-none ${getGexColor(gexIndex)}`}>
                        {gexIndex >= 0 ? '+' : ''}{gexIndex}
                    </div>

                    {/* Level Badge */}
                    <div className={`text-[10px] font-bold font-jakarta px-2 py-0.5 rounded-sm border ${gexLevel === 'LONG_GAMMA' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : gexLevel === 'SHORT_GAMMA' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-slate-400 border-slate-600/30 bg-slate-600/10'}`}>
                        {gexLevel.replace('_', ' ')}
                    </div>

                    {/* Gauge bar */}
                    <div className="w-full mt-1">
                        <div className="relative h-[6px] bg-slate-800 rounded-full overflow-hidden">
                            {/* Zero center line */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600/60 z-10" />

                            {/* Value bar */}
                            {gexIndex >= 0 ? (
                                <div
                                    className={`absolute top-0 bottom-0 left-1/2 bg-gradient-to-r ${getGexBarGradient(gexIndex)} rounded-r-full transition-all duration-700`}
                                    style={{ width: `${Math.min(50, (gexIndex / 100) * 50)}%` }}
                                />
                            ) : (
                                <div
                                    className={`absolute top-0 bottom-0 right-1/2 bg-gradient-to-l ${getGexBarGradient(gexIndex)} rounded-l-full transition-all duration-700`}
                                    style={{ width: `${Math.min(50, (Math.abs(gexIndex) / 100) * 50)}%` }}
                                />
                            )}
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[9px] font-jakarta text-red-400/50">-100</span>
                            <span className="text-[9px] font-jakarta text-slate-500">0</span>
                            <span className="text-[9px] font-jakarta text-emerald-400/50">+100</span>
                        </div>
                    </div>

                    {/* Label */}
                    <span className="text-[11px] font-jakarta text-slate-400 mt-0.5">
                        {gexLabel}
                    </span>
                </div>

                {/* Column 2: Squeeze Risk */}
                <div className="flex flex-col items-center gap-2 border-x border-slate-700/25 px-2">
                    <span className="text-[10px] font-bold font-jakarta tracking-[0.12em] text-slate-400 uppercase">
                        Squeeze Risk
                    </span>

                    {/* Circular Ring */}
                    <div className="relative">
                        <SqueezeRing value={squeezeRisk} level={squeezeLevel} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-[18px] font-black font-jakarta tabular-nums leading-none ${getSqueezeColor(squeezeLevel)}`}>
                                {squeezeRisk}
                            </span>
                            <span className="text-[10px] font-jakarta text-slate-500">%</span>
                        </div>
                    </div>

                    {/* Level Badge */}
                    <div className={`text-[10px] font-bold font-jakarta px-2 py-0.5 rounded-sm border ${getSqueezeBadgeBg(squeezeLevel)}`}>
                        <span className={getSqueezeColor(squeezeLevel)}>{squeezeLevel}</span>
                    </div>

                    {/* Warning message at high levels */}
                    {squeezeRisk >= 70 && (
                        <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />
                            <span className="text-[10px] font-jakarta text-red-400">
                                급변동 경고
                            </span>
                        </div>
                    )}
                </div>

                {/* Column 3: Trigger Band */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold font-jakarta tracking-[0.12em] text-slate-400 uppercase text-center">
                        Trigger Band
                    </span>
                    <span className="text-[9px] font-jakarta text-slate-500 text-center -mt-1">
                        S&P 500
                    </span>
                    <TriggerBand
                        support={supportWall}
                        current={currentPrice}
                        resistance={resistanceWall}
                    />
                </div>
            </div>
        </div>
    );
}
