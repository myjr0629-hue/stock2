'use client';
// ============================================================================
// SectorHeatmap — ECharts TreeMap (Finviz/Bloomberg Style)
// Real-time sector heatmap visualization with 10 sectors × N tickers
// ============================================================================

import React, { useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { IntelQuote, IntelSharedData } from '@/hooks/useIntelSharedData';

// Dynamic import to avoid SSR issues with ECharts
const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

// ── Sector Definitions ──
const SECTOR_DEFS = [
    { key: 'm7', label: 'M7', hex: '#06b6d4' },
    { key: 'physicalAI', label: 'PHYS AI', hex: '#f59e0b' },
    { key: 'siliconCore', label: 'SILICON', hex: '#fbbf24' },
    { key: 'powerMatrix', label: 'POWER', hex: '#10b981' },
    { key: 'bioPulse', label: 'BIO', hex: '#f43f5e' },
    { key: 'cyberShield', label: 'CYBER', hex: '#22d3ee' },
    { key: 'orbitDefense', label: 'ORBIT', hex: '#0ea5e9' },
    { key: 'quantumEdge', label: 'QUANTUM', hex: '#d946ef' },
    { key: 'fintechPulse', label: 'FINTECH', hex: '#84cc16' },
    { key: 'cloudFortress', label: 'CLOUD', hex: '#38bdf8' },
] as const;

// ── Helpers ──
function getHeatColor(pct: number): string {
    // Premium muted gradient — 20% lower brightness for dark-theme harmony
    if (pct >= 5)   return '#00a65c';    // vivid green (muted)
    if (pct >= 3)   return '#00904a';    // bright green
    if (pct >= 2)   return '#256b2b';    // green
    if (pct >= 1.5) return '#174d1a';    // deep green
    if (pct >= 1)   return '#244a30';    // muted green
    if (pct >= 0.5) return '#2a3f34';    // dark green tint
    if (pct > -0.5) return '#262f3a';    // neutral dark
    if (pct > -1)   return '#4a2222';    // muted red tint
    if (pct > -1.5) return '#611a1a';    // dark red
    if (pct > -2)   return '#7a1616';    // deep red
    if (pct > -3)   return '#961717';    // medium red
    if (pct > -5)   return '#b32020';    // red
    return '#cc3333';                     // vivid red (muted)
}

interface SectorHeatmapProps {
    sectorData: IntelSharedData;
    onNavigate: (tab: string) => void;
}

export function SectorHeatmap({ sectorData, onNavigate }: SectorHeatmapProps) {
    const treeData = useMemo(() => {
        return SECTOR_DEFS.map(sector => {
            const quotes: IntelQuote[] = (sectorData as any)[sector.key] || [];
            const validQuotes = quotes.filter(q => q.price > 0);

            if (validQuotes.length === 0) return null;

            const avgChange = validQuotes.reduce((s, q) => s + q.changePct, 0) / validQuotes.length;

            const children = validQuotes
                .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
                .map(q => ({
                    name: q.ticker,
                    value: Math.max(Math.min(Math.abs(q.changePct), 8) * 10, 5), // Size by magnitude, capped at 8% to prevent outlier dominance
                    changePct: q.changePct,
                    price: q.price,
                    itemStyle: {
                        color: getHeatColor(q.changePct),
                        borderColor: '#0d1117',
                        borderWidth: 1,
                    },
                    label: {
                        show: true,
                        formatter: (params: any) => {
                            const d = params.data;
                            if (!d) return '';
                            const pct = d.changePct ?? 0;
                            const sign = pct >= 0 ? '+' : '';
                            return [
                                `{ticker|${d.name || ''}}`,
                                `{pct|${sign}${pct.toFixed(1)}%}`,
                            ].join('\n');
                        },
                        rich: {
                            ticker: {
                                fontSize: 13,
                                fontWeight: 800,
                                color: '#fff',
                                lineHeight: 18,
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            },
                            pct: {
                                fontSize: 12,
                                fontWeight: 700,
                                color: 'rgba(255,255,255,0.85)',
                                lineHeight: 16,
                                fontFamily: 'monospace',
                            },
                        },
                    },
                }));

            return {
                name: sector.label,
                value: children.reduce((s, c) => s + c.value, 0),
                avgChange,
                children,
                itemStyle: {
                    color: getHeatColor(avgChange),
                    borderColor: '#1e293b',
                    borderWidth: 2,
                },
                label: {
                    show: true,
                    position: 'insideTopLeft' as const,
                    formatter: (params: any) => {
                        const d = params.data;
                        if (!d) return '';
                        const avg = d.avgChange ?? 0;
                        const sign = avg >= 0 ? '+' : '';
                        return `{sector|${d.name || ''}  ${sign}${avg.toFixed(2)}%}`;
                    },
                    rich: {
                        sector: {
                            fontSize: 12,
                            fontWeight: 900,
                            color: 'rgba(255,255,255,0.7)',
                            lineHeight: 20,
                            padding: [2, 4, 0, 2],
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        },
                    },
                },
            };
        }).filter(Boolean);
    }, [sectorData]);

    const tabKeyMap: Record<string, string> = {
        'M7': 'M7', 'PHYS AI': 'PHYSICAL_AI', 'SILICON': 'SILICON_CORE',
        'POWER': 'POWER_MATRIX', 'BIO': 'BIO_PULSE', 'CYBER': 'CYBER_SHIELD',
        'ORBIT': 'ORBIT_DEFENSE', 'QUANTUM': 'QUANTUM_EDGE', 'FINTECH': 'FINTECH_PULSE',
        'CLOUD': 'CLOUD_FORTRESS',
    };

    const onChartClick = useCallback((params: any) => {
        if (params.data) {
            // If clicking a ticker, navigate to parent sector
            const sectorName = params.treePathInfo?.[1]?.name || params.data.name;
            const tabKey = tabKeyMap[sectorName];
            if (tabKey) onNavigate(tabKey);
        }
    }, [onNavigate]);

    const option = useMemo(() => ({
        tooltip: {
            formatter: (params: any) => {
                const d = params.data;
                if (!d) return '';
                if (d.children) {
                    // Sector level
                    const avg = d.avgChange ?? 0;
                    const sign = avg >= 0 ? '+' : '';
                    return `<div style="font-family:system-ui;padding:4px 0">
                        <div style="font-weight:900;font-size:14px;margin-bottom:4px">${d.name || ''}</div>
                        <div style="font-size:13px;color:${avg >= 0 ? '#4ade80' : '#fb7185'}">
                            AVG: ${sign}${avg.toFixed(2)}%
                        </div>
                        <div style="font-size:12px;color:#94a3b8">${d.children.length} tickers</div>
                    </div>`;
                }
                // Ticker level
                const pct = d.changePct ?? 0;
                const sign = pct >= 0 ? '+' : '';
                const priceStr = typeof d.price === 'number' ? `<div style="font-size:12px;color:#94a3b8">$${d.price.toFixed(2)}</div>` : '';
                return `<div style="font-family:system-ui;padding:4px 0">
                    <div style="font-weight:900;font-size:14px">${d.name || ''}</div>
                    <div style="font-size:13px;color:${pct >= 0 ? '#4ade80' : '#fb7185'};font-family:monospace">
                        ${sign}${pct.toFixed(2)}%
                    </div>
                    ${priceStr}
                </div>`;
            },
            backgroundColor: '#0f172a',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0' },
        },

        series: [{
            type: 'treemap',
            data: treeData,
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            roam: false,
            nodeClick: false,
            squareRatio: 0.6,

            breadcrumb: { show: false },
            levels: [
                {
                    // Sector level
                    itemStyle: {
                        borderColor: '#334155',
                        borderWidth: 3,
                        gapWidth: 1,
                    },
                    upperLabel: {
                        show: true,
                        height: 18,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        color: '#e2e8f0',
                        fontSize: 12,
                        fontWeight: 900,
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        padding: [0, 6, 0, 6],
                    },
                },
                {
                    // Ticker level
                    itemStyle: {
                        borderColor: 'rgba(13, 17, 25, 0.6)',
                        borderWidth: 1,
                        gapWidth: 1,
                    },
                    label: {
                        show: true,
                        align: 'center',
                        verticalAlign: 'middle',
                    },
                },
            ],
            emphasis: {
                itemStyle: {
                    borderColor: '#60a5fa',
                    borderWidth: 2,
                    shadowBlur: 12,
                    shadowColor: 'rgba(96, 165, 250, 0.4)',
                },
                upperLabel: {
                    show: true,
                    color: '#ffffff',
                },
            },
        }],
    }), [treeData]);

    if (!treeData || treeData.length === 0) return null;

    return (
        <section className="relative z-10">
            <div className="rounded-xl border border-emerald-500/[0.15] bg-[#0d1117]/90 backdrop-blur-sm overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.06)]">
                {/* Header */}
                <div className="px-5 py-2.5 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-[#0d1117] via-[#0f1923] to-[#0d1117]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
                        <span className="text-[14px] font-black text-white tracking-wider uppercase">
                            SECTOR HEATMAP
                        </span>
                        <span className="text-[12px] text-slate-300 font-mono">
                            {SECTOR_DEFS.length} Sectors • Real-Time
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] font-mono">
                        <span className="text-emerald-400 font-bold">+3%</span>
                        <div className="w-20 h-2.5 rounded-full mx-1" style={{
                            background: 'linear-gradient(90deg, #00c853, #2e7d32, #37474f, #c62828, #f44336)'
                        }} />
                        <span className="text-rose-400 font-bold">-3%</span>
                    </div>
                </div>

                {/* TreeMap Chart — negative margin compensates for ECharts internal root padding */}
                <div style={{ height: 400, overflow: 'hidden' }}>
                    <div style={{ marginTop: -6, height: 410 }}>
                    <ReactECharts
                        option={option}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        onEvents={{ click: onChartClick }}
                    />
                    </div>
                </div>
            </div>
        </section>
    );
}
