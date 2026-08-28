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
import { getIsMarketActive, getEffectiveSession } from '@/services/guardian/marketSessionUtils';
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
    const gt = useTranslations('gate');
    const locale = useLocale();
    const { status: marketStatusInfo } = useMarketStatus();
    const isMarketActive = getIsMarketActive(session, marketStatusInfo.isHoliday);
    // ⚠️ 패널에는 **정규화한** 세션을 넘겨야 한다.
    //   API 가 CLOSED 를 주는데 실제로는 정규장인 경우(marketStatus 지연 등),
    //   원본을 그대로 넘기면 웹은 실시간 breadth 를 보여주는데 앱만 비실시간이 된다.
    //   같은 파일 안에서도 isMarketActive 는 내부적으로 정규화되므로
    //   «isMarketActive=true 인데 session=CLOSED» 라는 모순이 생긴다.
    //   형제 컴포넌트(MobileGuardianFlow / MobileGuardianShield)와 웹은 이미 이렇게 한다.
    const effectiveSession = getEffectiveSession(session);
    const [insightTab, setInsightTab] = useState<'insight' | 'whatif'>('insight');
    const { data: fedwatch } = useSWR('/api/guardian/fedwatch', url => fetch(url).then(r => r.json()), { refreshInterval: 60000 });
    const fwEase = typeof fedwatch?.ease === 'number' ? fedwatch.ease : 0;
    const fwPause = typeof fedwatch?.noChange === 'number' ? fedwatch.noChange : 0;
    const fwHike = typeof fedwatch?.hike === 'number' ? fedwatch.hike : 0;
    const fwTotal = fwEase + fwPause + fwHike;
    const hasFedwatch = fwTotal > 0;
    const fwDominant = fwPause >= fwHike && fwPause >= fwEase ? 'pause' : fwHike >= fwEase ? 'hike' : 'cut';
    const fwLocale = (locale === 'ko' || locale === 'ja' || locale === 'en') ? locale : 'en';
    const fwText = {
        ko: {
            title: 'FOMC 경로 & 유동성',
            fomcDday: 'FOMC',
            baseCase: fwDominant === 'pause' ? '동결 우세' : fwDominant === 'hike' ? '인상 리스크 우세' : '인하 가능성 우세',
            baseDesc: fwDominant === 'pause' ? '현재 확률은 동결을 기준 시나리오로 가리킵니다.' : fwDominant === 'hike' ? '시장 확률은 추가 긴축 리스크를 더 크게 반영합니다.' : '시장 확률은 완화 전환 가능성을 더 크게 반영합니다.',
            cut: '인하',
            pause: '동결',
            hike: '인상',
            base: '기준',
            tail: '리스크',
            low: '낮음',
            range: '범위',
            prob: '확률',
            week: '1주 변화',
            liquidity: '유동성',
            safeHaven: '안전자산',
            favorable: '우호적',
            dry: '건조',
            flight: '회피',
            stable: '안정',
            unavailable: 'FedWatch 데이터 대기 중',
        },
        en: {
            title: 'FOMC Path & Liquidity',
            fomcDday: 'FOMC',
            baseCase: fwDominant === 'pause' ? 'Pause Base Case' : fwDominant === 'hike' ? 'Hike Risk Leads' : 'Cut Probability Leads',
            baseDesc: fwDominant === 'pause' ? 'Current probabilities point to a hold as the base case.' : fwDominant === 'hike' ? 'Market probabilities are leaning toward additional tightening risk.' : 'Market probabilities are leaning toward an easing path.',
            cut: 'Cut',
            pause: 'Pause',
            hike: 'Hike',
            base: 'Base',
            tail: 'Risk',
            low: 'Low',
            range: 'Range',
            prob: 'Prob',
            week: '1W Chg',
            liquidity: 'Liquidity',
            safeHaven: 'Safe Haven',
            favorable: 'Favorable',
            dry: 'Dry',
            flight: 'Flight',
            stable: 'Stable',
            unavailable: 'Waiting for FedWatch data',
        },
        ja: {
            title: 'FOMC経路 & 流動性',
            fomcDday: 'FOMC',
            baseCase: fwDominant === 'pause' ? '据え置き優勢' : fwDominant === 'hike' ? '利上げリスク優勢' : '利下げ確率優勢',
            baseDesc: fwDominant === 'pause' ? '現在の確率は据え置きを基本シナリオとして示しています。' : fwDominant === 'hike' ? '市場確率は追加引き締めリスクをより強く反映しています。' : '市場確率は緩和方向への転換をより強く反映しています。',
            cut: '利下げ',
            pause: '据置',
            hike: '利上げ',
            base: '基準',
            tail: 'リスク',
            low: '低い',
            range: 'レンジ',
            prob: '確率',
            week: '1週変化',
            liquidity: '流動性',
            safeHaven: '安全資産',
            favorable: '良好',
            dry: '低下',
            flight: '逃避',
            stable: '安定',
            unavailable: 'FedWatchデータ待機中',
        },
    }[fwLocale];
    const liquidityScore = data?.rlsi?.components?.liquidityScore ?? 50;
    const safeHavenFlow = data?.rlsi?.components?.safeHavenFlow ?? 0;
    const daysUntilFomc = typeof fedwatch?.daysUntilFomc === 'number' ? fedwatch.daysUntilFomc : null;
    const fwScenarios = [
        { key: 'cut', label: fwText.cut, value: fwEase, prev: fedwatch?.prevEase, color: 'var(--green)' },
        { key: 'pause', label: fwText.pause, value: fwPause, prev: fedwatch?.prevNoChange, color: 'var(--cyan)' },
        { key: 'hike', label: fwText.hike, value: fwHike, prev: fedwatch?.prevHike, color: 'var(--red)' },
    ];

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
                    <div className="px-2.5 pt-2.5 pb-1">
                        <div className="flex items-center bg-white/[0.04] rounded-md p-0.5 border border-white/[0.06]">
                            {(['insight', 'whatif'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setInsightTab(tab)}
                                    className={`flex-1 flex h-7 min-h-7 items-center justify-center gap-1 rounded px-2 py-0 transition-all duration-300 touch-manipulation
                                        ${insightTab === tab
                                            ? tab === 'whatif'
                                                ? 'bg-violet-500/20 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
                                                : 'bg-emerald-500/15 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.15)]'
                                            : 'text-slate-500 active:text-slate-300'
                                        }`}
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    <span className="text-[9.5px] font-bold tracking-wide"
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
                            session={effectiveSession || 'CLOSED'}
                            appCompact
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
                    <div className="p-2.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Landmark className="w-4 h-4 text-violet-400 shrink-0" />
                                <div className="min-w-0">
                                    <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-violet-300 font-jakarta truncate">
                                        {fwText.title}
                                    </h3>
                                </div>
                            </div>
                            <div className="shrink-0 rounded-md border border-violet-400/20 bg-violet-500/[0.08] px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.07em] text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <span className="font-jakarta">{fwText.fomcDday}</span>
                                <span className="ml-1 font-mono tabular-nums">{daysUntilFomc !== null ? `D-${daysUntilFomc}` : '—'}</span>
                            </div>
                        </div>

                        <div className="rounded-lg border border-violet-400/15 bg-violet-500/[0.045] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[10.5px] font-black uppercase tracking-[0.13em] text-violet-300">
                                        {fwDominant === 'pause' ? fwText.base : fwText.tail}
                                    </div>
                                    <div className="mt-1 text-[15px] font-black text-white tracking-[-0.01em]">
                                        {hasFedwatch ? fwText.baseCase : fwText.unavailable}
                                    </div>
                                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                                        {hasFedwatch ? fwText.baseDesc : ''}
                                    </p>
                                </div>
                                <div className="rounded-md border border-white/[0.06] bg-slate-950/45 px-2 py-1.5 text-right">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{fwText.prob}</div>
                                    <div className="text-[18px] font-black font-mono text-cyan-300 tabular-nums">
                                        {hasFedwatch ? `${Math.max(fwEase, fwPause, fwHike).toFixed(1)}%` : '—'}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-950/70 border border-slate-800/70 flex">
                                {fwScenarios.map(item => {
                                    const width = hasFedwatch ? Math.max((item.value / fwTotal) * 100, item.value > 0 ? 2 : 0) : 0;
                                    return (
                                        <div key={item.key} style={{ width: `${width}%`, background: item.color }} className="h-full opacity-90" />
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {fwScenarios.map(item => {
                                const isLead = item.key === fwDominant && hasFedwatch;
                                const change = typeof item.prev === 'number' ? item.value - item.prev : null;
                                const changeText = change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
                                const changeClass = change === null ? 'text-slate-500' : change > 0 ? 'text-emerald-400' : change < 0 ? 'text-rose-400' : 'text-slate-500';

                                return (
                                    <div
                                        key={item.key}
                                        className={`rounded-lg border p-2 min-w-0 ${isLead ? 'border-cyan-400/25 bg-cyan-400/[0.07]' : 'border-slate-800/70 bg-slate-950/35'}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                                            <span className="text-[10.5px] font-black uppercase tracking-[0.08em] text-slate-400 truncate">{item.label}</span>
                                        </div>
                                        <div className="mt-1.5 text-[16px] font-black font-mono text-white tabular-nums">
                                            {hasFedwatch ? `${item.value.toFixed(1)}%` : '—'}
                                        </div>
                                        <div className={`mt-0.5 text-[10px] font-bold font-mono tabular-nums ${changeClass}`}>
                                            {fwText.week} {changeText}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="rounded-lg border border-emerald-400/15 bg-emerald-500/[0.045] p-2.5">
                                <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-slate-400">{fwText.liquidity}</span>
                                <div className="mt-1 flex items-baseline gap-1.5">
                                    <span className="text-[19px] font-black font-mono text-emerald-400 tabular-nums">
                                        {liquidityScore.toFixed(0)}
                                    </span>
                                    <span className="text-[11px] font-black text-emerald-400/80 uppercase">
                                        {liquidityScore >= 50 ? fwText.favorable : fwText.dry}
                                    </span>
                                </div>
                            </div>
                            <div className="rounded-lg border border-cyan-400/15 bg-cyan-500/[0.035] p-2.5">
                                <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-slate-400">{fwText.safeHaven}</span>
                                <div className="mt-1 flex items-baseline gap-1.5">
                                    <span className={`text-[19px] font-black font-mono tabular-nums ${safeHavenFlow > 0.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {safeHavenFlow.toFixed(2)}
                                    </span>
                                    <span className={`text-[11px] font-black uppercase ${safeHavenFlow > 0.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {safeHavenFlow > 0.5 ? fwText.flight : fwText.stable}
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
