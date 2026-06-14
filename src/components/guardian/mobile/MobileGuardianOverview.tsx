'use client';

// ============================================================================
// MobileGuardianOverview — Tab 1: Gravity Gauge + RLSI Insight/What-If
// Components: GravityGauge (with FedWatch), RLSIInsightPanel, WhatIfSimulator
// Data: Identical props as desktop page.tsx L406-507
// ============================================================================

import React, { useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { ProGate } from '@/components/gate/FeatureGate';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { getIsMarketActive } from '@/services/guardian/marketSessionUtils';
import { Landmark } from 'lucide-react';

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
    const { data: fedwatch } = useSWR('/api/guardian/fedwatch', url => fetch(url).then(r => r.json()), { refreshInterval: 60000 });

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

            {/* ── FEDWATCH & LIQUIDITY (PREMIUM) ── */}
            <div className="backdrop-blur-md border border-slate-800 rounded-lg relative shadow-2xl overflow-hidden"
                style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.03) 30%, transparent 50%), rgba(10,14,20,0.85)' }}>
                <ProGate title="Macro Intelligence" fomoMessage={gt('fomoMacroBriefing')} description={gt('descMacroBriefing')} mode="blur" compact>
                    <div className="p-4 space-y-4">
                        {/* Title */}
                        <div className="flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-violet-400 shrink-0" />
                            <h3 className="text-[13px] font-semibold uppercase tracking-[0.15em] text-violet-400 font-jakarta">
                                FOMC FEDWATCH & LIQUIDITY
                            </h3>
                        </div>

                        {/* FedWatch Section */}
                        <div className="space-y-2.5">
                            <div className="flex justify-between items-baseline">
                                <span className="text-[12.5px] font-medium text-slate-300 uppercase tracking-wider font-jakarta">Fed Rate Target Probability</span>
                                <span className="text-[12px] font-mono text-slate-400 font-medium font-jakarta">Target: {fedwatch?.targetRate || '5.25% - 5.50%'}</span>
                            </div>
                            {/* Horizontal Stacked Progress Bar */}
                            {(() => {
                                const ease = fedwatch?.ease || 0;
                                const noChange = fedwatch?.noChange || 0;
                                const hike = fedwatch?.hike || 0;
                                const total = ease + noChange + hike || 100;
                                
                                const easePct = (ease / total) * 100;
                                const noChangePct = (noChange / total) * 100;
                                const hikePct = (hike / total) * 100;

                                return (
                                    <div className="space-y-2">
                                        <div className="h-6 w-full bg-slate-900/60 rounded-lg overflow-hidden flex border border-slate-800/30">
                                            {easePct > 0 && (
                                                <div 
                                                    style={{ width: `${easePct}%`, background: 'var(--green)' }} 
                                                    className="h-full flex items-center justify-center text-[11px] font-mono font-bold text-black"
                                                >
                                                    {easePct >= 10 && `${ease.toFixed(0)}%`}
                                                </div>
                                            )}
                                            {noChangePct > 0 && (
                                                <div 
                                                    style={{ width: `${noChangePct}%`, background: 'var(--cyan)' }} 
                                                    className="h-full flex items-center justify-center text-[11px] font-mono font-bold text-black"
                                                >
                                                    {noChangePct >= 10 && `${noChange.toFixed(0)}%`}
                                                </div>
                                            )}
                                            {hikePct > 0 && (
                                                <div 
                                                    style={{ width: `${hikePct}%`, background: 'var(--red)' }} 
                                                    className="h-full flex items-center justify-center text-[11px] font-mono font-bold text-black"
                                                >
                                                    {hikePct >= 10 && `${hike.toFixed(0)}%`}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center text-[11.5px] font-bold tracking-wider text-slate-300">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                                                <span>CUTS: {ease.toFixed(1)}%</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--cyan)' }} />
                                                <span>PAUSE: {noChange.toFixed(1)}%</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--red)' }} />
                                                <span>HIKES: {hike.toFixed(1)}%</span>
                                            </div>
                                        </div>

                                        {/* Target Rate Probabilities Matrix Grid */}
                                        <div className="mt-3 bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/40 text-[12.5px] font-jakarta">
                                            {/* Header */}
                                            <div className="grid grid-cols-4 gap-1 text-[10.5px] font-bold tracking-wider text-slate-400 uppercase pb-1.5 border-b border-slate-800/80">
                                                <span>Outcome</span>
                                                <span className="text-center">Range</span>
                                                <span className="text-right">Prob</span>
                                                <span className="text-right">1W Change</span>
                                            </div>

                                            {/* Data Rows */}
                                            {(() => {
                                                const L_MATRIX = {
                                                    ko: { cut: '금리 인하', hold: '동결 (금리 유지)', hike: '금리 인상' },
                                                    en: { cut: 'Rate Cut', hold: 'Pause (Hold)', hike: 'Rate Hike' },
                                                    ja: { cut: '利下げ', hold: '維持 (金利据置)', hike: '利上げ' }
                                                }[locale as 'ko' | 'en' | 'ja'] || { cut: 'Rate Cut', hold: 'Pause (Hold)', hike: 'Rate Hike' };

                                                let low = 5.25;
                                                let high = 5.50;
                                                if (fedwatch?.targetRate) {
                                                    const match = fedwatch.targetRate.match(/(\d+\.?\d*)/g);
                                                    if (match && match.length >= 2) {
                                                        low = parseFloat(match[0]);
                                                        high = parseFloat(match[1]);
                                                        if (low > 10) {
                                                            low = low / 100;
                                                            high = high / 100;
                                                        }
                                                    }
                                                }

                                                const rows = [
                                                    {
                                                        lbl: L_MATRIX.cut,
                                                        range: `${(low - 0.25).toFixed(2)}% - ${low.toFixed(2)}%`,
                                                        prob: ease,
                                                        prev: fedwatch?.prevEase,
                                                        clr: 'var(--green)'
                                                    },
                                                    {
                                                        lbl: L_MATRIX.hold,
                                                        range: `${low.toFixed(2)}% - ${high.toFixed(2)}%`,
                                                        prob: noChange,
                                                        prev: fedwatch?.prevNoChange,
                                                        clr: 'var(--cyan)'
                                                    },
                                                    {
                                                        lbl: L_MATRIX.hike,
                                                        range: `${high.toFixed(2)}% - ${(high + 0.25).toFixed(2)}%`,
                                                        prob: hike,
                                                        prev: fedwatch?.prevHike,
                                                        clr: 'var(--red)'
                                                    }
                                                ];

                                                return rows.map((r, idx) => {
                                                    const change = r.prev !== null && r.prev !== undefined ? r.prob - r.prev : null;
                                                    const chgText = change !== null
                                                        ? (change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`)
                                                        : '—';
                                                    const chgClr = change !== null
                                                        ? (change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-slate-400')
                                                        : 'text-slate-600';

                                                    return (
                                                        <div key={idx} className="grid grid-cols-4 gap-1 py-2 border-b border-slate-900/60 last:border-b-0 items-center font-medium">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.clr }} />
                                                                <span className="text-slate-200 font-bold truncate">{r.lbl}</span>
                                                            </div>
                                                            <span className="text-center font-mono text-slate-300 text-[11px] tabular-nums whitespace-nowrap">{r.range}</span>
                                                            <span className="text-right font-mono text-white font-bold tabular-nums">{r.prob.toFixed(1)}%</span>
                                                            <span className={`text-right font-mono font-bold text-[11.5px] tabular-nums ${chgClr}`}>{chgText}</span>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>



                        {/* Liquidity Section */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/40">
                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-2.5 flex flex-col justify-between">
                                <span className="text-[11.5px] font-normal text-slate-400 uppercase tracking-wider font-jakarta">Net Liquidity Index</span>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-[19px] font-semibold font-mono text-emerald-400">
                                        {(data?.rlsi?.components?.liquidityScore ?? 50).toFixed(0)}
                                    </span>
                                    <span className="text-[11px] font-semibold text-emerald-400/80 uppercase">
                                        {(data?.rlsi?.components?.liquidityScore ?? 50) >= 50 ? 'FAVORABLE' : 'DRY'}
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-2.5 flex flex-col justify-between">
                                <span className="text-[11.5px] font-normal text-slate-400 uppercase tracking-wider font-jakarta">Safe Haven Flow</span>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className={`text-[19px] font-semibold font-mono ${
                                        (data?.rlsi?.components?.safeHavenFlow ?? 0) > 0.5 ? 'text-rose-400' : 'text-emerald-400'
                                    }`}>
                                        {(data?.rlsi?.components?.safeHavenFlow ?? 0).toFixed(2)}
                                    </span>
                                    <span className={`text-[11px] font-semibold uppercase ${
                                        (data?.rlsi?.components?.safeHavenFlow ?? 0) > 0.5 ? 'text-rose-400' : 'text-emerald-400'
                                    }`}>
                                        {(data?.rlsi?.components?.safeHavenFlow ?? 0) > 0.5 ? 'FLIGHT' : 'STABLE'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ProGate>
            </div>
        </div>
    );
}
