'use client';

// ============================================================================
// MobileGuardianPage — Premium 4-Tab Guardian Terminal (Mobile-Native)
// v2.0: Bloomberg/Robinhood-class design with glassmorphism header
// Data: 100% from useGuardian() — ZERO new logic
// Desktop Impact: ZERO — fully isolated in mobile/ directory
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useGuardian } from '@/components/guardian/GuardianProvider';
import { useMacroSnapshot } from '@/hooks/useMacroSnapshot';
import GuardianAlertBanner from '@/components/guardian/GuardianAlertBanner';
import useSWR from 'swr';
import { Eye, Shield, Activity, Map } from 'lucide-react';

// Lazy-loaded tab components
const MobileGuardianOverview = dynamic(() => import('./MobileGuardianOverview'), { ssr: false });
const MobileGuardianReality = dynamic(() => import('./MobileGuardianReality'), { ssr: false });
const MobileGuardianShield = dynamic(() => import('./MobileGuardianShield'), { ssr: false });
const MobileGuardianFlow = dynamic(() => import('./MobileGuardianFlow'), { ssr: false });

type TabKey = 'overview' | 'reality' | 'shield' | 'flow';

const TABS: { key: TabKey; label: string; prefix?: string; icon: typeof Eye }[] = [
    { key: 'overview', prefix: 'AI', label: 'Overview', icon: Eye },
    { key: 'reality', label: 'Reality', icon: Activity },
    { key: 'shield', label: 'Shield', icon: Shield },
    { key: 'flow', label: 'Flow', icon: Map },
];

// ── Macro Pill Status Helpers ──
const getFgStatus = (score: number) => {
    if (score >= 75) return { label: 'EXTREME GREED', color: '#34d399', border: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]' };
    if (score >= 55) return { label: 'GREED', color: '#86efac', border: 'border-emerald-400/25', bg: 'bg-emerald-400/[0.06]' };
    if (score >= 45) return { label: 'NEUTRAL', color: '#94a3b8', border: 'border-slate-500/20', bg: 'bg-slate-500/[0.06]' };
    if (score >= 25) return { label: 'FEAR', color: '#f59e0b', border: 'border-amber-500/25', bg: 'bg-amber-500/[0.06]' };
    return { label: 'EXTREME FEAR', color: '#f43f5e', border: 'border-rose-500/30', bg: 'bg-rose-500/[0.08]' };
};
const getVixStatus = (v: number) => {
    if (v > 30) return { label: 'EXTREME', color: '#f43f5e' };
    if (v > 20) return { label: 'ELEVATED', color: '#f59e0b' };
    if (v > 15) return { label: 'NORMAL', color: '#94a3b8' };
    return { label: 'LOW', color: '#34d399' };
};
const getDxyStatus = (d: number) => {
    if (d > 105) return { label: 'STRONG', color: '#f43f5e' };
    if (d > 100) return { label: 'FIRM', color: '#f59e0b' };
    if (d > 95) return { label: 'NEUTRAL', color: '#94a3b8' };
    return { label: 'WEAK', color: '#34d399' };
};

const indexFetcher = (url: string) => fetch(url).then(r => r.json());
interface IndexQuote { price: number; changePct: number; updatedAt: string; }
interface IndexCloseData { nasdaq: IndexQuote | null; dow: IndexQuote | null; spx: IndexQuote | null; }

