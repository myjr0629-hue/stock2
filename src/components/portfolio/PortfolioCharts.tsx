'use client';
// ============================================================================
// Portfolio Charts — Sector Donut (Pure SVG) + P&L TreeMap (ECharts)
// Donut: zero-dependency SVG for instant render on any device
// ============================================================================

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

// ─── SECTOR MAP (shared with parent) ─────────────────────────────────────
const SECTOR_MAP: Record<string, { sector: string; color: string }> = {
    AAPL: { sector: 'Technology', color: '#818cf8' }, MSFT: { sector: 'Technology', color: '#818cf8' },
    GOOGL: { sector: 'Communication', color: '#f472b6' }, GOOG: { sector: 'Communication', color: '#f472b6' },
    META: { sector: 'Communication', color: '#f472b6' }, NFLX: { sector: 'Communication', color: '#f472b6' },
    AMZN: { sector: 'Consumer Disc.', color: '#fb923c' }, TSLA: { sector: 'Consumer Disc.', color: '#fb923c' },
    NVDA: { sector: 'Technology', color: '#818cf8' }, AMD: { sector: 'Technology', color: '#818cf8' },
    INTC: { sector: 'Technology', color: '#818cf8' }, CRM: { sector: 'Technology', color: '#818cf8' },
    AVGO: { sector: 'Technology', color: '#818cf8' }, ORCL: { sector: 'Technology', color: '#818cf8' },
    JPM: { sector: 'Financials', color: '#fbbf24' }, GS: { sector: 'Financials', color: '#fbbf24' },
    BAC: { sector: 'Financials', color: '#fbbf24' }, V: { sector: 'Financials', color: '#fbbf24' },
    MA: { sector: 'Financials', color: '#fbbf24' }, MS: { sector: 'Financials', color: '#fbbf24' },
    UNH: { sector: 'Healthcare', color: '#34d399' }, JNJ: { sector: 'Healthcare', color: '#34d399' },
    LLY: { sector: 'Healthcare', color: '#34d399' }, PFE: { sector: 'Healthcare', color: '#34d399' },
    XOM: { sector: 'Energy', color: '#f87171' }, CVX: { sector: 'Energy', color: '#f87171' },
    PG: { sector: 'Consumer Staples', color: '#a78bfa' }, KO: { sector: 'Consumer Staples', color: '#a78bfa' },
    DIS: { sector: 'Communication', color: '#f472b6' }, BA: { sector: 'Industrials', color: '#94a3b8' },
    CAT: { sector: 'Industrials', color: '#94a3b8' }, UPS: { sector: 'Industrials', color: '#94a3b8' },
    NEE: { sector: 'Utilities', color: '#67e8f9' }, SPY: { sector: 'ETF', color: '#6ee7b7' },
    QQQ: { sector: 'ETF', color: '#6ee7b7' }, IWM: { sector: 'ETF', color: '#6ee7b7' },
    PLTR: { sector: 'Technology', color: '#818cf8' }, COIN: { sector: 'Financials', color: '#fbbf24' },
    SQ: { sector: 'Financials', color: '#fbbf24' }, SOFI: { sector: 'Financials', color: '#fbbf24' },
    SMCI: { sector: 'Technology', color: '#818cf8' }, MSTR: { sector: 'Technology', color: '#818cf8' },
    ARM: { sector: 'Technology', color: '#818cf8' }, TSM: { sector: 'Technology', color: '#818cf8' },
    MU: { sector: 'Technology', color: '#818cf8' }, QCOM: { sector: 'Technology', color: '#818cf8' },
    UBER: { sector: 'Technology', color: '#818cf8' }, SHOP: { sector: 'Technology', color: '#818cf8' },
    SNOW: { sector: 'Technology', color: '#818cf8' }, NET: { sector: 'Technology', color: '#818cf8' },
};
const DEFAULT_SECTOR = { sector: 'Other', color: '#64748b' };

