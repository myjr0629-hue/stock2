'use client';

// ============================================================================
// MobileGuardianOverview — Tab 1: Gravity Gauge + RLSI Insight/What-If
// Components: GravityGauge (with FedWatch), RLSIInsightPanel, WhatIfSimulator
// Data: Identical props as desktop page.tsx L406-507
// ============================================================================

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { ProGate } from '@/components/gate/FeatureGate';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { getIsMarketActive } from '@/services/guardian/marketSessionUtils';

const GravityGauge = dynamic(() => import('@/components/guardian/GravityGauge'), { ssr: false });
const RLSIInsightPanel = dynamic(() => import('@/components/guardian/MarketBreadthPanel'), { ssr: false });
const WhatIfSimulator = dynamic(() => import('@/components/guardian/WhatIfSimulator'), { ssr: false });

interface Props {
    data: any;
    loading: boolean;
    verdict: {
        title: string;
        desc: string;
        color: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        realityInsight?: string;
    };
    session?: string;
}

export default function MobileGuardianOverview({ data, loading, verdict, session }: Props) {
    const t = useTranslations('guardian');
    const gt = useTranslations('gate');
    const locale = useLocale();
    const { status: marketStatusInfo } = useMarketStatus();
    const isMarketActive = getIsMarketActive(session, marketStatusInfo.isHoliday);
    const [insightTab, setInsightTab] = useState<'insight' | 'whatif'>('insight');

    return (
        <div className="space-y-3">
            {/* ── GRAVITY GAUGE ── */}
            <div className="backdrop-blur-md border border-slate-800 rounded-lg p-3 relative shadow-2xl overflow-hidden"
                style={{ background: 'radial-gradient(circle at 50% 70%, rgba(52,211,153,0.12) 0%, transparent 50%), radial-gradient(circle at 20% 30%, rgba(6,182,212,0.06) 0%, transparent 40%), rgba(10,14,20,0.85)' }}>
                {/* HUD Background */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(6,182,212,0.06) 0%, rgba(15,23,42,0) 65%)' }} />
                    <div className="absolute inset-0 opacity-[0.04]" style={{
                        backgroundImage: 'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }} />
                </div>
                {/* Corner Decors */}
                <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-slate-600" />
                <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-slate-600" />
                <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-slate-600" />
                <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-slate-600" />

                <ProGate title="Gravity Gauge" fomoMessage={gt('fomoGravityGauge')} description={gt('descGravityGauge')} mode="peek" compact blurPx={6}>
                    <GravityGauge
                        score={data?.rlsi?.score || 0}
                        loading={loading}
                        session={data?.rlsi?.session}
                        components={data?.rlsi?.components}
                        rlsiHistory={data?.rlsiHistory}
                        regime={data?.rlsi?.regime}
                        zSignal={data?.rlsi?.zSignal}
                    />
                </ProGate>

                {/* Scanline */}
                <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-5 pointer-events-none" />
            </div>

            {/* ── RLSI INSIGHT / WHAT-IF ── */}
            <div className="backdrop-blur-md border border-slate-800 rounded-lg relative shadow-2xl overflow-hidden"
                style={{ background: 'linear-gradient(180deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.03) 30%, transparent 50%), rgba(10,14,20,0.85)' }}>
                <ProGate title="RLSI Insight" fomoMessage={gt('fomoRlsiInsight')} description={gt('descRlsiInsight')} mode="blur" compact>
                    {/* Premium Segment Control */}
                    <div className="px-3 pt-3 pb-1.5">
                        <div className="flex items-center bg-white/[0.04] rounded-xl p-0.5 border border-white/[0.06]">
                            {(['insight', 'whatif'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setInsightTab(tab)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[10px] transition-all duration-300 touch-manipulation
                                        ${insightTab === tab
                                            ? tab === 'whatif'
                                                ? 'bg-violet-500/20 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
                                                : 'bg-emerald-500/15 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.15)]'
                                            : 'text-slate-500 active:text-slate-300'
                                        }`}
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    <span className="text-[11px] font-bold tracking-wider"
                                        style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
                                        {tab === 'insight' ? (locale === 'ko' ? 'BRIEFING' : locale === 'ja' ? 'ブリーフィング' : 'BRIEFING') : 'WHAT-IF'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {insightTab === 'insight' ? (
                        <RLSIInsightPanel
                            alignmentStatus={data?.divergence?.isDivergent ? 'DIVERGENCE' : 'ALIGNMENT OK'}
                            insightTitle={verdict.title}
                            insightDesc={verdict.realityInsight || verdict.desc}
                            sentiment={verdict.sentiment}
                            breadthPct={data?.breadth?.breadthPct ?? data?.rlsi?.components?.breadthPct ?? 50}
                            adRatio={data?.breadth?.adRatio ?? data?.rlsi?.components?.adRatio ?? 1}
                            volumeBreadth={data?.breadth?.volumeBreadth ?? data?.rlsi?.components?.volumeBreadth ?? 50}
                            breadthSignal={data?.breadth?.signal ?? data?.rlsi?.components?.breadthSignal ?? 'NEUTRAL'}
                            isDivergent={data?.breadth?.isDivergent ?? data?.rlsi?.components?.breadthDivergent ?? false}
                            loading={loading}
                            isMarketActive={isMarketActive}
                            session={session || 'CLOSED'}
                        />
                    ) : (
                        <WhatIfSimulator
                            currentScore={data?.rlsi?.score || 50}
                            components={{
                                vix: data?.rlsi?.components?.vix ?? 15,
                                yieldRaw: data?.rlsi?.components?.yieldRaw ?? 4.0,
                                sentimentScore: data?.rlsi?.components?.sentimentScore ?? 50,
                                momentumScore: data?.rlsi?.components?.momentumScore ?? 50,
                                priceActionScore: data?.rlsi?.components?.priceActionScore ?? 50,
                                breadthScore: data?.rlsi?.components?.breadthScore ?? 50,
                                rotationScore: data?.rlsi?.components?.rotationScore ?? 50,
                                vixMultiplier: data?.rlsi?.components?.vixMultiplier ?? 1.0,
                                yieldPenalty: data?.rlsi?.components?.yieldPenalty ?? 5,
                                vixTermStructure: data?.rlsi?.components?.vixTermStructure ?? 1.0,
                            }}
                        />
                    )}
                </ProGate>
            </div>
        </div>
    );
}
