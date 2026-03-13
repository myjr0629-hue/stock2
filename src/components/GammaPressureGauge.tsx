"use client";

/**
 * Gamma Pressure Gauge — Bloomberg-tier visual indicator
 * 
 * Semicircle gauge showing real-time dealer gamma positioning:
 * - Needle position: current price relative to Put Floor ↔ Call Wall range
 * - Color: Long Gamma (green) vs Short Gamma (red)
 * - GEX value + Flip Level distance
 */

import { useLocale } from "next-intl";
import { CardTooltip, COMMAND_TOOLTIPS } from '@/components/ui/CardTooltip';

interface GammaPressureGaugeProps {
    netGex: number;
    callWall: number;
    putFloor: number;
    gammaFlipLevel: number;
    currentPrice: number;
    squeezeRisk?: string;
    squeezeScore?: number;
}

export function GammaPressureGauge({
    netGex,
    callWall,
    putFloor,
    gammaFlipLevel,
    currentPrice,
    squeezeRisk = 'LOW',
    squeezeScore = 0,
}: GammaPressureGaugeProps) {
    const locale = useLocale() as "ko" | "en" | "ja";

    // Skip render if no meaningful data
    if (!callWall && !putFloor && !netGex) return null;

    // Calculate gauge position
    const isLongGamma = netGex >= 0;
    const range = callWall && putFloor ? callWall - putFloor : 1;
    const pricePosition = callWall && putFloor && range > 0
        ? Math.max(0, Math.min(1, (currentPrice - putFloor) / range))
        : 0.5;

    // Flip level distance
    const flipDistance = gammaFlipLevel && currentPrice
        ? currentPrice - gammaFlipLevel
        : null;
    const flipPct = gammaFlipLevel && currentPrice
        ? ((currentPrice - gammaFlipLevel) / currentPrice * 100)
        : null;

    // Format GEX value
    const formatGex = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
        if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
        return v.toFixed(0);
    };

    // SVG gauge parameters
    const cx = 100;
    const cy = 75;
    const r = 58;
    const startAngle = Math.PI;
    const needleAngle = startAngle - pricePosition * Math.PI;

    // Arc path helper
    const arcPath = (startA: number, endA: number, radius: number) => {
        const x1 = cx + radius * Math.cos(startA);
        const y1 = cy - radius * Math.sin(startA);
        const x2 = cx + radius * Math.cos(endA);
        const y2 = cy - radius * Math.sin(endA);
        const largeArc = Math.abs(startA - endA) > Math.PI ? 1 : 0;
        return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 0 ${x2} ${y2}`;
    };

    // Needle tip
    const needleX = cx + (r - 10) * Math.cos(needleAngle);
    const needleY = cy - (r - 10) * Math.sin(needleAngle);

    // Flip marker position
    const flipPos = gammaFlipLevel > 0 && putFloor > 0 && callWall > 0
        ? Math.max(0, Math.min(1, (gammaFlipLevel - putFloor) / range))
        : -1;
    const flipA = Math.PI - flipPos * Math.PI;

    // Regime label
    const regimeLabel: Record<string, Record<string, string>> = {
        long: { ko: 'Long Gamma — 가격 안정화 구조', en: 'Long Gamma — Price Stabilization', ja: 'Long Gamma — 価格安定化構造' },
        short: { ko: 'Short Gamma — 변동성 확대 구조', en: 'Short Gamma — Volatility Expansion', ja: 'Short Gamma — ボラティリティ拡大構造' },
    };
    const regime = isLongGamma ? 'long' : 'short';

    return (
        <div className={`rounded-lg backdrop-blur-md shadow-lg relative group transition-all duration-500 ${
            isLongGamma
                ? 'border border-emerald-500/30 bg-slate-900/60 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                : 'border border-red-500/30 bg-slate-900/60 shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-[0_0_25px_rgba(239,68,68,0.2)]'
        }`}>
            {/* Gradient mesh background + corner accents */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full ${isLongGamma ? 'bg-emerald-500/[0.08]' : 'bg-red-500/[0.08]'} blur-3xl`} />
                <div className={`absolute -bottom-6 -left-6 w-28 h-28 rounded-full ${isLongGamma ? 'bg-emerald-500/[0.05]' : 'bg-red-500/[0.05]'} blur-2xl`} />
                <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-white/[0.03] to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-500/30 to-transparent" />
                <div className="absolute top-2 left-2 w-3.5 h-3.5 border-l-2 border-t-2 border-slate-500/25 rounded-tl" />
                <div className="absolute top-2 right-2 w-3.5 h-3.5 border-r-2 border-t-2 border-slate-500/25 rounded-tr" />
                <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-l-2 border-b-2 border-slate-500/25 rounded-bl" />
                <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-r-2 border-b-2 border-slate-500/25 rounded-br" />
            </div>

            {/* Header */}
            <div className="relative z-10 p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isLongGamma ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]'} animate-pulse`} />
                    <h3 className="text-[12px] font-black text-white uppercase tracking-widest font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.GAMMA_PRESSURE.tooltip} badge={COMMAND_TOOLTIPS.GAMMA_PRESSURE.badge}>Gamma Pressure</CardTooltip></h3>
                </div>
                <span className={`text-[12px] px-1.5 py-0.5 rounded border font-mono font-bold font-jakarta flex items-center gap-1.5 ${
                    isLongGamma
                        ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-900/50 text-red-400 border-red-500/30'
                }`}>
                    <div className={`w-2 h-2 rounded-full ${isLongGamma ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {isLongGamma ? 'LONG' : 'SHORT'}
                </span>
            </div>

            {/* Gauge SVG */}
            <div className="relative z-10 px-3 pt-3 pb-1 flex justify-center">
                <svg width="200" height="110" viewBox="0 -5 200 110" className="overflow-visible">
                    {/* Text shadow filter for readability */}
                    <defs>
                        <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.9" />
                        </filter>
                    </defs>

                    {/* Background arc — 4 segments with stronger colors */}
                    <path d={arcPath(Math.PI, Math.PI * 0.75, r)}
                        fill="none" stroke="rgba(239,68,68,0.35)" strokeWidth="14" strokeLinecap="round" />
                    <path d={arcPath(Math.PI * 0.75, Math.PI * 0.5, r)}
                        fill="none" stroke="rgba(251,191,36,0.25)" strokeWidth="14" strokeLinecap="round" />
                    <path d={arcPath(Math.PI * 0.5, Math.PI * 0.25, r)}
                        fill="none" stroke="rgba(251,191,36,0.25)" strokeWidth="14" strokeLinecap="round" />
                    <path d={arcPath(Math.PI * 0.25, 0, r)}
                        fill="none" stroke="rgba(16,185,129,0.35)" strokeWidth="14" strokeLinecap="round" />

                    {/* Active arc — stronger color */}
                    <path d={arcPath(Math.PI, needleAngle, r)}
                        fill="none"
                        stroke={isLongGamma ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'}
                        strokeWidth="14" strokeLinecap="round" />

                    {/* Flip level marker */}
                    {flipPos >= 0 && (() => {
                        const fx = cx + (r + 4) * Math.cos(flipA);
                        const fy = cy - (r + 4) * Math.sin(flipA);
                        return (
                            <>
                                <circle cx={fx} cy={fy} r="4" fill="#fbbf24" stroke="#0f172a" strokeWidth="1.5" />
                                <text x={fx} y={fy - 8} textAnchor="middle"
                                    fill="#fbbf24" fontSize="10" fontFamily="monospace" fontWeight="bold"
                                    filter="url(#textShadow)">FLIP</text>
                            </>
                        );
                    })()}

                    {/* Needle with glow */}
                    <line x1={cx} y1={cy} x2={needleX} y2={needleY}
                        stroke={isLongGamma ? '#10b981' : '#ef4444'} strokeWidth="2.5" strokeLinecap="round"
                        filter="drop-shadow(0 0 3px rgba(255,255,255,0.3))" />
                    <circle cx={needleX} cy={needleY} r="4"
                        fill={isLongGamma ? '#10b981' : '#ef4444'}
                        stroke="#0f172a" strokeWidth="1.5" />
                    <circle cx={cx} cy={cy} r="5"
                        fill={isLongGamma ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}
                        stroke={isLongGamma ? '#10b981' : '#ef4444'} strokeWidth="2" />

                    {/* Scale labels with shadow */}
                    <text x={cx - r - 4} y={cy + 14} textAnchor="middle"
                        fill="#cbd5e1" fontSize="12" fontFamily="monospace" fontWeight="600"
                        filter="url(#textShadow)">PUT</text>
                    <text x={cx + r + 4} y={cy + 14} textAnchor="middle"
                        fill="#cbd5e1" fontSize="12" fontFamily="monospace" fontWeight="600"
                        filter="url(#textShadow)">CALL</text>

                    {/* GEX value center — with dark halo for readability */}
                    <text x={cx} y={cy - 16} textAnchor="middle"
                        fill={isLongGamma ? '#10b981' : '#ef4444'} fontSize="16" fontFamily="monospace" fontWeight="bold"
                        filter="url(#textShadow)">
                        {formatGex(netGex)}
                    </text>
                    <text x={cx} y={cy - 3} textAnchor="middle"
                        fill="#cbd5e1" fontSize="12" fontFamily="monospace"
                        filter="url(#textShadow)">NET GEX</text>
                </svg>
            </div>

            {/* Info section */}
            <div className="relative z-10 px-3 pb-3 space-y-1.5">
                {/* Regime description */}
                <div className="text-[12px] text-slate-300 font-jakarta leading-[1.5]">
                    {regimeLabel[regime][locale]}
                </div>

                {/* Key levels */}
                <div className="flex items-center justify-between text-[12px] font-jakarta">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-400/80" />
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.PUT_FLOOR.tooltip} position="top"><span className="text-slate-300">Put Floor</span></CardTooltip>
                        <span className="text-red-400 font-mono font-bold">${putFloor > 0 ? putFloor.toFixed(0) : '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400/80" />
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.CALL_WALL.tooltip} position="top"><span className="text-slate-300">Call Wall</span></CardTooltip>
                        <span className="text-emerald-400 font-mono font-bold">${callWall > 0 ? callWall.toFixed(0) : '—'}</span>
                    </div>
                </div>

                {/* Flip level distance */}
                {flipDistance !== null && gammaFlipLevel > 0 && (
                    <div className="flex items-center justify-between text-[12px] font-jakarta border-t border-white/5 pt-1.5">
                        <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 12 12" className="text-amber-400 shrink-0"><path d="M6 1L7.5 4.5L11 5.5L8.5 8L9 11.5L6 9.5L3 11.5L3.5 8L1 5.5L4.5 4.5Z" fill="currentColor" /></svg>
                            <CardTooltip tooltip={COMMAND_TOOLTIPS.GAMMA_FLIP.tooltip} position="top"><span className="text-slate-300">Gamma Flip</span></CardTooltip>
                            <span className="text-amber-400 font-mono font-bold">${gammaFlipLevel.toFixed(0)}</span>
                        </div>
                        <span className={`font-mono font-bold ${flipDistance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {flipDistance >= 0 ? '+' : ''}{flipPct?.toFixed(1)}%
                        </span>
                    </div>
                )}

                {/* Squeeze indicator */}
                {squeezeRisk && squeezeRisk !== 'NONE' && squeezeRisk !== 'LOW' && (
                    <div className="flex items-center justify-between text-[12px] font-jakarta">
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.SQUEEZE_RISK.tooltip} position="top"><span className="text-slate-300">
                            {locale === 'ko' ? '스퀴즈 리스크' : locale === 'ja' ? 'スクイーズリスク' : 'Squeeze Risk'}
                        </span></CardTooltip>
                        <span className={`font-bold font-mono ${
                            squeezeRisk === 'HIGH' || squeezeRisk === 'CRITICAL' ? 'text-red-400' :
                            squeezeRisk === 'MEDIUM' ? 'text-amber-400' : 'text-slate-300'
                        }`}>
                            {squeezeRisk} {squeezeScore > 0 ? `(${squeezeScore})` : ''}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
