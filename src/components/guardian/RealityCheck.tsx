"use client";

import React, { useState, useMemo } from 'react';
import { Activity, AlertTriangle, TrendingUp, Radar } from "lucide-react";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { useTranslations, useLocale } from 'next-intl';
import { MiniGauge, DualGauge } from "./MiniGauge";
import { GuardianTooltip } from './GuardianTooltip';

interface RealityCheckProps {
    nasdaqChange: number;
    guardianScore: number;
    divergenceCase?: 'A' | 'B' | 'C' | 'D' | 'N';
    rvolNdx?: number;
    rvolDow?: number;
    verdict?: {
        title: string;
        desc: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    };
    vixTermStructure?: number;
    bondFlow?: number;
    goldFlow?: number;
}

/**
 * RealityCheck v9.1 — Dual-Mode: Gauges + Risk Radar HUD (6-Axis Hexagon)
 */
export function RealityCheck({
    nasdaqChange,
    guardianScore,
    divergenceCase = 'N',
    rvolNdx = 1.0,
    rvolDow = 1.0,
    vixTermStructure,
    bondFlow,
    goldFlow,
}: RealityCheckProps) {
    const t = useTranslations('guardian');
    const [activeTab, setActiveTab] = useState<'gauges' | 'radar'>('gauges');
    const isDivergent = divergenceCase === 'A' || divergenceCase === 'B';
    const statusText = isDivergent ? "DIVERGENCE" : "ALIGNED";
    const statusColor = isDivergent
        ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
        : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

    const { snapshot } = useMacroSnapshot();
    const yieldCurve = snapshot?.yieldCurve;
    const realYield = snapshot?.realYield;
    const us10yFactor = snapshot?.factors?.us10y;
    const us10yChangePct = us10yFactor?.chgPct ?? 0;

    const getRvolColor = (val: number) => val > 1.0 ? 'text-cyan-400' : 'text-slate-400';
    const get10YColor = (change: number) => change >= 0 ? 'text-rose-400' : 'text-emerald-400';
    const getSpreadColor = (val: number) => {
        if (val < 0) return 'text-rose-400';
        if (val < 0.25) return 'text-amber-400';
        return 'text-emerald-400';
    };
    const getRealColor = (stance: string) => {
        if (stance === 'TIGHT') return 'text-rose-400';
        if (stance === 'LOOSE') return 'text-emerald-400';
        return 'text-sky-400';
    };

    return (
        <div className="h-full flex flex-col p-3">
            {/* HEADER with tab toggle */}
            <div className="flex justify-between items-center mb-3 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400/60" />
                    <GuardianTooltip sectionId="realityCheck">
                        <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-white/70 font-jakarta">
                            REALITY CHECK
                        </h3>
                    </GuardianTooltip>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="flex bg-slate-800/60 rounded-full p-0.5 border border-slate-700/30">
                        <button
                            onClick={() => setActiveTab('gauges')}
                            className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full transition-all duration-200 ${activeTab === 'gauges'
                                ? 'bg-slate-600/80 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            GAUGES
                        </button>
                        <button
                            onClick={() => setActiveTab('radar')}
                            className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full transition-all duration-200 flex items-center gap-1 ${activeTab === 'radar'
                                ? 'bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30'
                                : 'text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            <Radar className="w-3 h-3" />
                            RADAR
                        </button>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColor}`}>
                        {statusText}
                    </span>
                </div>
            </div>

            {/* ===== GAUGES TAB ===== */}
            {activeTab === 'gauges' && (
                <>
                    <div className="flex-1 grid grid-cols-3 gap-x-2 gap-y-3 place-items-center content-center">
                        <DualGauge priceValue={nasdaqChange} flowValue={guardianScore} size="lg" />
                        <MiniGauge label="NDX 20D" value={`${Math.round(rvolNdx * 100)}%`}
                            subLabel={rvolNdx > 1.5 ? t('rvolActive') : rvolNdx > 1.0 ? t('rvolNormal') : t('rvolLow')}
                            colorClass={getRvolColor(rvolNdx)} size="lg" fillPercent={Math.min(rvolNdx * 50, 100)} />
                        <MiniGauge label="DOW 20D" value={`${Math.round(rvolDow * 100)}%`}
                            subLabel={rvolDow > 1.5 ? t('rvolActive') : rvolDow > 1.0 ? t('rvolNormal') : t('rvolLow')}
                            colorClass={rvolDow > 1.0 ? 'text-orange-400' : 'text-slate-400'} size="lg" fillPercent={Math.min(rvolDow * 50, 100)} />
                        <MiniGauge label="US10Y" value={yieldCurve ? `${yieldCurve.us10y.toFixed(2)}%` : '—'}
                            secondaryValue={`${us10yChangePct >= 0 ? '+' : ''}${us10yChangePct.toFixed(2)}%`}
                            subLabel={us10yChangePct > 0 ? t('yieldUp') : us10yChangePct < 0 ? t('yieldDown') : t('yieldFlat')}
                            colorClass={get10YColor(us10yChangePct)} size="lg" fillPercent={50 + us10yChangePct * 10} />
                        <MiniGauge label="2S10S" value={yieldCurve ? `${yieldCurve.spread2s10s > 0 ? '+' : ''}${yieldCurve.spread2s10s.toFixed(2)}%` : '—'}
                            subLabel={yieldCurve ? (yieldCurve.spread2s10s < 0 ? t('yieldInverted') : yieldCurve.spread2s10s < 0.25 ? t('yieldFlattening') : t('yieldNormal')) : '—'}
                            colorClass={yieldCurve ? getSpreadColor(yieldCurve.spread2s10s) : 'text-slate-400'} size="lg"
                            fillPercent={yieldCurve ? Math.min((yieldCurve.spread2s10s + 1) * 50, 100) : 50} />
                        <MiniGauge label="REAL" value={realYield ? `${realYield.realYield > 0 ? '+' : ''}${realYield.realYield.toFixed(2)}%` : '—'}
                            subLabel={realYield?.stance === 'TIGHT' ? t('stanceTight') : realYield?.stance === 'LOOSE' ? t('stanceLoose') : t('stanceNeutral')}
                            colorClass={realYield ? getRealColor(realYield.stance) : 'text-slate-400'} size="lg"
                            fillPercent={realYield ? Math.min((realYield.realYield + 2) * 25, 100) : 50} />
                    </div>
                    {(vixTermStructure !== undefined && bondFlow !== undefined && goldFlow !== undefined) && (
                        <div className="flex flex-col gap-2 mt-3 flex-none">
                            {vixTermStructure <= 0.95 && (
                                <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5">
                                    <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <div className="text-[13px] font-bold text-rose-400 uppercase tracking-wider font-jakarta">VIX Backwardation (Panic)</div>
                                        <div className="text-[13px] text-rose-300/85 mt-0.5 leading-[1.5]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                            {t('vixBackwardationDesc')}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {(bondFlow + goldFlow) > 0.5 && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
                                    <TrendingUp className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <div className="text-[13px] font-bold text-amber-400 uppercase tracking-wider font-jakarta">Risk-Off Rotation</div>
                                        <div className="text-[13px] text-amber-300/85 mt-0.5 leading-[1.5]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                            {t('riskOffDesc')} (Bonds: {(bondFlow > 0 ? '+' : '')}{bondFlow.toFixed(1)}%, Gold: {(goldFlow > 0 ? '+' : '')}{goldFlow.toFixed(1)}%)
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ===== RADAR TAB ===== */}
            {activeTab === 'radar' && (
                <RiskRadarHUD snapshot={snapshot} />
            )}
        </div>
    );
}

// ========================================================
// Risk Radar HUD — 6-Axis Hexagon (Larger, Center-Aligned)
// VIX | 10Y | OIL | DXY | GOLD | BTC
// ========================================================
function RiskRadarHUD({ snapshot }: { snapshot: ReturnType<typeof useMacroSnapshot>['snapshot'] }) {
    const locale = useLocale();
    const factors = snapshot?.factors;

    const axes = useMemo(() => {
        const vixLevel = factors?.vix?.level ?? 15;
        const vixChg = factors?.vix?.chgPct ?? 0;
        const us10yLevel = factors?.us10y?.level ?? 4.0;
        const us10yChg = factors?.us10y?.chgPct ?? 0;
        const oilLevel = factors?.oil?.level ?? 70;
        const oilChg = factors?.oil?.chgPct ?? 0;
        const dxyLevel = factors?.dxy?.level ?? 103;
        const dxyChg = factors?.dxy?.chgPct ?? 0;
        const goldLevel = factors?.gold?.level ?? 2000;
        const goldChg = factors?.gold?.chgPct ?? 0;
        const btcLevel = factors?.btc?.level ?? 60000;
        const btcChg = factors?.btc?.chgPct ?? 0;

        const vixNorm = Math.min(100, Math.max(0, ((vixLevel - 10) / 30) * 100));
        const yieldNorm = Math.min(100, Math.max(0, ((us10yLevel - 3) / 2.5) * 100));
        const oilNorm = Math.min(100, Math.max(0, ((oilLevel - 40) / 80) * 100));
        const dxyNorm = Math.min(100, Math.max(0, ((dxyLevel - 95) / 15) * 100));
        const goldNorm = Math.min(100, Math.max(0, (goldChg + 2) / 4 * 100));
        const btcNorm = Math.min(100, Math.max(0, (btcChg + 5) / 10 * 100));

        const step = (2 * Math.PI) / 6;
        return [
            { key: 'VIX', label: 'VIX', value: vixLevel.toFixed(1), chg: vixChg, norm: vixNorm, angle: -Math.PI / 2 },
            { key: '10Y', label: '10Y', value: `${us10yLevel.toFixed(2)}%`, chg: us10yChg, norm: yieldNorm, angle: -Math.PI / 2 + step },
            { key: 'OIL', label: 'OIL', value: `$${oilLevel.toFixed(0)}`, chg: oilChg, norm: oilNorm, angle: -Math.PI / 2 + step * 2 },
            { key: 'DXY', label: 'DXY', value: dxyLevel.toFixed(1), chg: dxyChg, norm: dxyNorm, angle: -Math.PI / 2 + step * 3 },
            { key: 'GOLD', label: 'GOLD', value: `$${goldLevel.toFixed(0)}`, chg: goldChg, norm: goldNorm, angle: -Math.PI / 2 + step * 4 },
            { key: 'BTC', label: 'BTC', value: `$${(btcLevel / 1000).toFixed(1)}K`, chg: btcChg, norm: btcNorm, angle: -Math.PI / 2 + step * 5 },
        ];
    }, [factors]);

    const regime = useMemo(() => {
        const vix = axes[0].norm;
        const goldChg = axes[4].chg;
        const btcChg = axes[5].chg;
        const oilChg = axes[2].chg;

        const riskScore = (vix * 0.35) +
            (Math.max(0, goldChg) * 8) +
            (Math.max(0, -btcChg) * 5) +
            (Math.abs(oilChg) > 3 ? 15 : 0) +
            (axes[1].norm * 0.15);

        if (riskScore > 55) return { label: 'RISK-OFF', color: '#f87171', bgColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)' };
        if (riskScore > 30) return { label: 'MIXED', color: '#fbbf24', bgColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' };
        return { label: 'RISK-ON', color: '#34d399', bgColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.25)' };
    }, [axes]);

    // ★ LARGER hexagon
    const CX = 150, CY = 115, R = 80;
    const getPoint = (angle: number, radius: number) => ({
        x: CX + radius * Math.cos(angle),
        y: CY + radius * Math.sin(angle),
    });
    const rings = [0.25, 0.5, 0.75, 1.0];
    const dataPoints = axes.map(a => {
        const r = (a.norm / 100) * R;
        return getPoint(a.angle, r);
    });

    const insightText = useMemo(() => {
        const vixState = axes[0].norm > 60 ? 'high' : axes[0].norm < 30 ? 'low' : 'mid';
        const btcDir = axes[5].chg > 1 ? 'up' : axes[5].chg < -1 ? 'down' : 'flat';
        const oilDir = axes[2].chg > 1 ? 'up' : axes[2].chg < -1 ? 'down' : 'flat';

        if (locale === 'ko') {
            if (regime.label === 'RISK-OFF') return `VIX ${vixState === 'high' ? '급등' : '경계'} · ${btcDir === 'down' ? '투기심리 위축' : '안전자산 이동'} · 방어적 환경`;
            if (regime.label === 'RISK-ON') return `VIX 안정 · ${btcDir === 'up' ? 'BTC 강세 · 위험선호' : '전반적 낙관'} · 공격적 환경`;
            return `혼재 신호 · ${oilDir === 'up' ? '원유 부담' : '방향 탐색 중'} · 선별적 접근`;
        }
        if (locale === 'ja') {
            if (regime.label === 'RISK-OFF') return `VIX${vixState === 'high' ? '急騰' : '警戒'} · ${btcDir === 'down' ? '投機心理縮小' : '安全資産移動'} · 防衛的環境`;
            if (regime.label === 'RISK-ON') return `VIX安定 · ${btcDir === 'up' ? 'BTC強気·リスク選好' : '全般楽観'} · 攻勢的環境`;
            return `混在シグナル · ${oilDir === 'up' ? '原油負担' : '方向模索中'} · 選別的アプローチ`;
        }
        if (regime.label === 'RISK-OFF') return `VIX ${vixState === 'high' ? 'surging' : 'elevated'} · ${btcDir === 'down' ? 'Spec sentiment weak' : 'Safe haven bid'} · Defensive`;
        if (regime.label === 'RISK-ON') return `VIX stable · ${btcDir === 'up' ? 'BTC strong · Risk-on' : 'Broad optimism'} · Offensive`;
        return `Mixed signals · ${oilDir === 'up' ? 'Oil pressure' : 'Seeking direction'} · Selective`;
    }, [axes, regime, locale]);

    const chgColor = (chg: number, invert = false) => {
        if (invert) return chg > 0.1 ? '#f87171' : chg < -0.1 ? '#34d399' : '#94a3b8';
        return chg > 0.1 ? '#34d399' : chg < -0.1 ? '#f87171' : '#94a3b8';
    };

    // Label component for DRY — always center-aligned
    const AxisLabel = ({ idx, invert = false }: { idx: number; invert?: boolean }) => (
        <>
            <div className="text-[13px] font-bold text-slate-400 tracking-wider font-jakarta">{axes[idx].label}</div>
            <div className="text-[14px] font-mono font-bold text-white leading-tight">{axes[idx].value}</div>
            <div className="text-[13px] font-mono font-semibold leading-tight" style={{ color: chgColor(axes[idx].chg, invert) }}>
                {axes[idx].chg > 0 ? '+' : ''}{axes[idx].chg.toFixed(2)}%
            </div>
        </>
    );

    return (
        <div className="flex-1 flex flex-col items-center justify-start mt-4">
            <div className="relative" style={{ width: 300, height: 240 }}>
                <svg width="300" height="240" viewBox="0 0 300 240" className="overflow-visible">
                    <defs>
                        <radialGradient id="radarBg6" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(6,182,212,0.06)" />
                            <stop offset="100%" stopColor="rgba(6,182,212,0.01)" />
                        </radialGradient>
                        <filter id="radarGlow6">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <linearGradient id="radarFill6" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={regime.color} stopOpacity="0.2" />
                            <stop offset="100%" stopColor={regime.color} stopOpacity="0.05" />
                        </linearGradient>
                    </defs>

                    <circle cx={CX} cy={CY} r={R + 5} fill="url(#radarBg6)" />

                    {/* Grid hexagons */}
                    {rings.map((r, i) => (
                        <polygon key={i}
                            points={axes.map(a => { const p = getPoint(a.angle, R * r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')}
                            fill="none"
                            stroke={i === rings.length - 1 ? "rgba(148,163,184,0.4)" : "rgba(148,163,184,0.15)"}
                            strokeWidth={i === rings.length - 1 ? "1" : "0.5"}
                        />
                    ))}

                    {/* Axis lines */}
                    {axes.map((a, i) => {
                        const p = getPoint(a.angle, R);
                        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" />;
                    })}

                    {/* Data polygon */}
                    <polygon
                        points={dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                        fill="url(#radarFill6)" stroke={regime.color} strokeWidth="1.5"
                        strokeLinejoin="round" filter="url(#radarGlow6)" opacity="0.9"
                    />

                    {/* Data points with pulse */}
                    {dataPoints.map((p, i) => (
                        <g key={i}>
                            <circle cx={p.x} cy={p.y} r="5" fill="none" stroke={regime.color} strokeWidth="0.5" opacity="0.3">
                                <animate attributeName="r" values="3;7;3" dur="3s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
                                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
                            </circle>
                            <circle cx={p.x} cy={p.y} r="3" fill={regime.color} opacity="0.9" />
                        </g>
                    ))}

                    {/* Center regime label */}
                    <text x={CX} y={CY - 3} textAnchor="middle"
                        className="font-jakarta" style={{ fontSize: '14px', fontWeight: 900, fill: regime.color, letterSpacing: '0.12em' }}>
                        {regime.label}
                    </text>
                    <circle cx={CX} cy={CY + 10} r="2.5" fill={regime.color} opacity="0.6">
                        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
                    </circle>
                </svg>

                {/* HTML Labels — ALL center-aligned */}
                {/* VIX — top */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '-14px' }}>
                    <AxisLabel idx={0} invert />
                </div>
                {/* 10Y — top-right */}
                <div className="absolute text-center" style={{ right: '-24px', top: `${CY - R * 0.5 - 22}px` }}>
                    <AxisLabel idx={1} invert />
                </div>
                {/* OIL — bottom-right */}
                <div className="absolute text-center" style={{ right: '-24px', top: `${CY + R * 0.5 - 6}px` }}>
                    <AxisLabel idx={2} />
                </div>
                {/* DXY — bottom */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ bottom: '-44px' }}>
                    <AxisLabel idx={3} invert />
                </div>
                {/* GOLD — bottom-left */}
                <div className="absolute text-center" style={{ left: '-28px', top: `${CY + R * 0.5 - 6}px` }}>
                    <AxisLabel idx={4} />
                </div>
                {/* BTC — top-left */}
                <div className="absolute text-center" style={{ left: '-28px', top: `${CY - R * 0.5 - 22}px` }}>
                    <AxisLabel idx={5} />
                </div>
            </div>

            {/* Insight bar */}
            <div className="w-full px-1 mt-12">
                <div className="px-3 py-1.5 rounded border text-center" style={{ backgroundColor: regime.bgColor, borderColor: regime.borderColor }}>
                    <span className="text-[12px] text-slate-300">{insightText}</span>
                </div>
            </div>
        </div>
    );
}
