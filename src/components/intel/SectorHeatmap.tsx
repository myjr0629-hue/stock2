'use client';
// ============================================================================
// SectorHeatmap V4 — Finviz-Style Premium TreeMap
// 10 sectors × N tickers — centered labels (NO rich text = verticalAlign works)
// ============================================================================

import React, { useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { IntelQuote, IntelSharedData } from '@/hooks/useIntelSharedData';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

const SECTOR_DEFS = [
    { key: 'm7', label: 'M7' },
    { key: 'physicalAI', label: 'PHYS AI' },
    { key: 'siliconCore', label: 'SILICON' },
    { key: 'powerMatrix', label: 'POWER' },
    { key: 'bioPulse', label: 'BIO' },
    { key: 'cyberShield', label: 'CYBER' },
    { key: 'orbitDefense', label: 'ORBIT' },
    { key: 'quantumEdge', label: 'QUANTUM' },
    { key: 'fintechPulse', label: 'FINTECH' },
    { key: 'cloudFortress', label: 'CLOUD' },
] as const;

function getHeatColor(pct: number): string {
    if (pct >= 4)    return '#2d8b57';
    if (pct >= 3)    return '#2a7d4f';
    if (pct >= 2)    return '#276e46';
    if (pct >= 1.5)  return '#245f3d';
    if (pct >= 1)    return '#1e5233';
    if (pct >= 0.5)  return '#1a4129';
    if (pct > 0)     return '#183520';
    if (pct === 0)   return '#1e2430';
    if (pct > -0.5)  return '#351a1a';
    if (pct > -1)    return '#4d1919';
    if (pct > -1.5)  return '#621919';
    if (pct > -2)    return '#7d1a1a';
    if (pct > -3)    return '#961c1c';
    if (pct > -4)    return '#ab2020';
    return '#c02424';
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
            const sorted = [...validQuotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

            const children = sorted.map(q => {
                const baseWeight = Math.max(q.price * 0.3, 8);
                const magnitudeBonus = Math.min(Math.abs(q.changePct) * 1.5, 15);
                const tileValue = baseWeight + magnitudeBonus;

                // Dynamic font sizing per tile (plain label, NO rich text)
                const fontSize = tileValue >= 60 ? 15 : tileValue >= 25 ? 13 : 12;

                return {
                    name: q.ticker,
                    value: tileValue,
                    changePct: q.changePct,
                    price: q.price,
                    itemStyle: {
                        color: getHeatColor(q.changePct),
                        borderColor: '#0a0e14',
                        borderWidth: 1.5,
                    },
                    // Per-node label: fontSize varies, but NO rich text → verticalAlign works
                    label: {
                        fontSize,
                        lineHeight: fontSize + 4,
                    },
                };
            });

            return {
                name: sector.label,
                value: children.reduce((s, c) => s + c.value, 0),
                avgChange,
                children,
                itemStyle: {
                    color: getHeatColor(avgChange),
                    borderColor: '#1a1f2e',
                    borderWidth: 2,
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
                    const avg = d.avgChange ?? 0;
                    const sign = avg >= 0 ? '+' : '';
                    const color = avg >= 0 ? '#4ade80' : '#fb7185';
                    return `<div style="font-family:'Plus Jakarta Sans',system-ui;padding:6px 2px">
                        <div style="font-weight:900;font-size:15px;margin-bottom:4px">${d.name || ''}</div>
                        <div style="font-size:14px;color:${color};font-family:monospace;font-weight:800">AVG: ${sign}${avg.toFixed(2)}%</div>
                        <div style="font-size:12px;color:#94a3b8;margin-top:2px">${d.children.length} tickers</div>
                    </div>`;
                }
                const pct = d.changePct ?? 0;
                const sign = pct >= 0 ? '+' : '';
                const color = pct >= 0 ? '#4ade80' : '#fb7185';
                const priceStr = typeof d.price === 'number'
                    ? `<div style="font-size:13px;color:#94a3b8;font-family:monospace;margin-top:2px">$${d.price.toFixed(2)}</div>` : '';
                return `<div style="font-family:'Plus Jakarta Sans',system-ui;padding:6px 2px">
                    <div style="font-weight:900;font-size:15px">${d.name || ''}</div>
                    <div style="font-size:14px;color:${color};font-family:monospace;font-weight:800;margin-top:2px">${sign}${pct.toFixed(2)}%</div>
                    ${priceStr}
                </div>`;
            },
            backgroundColor: 'rgba(10, 14, 22, 0.95)',
            borderColor: '#334155',
            borderWidth: 1,
            textStyle: { color: '#e2e8f0' },
            extraCssText: 'box-shadow: 0 8px 32px rgba(0,0,0,0.5); border-radius: 8px; backdrop-filter: blur(8px);',
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
            squareRatio: 0.62,
            breadcrumb: { show: false },

            levels: [
                {
                    // Level 0: Root — invisible
                    itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 0 },
                    upperLabel: { show: false },
                },
                {
                    // Level 1: Sector — header bar
                    itemStyle: { borderColor: '#1e293b', borderWidth: 3, gapWidth: 2 },
                    upperLabel: {
                        show: true,
                        height: 24,
                        backgroundColor: 'rgba(10, 14, 22, 0.92)',
                        color: '#e2e8f0',
                        fontSize: 12,
                        fontWeight: 900,
                        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
                        padding: [2, 8, 2, 8],
                        formatter: (params: any) => {
                            const d = params.data;
                            if (!d || !d.name) return '';
                            const avg = d.avgChange ?? 0;
                            const sign = avg >= 0 ? '+' : '';
                            return `${d.name}  ${sign}${avg.toFixed(1)}%`;
                        },
                    },
                },
                {
                    // Level 2: Ticker — PLAIN TEXT (no rich) → verticalAlign works!
                    itemStyle: { borderColor: 'rgba(10,14,22,0.7)', borderWidth: 1.5, gapWidth: 1 },
                    label: {
                        show: true,
                        position: 'inside',
                        align: 'center',
                        verticalAlign: 'middle',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowBlur: 3,
                        formatter: (params: any) => {
                            const d = params.data;
                            if (!d) return '';
                            const pct = d.changePct ?? 0;
                            const sign = pct >= 0 ? '+' : '';
                            return `${d.name || ''}\n${sign}${pct.toFixed(1)}%`;
                        },
                    },
                },
            ],

            emphasis: {
                itemStyle: {
                    borderColor: '#60a5fa',
                    borderWidth: 2,
                    shadowBlur: 16,
                    shadowColor: 'rgba(96, 165, 250, 0.5)',
                },
                upperLabel: { show: true, color: '#ffffff' },
            },
        }],
    }), [treeData]);

    if (!treeData || treeData.length === 0) return null;

    return (
        <section className="relative z-10">
            <div className="rounded-xl border border-slate-700/40 overflow-hidden"
                style={{
                    background: 'linear-gradient(180deg, #0d1117 0%, #0a0e14 100%)',
                    boxShadow: '0 0 30px rgba(0,0,0,0.4), 0 0 8px rgba(99,102,241,0.06)',
                }}>
                {/* Header */}
                <div className="px-5 py-2.5 border-b border-slate-800/60 flex items-center justify-between"
                    style={{ background: 'linear-gradient(90deg, rgba(13,17,23,1) 0%, rgba(15,25,35,0.95) 50%, rgba(13,17,23,1) 100%)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-5 rounded-full bg-gradient-to-b from-cyan-400 to-indigo-500" />
                        <span className="text-[14px] font-black text-white tracking-[0.12em] uppercase font-jakarta">
                            SECTOR HEATMAP
                        </span>
                        <span className="text-[12px] text-slate-300 font-mono">
                            {SECTOR_DEFS.length} Sectors • Real-Time
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] font-mono">
                        <span className="text-emerald-400 font-bold">+3%</span>
                        <div className="flex h-2.5 rounded-full overflow-hidden mx-1" style={{ width: 80 }}>
                            <div style={{ flex: 1, background: '#2d8b57' }} />
                            <div style={{ flex: 1, background: '#1e5233' }} />
                            <div style={{ flex: 1, background: '#1e2430' }} />
                            <div style={{ flex: 1, background: '#7d1a1a' }} />
                            <div style={{ flex: 1, background: '#c02424' }} />
                        </div>
                        <span className="text-rose-400 font-bold">-3%</span>
                    </div>
                </div>

                {/* TreeMap */}
                <div style={{ height: 450 }}>
                    <ReactECharts
                        option={option}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        onEvents={{ click: onChartClick }}
                    />
                </div>
            </div>
        </section>
    );
}
