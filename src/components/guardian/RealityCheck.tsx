"use client";

import React from 'react';
import { Activity } from "lucide-react";
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
 * RealityCheck V7.7
 * 3×2 uniform grid — all gauges balanced, compact layout
 */
export function RealityCheck({
    nasdaqChange,
    guardianScore,
    divergenceCase = 'N',
    rvolNdx = 1.0,
    rvolDow = 1.0,
}: RealityCheckProps) {
    const t = useTranslations('guardian');
    const isDivergent = divergenceCase === 'A' || divergenceCase === 'B';
    const statusText = isDivergent ? "DIVERGENCE" : t('alignment');
    const statusColor = isDivergent ? "text-rose-400" : "text-emerald-400";

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
            {/* HEADER */}
            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">
                        REALITY CHECK
                    </h3>
                </div>
                <div className={`text-[11px] font-black uppercase ${statusColor} border border-current px-1.5 py-0.5 rounded`}>
                    {statusText}
                </div>
            </div>

            {/* 3×2 UNIFORM GRID */}
            <div className="flex-1 grid grid-cols-3 gap-x-1 gap-y-1 place-items-center content-center">
                {/* Row 1 */}
                <DualGauge
                    priceValue={nasdaqChange}
                    flowValue={guardianScore}
                    size="lg"
                />
                <MiniGauge
                    label="NDX 20D"
                    value={`${Math.round(rvolNdx * 100)}%`}
                    subLabel={rvolNdx > 1.5 ? '활발' : rvolNdx > 1.0 ? '보통' : '저조'}
                    colorClass={getRvolColor(rvolNdx)}
                    size="lg"
                    fillPercent={Math.min(rvolNdx * 50, 100)}
                />
                <MiniGauge
                    label="DOW 20D"
                    value={`${Math.round(rvolDow * 100)}%`}
                    subLabel={rvolDow > 1.5 ? '활발' : rvolDow > 1.0 ? '보통' : '저조'}
                    colorClass={rvolDow > 1.0 ? 'text-orange-400' : 'text-slate-400'}
                    size="lg"
                    fillPercent={Math.min(rvolDow * 50, 100)}
                />

                {/* Row 2 */}
                <MiniGauge
                    label="US10Y"
                    value={yieldCurve ? `${yieldCurve.us10y.toFixed(2)}%` : '—'}
                    secondaryValue={`${us10yChangePct >= 0 ? '+' : ''}${us10yChangePct.toFixed(2)}%`}
                    subLabel={us10yChangePct > 0 ? '상승' : us10yChangePct < 0 ? '하락' : '보합'}
                    colorClass={get10YColor(us10yChangePct)}
                    size="lg"
                    fillPercent={50 + us10yChangePct * 10}
                />
                <MiniGauge
                    label="2s10s"
                    value={yieldCurve ? `${yieldCurve.spread2s10s > 0 ? '+' : ''}${yieldCurve.spread2s10s.toFixed(2)}%` : '—'}
                    subLabel={yieldCurve ? (yieldCurve.spread2s10s < 0 ? '역전' : yieldCurve.spread2s10s < 0.25 ? '둔화' : '정상') : '—'}
                    colorClass={yieldCurve ? getSpreadColor(yieldCurve.spread2s10s) : 'text-slate-400'}
                    size="lg"
                    fillPercent={yieldCurve ? Math.min((yieldCurve.spread2s10s + 1) * 50, 100) : 50}
                />
                <MiniGauge
                    label="REAL"
                    value={realYield ? `${realYield.realYield > 0 ? '+' : ''}${realYield.realYield.toFixed(2)}%` : '—'}
                    subLabel={realYield?.stance === 'TIGHT' ? '긴축' : realYield?.stance === 'LOOSE' ? '완화' : '중립'}
                    colorClass={realYield ? getRealColor(realYield.stance) : 'text-slate-400'}
                    size="lg"
                    fillPercent={realYield ? Math.min((realYield.realYield + 2) * 25, 100) : 50}
                />
            </div>
        </div>
    );
}