// ─── COLOR PALETTE ───────────────────────────────────────────────────────
function getTreemapColor(pct: number): string {
    if (pct >= 4)    return '#1a8a4a';
    if (pct >= 3)    return '#1e7b44';
    if (pct >= 2)    return '#216e3e';
    if (pct >= 1.5)  return '#235f37';
    if (pct >= 1)    return '#1e5230';
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

// ─── TOOLTIP STYLE (shared) ──────────────────────────────────────────────
const TOOLTIP_STYLE = {
    backgroundColor: 'rgba(10, 14, 22, 0.95)',
    borderColor: '#334155',
    borderWidth: 1,
    textStyle: { color: '#e2e8f0' },
    extraCssText: 'box-shadow: 0 8px 32px rgba(0,0,0,0.5); border-radius: 10px; backdrop-filter: blur(8px);',
    confine: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTOR DONUT — Pure SVG (Zero-dependency, instant render)
// Replaces ECharts pie for performance — renders 3-4 sectors at 110x110px
// ═══════════════════════════════════════════════════════════════════════════

export function EChartsSectorDonut({ sectors, total, label }: {
    sectors: { sector: string; color: string; value: number }[];
    total: number;
    label?: string;
}) {
    const [hovered, setHovered] = React.useState<number | null>(null);

    const size = 110;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 42;
    const innerR = 28;
    const midR = (outerR + innerR) / 2;
    const strokeW = outerR - innerR;
    const circumference = 2 * Math.PI * midR;
    const gap = 3; // gap in degrees between segments

    // Calculate arc segments
    const arcs = useMemo(() => {
        if (!sectors.length || total <= 0) return [];
        const totalGapDeg = gap * sectors.length;
        const availableDeg = 360 - totalGapDeg;
        let offset = -90; // start from top

        return sectors.map((s, i) => {
            const pct = s.value / total;
            const deg = Math.max(pct * availableDeg, 2); // min 2deg for visibility
            const dashLen = (deg / 360) * circumference;
            const dashGap = circumference - dashLen;
            const rotation = offset;
            offset += deg + gap;

            return {
                ...s,
                pct,
                dashLen,
                dashGap,
                rotation,
                index: i,
            };
        });
    }, [sectors, total, circumference]);

    return (
        <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ overflow: 'visible' }}
            >
                {/* Background ring */}
                <circle
                    cx={cx} cy={cy} r={midR}
                    fill="none"
                    stroke="rgba(30,41,59,0.5)"
                    strokeWidth={strokeW}
                />

                {/* Sector arcs */}
                {arcs.map((arc) => {
                    const isHovered = hovered === arc.index;
                    return (
                        <circle
                            key={arc.index}
                            cx={cx}
                            cy={cy}
                            r={midR}
                            fill="none"
                            stroke={arc.color}
                            strokeWidth={isHovered ? strokeW + 3 : strokeW}
                            strokeDasharray={`${arc.dashLen} ${arc.dashGap}`}
                            strokeDashoffset={0}
                            strokeLinecap="round"
                            style={{
                                transform: `rotate(${arc.rotation}deg)`,
                                transformOrigin: `${cx}px ${cy}px`,
                                transition: 'stroke-width 0.2s ease, filter 0.2s ease, transform 0.2s ease',
                                filter: isHovered ? `drop-shadow(0 0 8px ${arc.color}80)` : 'none',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={() => setHovered(arc.index)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <title>{`${arc.sector}: ${(arc.pct * 100).toFixed(1)}% ($${arc.value.toLocaleString('en-US', { maximumFractionDigits: 0 })})`}</title>
                        </circle>
                    );
                })}

                {/* Center text — count */}
                <text
                    x={cx} y={cy - 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ffffff"
                    fontSize="18"
                    fontWeight="900"
                    fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                >{sectors.length}</text>

                {/* Center text — label */}
                <text
                    x={cx} y={cy + 14}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#cbd5e1"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                    letterSpacing="0.08em"
                >{(label || 'SECTORS').toUpperCase()}</text>
            </svg>

            {/* Hover tooltip */}
            {hovered !== null && arcs[hovered] && (
                <div
                    style={{
                        position: 'absolute',
                        top: -48,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(10,14,22,0.95)',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        padding: '6px 10px',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        zIndex: 50,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <div style={{ fontWeight: 900, fontSize: 12, color: '#e2e8f0', marginBottom: 2 }}>
                        {arcs[hovered].sector}
                    </div>
                    <div style={{ fontSize: 11, color: arcs[hovered].color, fontFamily: 'monospace', fontWeight: 800 }}>
                        {(arcs[hovered].pct * 100).toFixed(1)}% · ${arcs[hovered].value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// P&L TREEMAP — ECharts TreeMap (Finviz+ 2-Depth)
// ═══════════════════════════════════════════════════════════════════════════

interface TreemapHolding {
    ticker: string;
    changePct: number;
    gainLossPct: number;
    marketValue: number;
}

export function EChartsPnlTreemap({ holdings, totalValue }: {
    holdings: TreemapHolding[];
    totalValue: number;
}) {
    const locale = useLocale();

    const treeData = useMemo(() => {
        if (holdings.length === 0 || totalValue <= 0) return [];

        const sectorMap: Record<string, { sector: string; color: string; children: any[] }> = {};
        holdings.forEach(h => {
            const s = SECTOR_MAP[h.ticker] || DEFAULT_SECTOR;
            if (!sectorMap[s.sector]) sectorMap[s.sector] = { sector: s.sector, color: s.color, children: [] };
            const weight = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
            // [DESIGN] Color by gainLossPct (total P&L) — always meaningful, even when market is CLOSED
            const colorPct = h.gainLossPct;
            sectorMap[s.sector].children.push({
                name: h.ticker,
                value: Math.max(weight, 0.5),
                changePct: h.changePct,
                gainLossPct: h.gainLossPct,
                marketValue: h.marketValue,
                weight,
                itemStyle: { color: getTreemapColor(colorPct), borderColor: '#0a0e14', borderWidth: 1.5 },
                label: { fontSize: weight >= 25 ? 14 : weight >= 15 ? 13 : 12, lineHeight: weight >= 25 ? 18 : 16 },
            });
        });

        return Object.values(sectorMap)
            .sort((a, b) => b.children.reduce((s, c) => s + c.value, 0) - a.children.reduce((s, c) => s + c.value, 0))
            .map(s => {
                const avg = s.children.length > 0 ? s.children.reduce((sum, c) => sum + c.gainLossPct, 0) / s.children.length : 0;
                return {
                    name: s.sector, value: s.children.reduce((sum, c) => sum + c.value, 0),
                    avgChange: avg, children: s.children.sort((a, b) => b.value - a.value),
                    itemStyle: { color: getTreemapColor(avg), borderColor: '#1a1f2e', borderWidth: 2 },
                };
            });
    }, [holdings, totalValue]);

    const option = useMemo(() => ({
        animation: true,
        animationDuration: 300,
        animationDurationUpdate: 0,
        animationEasing: 'cubicOut',
        tooltip: {
            formatter: (params: any) => {
                const d = params.data;
                if (!d) return '';
                if (d.children) {
                    const avg = d.avgChange ?? 0;
                    const sign = avg >= 0 ? '+' : '';
                    const color = avg >= 0 ? '#4ade80' : '#fb7185';
                    return `<div style="font-family:'Plus Jakarta Sans',system-ui;padding:6px 2px">
                        <div style="font-weight:900;font-size:14px;margin-bottom:4px">${d.name || ''}</div>
                        <div style="font-size:13px;color:${color};font-family:monospace;font-weight:800">AVG: ${sign}${avg.toFixed(2)}%</div>
                        <div style="font-size:12px;color:#cbd5e1;margin-top:2px">${d.children.length} ${locale === 'ko' ? '종목' : locale === 'ja' ? '銘柄' : 'tickers'}</div>
                    </div>`;
                }
                const pct = d.changePct ?? 0; const gl = d.gainLossPct ?? 0;
                const w = d.weight ?? 0; const mv = d.marketValue ?? 0;
                const tC = pct >= 0 ? '#4ade80' : '#fb7185';
                const gC = gl >= 0 ? '#4ade80' : '#fb7185';
                const tL = locale === 'ko' ? '오늘' : locale === 'ja' ? '本日' : 'Today';
                const pL = locale === 'ko' ? '총 손익' : locale === 'ja' ? '総損益' : 'Total P&L';
                const wL = locale === 'ko' ? '비중' : locale === 'ja' ? 'ウェイト' : 'Weight';
                const vL = locale === 'ko' ? '평가액' : locale === 'ja' ? '評価額' : 'Value';
                return `<div style="font-family:'Plus Jakarta Sans',system-ui;padding:8px 4px;min-width:140px">
                    <div style="font-weight:900;font-size:15px;margin-bottom:6px;letter-spacing:0.05em">${d.name || ''}</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:12px">
                        <span style="color:#cbd5e1;font-weight:700">${tL}</span>
                        <span style="color:${tC};font-family:monospace;font-weight:800;text-align:right">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
                        <span style="color:#cbd5e1;font-weight:700">${pL}</span>
                        <span style="color:${gC};font-family:monospace;font-weight:800;text-align:right">${gl >= 0 ? '+' : ''}${gl.toFixed(2)}%</span>
                        <span style="color:#cbd5e1;font-weight:700">${wL}</span>
                        <span style="color:#e2e8f0;font-family:monospace;font-weight:700;text-align:right">${w.toFixed(1)}%</span>
                        <span style="color:#cbd5e1;font-weight:700">${vL}</span>
                        <span style="color:#e2e8f0;font-family:monospace;font-weight:700;text-align:right">$${mv.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>`;
            },
            ...TOOLTIP_STYLE,
        },
        series: [{
            type: 'treemap',
            data: treeData,
            left: 0, top: 0, right: 0, bottom: 0,
            roam: false, nodeClick: false, squareRatio: 0.62,
            breadcrumb: { show: false },
            levels: [
                { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 0 }, upperLabel: { show: false } },
                {
                    itemStyle: { borderColor: '#1e293b', borderWidth: 2.5, gapWidth: 2 },
                    upperLabel: {
                        show: true, height: 22,
                        backgroundColor: 'rgba(10, 14, 22, 0.92)',
                        color: '#cbd5e1', fontSize: 12, fontWeight: 900,
                        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
                        padding: [2, 8, 2, 8],
                        formatter: (params: any) => {
                            const d = params.data;
                            if (!d?.name) return '';
                            const avg = d.avgChange ?? 0;
                            return `${d.name}  ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}%`;
                        },
                    },
                },
                {
                    itemStyle: { borderColor: 'rgba(10,14,22,0.7)', borderWidth: 1.5, gapWidth: 1 },
                    label: {
                        show: true, position: 'inside', align: 'center', verticalAlign: 'middle',
                        color: '#ffffff', fontWeight: 900, fontSize: 12,
                        fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
                        textShadowColor: 'rgba(0,0,0,0.6)', textShadowBlur: 4,
                        formatter: (params: any) => {
                            const d = params.data;
                            if (!d) return '';
                            const pct = d.gainLossPct ?? 0;
                            return `${d.name || ''}\n${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
                        },
                    },
                },
            ],
            emphasis: {
                itemStyle: { borderColor: '#60a5fa', borderWidth: 2, shadowBlur: 20, shadowColor: 'rgba(96, 165, 250, 0.5)' },
                upperLabel: { show: true, color: '#ffffff' },
            },
        }],
    }), [treeData, locale]);

    if (!treeData || treeData.length === 0) return null;

    return (
        <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%', minHeight: 160 }}
            opts={{ renderer: 'canvas' }}
            notMerge={false}
            lazyUpdate={true}
        />
    );
}