export default function MobileGuardianPage() {
    const { data: globalData, loading, alerts, connectionMode, rlsi } = useGuardian();
    const data = globalData as any;
    const { snapshot } = useMacroSnapshot();
    const { data: idxData } = useSWR<IndexCloseData>('/api/market/index-close', indexFetcher, { refreshInterval: 60000, dedupingInterval: 30000 });
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const tabsRef = useRef<HTMLDivElement>(null);

    // Macro data
    const fgScore = rlsi?.components?.sentimentScore ?? 0;
    const vix = snapshot?.factors?.vix?.level ?? 0;
    const vixChg = snapshot?.factors?.vix?.chgPct ?? 0;
    const dxy = snapshot?.factors?.dxy?.level ?? 0;
    const dxyChg = snapshot?.factors?.dxy?.chgPct ?? 0;
    const fgStatus = getFgStatus(fgScore);
    const vixStatus = getVixStatus(vix);
    const dxyStatus = getDxyStatus(dxy);

    // RLSI score color
    const rlsiScore = data?.rlsi?.score ?? 0;
    const rlsiColor = rlsiScore >= 60 ? '#34d399' : rlsiScore >= 40 ? '#fbbf24' : '#f87171';

    // Tab scroll to active
    useEffect(() => {
        if (!tabsRef.current) return;
        const activeEl = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeTab]);

    const handleTabSwitch = useCallback((tab: TabKey) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        setActiveTab(tab);
    }, []);

    // Verdict computation — identical to desktop page.tsx L283-303
    const verdict = useMemo(() => {
        if (!data || !data.verdict) return {
            title: "SYSTEM INITIALIZING...",
            desc: "ESTABLISHING SECURE CONNECTION TO GUARDIAN NODE...",
            color: "text-slate-500",
            sentiment: "NEUTRAL" as const,
            realityInsight: undefined as string | undefined,
        };
        const v = data.verdict;
        let color = "text-slate-300";
        if (v.sentiment === 'BULLISH') color = "text-emerald-400";
        if (v.sentiment === 'BEARISH') color = "text-rose-400";
        return {
            title: v.title,
            desc: v.description,
            color,
            sentiment: v.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
            realityInsight: v.realityInsight as string | undefined,
            gammaInsight: v.gammaInsight as string | undefined,
        };
    }, [data]);

    const session = data?.rlsi?.session;

    return (
        <div className="w-full flex flex-col min-h-screen bg-[#060a10] pb-24 relative z-10">

            {/* ═══ PREMIUM STICKY HEADER ═══ */}
            <div className="fixed top-14 left-0 right-0 z-30"
                style={{
                    background: 'linear-gradient(180deg, rgba(6,10,16,0.97) 0%, rgba(6,10,16,0.92) 100%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                    backdropFilter: 'blur(24px) saturate(1.4)',
                    borderBottom: '1px solid rgba(52,211,153,0.08)',
                }}>

                {/* ── GUARDIAN EYE BANNER ── */}
                <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            {/* Animated Pulse Ring */}
                            <div className="relative w-7 h-7 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border border-emerald-400/40 animate-ping" style={{ animationDuration: '3s' }} />
                                <div className="absolute inset-[3px] rounded-full border border-emerald-400/30" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[15px] font-black tracking-[0.12em] text-white/95"
                                        style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
                                        GUARDIAN
                                    </span>
                                    <span className="text-[15px] font-black tracking-[0.12em] text-emerald-400"
                                        style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
                                        EYE
                                    </span>
                                </div>
                                <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mt-0.5">
                                    MACRO RISK MONITOR · LIVE
                                </div>
                            </div>
                        </div>
                        {/* RLSI Score Badge */}
                        <div className="flex items-center gap-2">
                            <div className="px-3 py-1.5 rounded-lg border"
                                style={{
                                    borderColor: `${rlsiColor}33`,
                                    background: `linear-gradient(135deg, ${rlsiColor}15, ${rlsiColor}08)`,
                                }}>
                                <div className="text-[10px] font-bold tracking-wider text-slate-400 mb-0.5">RLSI</div>
                                <div className="text-[17px] font-black font-mono tabular-nums leading-none" style={{ color: rlsiColor }}>
                                    {rlsiScore.toFixed(0)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MACRO INDICATOR GRID (4 cards, no scroll) ── */}
                <div className="px-3 pb-3 grid grid-cols-4 gap-2">
                    {/* Fear & Greed */}
                    <div className={`flex flex-col items-center justify-center py-2.5 rounded-xl border ${fgStatus.border} ${fgStatus.bg}`}
                        style={{ backdropFilter: 'blur(8px)' }}>
                        <span className="text-[9px] font-bold text-white/80 tracking-wider uppercase mb-1 leading-tight text-center">Fear &amp;<br/>Greed</span>
                        <span className="text-[18px] font-black font-mono tabular-nums leading-none" style={{ color: fgStatus.color }}>
                            {fgScore > 0 ? fgScore.toFixed(0) : '—'}
                        </span>
                        <span className="text-[10px] font-extrabold tracking-wider mt-1" style={{ color: fgStatus.color }}>
                            {fgStatus.label}
                        </span>
                    </div>
                    {/* VIX */}
                    <div className="flex flex-col items-center justify-center py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04]"
                        style={{ backdropFilter: 'blur(8px)' }}>
                        <span className="text-[11px] font-bold text-white/80 tracking-wider uppercase mb-1">VIX</span>
                        <span className="text-[18px] font-black font-mono tabular-nums leading-none" style={{ color: vixStatus.color }}>
                            {vix > 0 ? vix.toFixed(1) : '—'}
                        </span>
                        <span className={`text-[11px] font-bold font-mono tabular-nums mt-1 ${vixChg >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {vixChg >= 0 ? '+' : ''}{vixChg.toFixed(1)}%
                        </span>
                    </div>
                    {/* DOW */}
                    <div className="flex flex-col items-center justify-center py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04]"
                        style={{ backdropFilter: 'blur(8px)' }}>
                        <span className="text-[11px] font-bold text-white/80 tracking-wider uppercase mb-1">DOW</span>
                        <span className={`text-[18px] font-black font-mono tabular-nums leading-none ${(idxData?.dow?.changePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {idxData?.dow ? (idxData.dow.changePct >= 0 ? '+' : '') + idxData.dow.changePct.toFixed(2) + '%' : '—'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 mt-1">
                            {idxData?.dow ? Number(idxData.dow.price).toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}
                        </span>
                    </div>
                    {/* NDX */}
                    <div className="flex flex-col items-center justify-center py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04]"
                        style={{ backdropFilter: 'blur(8px)' }}>
                        <span className="text-[11px] font-bold text-white/80 tracking-wider uppercase mb-1">NDX</span>
                        <span className={`text-[18px] font-black font-mono tabular-nums leading-none ${(idxData?.nasdaq?.changePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {idxData?.nasdaq ? (idxData.nasdaq.changePct >= 0 ? '+' : '') + idxData.nasdaq.changePct.toFixed(2) + '%' : '—'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 mt-1">
                            {idxData?.nasdaq ? Number(idxData.nasdaq.price).toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}
                        </span>
                    </div>
                </div>

                {/* ── PREMIUM TAB NAVIGATION ── */}
                <div ref={tabsRef} className="flex gap-0 px-1"
                    style={{ scrollbarWidth: 'none' } as any}>
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.key;
                        const TabIcon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                data-tab={tab.key}
                                onClick={() => handleTabSwitch(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-3 transition-all duration-300 relative touch-manipulation
                                    ${isActive ? 'text-white' : 'text-slate-500 active:text-slate-300'}`}
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                <TabIcon className={`w-4 h-4 transition-colors duration-300 ${isActive ? 'text-emerald-400' : 'text-slate-600'}`} />
                                <span className="flex items-center gap-1">
                                    {tab.prefix && (
                                        <span className={`text-[12px] font-black tracking-wider transition-colors duration-300 ${isActive ? 'text-cyan-400' : 'text-cyan-700'}`}
                                            style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
                                            {tab.prefix}
                                        </span>
                                    )}
                                    <span className={`text-[12px] font-bold tracking-wider transition-colors duration-300 ${isActive ? 'text-white' : 'text-slate-500'}`}
                                        style={{ fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>
                                        {tab.label}
                                    </span>
                                </span>
                                {/* Active indicator — gradient bar */}
                                {isActive && (
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full"
                                        style={{
                                            width: '40px',
                                            background: 'linear-gradient(90deg, transparent, #34d399, transparent)',
                                        }} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══ SPACER for fixed header ═══ */}
            <div className="shrink-0" style={{ height: 225 }} />

            {/* Alert Banner — common across all tabs */}
            <div className="px-3">
                <GuardianAlertBanner alerts={alerts} connectionMode={connectionMode} />
            </div>

            {/* ═══ TAB CONTENT ═══ */}
            <div className="px-3 space-y-3 mt-2">
                {activeTab === 'overview' && (
                    <MobileGuardianOverview
                        data={data}
                        loading={loading}
                        verdict={verdict}
                        session={session}
                    />
                )}
                {activeTab === 'reality' && (
                    <MobileGuardianReality
                        data={data}
                        verdict={verdict}
                    />
                )}
                {activeTab === 'shield' && (
                    <MobileGuardianShield
                        data={data}
                        loading={loading}
                        verdict={verdict}
                        session={session}
                    />
                )}
                {activeTab === 'flow' && (
                    <MobileGuardianFlow
                        data={data}
                        loading={loading}
                        verdict={verdict}
                        session={session}
                    />
                )}
            </div>
        </div>
    );
}
