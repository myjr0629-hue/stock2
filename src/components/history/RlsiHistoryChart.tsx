"use client";

/**
 * [Phase 3] RLSI History Mini Chart — Market regime tracker from DynamoDB
 * 
 * Shows RLSI (Real-time Leadership Stability Index) over time.
 * Color zones: Green (Stable) → Yellow (Transitional) → Red (Unstable)
 * 
 * Uses: /api/history?type=rlsi&days=30
 */

import { useEffect, useState, useMemo } from "react";

interface RlsiDataPoint {
    pk: string;
    timestamp: number;
    rlsi: number;
    momentum: number;
    participation: number;
    priceTrend: number;
    rotation: number;
    sentiment: number;
    regime: string;
}

interface RlsiHistoryChartProps {
    days?: number;
    height?: number;
}

export function RlsiHistoryChart({ days = 30, height = 80 }: RlsiHistoryChartProps) {
    const [data, setData] = useState<RlsiDataPoint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/history?type=rlsi&days=${days}`)
            .then(r => r.json())
            .then(res => {
                setData(res.data || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [days]);

    const stats = useMemo(() => {
        if (!data.length) return null;
        const values = data.map(d => d.rlsi);
        const max = Math.max(...values, 100);
        const min = Math.min(...values, 0);
        const latest = data[data.length - 1];
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        return { max, min, latest, avg };
    }, [data]);

    if (loading) {
        return <div className="animate-pulse h-20 bg-slate-800/30 rounded-xl border border-slate-700/20" />;
    }

    if (!data.length || !stats) return null;

    const W = 400;
    const H = height;
    const P = 4;

    // Color based on RLSI value
    const getColor = (rlsi: number) => {
        if (rlsi >= 70) return '#10b981'; // Stable — emerald
        if (rlsi >= 40) return '#f59e0b'; // Transitional — amber
        return '#ef4444'; // Unstable — red
    };

    // Build gradient path points
    const points = data.map((d, i) => {
        const x = P + (i / (data.length - 1)) * (W - P * 2);
        const y = P + (1 - d.rlsi / 100) * (H - P * 2);
        return { x, y, rlsi: d.rlsi, regime: d.regime };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${H - P} L ${points[0].x.toFixed(1)} ${H - P} Z`;

    const latestColor = getColor(stats.latest.rlsi);
    const latestLabel = stats.latest.rlsi >= 70 ? 'STABLE' : stats.latest.rlsi >= 40 ? 'TRANSITIONAL' : 'UNSTABLE';

    return (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 backdrop-blur-sm p-4 space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: latestColor, boxShadow: `0 0 6px ${latestColor}60` }} />
                    <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
                        RLSI Timeline
                    </span>
                    <span className="text-[10px] text-slate-500">{days}D</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold" style={{ color: latestColor }}>
                        {stats.latest.rlsi.toFixed(0)}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ color: latestColor, backgroundColor: `${latestColor}15`, border: `1px solid ${latestColor}30` }}>
                        {latestLabel}
                    </span>
                </div>
            </div>

            {/* Chart */}
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
                {/* Zone backgrounds */}
                {/* Stable zone (70-100) */}
                <rect x={P} y={P} width={W - P * 2} height={(H - P * 2) * 0.3}
                    fill="rgba(16,185,129,0.04)" />
                {/* Transitional zone (40-70) */}
                <rect x={P} y={P + (H - P * 2) * 0.3} width={W - P * 2} height={(H - P * 2) * 0.3}
                    fill="rgba(245,158,11,0.03)" />
                {/* Unstable zone (0-40) */}
                <rect x={P} y={P + (H - P * 2) * 0.6} width={W - P * 2} height={(H - P * 2) * 0.4}
                    fill="rgba(239,68,68,0.03)" />

                {/* Zone lines */}
                <line x1={P} y1={P + (H - P * 2) * 0.3} x2={W - P} y2={P + (H - P * 2) * 0.3}
                    stroke="rgba(16,185,129,0.15)" strokeWidth="0.5" strokeDasharray="3 3" />
                <line x1={P} y1={P + (H - P * 2) * 0.6} x2={W - P} y2={P + (H - P * 2) * 0.6}
                    stroke="rgba(239,68,68,0.15)" strokeWidth="0.5" strokeDasharray="3 3" />

                {/* Area fill */}
                <path d={fillPath} fill={`${latestColor}10`} />

                {/* Main line segments colored by value */}
                {points.map((p, i) => {
                    if (i === 0) return null;
                    const prev = points[i - 1];
                    const color = getColor(p.rlsi);
                    return (
                        <line key={i}
                            x1={prev.x} y1={prev.y} x2={p.x} y2={p.y}
                            stroke={color} strokeWidth="1.5" strokeLinecap="round"
                        />
                    );
                })}

                {/* Latest point */}
                <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                    r="3" fill={latestColor} stroke="#0f172a" strokeWidth="1" />
            </svg>

            {/* Zone legend */}
            <div className="flex items-center justify-between text-[9px] text-slate-500">
                <div className="flex items-center gap-3">
                    <span><span className="text-emerald-400">■</span> Stable (70+)</span>
                    <span><span className="text-amber-400">■</span> Transition (40-70)</span>
                    <span><span className="text-red-400">■</span> Unstable (&lt;40)</span>
                </div>
                <span>Avg: {stats.avg.toFixed(0)}</span>
            </div>
        </div>
    );
}
