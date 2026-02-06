"use client";

import React from 'react';
import { Activity, MessageSquare } from "lucide-react";
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
}

/**
 * RealityCheck V45.4 - Fixed sizing and labels
 */
export function RealityCheck({
    nasdaqChange,
    guardianScore,
    divergenceCase = 'N',
    rvolNdx = 1.0,
    rvolDow = 1.0,
    verdict
}: RealityCheckProps) {
    const t = useTranslations('guardian');
    const isDivergent = divergenceCase === 'A' || divergenceCase === 'B';
    const statusText = isDivergent ? "DIVERGENCE" : "ALIGNMENT OK";
    const statusColor = isDivergent ? "text-rose-400" : "text-emerald-400";

    const { snapshot } = useMacroSnapshot();
    const yieldCurve = snapshot?.yieldCurve;
    const realYield = snapshot?.realYield;
    const us10yFactor = snapshot?.factors?.us10y;

    // 10Y 일일 변동률 (% change)
    const us10yChangePct = us10yFactor?.chgPct ?? 0;

    // Color helpers
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

    // Interpretation helpers
    const get10YInterpretation = (change: number) => {
        if (change > 2) return '급등 · 긴축';
        if (change > 0) return '상승 · 부담↑';
        if (change < -2) return '급락 · 완화';
        return '하락 · 부담↓';
    };

    const getSpreadInterpretation = (val: number) => {
        if (val < 0) return '⚠️ 침체 경고';
        if (val < 0.25) return '경기 둔화';
        return '정상 · 성장';
    };

    const getRealInterpretation = (stance: string) => {
        if (stance === 'TIGHT') return '자금 긴축';
        if (stance === 'LOOSE') return '자금 완화';
        return '중립 환경';
    };

    // VIX and DXY from macro snapshot
    const vixFactor = snapshot?.factors?.vix;
    const vix = vixFactor?.level ?? 0;
    const dxyFactor = snapshot?.factors?.dxy;
    const dxy = dxyFactor?.level ?? 0;

    // VIX color: green if <20, amber if 20-30, red if >30
    const getVixColor = (v: number) => {
        if (v > 30) return 'text-rose-400';
        if (v > 20) return 'text-amber-400';
        return 'text-emerald-400';
    };

    // DXY color: green if strengthening (>100), amber if neutral, otherwise slate
    const getDxyColor = (d: number) => {
        if (d > 105) return 'text-rose-400';
        if (d > 100) return 'text-amber-400';
        return 'text-emerald-400';
    };

    return (
        <div className="h-full flex flex-col p-2">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-400">
                        REALITY CHECK
                    </h3>
                </div>
                {/* VIX / DXY Glassmorphism Cards - Single Row */}
                <div className="flex items-center gap-2">
                    {/* VIX Card */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-rose-500/30 to-amber-500/30 rounded-lg blur opacity-60 group-hover:opacity-100 transition" />
                        <div className="relative flex items-center gap-3 px-4 py-px bg-slate-900/80 backdrop-blur-md rounded-lg border border-white/10">
                            <span className="text-[10px] text-white/50 font-medium tracking-wider">VIX</span>
                            <span className={`text-base font-bold tabular-nums ${getVixColor(vix)}`}>
                                {vix > 0 ? vix.toFixed(1) : '—'}
                            </span>
                            {vixFactor?.chgPct != null && (
                                <span className={`text-sm font-semibold ${(vixFactor.chgPct ?? 0) >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {(vixFactor.chgPct ?? 0) >= 0 ? '+' : ''}{(vixFactor.chgPct ?? 0).toFixed(1)}%
                                </span>
                            )}
                            <span className={`text-xs font-bold uppercase tracking-wide border-l border-white/20 pl-3 ${getVixColor(vix)}`}>
                                {vix > 30 ? '🔥 EXTREME FEAR' : vix > 20 ? '⚡ FEAR' : vix > 15 ? '😐 NEUTRAL' : '😊 CALM'}
                            </span>
                        </div>
                    </div>
                    {/* DXY Card */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-sky-500/30 to-cyan-500/30 rounded-lg blur opacity-60 group-hover:opacity-100 transition" />
                        <div className="relative flex items-center gap-3 px-4 py-px bg-slate-900/80 backdrop-blur-md rounded-lg border border-white/10">
                            <span className="text-[10px] text-white/50 font-medium tracking-wider">DXY</span>
                            <span className={`text-base font-bold tabular-nums ${getDxyColor(dxy)}`}>
                                {dxy > 0 ? dxy.toFixed(1) : '—'}
                            </span>
                            {dxyFactor?.chgPct != null && (
                                <span className={`text-sm font-semibold ${(dxyFactor.chgPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {(dxyFactor.chgPct ?? 0) >= 0 ? '+' : ''}{(dxyFactor.chgPct ?? 0).toFixed(1)}%
                                </span>
                            )}
                            <span className={`text-xs font-bold uppercase tracking-wide border-l border-white/20 pl-3 ${getDxyColor(dxy)}`}>
                                {dxy > 105 ? '💪 STRONG $' : dxy > 100 ? '📈 FIRM' : dxy > 95 ? '😐 NEUTRAL' : '📉 WEAK $'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex gap-3 min-h-0">

                {/* LEFT: Combined PRICE/FLOW + RVOL Gauges */}
                <div className="w-[45%] flex flex-col items-center justify-center gap-3">
                    {/* Dual Gauge: PRICE vs FLOW - Size controlled */}
                    <DualGauge
                        priceValue={nasdaqChange}
                        flowValue={guardianScore}
                        size="xl"
                    />

                    {/* RVOL Gauges Row - Proper labels */}
                    <div className="flex gap-8 items-start">
                        <MiniGauge
                            label="NDX 20D"
                            value={`${Math.round(rvolNdx * 100)}%`}
                            description="평균거래량 대비"
                            subLabel={rvolNdx > 1.5 ? '활발' : rvolNdx > 1.0 ? '보통' : '저조'}
                            colorClass={getRvolColor(rvolNdx)}
                            size="lg"
                            fillPercent={Math.min(rvolNdx * 50, 100)}
                        />
                        <MiniGauge
                            label="DOW 20D"
                            value={`${Math.round(rvolDow * 100)}%`}
                            description="평균거래량 대비"
                            subLabel={rvolDow > 1.5 ? '활발' : rvolDow > 1.0 ? '보통' : '저조'}
                            colorClass={rvolDow > 1.0 ? 'text-orange-400' : 'text-slate-400'}
                            size="lg"
                            fillPercent={Math.min(rvolDow * 50, 100)}
                        />
                    </div>
                </div>

                {/* RIGHT: RLSI Panel + Macro Gauges */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">

                    {/* RLSI Glass Panel */}
                    <div className="rounded-xl backdrop-blur-xl bg-slate-900/60 border border-white/20 p-2.5">
                        <div className="flex justify-between items-center mb-1.5">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">{t('rlsi')}</span>
                            </div>
                            <div className={`text-[9px] font-black uppercase ${statusColor} border border-current px-1.5 py-0.5 rounded`}>
                                {statusText}
                            </div>
                        </div>

                        {verdict && (
                            <div>
                                <div className={`text-[10px] font-bold mb-0.5 uppercase tracking-wide ${verdict.sentiment === 'BULLISH' ? 'text-emerald-300' :
                                    verdict.sentiment === 'BEARISH' ? 'text-rose-300' : 'text-white'
                                    }`}>
                                    {verdict.title}
                                </div>
                                <div className="text-[10px] text-white/90 leading-snug line-clamp-2" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {verdict.desc}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Macro Gauges - Free floating without frame */}
                    <div className="flex-1 flex items-center justify-around">
                        {/* US10Y - Show current rate, change below */}
                        <MiniGauge
                            label="US10Y"
                            value={yieldCurve ? `${yieldCurve.us10y.toFixed(2)}%` : '—'}
                            description="10년물 금리"
                            secondaryValue={`${us10yChangePct >= 0 ? '+' : ''}${us10yChangePct.toFixed(2)}%`}
                            subLabel={us10yChangePct !== 0 ? get10YInterpretation(us10yChangePct) : '보합'}
                            colorClass={get10YColor(us10yChangePct)}
                            size="lg"
                            fillPercent={50 + us10yChangePct * 10}
                        />

                        {/* 2s10s Spread */}
                        <MiniGauge
                            label="2s10s"
                            value={yieldCurve ? `${yieldCurve.spread2s10s > 0 ? '+' : ''}${yieldCurve.spread2s10s.toFixed(2)}%` : '—'}
                            description="장단기 금리차"
                            subLabel={yieldCurve ? getSpreadInterpretation(yieldCurve.spread2s10s) : '—'}
                            colorClass={yieldCurve ? getSpreadColor(yieldCurve.spread2s10s) : 'text-slate-400'}
                            size="lg"
                            fillPercent={yieldCurve ? Math.min((yieldCurve.spread2s10s + 1) * 50, 100) : 50}
                        />

                        {/* Real Yield */}
                        <MiniGauge
                            label="REAL"
                            value={realYield ? `${realYield.realYield > 0 ? '+' : ''}${realYield.realYield.toFixed(2)}%` : '—'}
                            description="실질 금리"
                            subLabel={realYield ? getRealInterpretation(realYield.stance) : '—'}
                            colorClass={realYield ? getRealColor(realYield.stance) : 'text-slate-400'}
                            size="lg"
                            fillPercent={realYield ? Math.min((realYield.realYield + 2) * 25, 100) : 50}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
