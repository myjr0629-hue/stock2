"use client";

import React from 'react';
import { Activity, AlertTriangle, TrendingUp } from "lucide-react";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { useTranslations } from 'next-intl';
import { MiniGauge, DualGauge } from "./MiniGauge";

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
    vixTermStructure?: number; // [V9.0]
    bondFlow?: number;         // [V9.0]
    goldFlow?: number;         // [V9.0]
}

/**
 * RealityCheck v8.0 — Flow Map Glassmorphic Style
 * 3×2 premium gauge grid with unified visual language
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
            {/* HEADER — minimal, premium */}
            <div className="flex justify-between items-center mb-3 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400/60" />
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70 font-jakarta">
                        REALITY CHECK
                    </h3>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColor}`}>
                    {statusText}
                </span>
            </div>

            {/* 3×2 GAUGE GRID */}
            <div className="flex-1 grid grid-cols-3 gap-x-2 gap-y-3 place-items-center content-center">
                {/* Row 1 */}
                <DualGauge
                    priceValue={nasdaqChange}
                    flowValue={guardianScore}
                    size="lg"
                />
                <MiniGauge
                    label="NDX 20D"
                    value={`${Math.round(rvolNdx * 100)}%`}
                    subLabel={rvolNdx > 1.5 ? t('rvolActive') : rvolNdx > 1.0 ? t('rvolNormal') : t('rvolLow')}
                    colorClass={getRvolColor(rvolNdx)}
                    size="lg"
                    fillPercent={Math.min(rvolNdx * 50, 100)}
                />
                <MiniGauge
                    label="DOW 20D"
                    value={`${Math.round(rvolDow * 100)}%`}
                    subLabel={rvolDow > 1.5 ? t('rvolActive') : rvolDow > 1.0 ? t('rvolNormal') : t('rvolLow')}
                    colorClass={rvolDow > 1.0 ? 'text-orange-400' : 'text-slate-400'}
                    size="lg"
                    fillPercent={Math.min(rvolDow * 50, 100)}
                />

                {/* Row 2 */}
                <MiniGauge
                    label="US10Y"
                    value={yieldCurve ? `${yieldCurve.us10y.toFixed(2)}%` : '—'}
                    secondaryValue={`${us10yChangePct >= 0 ? '+' : ''}${us10yChangePct.toFixed(2)}%`}
                    subLabel={us10yChangePct > 0 ? t('yieldUp') : us10yChangePct < 0 ? t('yieldDown') : t('yieldFlat')}
                    colorClass={get10YColor(us10yChangePct)}
                    size="lg"
                    fillPercent={50 + us10yChangePct * 10}
                />
                <MiniGauge
                    label="2S10S"
                    value={yieldCurve ? `${yieldCurve.spread2s10s > 0 ? '+' : ''}${yieldCurve.spread2s10s.toFixed(2)}%` : '—'}
                    subLabel={yieldCurve ? (yieldCurve.spread2s10s < 0 ? t('yieldInverted') : yieldCurve.spread2s10s < 0.25 ? t('yieldFlattening') : t('yieldNormal')) : '—'}
                    colorClass={yieldCurve ? getSpreadColor(yieldCurve.spread2s10s) : 'text-slate-400'}
                    size="lg"
                    fillPercent={yieldCurve ? Math.min((yieldCurve.spread2s10s + 1) * 50, 100) : 50}
                />
                <MiniGauge
                    label="REAL"
                    value={realYield ? `${realYield.realYield > 0 ? '+' : ''}${realYield.realYield.toFixed(2)}%` : '—'}
                    subLabel={realYield?.stance === 'TIGHT' ? t('stanceTight') : realYield?.stance === 'LOOSE' ? t('stanceLoose') : t('stanceNeutral')}
                    colorClass={realYield ? getRealColor(realYield.stance) : 'text-slate-400'}
                    size="lg"
                    fillPercent={realYield ? Math.min((realYield.realYield + 2) * 25, 100) : 50}
                />
            </div>

            {/* [V9.0] MACRO TACTICAL ALERTS */}
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
        </div>
    );
}
