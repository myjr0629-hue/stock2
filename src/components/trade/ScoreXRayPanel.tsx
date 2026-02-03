"use client";

import { useMemo } from "react";

interface ScoreBreakdown {
    momentum: number;  // 0-20
    options: number;   // 0-20
    structure: number; // 0-20
    regime: number;    // 0-20
    risk: number;      // 0-20
}

interface ScoreMetrics {
    changePct?: number;
    pcr?: number;
    vix?: number;
    atr?: number;
}

interface ScoreXRayProps {
    symbol: string;
    scores: ScoreBreakdown;
    metrics?: ScoreMetrics;
}

/**
 * Score X-Ray Panel
 * 5-Factor Alpha Score breakdown with radar visualization
 */
export function ScoreXRayPanel({ symbol, scores, metrics }: ScoreXRayProps) {
    const totalScore = useMemo(() => {
        return scores.momentum + scores.options + scores.structure + scores.regime + scores.risk;
    }, [scores]);

    const tier = useMemo(() => {
        if (totalScore >= 75) return { label: "ACTIONABLE", color: "emerald" };
        if (totalScore >= 55) return { label: "WATCH", color: "amber" };
        return { label: "FILLER", color: "slate" };
    }, [totalScore]);

    const factors = [
        {
            key: "momentum",
            label: "Momentum",
            value: scores.momentum,
            max: 20,
            metric: metrics?.changePct !== undefined ? `${metrics.changePct > 0 ? '+' : ''}${metrics.changePct.toFixed(1)}%` : undefined
        },
        {
            key: "options",
            label: "Options",
            value: scores.options,
            max: 20,
            metric: metrics?.pcr !== undefined ? `PCR ${metrics.pcr.toFixed(2)}` : undefined
        },
        {
            key: "structure",
            label: "Structure",
            value: scores.structure,
            max: 20,
            metric: metrics?.atr !== undefined ? `ATR ${metrics.atr.toFixed(2)}` : undefined
        },
        {
            key: "regime",
            label: "Regime",
            value: scores.regime,
            max: 20,
            metric: metrics?.vix !== undefined ? `VIX ${metrics.vix.toFixed(1)}` : undefined
        },
        {
            key: "risk",
            label: "Risk",
            value: scores.risk,
            max: 20,
            metric: undefined
        },
    ];

    // Calculate radar chart points
    const radarPoints = useMemo(() => {
        const centerX = 80;
        const centerY = 70;
        const radius = 50;
        const angleOffset = -90; // Start from top

        return factors.map((factor, i) => {
            const angle = ((360 / factors.length) * i + angleOffset) * (Math.PI / 180);
            const normalizedValue = factor.value / factor.max;
            const x = centerX + Math.cos(angle) * radius * normalizedValue;
            const y = centerY + Math.sin(angle) * radius * normalizedValue;

            // Label positions (outside the radar)
            const labelX = centerX + Math.cos(angle) * (radius + 20);
            const labelY = centerY + Math.sin(angle) * (radius + 20);

            return {
                x,
                y,
                labelX,
                labelY,
                label: factor.label,
                value: factor.value,
                angle: angle * (180 / Math.PI)
            };
        });
    }, [factors]);

    // Create polygon path
    const polygonPath = radarPoints.map((p, i) =>
        `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ') + ' Z';

    // Grid lines for radar
    const gridLevels = [0.25, 0.5, 0.75, 1];
    const gridPaths = gridLevels.map(level => {
        const centerX = 80;
        const centerY = 70;
        const radius = 50 * level;
        const angleOffset = -90;

        return factors.map((_, i) => {
            const angle = ((360 / factors.length) * i + angleOffset) * (Math.PI / 180);
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ') + ' Z';
    });

    return (
        <div className="relative bg-gradient-to-br from-[#0a0a1a]/95 to-[#0f1428]/95 backdrop-blur-xl rounded-2xl border border-[#1a2744] shadow-2xl overflow-hidden">
            {/* Subtle glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative px-6 py-4 border-b border-[#1a2744]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-blue-500 rounded-full" />
                        <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                            Alpha Score Breakdown
                        </h3>
                    </div>
                    <div className="text-lg font-mono font-bold text-white">
                        {symbol}
                    </div>
                </div>
            </div>

            {/* Radar Chart */}
            <div className="relative px-6 py-6">
                <svg viewBox="0 0 160 140" className="w-full h-auto max-h-[200px]">
                    {/* Grid lines */}
                    {gridPaths.map((path, i) => (
                        <path
                            key={i}
                            d={path}
                            fill="none"
                            stroke="#1a2744"
                            strokeWidth="0.5"
                            opacity={0.5 + i * 0.15}
                        />
                    ))}

                    {/* Axis lines */}
                    {radarPoints.map((point, i) => (
                        <line
                            key={i}
                            x1={80}
                            y1={70}
                            x2={80 + Math.cos((point.angle - 90) * Math.PI / 180) * 50}
                            y2={70 + Math.sin((point.angle - 90) * Math.PI / 180) * 50}
                            stroke="#1a2744"
                            strokeWidth="0.5"
                        />
                    ))}

                    {/* Filled polygon */}
                    <path
                        d={polygonPath}
                        fill="url(#radarGradient)"
                        stroke="url(#radarStroke)"
                        strokeWidth="2"
                        opacity="0.8"
                    />

                    {/* Data points */}
                    {radarPoints.map((point, i) => (
                        <circle
                            key={i}
                            cx={point.x}
                            cy={point.y}
                            r="3"
                            fill="#00d4aa"
                            stroke="#fff"
                            strokeWidth="1"
                        />
                    ))}

                    {/* Labels */}
                    {radarPoints.map((point, i) => (
                        <text
                            key={i}
                            x={point.labelX}
                            y={point.labelY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-slate-400 text-[8px] font-medium uppercase"
                        >
                            {point.label}
                        </text>
                    ))}

                    {/* Gradients */}
                    <defs>
                        <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00d4aa" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#00a3ff" stopOpacity="0.2" />
                        </linearGradient>
                        <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00d4aa" />
                            <stop offset="100%" stopColor="#00a3ff" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>

            {/* Factor Bars */}
            <div className="relative px-6 pb-6 space-y-3">
                {factors.map((factor) => (
                    <div key={factor.key} className="flex items-center gap-4">
                        <div className="w-20 text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                            {factor.label}
                        </div>
                        <div className="flex-1 h-2 bg-[#0f1428] rounded-full overflow-hidden border border-[#1a2744]">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
                                style={{ width: `${(factor.value / factor.max) * 100}%` }}
                            />
                        </div>
                        <div className="w-16 text-right">
                            <span className="text-xs font-mono font-bold text-white">
                                {factor.value}/{factor.max}
                            </span>
                        </div>
                        {factor.metric && (
                            <div className="w-20 text-right">
                                <span className="text-[10px] font-mono text-slate-500">
                                    {factor.metric}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Total Score */}
            <div className="relative px-6 py-4 border-t border-[#1a2744] flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="text-3xl font-mono font-black text-white">
                        {totalScore}
                        <span className="text-lg text-slate-500">/100</span>
                    </div>
                </div>
                <div className={`px-4 py-1.5 rounded-lg border font-bold text-xs uppercase tracking-wider
                    ${tier.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : ''}
                    ${tier.color === 'amber' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : ''}
                    ${tier.color === 'slate' ? 'bg-slate-500/10 border-slate-500/30 text-slate-400' : ''}
                `}>
                    {tier.label}
                </div>
            </div>
        </div>
    );
}

export default ScoreXRayPanel;
