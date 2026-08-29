'use client';

// ============================================================================
// MobileGuardianReality — Tab 2: Reality Check + Economic Calendar
// Components: RealityCheck (6 Gauges + Macro Alerts + News Pulse) + Calendar
// Data: Identical props as desktop page.tsx L426-441
// ============================================================================

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ProGate } from '@/components/gate/FeatureGate';
import { RealityCheck } from '@/components/guardian/RealityCheck';
import { EconomicCalendarWidget } from '@/components/guardian/EconomicCalendarWidget';

interface Props {
    data: any;
    verdict: {
        title: string;
        desc: string;
        color: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        realityInsight?: string;
    };
}

export default function MobileGuardianReality({ data, verdict }: Props) {
    const gt = useTranslations('gate');
    const locale = useLocale();

    return (
        <div className="space-y-3">
            {/* ── REALITY CHECK (full component with all internal tabs) ── */}
            <div className="backdrop-blur-md border border-slate-800 rounded-lg p-3 relative shadow-2xl overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.10) 0%, rgba(6,182,212,0.03) 40%, transparent 70%), rgba(10,14,20,0.85)' }}>
                {/* Infographic: Dot Matrix Grid */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(6,182,212,0.22) 1.2px, transparent 1.2px)',
                        backgroundSize: '20px 20px',
                        backgroundPosition: '10px 10px',
                    }}
                />
                <ProGate title="Reality Check" fomoMessage={gt('fomoRealityCheck')} description={gt('descRealityCheck')} mode="peek" compact blurPx={6}>
                    <RealityCheck
                        nasdaqChange={data?.market?.nqChangePercent || 0}
                        guardianScore={data?.rlsi?.score || 0}
                        divergenceCase={data?.divergence?.caseId as "N" | "A" | "B" | "C" | "D" | undefined}
                        // ⚠️ `|| 1.0` 금지 — 엔진이 «측정 안 함»으로 null 을 주는데
                        //    1.0 으로 되돌리면 화면이 «100% · 저조»라고 단언한다
                        //    (2026-08-29 실측: 앱 「시장 현황」 탭에 상시 노출)
                        rvolNdx={data?.rvol?.ndx?.rvol ?? null}
                        rvolDow={data?.rvol?.dow?.rvol ?? null}
                        verdict={{
                            title: "MARKET ESSENCE",
                            desc: verdict.realityInsight || "Gathering Pulse...",
                            sentiment: verdict.sentiment
                        }}
                        vixTermStructure={data?.rlsi?.components?.vixTermStructure}
                        bondFlow={data?.rlsi?.components?.bondFlow}
                        goldFlow={data?.rlsi?.components?.goldFlow}
                    />
                </ProGate>
            </div>

            {/* ── ECONOMIC CALENDAR ── */}
            <EconomicCalendarWidget locale={locale} localizeLabels />
        </div>
    );
}
