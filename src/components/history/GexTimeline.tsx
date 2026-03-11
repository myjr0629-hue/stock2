"use client";

/**
 * [Phase 3] GEX Timeline Chart — 30-day GEX history from DynamoDB
 * 
 * Shows: GEX value over time, gamma regime zones, key levels.
 * This is Bloomberg-tier — historical GEX tracking is typically behind
 * expensive institutional data paywalls ($300+/mo SpotGamma level).
 * 
 * Insight: Tracks dealer hedging pressure transitions.
 * - Positive→Negative = volatility expansion, downside acceleration
 * - Negative→Positive = stabilization, pin effect
 * 
 * Uses: /api/history?type=gex&ticker=NVDA&days=30
 */

import { useEffect, useState, useMemo } from "react";

interface GexDataPoint {
    timestamp: number;
    gex: number;
    flipLevel: number | null;
    callWall: number | null;
    putFloor: number | null;
    price: number;
    gammaRegime: string;
}

interface GexTimelineProps {
    ticker: string;
    days?: number;
    compact?: boolean;
}

export function GexTimeline({ ticker, days = 30, compact = false }: GexTimelineProps) {
    const [data, setData] = useState<GexDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!ticker) return;
        setLoading(true);
        fetch(`/api/history?type=gex&ticker=${ticker}&days=${days}`)
            .then(r => r.json())
            .then(res => {
                setData(res.data || []);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [ticker, days]);

    const stats = useMemo(() => {
        if (!data.length) return null;
        const gexValues = data.map(d => d.gex);
        const max = Math.max(...gexValues);
        const min = Math.min(...gexValues);
        const range = max - min || 1;
        const latest = data[data.length - 1];
        const prev = data.length > 1 ? data[data.length - 2] : null;
        const trend = prev ? (latest.gex > prev.gex ? 'rising' : 'falling') : 'stable';
        const positiveDays = data.filter(d => d.gex > 0).length;
        const negativeDays = data.filter(d => d.gex < 0).length;

        // [PREMIUM] Gamma Flip Events — detect regime transitions
        const flipEvents: { index: number; from: string; to: string; timestamp: number; price: number; flipLevel: number | null }[] = [];
        for (let i = 1; i < data.length; i++) {
            const prevRegime = data[i - 1].gammaRegime;
            const currRegime = data[i].gammaRegime;
            if (prevRegime !== currRegime && prevRegime && currRegime) {
                flipEvents.push({ index: i, from: prevRegime, to: currRegime, timestamp: data[i].timestamp, price: data[i].price, flipLevel: data[i].flipLevel });
            }
        }

        // [PREMIUM] Anomaly Detection — current GEX vs 30-day percentile
        const sorted = [...gexValues].sort((a, b) => a - b);
        const currentIdx = sorted.findIndex(v => v >= latest.gex);
        const percentile = Math.round((currentIdx / sorted.length) * 100);
        const isAnomaly = percentile >= 90 || percentile <= 10;
        const anomalyLabel = percentile >= 90 ? 'EXTREME HIGH' : percentile <= 10 ? 'EXTREME LOW' : percentile >= 75 ? 'ELEVATED' : percentile <= 25 ? 'DEPRESSED' : 'NORMAL';

        return { max, min, range, latest, trend, positiveDays, negativeDays, flipEvents, percentile, isAnomaly, anomalyLabel };
    }, [data]);

    // Format GEX value
    const formatGex = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
        if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
        return v.toFixed(0);
    };

    if (loading) {
        return (
            <div className={`animate-pulse ${compact ? 'h-16' : 'h-48'} bg-slate-800/30 rounded-xl border border-slate-700/20`} />
        );
    }

    if (error || !data.length || !stats) {
        return compact ? null : (
            <div className="h-32 flex items-center justify-center text-slate-300 text-xs border border-slate-800/40 rounded-xl bg-slate-900/30">
                GEX history unavailable
            </div>
        );
    }

    // Single data point — show value only, no chart line
    if (data.length < 2) {
        const d = data[0];
        const isPos = d.gex >= 0;
        if (compact) return (
            <span className={`text-xs font-mono ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{formatGex(d.gex)}</span>
        );
        return (
            <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isPos ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`} />
                        <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">GEX Timeline</span>
                        <span className="text-xs text-slate-300">{days}D</span>
                    </div>
                    <div className="text-right">
                        <div className={`text-sm font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{formatGex(d.gex)}</div>
                        <div className="text-xs text-slate-300">
                            {d.gammaRegime === 'POSITIVE' ? '🟢 Long Gamma' : d.gammaRegime === 'NEGATIVE' ? '🔴 Short Gamma' : '⚪ Neutral'}
                        </div>
                    </div>
                </div>
                <div className="mt-2 text-xs text-slate-300 text-center">Collecting data — chart appears with 2+ data points</div>
            </div>
        );
    }

    // SVG chart dimensions
    const W = compact ? 200 : 600;
    const H = compact ? 40 : 120;
    const PADDING = compact ? 2 : 8;

    // Build SVG path
    const points = data.map((d, i) => {
        const x = PADDING + (i / (data.length - 1)) * (W - PADDING * 2);
        const y = PADDING + (1 - (d.gex - stats.min) / stats.range) * (H - PADDING * 2);
        return { x, y, gex: d.gex, regime: d.gammaRegime };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    // Fill path (area under curve to zero line)
    const zeroY = PADDING + (1 - (0 - stats.min) / stats.range) * (H - PADDING * 2);
    const fillPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${points[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    // Determine color based on latest regime
    const isPositive = stats.latest.gex >= 0;
    const lineColor = isPositive ? '#10b981' : '#ef4444';
    const fillColor = isPositive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
    const glowColor = isPositive ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';

    // Compact version (for AlphaCard or inline use)
    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
                    <line x1={PADDING} y1={zeroY} x2={W - PADDING} y2={zeroY}
                        stroke="rgba(148,163,184,0.15)" strokeWidth="0.5" strokeDasharray="2 2" />
                    <path d={fillPath} fill={fillColor} />
                    <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" />
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                        r="2" fill={lineColor} />
                </svg>
                <span className={`text-xs font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatGex(stats.latest.gex)}
                </span>
            </div>
        );
    }

    // Full version
    return (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 backdrop-blur-sm p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isPositive ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`} />
                    <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
                        GEX Timeline
                    </span>
                    <span className="text-xs text-slate-300">{days}D</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className={`text-sm font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatGex(stats.latest.gex)}
                        </div>
                        <div className="text-xs text-slate-300">
                            {stats.latest.gammaRegime === 'POSITIVE' ? '🟢 Long Gamma' : stats.latest.gammaRegime === 'NEGATIVE' ? '🔴 Short Gamma' : '⚪ Neutral'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="relative">
                <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
                    {/* Grid lines */}
                    <line x1={PADDING} y1={PADDING} x2={W - PADDING} y2={PADDING}
                        stroke="rgba(148,163,184,0.06)" strokeWidth="0.5" />
                    <line x1={PADDING} y1={H - PADDING} x2={W - PADDING} y2={H - PADDING}
                        stroke="rgba(148,163,184,0.06)" strokeWidth="0.5" />

                    {/* Zero line */}
                    <line x1={PADDING} y1={zeroY} x2={W - PADDING} y2={zeroY}
                        stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" strokeDasharray="4 4" />

                    {/* Positive/Negative zones */}
                    <rect x={PADDING} y={PADDING} width={W - PADDING * 2} height={Math.max(0, zeroY - PADDING)}
                        fill="rgba(16,185,129,0.03)" />
                    <rect x={PADDING} y={zeroY} width={W - PADDING * 2} height={Math.max(0, H - PADDING - zeroY)}
                        fill="rgba(239,68,68,0.03)" />

                    {/* Area fill */}
                    <path d={fillPath} fill={fillColor} />

                    {/* Line with glow */}
                    <path d={linePath} fill="none" stroke={glowColor} strokeWidth="4" />
                    <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" />

                    {/* Latest point with glow */}
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                        r="4" fill={glowColor} />
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                        r="2.5" fill={lineColor} stroke="#0f172a" strokeWidth="1" />
                </svg>

                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 text-xs text-emerald-400/70 font-mono">
                    {formatGex(stats.max)}
                </div>
                <div className="absolute left-0 bottom-0 text-xs text-red-400/70 font-mono">
                    {formatGex(stats.min)}
                </div>
            </div>

            {/* Stats bar + Anomaly Badge */}
            <div className="flex items-center justify-between text-xs text-slate-300">
                <span>
                    <span className="text-emerald-400">▲</span> {stats.positiveDays}d positive
                </span>
                <span>
                    <span className="text-red-400">▼</span> {stats.negativeDays}d negative
                </span>
                {stats.isAnomaly && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold animate-pulse ${stats.percentile >= 90 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'}`}>
                        🔥 {stats.anomalyLabel} ({stats.percentile}th %ile)
                    </span>
                )}
                {!stats.isAnomaly && (
                    <span className="text-slate-300/60">{stats.percentile}th percentile</span>
                )}
                <span className={stats.trend === 'rising' ? 'text-emerald-400' : 'text-red-400'}>
                    {stats.trend === 'rising' ? '↗ Rising' : '↘ Falling'}
                </span>
            </div>

            {/* [PREMIUM] Gamma Flip Event Timeline */}
            {stats.flipEvents.length > 0 && (
                <div className="border-t border-slate-700/30 pt-2 mt-1 space-y-1">
                    <div className="text-xs font-semibold text-slate-300/80 tracking-wider uppercase flex items-center gap-1">
                        <span className="text-amber-400">⚡</span> Gamma Flip Events ({stats.flipEvents.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {stats.flipEvents.slice(-5).map((ev, i) => {
                            const date = new Date(ev.timestamp);
                            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                            const isPositiveFlip = ev.to === 'POSITIVE';
                            return (
                                <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${
                                    isPositiveFlip ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
                                }`}>
                                    <span className="font-mono text-slate-300/60">{dateStr}</span>
                                    <span>{isPositiveFlip ? '🟢' : '🔴'}</span>
                                    <span className="font-medium">{ev.from.slice(0,3)} → {ev.to.slice(0,3)}</span>
                                    <span className="text-slate-300/50 font-mono">${ev.price?.toFixed(0)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
