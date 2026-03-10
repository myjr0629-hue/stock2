"use client";

/**
 * [Phase 3] Sector Rotation Heatmap — Daily sector performance from DynamoDB
 * 
 * Shows 10 sectors over 30 days as a color-coded heatmap.
 * Green = positive change, Red = negative, Intensity = magnitude.
 * 
 * Uses: /api/history?type=sector&sectorId={id}&days=30
 */

import { useEffect, useState } from "react";

interface SectorDay {
    sectorId: string;
    date: string;
    avgChange: number;
    ranking: number;
    leadTicker: string;
    lagTicker: string;
}

const SECTOR_LABELS: Record<string, string> = {
    m7: "M7",
    physical_ai: "Physical AI",
    silicon_core: "Silicon Core",
    power_matrix: "Power Matrix",
    bio_pulse: "Bio Pulse",
    cyber_shield: "Cyber Shield",
    orbit_defense: "Orbit Defense",
    quantum_edge: "Quantum Edge",
    fintech_pulse: "FinTech",
    cloud_fortress: "Cloud Fortress",
};

const SECTORS = Object.keys(SECTOR_LABELS);

export function SectorRotationHeatmap({ days = 20 }: { days?: number }) {
    const [sectorData, setSectorData] = useState<Map<string, SectorDay[]>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all(
            SECTORS.map(async (sectorId) => {
                try {
                    const res = await fetch(`/api/history?type=sector&sectorId=${sectorId}&days=${days}`);
                    const json = await res.json();
                    return { sectorId, data: json.data || [] };
                } catch {
                    return { sectorId, data: [] };
                }
            })
        ).then(results => {
            const map = new Map<string, SectorDay[]>();
            results.forEach(r => map.set(r.sectorId, r.data));
            setSectorData(map);
            setLoading(false);
        });
    }, [days]);

    if (loading) {
        return <div className="animate-pulse h-64 bg-slate-800/30 rounded-xl border border-slate-700/20" />;
    }

    // Get all unique dates across all sectors
    const allDates = new Set<string>();
    sectorData.forEach(data => data.forEach(d => allDates.add(d.date)));
    const sortedDates = [...allDates].sort().slice(-days);

    if (sortedDates.length === 0) {
        return (
            <div className="h-32 flex items-center justify-center text-slate-500 text-xs border border-slate-800/40 rounded-xl bg-slate-900/30">
                Sector rotation data collecting...
            </div>
        );
    }

    // Color function based on avgChange
    const getHeatColor = (change: number) => {
        if (change >= 2) return 'rgba(16,185,129,0.7)';
        if (change >= 1) return 'rgba(16,185,129,0.45)';
        if (change >= 0.3) return 'rgba(16,185,129,0.25)';
        if (change >= 0) return 'rgba(16,185,129,0.1)';
        if (change >= -0.3) return 'rgba(239,68,68,0.1)';
        if (change >= -1) return 'rgba(239,68,68,0.25)';
        if (change >= -2) return 'rgba(239,68,68,0.45)';
        return 'rgba(239,68,68,0.7)';
    };

    // Calculate current rankings (based on most recent date)
    const latestDate = sortedDates[sortedDates.length - 1];
    const rankings: { sectorId: string; change: number }[] = [];
    SECTORS.forEach(sectorId => {
        const data = sectorData.get(sectorId) || [];
        const latest = data.find(d => d.date === latestDate);
        rankings.push({ sectorId, change: latest?.avgChange || 0 });
    });
    rankings.sort((a, b) => b.change - a.change);

    return (
        <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 backdrop-blur-sm p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
                        Sector Rotation
                    </span>
                    <span className="text-[10px] text-slate-500">{sortedDates.length}D Heatmap</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-slate-500">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.5)' }} />
                    <span>Bear</span>
                    <span className="w-3 h-3 rounded mx-1" style={{ backgroundColor: 'rgba(148,163,184,0.1)' }} />
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(16,185,129,0.5)' }} />
                    <span>Bull</span>
                </div>
            </div>

            {/* Heatmap grid */}
            <div className="overflow-x-auto">
                <div className="min-w-[500px]">
                    {/* Date headers (show every 5th) */}
                    <div className="flex mb-1" style={{ paddingLeft: '100px' }}>
                        {sortedDates.map((date, i) => (
                            <div key={date} className="flex-1 text-center text-[8px] text-slate-600">
                                {i % 5 === 0 ? date.slice(5) : ''}
                            </div>
                        ))}
                    </div>

                    {/* Rows */}
                    {rankings.map(({ sectorId }) => {
                        const data = sectorData.get(sectorId) || [];
                        const dateMap = new Map(data.map(d => [d.date, d]));

                        return (
                            <div key={sectorId} className="flex items-center gap-1 mb-0.5">
                                {/* Sector label */}
                                <div className="w-[96px] text-[10px] text-slate-400 font-medium truncate text-right pr-2">
                                    {SECTOR_LABELS[sectorId]}
                                </div>
                                {/* Cells */}
                                <div className="flex flex-1 gap-[1px]">
                                    {sortedDates.map(date => {
                                        const day = dateMap.get(date);
                                        const change = day?.avgChange || 0;
                                        return (
                                            <div
                                                key={date}
                                                className="flex-1 rounded-[2px] transition-colors"
                                                style={{
                                                    height: '18px',
                                                    backgroundColor: getHeatColor(change),
                                                    border: '1px solid rgba(30,41,59,0.3)',
                                                }}
                                                title={`${SECTOR_LABELS[sectorId]} ${date}: ${change > 0 ? '+' : ''}${change.toFixed(2)}%`}
                                            />
                                        );
                                    })}
                                </div>
                                {/* Latest change */}
                                <div className={`w-14 text-right text-[10px] font-mono ${(dateMap.get(latestDate)?.avgChange || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                    {(() => {
                                        const v = dateMap.get(latestDate)?.avgChange || 0;
                                        return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
