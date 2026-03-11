import React, { useEffect, useState, useMemo } from "react";
import { Activity, TrendingUp, TrendingDown, BarChart3, Radio, Globe, ShieldAlert, Minus, ChevronUp, ChevronDown } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useMarketStatus } from '@/hooks/useMarketStatus';

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
    rlsiHistory?: { time: string; score: number }[];
}

export default function GravityGauge({ score, loading, session, components, rlsiHistory }: GravityGaugeProps) {
    const [animatedScore, setAnimatedScore] = useState(0);
    const t = useTranslations('guardian');
    const { status: marketStatus } = useMarketStatus();
    const isHoliday = marketStatus.isHoliday;

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
                    <span className="text-xs uppercase tracking-[0.2em] text-white font-black font-jakarta">Gravity Gauge</span>
                    {session && (
                        <span className={`${session === 'PRE' ? 'text-[12px]' : 'text-[12px]'} font-bold px-1.5 py-0.5 rounded ml-auto whitespace-nowrap ${isHoliday ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            session === 'PRE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                session === 'REG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    session === 'POST' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                        'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                            }`}>
                            {isHoliday ? 'HOLIDAY' :
                                session === 'PRE' ? t('preMarketEstimate') :
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
                    <text x="100" y="14" textAnchor="middle" className="fill-white text-[12px] font-black uppercase" letterSpacing="4" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                        RLSI
                    </text>
                </svg>

                {/* Central Score Display */}
                <div className="absolute bottom-0 left-0 right-0 top-6 flex flex-col items-center justify-end pb-1">
                    <span className="text-4xl font-mono font-bold tracking-tighter text-white drop-shadow-lg">
                        {loading ? "--" : Math.round(animatedScore)}
                    </span>
                    <span
                        className="text-[12px] font-black uppercase tracking-widest mt-0.5 px-2 py-0.5 rounded border border-white/10 font-jakarta"
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
                        <span key={z.label} className="text-[12px] font-mono text-slate-300">{z.label}</span>
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
                                <div className="w-[88px] flex-shrink-0">
                                    <div className="text-[12px] font-bold text-white/80 uppercase tracking-wide leading-tight whitespace-nowrap">
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
                                <div className="w-[90px] text-right flex-shrink-0 flex items-center justify-end gap-1 whitespace-nowrap">
                                    <span className="text-[12px] font-mono font-bold" style={{ color: item.color }}>
                                        {Math.round(item.score)}
                                    </span>
                                    <span className="text-[12px] font-bold" style={{ color: interp.color }}>
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
                                    <span className="text-[12px] font-bold text-emerald-400">
                                        {t('bullish')} ×{factorSummary.bull}
                                    </span>
                                </div>
                            )}
                            {factorSummary.bear > 0 && (
                                <div className="flex items-center gap-1">
                                    <ChevronDown className="w-3 h-3 text-red-400" />
                                    <span className="text-[12px] font-bold text-red-400">
                                        {t('bearish')} ×{factorSummary.bear}
                                    </span>
                                </div>
                            )}
                            {factorSummary.bull === 0 && factorSummary.bear === 0 && (
                                <div className="flex items-center gap-1">
                                    <Minus className="w-3 h-3 text-slate-300" />
                                    <span className="text-[12px] font-bold text-slate-300">
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
                            <div className="flex-shrink-0">
                                <div className="text-[12px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                                    {t(`gauge.${key}` as 'gauge.momentum')}
                                </div>
                            </div>
                            <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden">
                                <div className="h-full w-0 rounded-full bg-slate-700" />
                            </div>
                            <div className="w-[90px] text-right flex-shrink-0">
                                <span className="text-[12px] font-mono text-slate-300">--</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* [V10.0] Guardian Score Timeline — ECG-style with insights */}
            {rlsiHistory && rlsiHistory.length >= 2 && !loading && !isHoliday && (
                <div className="w-full max-w-[290px] border-t border-slate-800/50 pt-2 mt-1">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-slate-300 font-jakarta">INTRADAY TREND</span>
                        <span className="text-[12px] font-mono text-slate-300 font-jakarta">{rlsiHistory.length} pts</span>
                    </div>
                    <ScoreTimeline history={rlsiHistory} currentScore={animatedScore} />
                </div>
            )}
        </div>
    );
}

// [V10.0] Guardian Score Timeline — ECG-Style Premium Component
function ScoreTimeline({ history, currentScore }: { history: { time: string; score: number }[]; currentScore: number }) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const W = 280;
    const H = 56;
    const PAD_TOP = 6;
    const PAD_BOT = 6;
    const drawH = H - PAD_TOP - PAD_BOT;

    const scores = history.map(h => h.score);
    const minScore = Math.max(0, Math.min(...scores) - 5);
    const maxScore = Math.min(100, Math.max(...scores) + 5);
    const range = maxScore - minScore || 1;

    // Build SVG points
    const points = history.map((h, i) => {
        const x = (i / (history.length - 1)) * W;
        const y = PAD_TOP + drawH - ((h.score - minScore) / range) * drawH;
        return { x, y, score: h.score, time: h.time };
    });

    // Zone color by RLSI score
    const getZoneColor = (s: number) => {
        if (s >= 70) return '#34d399';   // Bullish — emerald
        if (s >= 55) return '#6ee7b7';   // Mild bull — light emerald
        if (s >= 45) return '#94a3b8';   // Neutral — slate
        if (s >= 30) return '#fbbf24';   // Cautious — amber
        return '#f87171';                 // Bearish — red
    };

    // Create colored line segments
    const segments: { path: string; color: string }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const avgScore = (p1.score + p2.score) / 2;
        segments.push({
            path: `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`,
            color: getZoneColor(avgScore),
        });
    }

    // Fill path for gradient area
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L${W},${PAD_TOP + drawH} L0,${PAD_TOP + drawH} Z`;

    // Last point for pulse
    const lastPoint = points[points.length - 1];
    const lastColor = getZoneColor(currentScore);

    // Hovered point
    const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

    // Time format
    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    // Trend Insight calculation
    const trendInsight = useMemo(() => {
        if (scores.length < 4) return null;
        const recent5 = scores.slice(-5);
        const older5 = scores.slice(-10, -5);
        const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
        const olderAvg = older5.length > 0 ? older5.reduce((a, b) => a + b, 0) / older5.length : recentAvg;
        const delta = recentAvg - olderAvg;
        const dayHigh = Math.max(...scores);
        const dayLow = Math.min(...scores);
        const volatility = dayHigh - dayLow;

        let direction: 'rising' | 'falling' | 'stable';
        let icon: string;
        let color: string;

        if (delta > 3) { direction = 'rising'; icon = '▲'; color = '#34d399'; }
        else if (delta < -3) { direction = 'falling'; icon = '▼'; color = '#f87171'; }
        else { direction = 'stable'; icon = '─'; color = '#94a3b8'; }

        return { direction, icon, color, delta, dayHigh, dayLow, volatility, recentAvg };
    }, [scores]);

    // Zone borders for background bands
    const scoreToY = (s: number) => PAD_TOP + drawH - ((s - minScore) / range) * drawH;
    const zoneWarnTop = Math.max(PAD_TOP, scoreToY(Math.min(maxScore, 60)));
    const zoneWarnBot = Math.min(PAD_TOP + drawH, scoreToY(Math.max(minScore, 40)));
    const showZoneBands = maxScore > 40 && minScore < 60;

    return (
        <div className="relative">
            {/* Score labels */}
            <div className="absolute right-0 top-0 -mr-1 flex flex-col justify-between h-[56px] items-end pointer-events-none" style={{ transform: 'translateX(100%)', paddingLeft: '4px' }}>
                <span className="text-[12px] font-mono font-semibold text-slate-300 leading-none">{maxScore}</span>
                <span className="text-[12px] font-mono font-semibold text-slate-300 leading-none">{minScore}</span>
            </div>

            {/* SVG Chart */}
            <svg
                width="100%"
                height={H}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="overflow-visible cursor-crosshair"
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = ((e.clientX - rect.left) / rect.width) * W;
                    const closest = points.reduce((best, p, i) =>
                        Math.abs(p.x - relX) < Math.abs(points[best].x - relX) ? i : best, 0);
                    setHoveredIdx(closest);
                }}
                onMouseLeave={() => setHoveredIdx(null)}
            >
                <defs>
                    <linearGradient id="ecgFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lastColor} stopOpacity="0.12" />
                        <stop offset="100%" stopColor={lastColor} stopOpacity="0.01" />
                    </linearGradient>
                    <filter id="ecgGlow">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Neutral zone band (40-60) */}
                {showZoneBands && (
                    <rect
                        x={0} y={zoneWarnTop}
                        width={W} height={Math.max(0, zoneWarnBot - zoneWarnTop)}
                        fill="rgba(148,163,184,0.04)"
                        rx={2}
                    />
                )}

                {/* Grid lines */}
                <line x1="0" y1={PAD_TOP} x2={W} y2={PAD_TOP} stroke="rgba(148,163,184,0.12)" strokeWidth="0.5" />
                <line x1="0" y1={PAD_TOP + drawH / 2} x2={W} y2={PAD_TOP + drawH / 2} stroke="rgba(148,163,184,0.08)" strokeWidth="0.5" strokeDasharray="3 6" />
                <line x1="0" y1={PAD_TOP + drawH} x2={W} y2={PAD_TOP + drawH} stroke="rgba(148,163,184,0.12)" strokeWidth="0.5" />

                {/* Gradient fill */}
                <path d={fillPath} fill="url(#ecgFill)" />

                {/* Zone-colored line segments */}
                {segments.map((seg, i) => (
                    <path
                        key={i}
                        d={seg.path}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={hoveredIdx !== null && (hoveredIdx !== i && hoveredIdx !== i + 1) ? 0.4 : 1}
                    />
                ))}

                {/* Hover crosshair + dot */}
                {hoveredPoint && (
                    <>
                        <line x1={hoveredPoint.x} y1={PAD_TOP} x2={hoveredPoint.x} y2={PAD_TOP + drawH} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2 3" />
                        <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="3.5" fill={getZoneColor(hoveredPoint.score)} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
                    </>
                )}

                {/* Current point — pulse animation */}
                {lastPoint && (
                    <>
                        <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill="none" stroke={lastColor} strokeWidth="0.5" opacity="0.3">
                            <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill={lastColor} filter="url(#ecgGlow)" />
                    </>
                )}
            </svg>

            {/* Hover tooltip */}
            {hoveredPoint && hoveredIdx !== null && (
                <div
                    className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-slate-900/95 border border-slate-700/60 shadow-lg backdrop-blur-sm"
                    style={{
                        left: `${Math.min(78, Math.max(2, (hoveredPoint.x / W) * 100))}%`,
                        top: '-28px',
                        transform: 'translateX(-50%)',
                    }}
                >
                    <span className="text-[12px] font-mono font-bold" style={{ color: getZoneColor(hoveredPoint.score) }}>
                        {Math.round(hoveredPoint.score)}
                    </span>
                    <span className="text-[12px] font-mono text-slate-400 ml-1.5">
                        {formatTime(hoveredPoint.time)}
                    </span>
                </div>
            )}

            {/* Time labels */}
            <div className="flex justify-between mt-1 px-0.5">
                <span className="text-[12px] font-mono font-medium text-slate-300">{formatTime(history[0].time)}</span>
                {history.length > 10 && (
                    <span className="text-[12px] font-mono font-medium text-slate-300">{formatTime(history[Math.floor(history.length / 2)].time)}</span>
                )}
                <span className="text-[12px] font-mono font-bold text-slate-200">NOW</span>
            </div>

            {/* Trend Insight — AI narrative text */}
            {trendInsight && (
                <div className="mt-1.5 px-1 py-1 rounded bg-slate-800/30 border border-slate-700/20">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold" style={{ color: trendInsight.color }}>
                            {trendInsight.icon}
                        </span>
                        <span className="text-[12px] text-slate-300 leading-tight">
                            {trendInsight.direction === 'rising' && `RLSI ${trendInsight.delta.toFixed(1)}pt ↑ | H:${trendInsight.dayHigh} L:${trendInsight.dayLow} | Range ${trendInsight.volatility.toFixed(0)}pt`}
                            {trendInsight.direction === 'falling' && `RLSI ${Math.abs(trendInsight.delta).toFixed(1)}pt ↓ | H:${trendInsight.dayHigh} L:${trendInsight.dayLow} | Range ${trendInsight.volatility.toFixed(0)}pt`}
                            {trendInsight.direction === 'stable' && `RLSI stable ±${Math.abs(trendInsight.delta).toFixed(1)}pt | H:${trendInsight.dayHigh} L:${trendInsight.dayLow} | Range ${trendInsight.volatility.toFixed(0)}pt`}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
