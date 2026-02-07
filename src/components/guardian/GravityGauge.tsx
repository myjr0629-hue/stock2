import React, { useEffect, useState, useMemo } from "react";
import { Activity, TrendingUp, TrendingDown, BarChart3, Radio, Globe, ShieldAlert, Minus, ChevronUp, ChevronDown } from "lucide-react";
import { useTranslations } from 'next-intl';

interface RLSIComponents {
    priceActionRaw: number;
    priceActionScore: number;
    breadthPct: number;
    breadthScore: number;
    adRatio: number;
    volumeBreadth: number;
    breadthSignal: string;
    breadthDivergent: boolean;
    sentimentRaw: number;
    sentimentScore: number;
    momentumRaw: number;
    momentumScore: number;
    rotationScore: number;
    yieldRaw: number;
    yieldPenalty: number;
    vix: number;
    vixMultiplier: number;
}

interface GravityGaugeProps {
    score: number;
    loading?: boolean;
    session?: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    components?: RLSIComponents;
}

export default function GravityGauge({ score, loading, session, components }: GravityGaugeProps) {
    const [animatedScore, setAnimatedScore] = useState(0);
    const t = useTranslations('guardian');

    useEffect(() => {
        const timer = setTimeout(() => setAnimatedScore(score), 100);
        return () => clearTimeout(timer);
    }, [score]);

    // Calculate Gauge Parameters
    const radius = 60;
    const stroke = 8;
    const normalizedScore = Math.min(Math.max(animatedScore, 0), 100);
    const circumference = 2 * Math.PI * radius;
    const maxOffset = circumference / 2;
    const offset = maxOffset - (normalizedScore / 100) * maxOffset;

    // Determine Status
    let statusText = "NEUTRAL";
    let statusColor = "#94a3b8";
    if (normalizedScore >= 80) { statusText = "OVERHEATED"; statusColor = "#f43f5e"; }
    else if (normalizedScore >= 60) { statusText = "BULLISH"; statusColor = "#34d399"; }
    else if (normalizedScore <= 20) { statusText = "OVERSOLD"; statusColor = "#f43f5e"; }
    else if (normalizedScore <= 40) { statusText = "BEARISH"; statusColor = "#60a5fa"; }

    // Score interpretation helper
    const getInterpretation = (val: number): { text: string; color: string } => {
        if (val >= 80) return { text: t('gauge.robust'), color: '#34d399' };
        if (val >= 60) return { text: t('gauge.healthy'), color: '#6ee7b7' };
        if (val >= 45) return { text: t('gauge.stable'), color: '#94a3b8' };
        if (val >= 30) return { text: t('gauge.caution'), color: '#fbbf24' };
        return { text: t('gauge.weak'), color: '#f87171' };
    };

    // Decomposition data with i18n labels
    const decomposition = components ? [
        {
            label: t('gauge.momentum'),
            score: components.momentumScore,
            icon: TrendingUp,
            color: components.momentumScore >= 55 ? "#34d399" : components.momentumScore <= 45 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.breadth'),
            score: components.breadthScore,
            icon: Globe,
            color: components.breadthScore >= 55 ? "#34d399" : components.breadthScore <= 40 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.priceAction'),
            score: components.priceActionScore,
            icon: BarChart3,
            color: components.priceActionScore >= 55 ? "#34d399" : components.priceActionScore <= 45 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.rotation'),
            score: components.rotationScore,
            icon: Radio,
            color: components.rotationScore >= 55 ? "#34d399" : components.rotationScore <= 40 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.sentiment'),
            score: components.sentimentScore,
            icon: Activity,
            color: components.sentimentScore >= 55 ? "#34d399" : components.sentimentScore <= 45 ? "#f43f5e" : "#94a3b8"
        }
    ] : [];

    // Factor summary: count bullish vs bearish factors
    const factorSummary = useMemo(() => {
        if (!components) return null;
        let bull = 0;
        let bear = 0;
        decomposition.forEach(d => {
            if (d.score >= 60) bull++;
            else if (d.score <= 40) bear++;
        });
        return { bull, bear, total: decomposition.length };
    }, [components, decomposition]);

    // Score scale zones
    const scaleZones = [
        { label: '0', pos: 0 },
        { label: '20', pos: 20 },
        { label: '40', pos: 40 },
        { label: '60', pos: 60 },
        { label: '80', pos: 80 },
        { label: '100', pos: 100 }
    ];

    return (
        <div className="flex flex-col items-center justify-start h-full relative p-3 pt-4">
            {/* Header */}
            <div className="w-full px-2 mb-1">
                <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-white opacity-70" />
                    <span className="text-xs uppercase tracking-[0.2em] text-white font-black">Gravity Gauge</span>
                    {session && (
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ml-auto ${session === 'PRE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
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
            </div>

            {/* Main Gauge Container */}
            <div className="relative mt-0">
                <svg width="200" height="115" viewBox="0 0 200 115" className="overflow-visible">
                    <defs>
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#60a5fa" />
                            <stop offset="50%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#f43f5e" />
                        </linearGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* TICK MARKS */}
                    {Array.from({ length: 31 }).map((_, i) => {
                        const angle = Math.PI - (i / 30) * Math.PI;
                        const cx = 100;
                        const cy = 100;
                        const rInner = 68;
                        const rOuter = i % 5 === 0 ? 76 : 72;

                        const x1 = cx + rInner * Math.cos(angle);
                        const y1 = cy - rInner * Math.sin(angle);
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

                    {/* RLSI Label — centered above the arc */}
                    <text x="100" y="14" textAnchor="middle" className="fill-white text-[12px] font-black uppercase" letterSpacing="4">
                        RLSI
                    </text>
                </svg>

                {/* Central Score Display */}
                <div className="absolute bottom-0 left-0 right-0 top-6 flex flex-col items-center justify-end pb-1">
                    <span className="text-4xl font-mono font-bold tracking-tighter text-white drop-shadow-lg">
                        {loading ? "--" : Math.round(animatedScore)}
                    </span>
                    <span
                        className="text-[9px] font-black uppercase tracking-widest mt-0.5 px-2 py-0.5 rounded border border-white/10"
                        style={{ color: statusColor, borderColor: `${statusColor}33`, backgroundColor: `${statusColor}11` }}
                    >
                        {statusText}
                    </span>
                </div>
            </div>

            {/* Score Scale Bar — replaces "RLSI 시장건강도" */}
            <div className="w-full max-w-[260px] mt-1 mb-1">
                <div className="relative h-[6px] rounded-full overflow-hidden"
                    style={{ background: 'linear-gradient(90deg, #60a5fa 0%, #34d399 40%, #34d399 60%, #f43f5e 100%)' }}>
                    {/* Score position marker */}
                    <div
                        className="absolute top-[-3px] w-[3px] h-[12px] bg-white rounded-full shadow-lg transition-all duration-1000 ease-out"
                        style={{ left: `${normalizedScore}%`, transform: 'translateX(-50%)' }}
                    />
                </div>
                {/* Scale labels */}
                <div className="flex justify-between mt-0.5 px-0.5">
                    {scaleZones.map(z => (
                        <span key={z.label} className="text-[7px] font-mono text-slate-600">{z.label}</span>
                    ))}
                </div>
            </div>

            {/* === RLSI DECOMPOSITION BARS === */}
            {components && !loading && (
                <div className="w-full max-w-[290px] border-t border-slate-800/50 pt-2 space-y-[5px]">
                    {decomposition.map((item, idx) => {
                        const Icon = item.icon;
                        const interp = getInterpretation(item.score);
                        return (
                            <div key={idx} className="flex items-center gap-1.5 group">
                                {/* Icon */}
                                <Icon className="w-3 h-3 flex-shrink-0 opacity-60" style={{ color: item.color }} />
                                {/* Label */}
                                <div className="w-[52px] flex-shrink-0">
                                    <div className="text-[9px] font-bold text-white/80 uppercase tracking-wide leading-tight truncate">
                                        {item.label}
                                    </div>
                                </div>
                                {/* Bar */}
                                <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden relative">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${Math.min(100, Math.max(2, item.score))}%`,
                                            background: `linear-gradient(90deg, ${item.color}66, ${item.color})`,
                                            boxShadow: `0 0 6px ${item.color}40`
                                        }}
                                    />
                                    {/* 50% marker */}
                                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600/30" />
                                </div>
                                {/* Score + Interpretation */}
                                <div className="w-[68px] text-right flex-shrink-0 flex items-center justify-end gap-1">
                                    <span className="text-[10px] font-mono font-bold" style={{ color: item.color }}>
                                        {Math.round(item.score)}
                                    </span>
                                    <span className="text-[8px] font-bold" style={{ color: interp.color }}>
                                        {interp.text}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {/* Factor Summary Row */}
                    {factorSummary && (
                        <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-800/30 mt-1">
                            {factorSummary.bull > 0 && (
                                <div className="flex items-center gap-1">
                                    <ChevronUp className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[9px] font-bold text-emerald-400">
                                        {t('bullish')} ×{factorSummary.bull}
                                    </span>
                                </div>
                            )}
                            {factorSummary.bear > 0 && (
                                <div className="flex items-center gap-1">
                                    <ChevronDown className="w-3 h-3 text-red-400" />
                                    <span className="text-[9px] font-bold text-red-400">
                                        {t('bearish')} ×{factorSummary.bear}
                                    </span>
                                </div>
                            )}
                            {factorSummary.bull === 0 && factorSummary.bear === 0 && (
                                <div className="flex items-center gap-1">
                                    <Minus className="w-3 h-3 text-slate-400" />
                                    <span className="text-[9px] font-bold text-slate-400">
                                        {t('neutral')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Loading state — same layout, just placeholders */}
            {(!components || loading) && (
                <div className="w-full max-w-[290px] border-t border-slate-800/50 pt-2 space-y-[5px]">
                    {['momentum', 'breadth', 'priceAction', 'rotation', 'sentiment'].map((key) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-slate-800 animate-pulse flex-shrink-0" />
                            <div className="w-[52px] flex-shrink-0">
                                <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">
                                    {t(`gauge.${key}` as 'gauge.momentum')}
                                </div>
                            </div>
                            <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden">
                                <div className="h-full w-0 rounded-full bg-slate-700" />
                            </div>
                            <div className="w-[68px] text-right flex-shrink-0">
                                <span className="text-[10px] font-mono text-slate-600">--</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
