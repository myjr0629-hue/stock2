"use client";

import React, { useMemo } from "react";
import { generateVerdictWHY, VerdictWHY } from "@/lib/whyEngine";
import { WithExplanation } from "@/components/common/ExplanationTooltip";
import { useTranslations } from 'next-intl';

interface VerdictPanelProps {
    vix: number | null;
    vixChange: number | null;
    us10y: number | null;
    ndx: number | null;
    ndxChange: number | null;
    pinZone?: boolean;
    gammaExposure?: number | null;
}

export function VerdictPanel({
    vix,
    vixChange,
    us10y,
    ndx,
    ndxChange,
    pinZone = false,
    gammaExposure = null
}: VerdictPanelProps) {
    const t = useTranslations('verdict');

    // Determine regime from VIX
    const regime = useMemo(() => {
        if (!vix) return "Neutral";
        if (vix > 20) return "Risk-Off";
        if (vix < 16) return "Risk-On";
        return "Neutral";
    }, [vix]);

    // Generate WHY explanation
    const verdict: VerdictWHY = useMemo(() => {
        return generateVerdictWHY(
            vix ?? 18,
            vixChange ?? 0,
            us10y ?? 4.0,
            ndx,
            ndxChange,
            regime,
            pinZone,
            gammaExposure
        );
    }, [vix, vixChange, us10y, ndx, ndxChange, regime, pinZone, gammaExposure]);

    // Headline color based on regime
    const headlineColor = useMemo(() => {
        if (regime === "Risk-On") return "text-emerald-400";
        if (regime === "Risk-Off") return "text-rose-400";
        return "text-amber-400";
    }, [regime]);

    return (
        <div className="bg-[#1A1F26] border border-slate-700/50 rounded-xl p-5 shadow-md">
            {/* Headline */}
            <div className="mb-4">
                <WithExplanation indicatorId="REGIME">
                    <h2 className={`verdict-headline ${headlineColor}`}>
                        {verdict.headline}
                    </h2>
                </WithExplanation>
            </div>

            {/* 3-line WHY explanation */}
            <div className="space-y-3">
                {/* 가격 구조 */}
                <div className="flex items-start gap-2">
                    <span className="badge-text text-indigo-400 shrink-0">1️⃣ {t('price')}</span>
                    <p className="why-text text-slate-300">{verdict.priceStructure}</p>
                </div>

                {/* 레짐/변동성 */}
                <div className="flex items-start gap-2">
                    <span className="badge-text text-amber-400 shrink-0">2️⃣ {t('regime')}</span>
                    <p className="why-text text-slate-300">{verdict.regimeContext}</p>
                </div>

                {/* 실행 규칙 */}
                <div className="flex items-start gap-2">
                    <span className="badge-text text-rose-400 shrink-0">3️⃣ {t('execution')}</span>
                    <p className="why-text text-slate-300">{verdict.executionRule}</p>
                </div>
            </div>

            {/* Bottom badge */}
            <div className="mt-4 pt-3 border-t border-slate-700/40 flex items-center justify-between">
                <span className="badge-text text-slate-500">Engine V9.0</span>
                <span className={`text-sm font-bold ${headlineColor}`}>
                    {regime === "Risk-On" ? `📈 ${t('bullish')}` : regime === "Risk-Off" ? `📉 ${t('defensive')}` : `⏸️ ${t('wait')}`}
                </span>
            </div>
        </div>
    );
}
