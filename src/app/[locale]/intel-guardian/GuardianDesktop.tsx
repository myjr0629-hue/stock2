
"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from 'next-intl';
import { Activity, Shield, Zap, AlertTriangle, Layers, ArrowRight, Radio, Clock, BookOpen, Lock } from "lucide-react";
import { useTier } from '@/contexts/TierContext';
import { GuardianTooltip } from '@/components/guardian/GuardianTooltip';

import { Link } from "@/i18n/routing";

import dynamic from 'next/dynamic';
import { TypewriterText, renderColoredText } from "@/components/guardian/TypewriterText";
import { RealityCheck } from "@/components/guardian/RealityCheck";
import { useGuardian } from "@/components/guardian/GuardianProvider";
import GuardianAlertBanner from "@/components/guardian/GuardianAlertBanner";
import { EconomicCalendarWidget } from "@/components/guardian/EconomicCalendarWidget";
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { GuestWall } from '@/components/gate/GuestWall';
import { ProGate, EliteGate } from '@/components/gate/FeatureGate';

// [PERF] Lazy-loaded heavy components — reduces initial JS bundle
const SmartMoneyMap = dynamic(() => import("@/components/guardian/SmartMoneyMap"), { ssr: false });
const GravityGauge = dynamic(() => import("@/components/guardian/GravityGauge"), { ssr: false });
const VitalsPanel = dynamic(() => import("@/components/guardian/VitalsPanel").then(m => m.VitalsPanel), { ssr: false });
const OracleHeader = dynamic(() => import("@/components/guardian/OracleHeader").then(m => m.OracleHeader), { ssr: false });
const RLSIInsightPanel = dynamic(() => import("@/components/guardian/MarketBreadthPanel"), { ssr: false });
const GammaShield = dynamic(() => import("@/components/guardian/GammaShield"), { ssr: false });
const WhatIfSimulator = dynamic(() => import("@/components/guardian/WhatIfSimulator"), { ssr: false });


// === TYPES ===
interface RLSIResult {
    score: number;
    level: 'DANGER' | 'NEUTRAL' | 'OPTIMAL';
    session?: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    // [V2.0] Gamma-Enhanced fields
    regime?: string;           // RISK_ON | RISK_OFF | ROTATION | PANIC | NEUTRAL
    zScore?: number | null;
    zSignal?: string | null;   // EXTREME_FEAR_REVERSAL | OVERHEATED | etc.
    gammaAdjustment?: number;
    components: {
        priceActionRaw: number;
        priceActionScore: number;
        breadthPct: number;
        breadthScore: number;
        adRatio: number;
        volumeBreadth: number;
        breadthSignal: string;
        breadthDivergent: boolean;
        sentimentRaw: number;
        sentimentScore: number;
        momentumRaw: number;
        momentumScore: number;
        rotationScore: number;
        yieldRaw: number;
        yieldPenalty: number;
        vix: number;
        vixMultiplier: number;
        [key: string]: any;
    };
    timestamp: string;
}

interface SectorFlowRate {
    id: string;
    name: string;
    change: number;
    volume: number;
    topConstituents?: { symbol: string; price: number; change: number; volume: number }[];
}

interface FlowVector {
    sourceId: string;
    targetId: string;
    strength: number;
    rank: number;
}

interface GuardianVerdict {
    title: string;
    description: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    realityInsight?: string;
}

interface GuardianContext {
    rlsi: RLSIResult;
    market?: any;
    sectors: SectorFlowRate[];
    vectors?: FlowVector[];
    verdict: GuardianVerdict;
    divergence?: {
        caseId: string;
        verdictTitle: string;
        verdictDesc: string;
        isDivergent: boolean;
        score: number;
    };
    rvol?: {
        ndx: { rvol: number };
        dow: { rvol: number };
    };
    tripleA?: {
        regime: 'BULL' | 'BEAR' | 'NEUTRAL';
        alignment: boolean;
        acceleration: boolean;
        accumulation: boolean;
        isTargetLock: boolean;
        checklist?: {
            passedCount: number;
            totalCount: number;
            message: string;
        };
    };
    verdictSourceId: string | null;
    verdictTargetId: string | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    rotationIntensity?: {
        score: number;
        direction: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
        topInflow: { sector: string; flow: number }[];
        topOutflow: { sector: string; flow: number }[];
        breadth: number;
        conviction: 'HIGH' | 'MEDIUM' | 'LOW';
        regime: string;
        fiveDayData?: Record<string, {
            changes: number[];
            cumReturn: number;
            rvol: number;
            consistency: number;
            flowScore: number;
            todayChange: number;
            isBounce: boolean;
        }>;
        noiseFlags?: string[];
        bounceWarnings?: string[];
    };
    breadth?: {
        advancers: number;
        decliners: number;
        totalTickers: number;
        breadthPct: number;
        adRatio: number;
        volumeBreadth: number;
        signal: string;
        isDivergent: boolean;
    };
    // [V9.0] RLSI Intraday History
    rlsiHistory?: { time: string; score: number }[];
    // [V10.0] GAMMA SHIELD
    gammaShield?: any;
    timestamp: string;
}

// === SECTOR INTEL i18n ===
type SectorLocale = 'ko' | 'en' | 'ja';
const SECTOR_INTEL_TEXTS: Record<SectorLocale, {
    trendAnalysis: string;
    volumeIntensity: string;
    trendConsistency: string;
    rvolSurging: string; rvolActive: string; rvolNormal: string; rvolLow: string;
    consistencyStrong: string; consistencyMixed: string; consistencyUnstable: string;
    noiseBounce: (todayChange: number, cumReturn: number) => string;
}> = {
    ko: {
        trendAnalysis: '5일 추세 분석',
        volumeIntensity: '거래량 강도',
        trendConsistency: '추세 일관성',
        rvolSurging: '급증', rvolActive: '활발', rvolNormal: '보통', rvolLow: '저조',
        consistencyStrong: '강한 추세', consistencyMixed: '혼조', consistencyUnstable: '불안정',
        noiseBounce: (today, cum) => `노이즈 반등 — 오늘 ${today > 0 ? '+' : ''}${today.toFixed(1)}% 이나 5일간 ${cum > 0 ? '+' : ''}${cum.toFixed(1)}% 추세`
    },
    en: {
        trendAnalysis: '5-Day Trend Analysis',
        volumeIntensity: 'Volume Intensity',
        trendConsistency: 'Trend Consistency',
        rvolSurging: 'Surging', rvolActive: 'Active', rvolNormal: 'Normal', rvolLow: 'Low',
        consistencyStrong: 'Strong', consistencyMixed: 'Mixed', consistencyUnstable: 'Unstable',
        noiseBounce: (today, cum) => `Noise bounce — Today ${today > 0 ? '+' : ''}${today.toFixed(1)}% but 5-day trend ${cum > 0 ? '+' : ''}${cum.toFixed(1)}%`
    },
    ja: {
        trendAnalysis: '5日トレンド分析',
        volumeIntensity: '出来高強度',
        trendConsistency: 'トレンド一貫性',
        rvolSurging: '急増', rvolActive: '活発', rvolNormal: '普通', rvolLow: '低調',
        consistencyStrong: '強いトレンド', consistencyMixed: '混在', consistencyUnstable: '不安定',
        noiseBounce: (today, cum) => `ノイズ反発 — 本日 ${today > 0 ? '+' : ''}${today.toFixed(1)}% しかし5日間 ${cum > 0 ? '+' : ''}${cum.toFixed(1)}% トレンド`
    }
};

// === SECTOR NAME i18n ===
const SECTOR_NAME_I18N: Record<string, Record<SectorLocale, string>> = {
    '기술주': { ko: '기술주', en: 'Technology', ja: 'テクノロジー' },
    '커뮤니케이션': { ko: '커뮤니케이션', en: 'Communication', ja: 'コミュニケーション' },
    '임의소비재': { ko: '임의소비재', en: 'Cons. Disc.', ja: '一般消費財' },
    '에너지': { ko: '에너지', en: 'Energy', ja: 'エネルギー' },
    '금융': { ko: '금융', en: 'Financials', ja: '金融' },
    '헬스케어': { ko: '헬스케어', en: 'Healthcare', ja: 'ヘルスケア' },
    '산업재': { ko: '산업재', en: 'Industrials', ja: '資本財' },
    '소재': { ko: '소재', en: 'Materials', ja: '素材' },
    '필수소비재': { ko: '필수소비재', en: 'Cons. Staples', ja: '生活必需品' },
    '부동산': { ko: '부동산', en: 'Real Estate', ja: '不動産' },
    '유틸리티': { ko: '유틸리티', en: 'Utilities', ja: 'ユーティリティ' },
    'AI 전력망': { ko: 'AI 전력망', en: 'AI Power Grid', ja: 'AI電力網' },
    '반도체': { ko: '반도체', en: 'Semiconductors', ja: '半導体' },
    '사이버보안': { ko: '사이버보안', en: 'Cyber Security', ja: 'サイバーセキュリティ' },
    '클린에너지': { ko: '클린에너지', en: 'Clean Energy', ja: 'クリーンエネルギー' },
    '안전자산': { ko: '안전자산', en: 'Safe Haven', ja: '安全資産' },
};
function getSectorName(name: string, locale: string): string {
    return SECTOR_NAME_I18N[name]?.[(locale as SectorLocale) || 'ko'] || name;
}

export default function GuardianDesktop() {
    const { data: globalData, loading, refresh, alerts, connectionMode } = useGuardian();
    const t = useTranslations('guardian');
    const gt = useTranslations('gate');
    const locale = useLocale();
    const { hasAccess, tier } = useTier();
    const isMapGuestPreview = tier === 'guest' && (() => {
        if (typeof document === 'undefined') return true;
        const match = document.cookie.match(/shq_gv=(\d+)/);
        return match ? parseInt(match[1], 10) <= 5 : true;
    })();
    const isMapUnlocked = hasAccess('elite') || isMapGuestPreview;
    // Map global data to local type if necessary, or just cast
    const data = globalData as GuardianContext | null;
    const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
    const [insightTab, setInsightTab] = useState<'insight' | 'whatif'>('insight');
    // [30s POLLING] Live constituent prices, independent from 5-min Guardian cache
    const [livePrices, setLivePrices] = useState<Record<string, { price: number; change: number; volume: number }>>({});
    const priceIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // useEffect removed to prevent double-fetch (Provider handles it)

    // Map popup: only opens on user click (selectedSectorId starts null)
    // SECTOR INTEL panel: always visible, defaults to verdictTargetId
    const intelSectorId = selectedSectorId || data?.verdictTargetId || null;

    // [30s POLLING] Fetch constituent prices every 30 seconds
    const selectedSector = data?.sectors.find(s => s.id === intelSectorId);
    const constituentSymbols = selectedSector?.topConstituents?.map(c => c.symbol) || [];

    // [WS] Subscribe constituent symbols to WebSocket price stream
    const wsTickerArray = useMemo(() => constituentSymbols, [constituentSymbols.join(',')]);
    const { connected: wsConnected, getPrice: wsGetPrice } = useRealtimeData(wsTickerArray.length > 0 ? wsTickerArray : undefined);

    const fetchLivePrices = useCallback(async (symbols: string[]) => {
        if (symbols.length === 0) return;
        try {
            const res = await fetch(`/api/live/prices?t=${symbols.join(',')}`);
            if (!res.ok) return;
            const json = await res.json();
            const map: Record<string, { price: number; change: number; volume: number }> = {};
            (json.prices || []).forEach((p: any) => {
                map[p.symbol] = { price: p.price, change: p.change, volume: p.volume };
            });
            setLivePrices(map);
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        // Clear previous interval when sector changes
        if (priceIntervalRef.current) {
            clearInterval(priceIntervalRef.current);
            priceIntervalRef.current = null;
        }
        if (constituentSymbols.length === 0) return;

        // Initial fetch
        fetchLivePrices(constituentSymbols);

        // Poll at reduced frequency when WS is active
        // [WS] Backup polling at 30s — WS handles real-time push, this is safety net
        priceIntervalRef.current = setInterval(() => fetchLivePrices(constituentSymbols), 30_000);

        return () => {
            if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
        };
    }, [selectedSectorId, constituentSymbols.join(','), fetchLivePrices]);

    const verdict = React.useMemo(() => {
        if (!data || !data.verdict) return {
            title: "SYSTEM INITIALIZING...",
            desc: "ESTABLISHING SECURE CONNECTION TO GUARDIAN NODE...",
            color: "text-slate-500",
            sentiment: "NEUTRAL"
        };

        const v = data.verdict;
        let color = "text-slate-300";
        if (v.sentiment === 'BULLISH') color = "text-emerald-400";
        if (v.sentiment === 'BEARISH') color = "text-rose-400";

        return {
            title: v.title,
            desc: v.description,
            color,
            sentiment: v.sentiment,
            realityInsight: v.realityInsight
        };
    }, [data]);

    // Determine Movers: WS price > live API prices > Guardian snapshot data
    const topMovers = (selectedSector?.topConstituents || []).map(stock => {
        // [WS] WebSocket price has highest priority
        const wsPrice = wsConnected ? wsGetPrice(stock.symbol) : undefined;
        if (wsPrice && wsPrice.price > 0) {
            return { ...stock, price: wsPrice.price, change: wsPrice.changePct || stock.change, volume: wsPrice.volume || stock.volume };
        }
        const live = livePrices[stock.symbol];
        return live ? { ...stock, price: live.price, change: live.change, volume: live.volume } : stock;
    });

    // [V3.0] Regime Logic
    const isTargetLocked = data?.tripleA?.isTargetLock || false;
    const regime = data?.tripleA?.regime || 'NEUTRAL';
    const isBullMode = regime === 'BULL';

    // [V7.7] Session-based animation control
    const session = data?.rlsi?.session;
    const { status: marketStatusInfo } = useMarketStatus();
    // isMarketActive: PRE + REG + POST = show analysis (04:00-20:00 ET)
    const isMarketActive = (session === 'REG' || session === 'PRE' || session === 'POST') && !marketStatusInfo.isHoliday;
    // isFullyActive: REG only = live animations, pulse effects
    const isFullyActive = session === 'REG' && !marketStatusInfo.isHoliday;

    // Dynamic Map Border — no pulse animation when market is closed
    const mapBorderClass = isTargetLocked && isFullyActive
        ? "border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-pulse" // Locked (Gold) - only during REG hours
        : isTargetLocked
            ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]" // Locked but static after hours
            : isBullMode
                ? "border-emerald-500/30"
                : "border-slate-800";



    return (
        <GuestWall pageName="GUARDIAN">
            <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500/30" data-guardian>
                {/* ORACLE HEADER (Below fixed nav+ticker) */}
                <div>
                    <OracleHeader
                        nasdaq={data?.market?.nqChangePercent || 0}
                        rlsi={data?.rlsi.score || 0}
                        verdictTitle={verdict.title}
                        isDivergent={data?.divergence?.isDivergent || false}
                        timestamp={data?.timestamp || ""}
                    />
                </div>

                {/* MAIN HUD CONTAINER — Granular Tier Gates */}
                <main className="pb-24 px-3 md:pb-4 md:px-4 min-h-[calc(100vh-110px)] max-w-[1920px] mx-auto flex flex-col gap-3 md:gap-4 mt-2 lg:mt-4">

                    {/* CROSS-INTELLIGENCE ALERTS (real-time from EC2 Worker via WebSocket) */}
                    <GuardianAlertBanner alerts={alerts} connectionMode={connectionMode} />

                    {/* --- TOP ROW: GAUGE | REALITY | MAP | VERDICT (GRID) --- */}
                    {/* 
                    Layout Strategy based on Mockup:
                    The Mockup shows a complex grid.
                    Let's use a Dashboard Grid architecture.
                    
                    Row 1 (Top): Gravity Gauge (Left), Reality Check (Right Top)
                    Row 2 (Mid): Flow Map (Left Big), Tactical Verdict (Right)
                    Row 3 (Bot): Sector Intel (Left), Actions (Right)
                    
                    Actually, looking at the image:
                    Top Left: Gravity Gauge
                    Top Right: Reality Check
                    Mid Left: Flow Map
                    Mid Right: Tactical Verdict
                    Bot Left: Sector Intel
                    Bot Right: Login/Force (Control Bar)
                */}

                    <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr_30px] gap-3 lg:gap-4 min-h-0">

                        {/* TOP ROW CAROUSEL WRAPPER (MOBILE) / PASS-THROUGH (DESKTOP) */}
                        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-3 px-3 lg:mx-0 lg:px-0 lg:pb-0 lg:gap-0 lg:contents hide-scrollbar">
                            
                            {/* BLOCK A: GAUGE (4 cols) */}
                            <div className="w-[88vw] shrink-0 snap-center lg:w-auto lg:col-span-4 backdrop-blur-md border border-slate-800 rounded-lg p-3 md:p-4 relative shadow-2xl flex flex-col justify-center overflow-hidden transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_25px_rgba(52,211,153,0.08)] hover:scale-[1.003]"
                            style={{ background: 'radial-gradient(circle at 50% 70%, rgba(52,211,153,0.12) 0%, transparent 50%), radial-gradient(circle at 20% 30%, rgba(6,182,212,0.06) 0%, transparent 40%), rgba(10,14,20,0.85)' }}
                        >
                            {/* Premium HUD Background */}
                            <div className="absolute inset-0 pointer-events-none">
                                {/* Radial vignette glow */}
                                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(6,182,212,0.06) 0%, rgba(15,23,42,0) 65%)' }} />
                                {/* Subtle grid overlay */}
                                <div className="absolute inset-0 opacity-[0.04]" style={{
                                    backgroundImage: 'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)',
                                    backgroundSize: '24px 24px',
                                }} />
                                {/* Faint horizontal scan accent */}
                                <div className="absolute left-0 right-0" style={{ top: '42%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.15) 30%, rgba(6,182,212,0.15) 70%, transparent)' }} />
                            </div>
                            {/* Sci-Fi Corner Decors */}
                            <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-slate-600"></div>
                            <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-slate-600"></div>
                            <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-slate-600"></div>
                            <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-slate-600"></div>

                            <ProGate title="Gravity Gauge" fomoMessage={gt('fomoGravityGauge')} description={gt('descGravityGauge')} mode="peek" compact blurPx={6}>
                                <GravityGauge score={data?.rlsi.score || 0} loading={loading} session={data?.rlsi.session} components={data?.rlsi.components} rlsiHistory={data?.rlsiHistory} regime={data?.rlsi.regime} zSignal={data?.rlsi.zSignal} />
                            </ProGate>

                            {/* Scanline Overlay */}
                            <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-5 pointer-events-none"></div>
                        </div>

                        {/* BLOCK B: REALITY CHECK (4 cols) */}
                        <div className="w-[88vw] shrink-0 snap-center lg:w-auto lg:col-span-4 backdrop-blur-md border border-slate-800 rounded-lg p-3 relative shadow-2xl flex flex-col justify-center overflow-hidden transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_25px_rgba(6,182,212,0.08)] hover:scale-[1.003]"
                            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.10) 0%, rgba(6,182,212,0.03) 40%, transparent 70%), rgba(10,14,20,0.85)' }}
                        >
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
                                    guardianScore={data?.rlsi.score || 0}
                                    divergenceCase={data?.divergence?.caseId as "N" | "A" | "B" | "C" | "D" | undefined}
                                    rvolNdx={data?.rvol?.ndx?.rvol || 1.0}
                                    rvolDow={data?.rvol?.dow?.rvol || 1.0}
                                    verdict={{
                                        title: "MARKET ESSENCE",
                                        desc: verdict.realityInsight || "Gathering Pulse...",
                                        sentiment: verdict.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL'
                                    }}
                                    vixTermStructure={data?.rlsi.components?.vixTermStructure}
                                    bondFlow={data?.rlsi.components?.bondFlow}
                                    goldFlow={data?.rlsi.components?.goldFlow}
                                />
                            </ProGate>
                        </div>

                        {/* BLOCK C: RLSI INSIGHT + BREADTH COMPACT (4 cols) */}
                        <div className="w-[88vw] shrink-0 snap-center lg:w-auto lg:col-span-4 min-h-[420px] lg:min-h-0 backdrop-blur-md border border-slate-800 rounded-lg relative shadow-2xl flex flex-col overflow-hidden transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_25px_rgba(16,185,129,0.08)] hover:scale-[1.003]"
                            style={{ background: 'linear-gradient(180deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.03) 30%, transparent 50%), rgba(10,14,20,0.85)' }}
                        >
                            {/* Infographic: Horizontal Data Bars */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                                <rect x="0" y="15%" width="35%" height="3" fill="rgba(16,185,129,0.18)" rx="1.5" />
                                <rect x="0" y="30%" width="55%" height="3" fill="rgba(16,185,129,0.14)" rx="1.5" />
                                <rect x="0" y="45%" width="25%" height="3" fill="rgba(16,185,129,0.10)" rx="1.5" />
                                <rect x="0" y="60%" width="45%" height="3" fill="rgba(16,185,129,0.16)" rx="1.5" />
                                <rect x="0" y="75%" width="65%" height="3" fill="rgba(16,185,129,0.12)" rx="1.5" />
                                <rect x="0" y="90%" width="20%" height="3" fill="rgba(16,185,129,0.08)" rx="1.5" />
                            </svg>
                            <div className="flex-1 flex flex-col">
                                <ProGate title="RLSI Insight" fomoMessage={gt('fomoRlsiInsight')} description={gt('descRlsiInsight')} mode="blur" compact>
                                    {/* Tab Toggle */}
                                    <div className="flex items-center gap-1 px-3 pt-2 pb-1">
                                        {(['insight', 'whatif'] as const).map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setInsightTab(tab)}
                                                className={`text-[12px] font-bold font-jakarta px-3 py-1 rounded-md border transition-all duration-200 ${insightTab === tab
                                                        ? tab === 'whatif' ? 'text-violet-300 border-violet-500/40 bg-violet-500/15' : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15'
                                                        : 'text-slate-400 border-slate-700/30 bg-transparent hover:text-slate-300 hover:border-slate-600/40'
                                                    }`}
                                            >
                                                {tab === 'insight' ? (locale === 'ko' ? '✧ 브리핑' : locale === 'ja' ? '✧ ブリーフィング' : '✧ BRIEFING') : (locale === 'ko' ? '⚡ What-If' : locale === 'ja' ? '⚡ What-If' : '⚡ WHAT-IF')}
                                            </button>
                                        ))}
                                    </div>

                                    {insightTab === 'insight' ? (
                                        <RLSIInsightPanel
                                            alignmentStatus={data?.divergence?.isDivergent ? 'DIVERGENCE' : 'ALIGNMENT OK'}
                                            insightTitle={verdict.title}
                                            insightDesc={verdict.realityInsight || verdict.desc}
                                            sentiment={verdict.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL'}
                                            breadthPct={data?.breadth?.breadthPct ?? data?.rlsi.components?.breadthPct ?? 50}
                                            adRatio={data?.breadth?.adRatio ?? data?.rlsi.components?.adRatio ?? 1}
                                            volumeBreadth={data?.breadth?.volumeBreadth ?? data?.rlsi.components?.volumeBreadth ?? 50}
                                            breadthSignal={data?.breadth?.signal ?? data?.rlsi.components?.breadthSignal ?? 'NEUTRAL'}
                                            isDivergent={data?.breadth?.isDivergent ?? data?.rlsi.components?.breadthDivergent ?? false}
                                            loading={loading}
                                            isMarketActive={isMarketActive}
                                            session={session || 'CLOSED'}
                                        />
                                    ) : (
                                        <WhatIfSimulator
                                            currentScore={data?.rlsi.score || 50}
                                            components={{
                                                vix: data?.rlsi.components?.vix ?? 15,
                                                yieldRaw: data?.rlsi.components?.yieldRaw ?? 4.0,
                                                sentimentScore: data?.rlsi.components?.sentimentScore ?? 50,
                                                momentumScore: data?.rlsi.components?.momentumScore ?? 50,
                                                priceActionScore: data?.rlsi.components?.priceActionScore ?? 50,
                                                breadthScore: data?.rlsi.components?.breadthScore ?? 50,
                                                rotationScore: data?.rlsi.components?.rotationScore ?? 50,
                                                vixMultiplier: data?.rlsi.components?.vixMultiplier ?? 1.0,
                                                yieldPenalty: data?.rlsi.components?.yieldPenalty ?? 5,
                                                vixTermStructure: data?.rlsi.components?.vixTermStructure ?? 1.0,
                                            }}
                                        />
                                    )}
                                </ProGate>
                            </div>
                        </div>
                    </div>
                    {/* END TOP ROW CAROUSEL WRAPPER */}

                    {/* ROW 2: SPLIT (MAP vs INTELLIGENCE STACK) */}

                        {/* LEFT: GAMMA SHIELD + MAP (Cols 1-8) */}
                        {/* CAROUSEL ON MOBILE / STACK ON DESKTOP */}
                        <div className="col-span-12 flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-3 px-3 lg:mx-0 lg:px-0 lg:pb-0 lg:gap-4 lg:col-span-8 lg:flex lg:flex-col lg:overflow-visible items-stretch hide-scrollbar">

                            {/* Flow Topography Map — ELITE (인라인 게이트: Three.js Canvas 전용) */}
                            <div className="relative w-[92vw] shrink-0 snap-center lg:w-auto lg:flex-1 flex flex-col self-stretch">
                                {(() => {
                                    // ── 맵 콘텐츠 (공통) ──
                                    const mapContent = (
                                        <>
                                            <div className="absolute top-2 left-2 md:top-6 md:left-6 z-10 flex flex-wrap items-center gap-1.5 md:gap-3 right-2 md:right-auto">
                                                <GuardianTooltip sectionId="flowMap">
                                                    <h3 className="text-[11px] md:text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-1 md:pb-2 inline-block font-jakarta">
                                                        Flow Topography Map v3.0
                                                    </h3>
                                                </GuardianTooltip>
                                                <span className={`text-[10px] md:text-[12px] font-black tracking-wide px-2 md:px-3 py-0.5 md:py-1 rounded-md border font-jakarta shrink-0 ${isFullyActive
                                                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                                                    : 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                                                    }`}>
                                                    {isFullyActive ? '● LIVE' : isMarketActive ? '◉ ACTIVE' : 'STANDBY'}
                                                </span>
                                                {!isMarketActive && (
                                                    <span className="text-[10px] md:text-[12px] text-amber-500/80 font-medium tracking-wide">
                                                        {t('mapStandbyNotice')}
                                                    </span>
                                                )}
                                                {isMarketActive && data?.rotationIntensity?.regime && data.rotationIntensity.regime !== 'MIXED' && (
                                                    <span className={`text-[10px] md:text-[12px] font-bold tracking-wider px-2 py-0.5 rounded border font-jakarta ${data.rotationIntensity.regime === 'RISK_ON_GROWTH' ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' :
                                                        data.rotationIntensity.regime === 'RISK_OFF_DEFENSE' ? 'bg-rose-950/80 text-rose-400 border-rose-500/30' :
                                                            data.rotationIntensity.regime === 'CYCLICAL_RECOVERY' ? 'bg-amber-950/80 text-amber-400 border-amber-500/30' :
                                                                data.rotationIntensity.regime === 'BROAD_RALLY' ? 'bg-emerald-950/80 text-emerald-300 border-emerald-400/30' :
                                                                    data.rotationIntensity.regime === 'BROAD_SELLOFF' ? 'bg-rose-950/80 text-rose-300 border-rose-400/30' :
                                                                        'bg-slate-800/80 text-slate-400 border-slate-600/30'
                                                        }`}>
                                                        {data.rotationIntensity.regime.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </div>
                                            {isTargetLocked && (
                                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center select-none">
                                                    {isFullyActive ? (
                                                        <>
                                                            <div className="absolute w-[180px] h-[180px] border border-amber-500/15 rounded-full animate-[spin_12s_linear_infinite]" />
                                                            <div className="absolute w-[120px] h-[120px] border border-dashed border-amber-500/25 rounded-full animate-[spin_6s_linear_infinite_reverse]" />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="absolute w-[180px] h-[180px] border border-amber-500/10 rounded-full" />
                                                            <div className="absolute w-[120px] h-[120px] border border-dashed border-amber-500/15 rounded-full" />
                                                        </>
                                                    )}
                                                    <div className={`text-2xl font-black text-amber-400 tracking-[0.15em] drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] whitespace-nowrap ${isFullyActive ? 'animate-[pulse_3s_ease-in-out_infinite]' : 'opacity-60'}`}>
                                                        TARGET LOCKED
                                                    </div>
                                                    <div className="text-[12px] text-amber-200 tracking-[0.5em] mt-2 uppercase font-bold bg-black/60 px-3 py-1 rounded border border-amber-500/30">
                                                        TRIPLE-A SEQUENCE ENGAGED
                                                    </div>
                                                </div>
                                            )}
                                            <div className={isMapUnlocked ? 'flex-1 relative' : 'h-full relative'}>
                                                <SmartMoneyMap
                                                    sectors={(data?.sectors || []).map(s => ({
                                                        id: s.id,
                                                        name: s.name,
                                                        density: s.change,
                                                        height: Math.min(2.5, Math.abs(s.change)),
                                                        topTickers: [],
                                                        color: s.change >= 0 ? '#10b981' : '#f43f5e'
                                                    }))}
                                                    vectors={data?.vectors || []}
                                                    sourceId={data?.verdictSourceId}
                                                    targetId={data?.verdictTargetId}
                                                    onSectorSelect={setSelectedSectorId}
                                                    isBullMode={isBullMode}
                                                    isMarketActive={isMarketActive}
                                                />

                                                {/* [FLOW AI EXPLAIN] Glassmorphism Sector Insight Popover */}
                                                {selectedSectorId && isMapUnlocked && (() => {
                                                    const sec = data?.sectors.find(s => s.id === selectedSectorId);
                                                    if (!sec) return null;
                                                    const sectorName = getSectorName(sec.name, locale);
                                                    const change = sec.change;
                                                    const isInflow = change >= 0;
                                                    const absChange = Math.abs(change).toFixed(2);
                                                    const tops = sec.topConstituents?.slice(0, 3) || [];

                                                    // Flow vectors related to this sector
                                                    const inboundVecs = (data?.vectors || []).filter(v => v.targetId === selectedSectorId);
                                                    const outboundVecs = (data?.vectors || []).filter(v => v.sourceId === selectedSectorId);
                                                    const totalInbound = inboundVecs.reduce((s, v) => s + v.strength, 0);
                                                    const totalOutbound = outboundVecs.reduce((s, v) => s + v.strength, 0);
                                                    const netFlow = totalInbound - totalOutbound;

                                                    // [COMPLIANCE] Observational insight — no advisory language
                                                    const insightLines: string[] = [];
                                                    if (locale === 'ko') {
                                                        if (Math.abs(change) > 3) {
                                                            insightLines.push(isInflow
                                                                ? `5일 누적 유입 ${absChange}% — 강한 자금 집중 흐름 관측`
                                                                : `5일 누적 유출 ${absChange}% — 지속적 자금 이탈 패턴 관측`);
                                                        } else if (Math.abs(change) > 1) {
                                                            insightLines.push(isInflow
                                                                ? `완만한 유입 흐름 ${absChange}% — 자금 유입 점진적 확대 관측`
                                                                : `점진적 유출 흐름 ${absChange}% — 자금 유출 지속 관측`);
                                                        } else {
                                                            insightLines.push(`자금 흐름 중립 구간 — 방향성 미확정`);
                                                        }
                                                        if (netFlow > 10) insightLines.push(`→ 순유입 흐름 우위 — 타 섹터 대비 자금 유입 집중`);
                                                        else if (netFlow < -10) insightLines.push(`→ 순유출 흐름 우위 — 자금이 타 섹터로 분산 이동 중`);
                                                    } else if (locale === 'ja') {
                                                        if (Math.abs(change) > 3) {
                                                            insightLines.push(isInflow
                                                                ? `5日累積流入 ${absChange}% — 強い資金集中フロー観測`
                                                                : `5日累積流出 ${absChange}% — 継続的資金流出パターン観測`);
                                                        } else if (Math.abs(change) > 1) {
                                                            insightLines.push(isInflow
                                                                ? `緩やかな流入 ${absChange}% — 資金流入の段階的拡大を観測`
                                                                : `段階的流出 ${absChange}% — 資金流出の継続を観測`);
                                                        } else {
                                                            insightLines.push(`資金フローニュートラル — 方向性未確定`);
                                                        }
                                                        if (netFlow > 10) insightLines.push(`→ 純流入優位 — 他セクター比で資金集中`);
                                                        else if (netFlow < -10) insightLines.push(`→ 純流出優位 — 資金は他セクターに分散移動中`);
                                                    } else {
                                                        if (Math.abs(change) > 3) {
                                                            insightLines.push(isInflow
                                                                ? `5-day cumulative inflow ${absChange}% — strong capital concentration flow observed`
                                                                : `5-day cumulative outflow ${absChange}% — sustained capital exit pattern observed`);
                                                        } else if (Math.abs(change) > 1) {
                                                            insightLines.push(isInflow
                                                                ? `Gradual inflow ${absChange}% — incremental capital expansion observed`
                                                                : `Gradual outflow ${absChange}% — sustained capital reduction observed`);
                                                        } else {
                                                            insightLines.push(`Capital flow neutral — directionality unconfirmed`);
                                                        }
                                                        if (netFlow > 10) insightLines.push(`→ Net inflow dominant — capital concentration relative to other sectors`);
                                                        else if (netFlow < -10) insightLines.push(`→ Net outflow dominant — capital dispersing to other sectors`);
                                                    }

                                                    return (
                                                        <div className="absolute top-3 right-3 z-30 w-[260px] animate-in fade-in slide-in-from-right-2 duration-300">
                                                            <div className="bg-slate-900/92 backdrop-blur-xl border border-slate-600/40 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
                                                                {/* Header */}
                                                                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-2 h-2 rounded-full ${isInflow ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                                        <span className="text-[13px] font-bold text-white tracking-wide">{sectorName}</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setSelectedSectorId(null)}
                                                                        className="text-slate-500 hover:text-white transition-colors text-lg leading-none px-1"
                                                                    >×</button>
                                                                </div>
                                                                {/* Change badge */}
                                                                <div className="px-3 py-2">
                                                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono font-bold ${isInflow ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                                                                        }`}>
                                                                        {isInflow ? '▲' : '▼'} {isInflow ? '+' : ''}{change.toFixed(2)}%
                                                                        <span className="text-slate-500 font-normal ml-1">5D</span>
                                                                    </div>
                                                                </div>
                                                                {/* AI Insight */}
                                                                <div className="px-3 pb-2">
                                                                    {insightLines.map((line, i) => (
                                                                        <p key={i} className="text-[12px] text-slate-300 leading-relaxed">
                                                                            {i === 0 ? '⚡ ' : '→ '}{line}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                                {/* Top Tickers */}
                                                                {tops.length > 0 && (
                                                                    <div className="px-3 pb-2.5 border-t border-slate-700/30 pt-2">
                                                                        <div className="text-[11px] text-slate-500 font-semibold tracking-wider mb-1.5 uppercase">
                                                                            {locale === 'ko' ? '주요 종목' : locale === 'ja' ? '主要銘柄' : 'Top Holdings'}
                                                                        </div>
                                                                        {tops.map((tk, i) => {
                                                                            const live = livePrices[tk.symbol];
                                                                            const price = live?.price || tk.price;
                                                                            const chg = live?.change ?? tk.change;
                                                                            return (
                                                                                <Link key={i} href={`/ticker?ticker=${tk.symbol}`} className="flex items-center justify-between py-0.5 group/tk hover:bg-white/[0.03] rounded px-0.5 -mx-0.5 transition-colors">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <img
                                                                                            src={`https://assets.parqet.com/logos/symbol/${tk.symbol}`}
                                                                                            alt={tk.symbol}
                                                                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                                        />
                                                                                        <span className="text-[12px] font-mono font-bold text-slate-200 group-hover/tk:text-cyan-400 transition-colors">{tk.symbol}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-[12px] font-mono text-slate-400">${price.toFixed(2)}</span>
                                                                                        <span className={`text-[12px] font-mono font-bold ${chg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                            {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                                                                                        </span>
                                                                                    </div>
                                                                                </Link>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </>
                                    );

                                    // ── ELITE: 원래 레이아웃 그대로 ──
                                    if (isMapUnlocked) {
                                        return (
                                            <div className={`absolute inset-0 lg:static lg:flex-1 lg:h-auto lg:min-h-[600px] w-full bg-[#0a0e14] border rounded-lg overflow-hidden group flex flex-col transition-all duration-500 ${mapBorderClass}`}>
                                                {mapContent}
                                            </div>
                                        );
                                    }

                                    // ── FREE/PRO: 고정 높이 + 블러 + 오버레이 ──
                                    return (
                                        <div className={`absolute inset-0 lg:static lg:flex-1 lg:h-auto lg:min-h-[600px] w-full rounded-xl overflow-hidden bg-[#0a0e14] border ${mapBorderClass}`}>
                                            <div className="pointer-events-none select-none h-full overflow-hidden" style={{ filter: 'blur(4.5px)' }}>
                                                <div className="h-full flex flex-col">
                                                    {mapContent}
                                                </div>
                                            </div>
                                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/30 cursor-pointer">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="rounded-full p-2.5 bg-cyan-500/10 border-cyan-500/30 border shadow-[0_0_20px_rgba(34,211,238,0.15)]">
                                                        <Lock className="w-5 h-5 text-cyan-400" />
                                                    </div>
                                                    <span className="text-white font-jakarta font-bold tracking-wide text-center text-sm">
                                                        Flow Topography Map
                                                    </span>
                                                    <p className="text-center font-medium tracking-wide font-jakarta text-[12px] text-slate-200 max-w-sm leading-relaxed">
                                                        {gt('fomoFlowTopo')}
                                                    </p>
                                                    <Link href="/pricing" className="inline-flex items-center gap-1.5 rounded-lg font-bold uppercase tracking-wider transition-all hover:brightness-110 text-xs px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 text-black shadow-[0_0_20px_rgba(34,211,238,0.15)]">
                                                        {gt('unlockWith', { tier: 'ELITE' })} <ArrowRight className="w-3.5 h-3.5" />
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* [V10.0] GAMMA SHIELD — PRO */}
                            <div className="order-last lg:order-first w-[92vw] shrink-0 snap-center lg:w-auto lg:shrink flex flex-col self-stretch">
                                <ProGate title="Gamma Shield" fomoMessage={gt('fomoGammaShield')} description={gt('descGammaShield')} mode="blur" compact>
                                    <GammaShield data={data?.gammaShield} isMarketActive={isMarketActive} />
                                </ProGate>
                            </div>
                        </div>

                        {/* RIGHT: INTELLIGENCE STACK (Cols 9-12) */}
                        <div className="col-span-12 lg:col-span-4 min-w-0 h-full">
                                <div className="flex flex-col gap-4 h-full">

                                    {/* 0. ECONOMIC CALENDAR (Compact) — FREE */}
                                    <EconomicCalendarWidget locale={locale} />

                                    {/* 1. TACTICAL VERDICT (Compact, Top) — PRO ONLY */}
                                    <ProGate title="Tactical Verdict" fomoMessage={gt('fomoIntelStack')} description={gt('descRlsiInsight')} mode="blur">
                                    <div className="border border-slate-800 rounded-lg p-3.5 md:p-4 lg:p-5 relative flex flex-col shadow-2xl flex-none overflow-hidden"
                                        style={{
                                            background: verdict.sentiment === 'BULLISH'
                                                ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.04) 40%, rgba(10,14,20,1) 70%)'
                                                : verdict.sentiment === 'BEARISH'
                                                    ? 'linear-gradient(135deg, rgba(244,63,94,0.15) 0%, rgba(244,63,94,0.04) 40%, rgba(10,14,20,1) 70%)'
                                                    : 'linear-gradient(135deg, rgba(148,163,184,0.06) 0%, rgba(10,14,20,1) 50%)'
                                        }}
                                    >
                                        {/* Infographic: Crosshair Target Pattern */}
                                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-[140px] h-[140px] pointer-events-none" viewBox="0 0 120 120">
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                                            <circle cx="60" cy="60" r="35" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" strokeDasharray="3 3" />
                                            <circle cx="60" cy="60" r="20" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
                                            <circle cx="60" cy="60" r="4" fill="rgba(16,185,129,0.30)" />
                                            <line x1="60" y1="5" x2="60" y2="115" stroke="rgba(148,163,184,0.10)" strokeWidth="0.8" strokeDasharray="2 4" />
                                            <line x1="5" y1="60" x2="115" y2="60" stroke="rgba(148,163,184,0.10)" strokeWidth="0.8" strokeDasharray="2 4" />
                                        </svg>
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-shrink-0">
                                                    <img
                                                        src="/signum-sg-vectorized.svg"
                                                        alt="AI"
                                                        width={15}
                                                        height={15}
                                                        style={{
                                                            objectFit: 'contain' as const,
                                                            filter: 'drop-shadow(0 0 3px rgba(245,158,11,0.35)) drop-shadow(0 0 1px rgba(245,158,11,0.25))',
                                                            animation: 'aiLogoPulse 2.5s ease-in-out infinite',
                                                        }}
                                                    />
                                                </div>
                                                <GuardianTooltip sectionId="tacticalVerdict">
                                                    <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-emerald-400 font-jakarta">
                                                        TACTICAL VERDICT
                                                    </h3>
                                                </GuardianTooltip>
                                                <span className="text-[12px] text-amber-500 font-mono font-jakarta">· {session === 'REG' ? 'Regular Session' : session === 'PRE' ? 'Pre-Market' : session === 'POST' ? 'Post-Market' : 'Off-Hours'}</span>
                                            </div>
                                            <span className="text-[10px] bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
                                                CLAUDE S4
                                            </span>
                                        </div>

                                        {isMarketActive ? (
                                            <>
                                                <div className="overflow-hidden mb-2">
                                                    <h4 className={`text-sm font-bold mb-2 uppercase tracking-wide ${verdict.color}`}>{verdict.title}</h4>
                                                    <div className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                                        {renderColoredText(verdict.desc)}
                                                    </div>
                                                </div>

                                                {/* COMPACT METRICS */}
                                                <div className="mt-auto pt-3 border-t border-slate-800 grid grid-cols-3 gap-3">
                                                    {/* ROTATION - V6.0 Conviction Bar */}
                                                    <div>
                                                        <div className="text-[12px] text-white font-bold mb-0.5 tracking-wider font-jakarta">ROTATION</div>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-700 ${(data?.rotationIntensity?.score || 0) >= 60 ? 'bg-emerald-400' :
                                                                        (data?.rotationIntensity?.score || 0) >= 35 ? 'bg-amber-400' : 'bg-rose-400'
                                                                        }`}
                                                                    style={{ width: `${Math.min(100, data?.rotationIntensity?.score || 50)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[12px] font-mono font-bold text-slate-300">
                                                                {(data?.rotationIntensity?.score || 50).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                        <div className={`text-[12px] font-bold mt-0.5 tracking-wide ${data?.rotationIntensity?.direction === 'RISK_ON' ? 'text-emerald-400' :
                                                            data?.rotationIntensity?.direction === 'RISK_OFF' ? 'text-rose-400' : 'text-slate-300'
                                                            }`}>
                                                            {data?.rotationIntensity?.direction || 'NEUTRAL'} · {data?.rotationIntensity?.conviction || 'LOW'}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-[12px] text-white font-bold mb-0.5 tracking-wider font-jakarta">MOMENTUM</div>
                                                        {(() => {
                                                            const momVal = ((data?.rlsi.components.momentumRaw || 1) - 1) * 100;
                                                            const momColor = momVal > 0 ? 'text-emerald-400' : momVal < 0 ? 'text-rose-400' : 'text-white';
                                                            return (
                                                                <div className={`text-sm font-mono font-bold ${momColor}`}>
                                                                    {momVal > 0 ? '▲ +' : momVal < 0 ? '▼ ' : ''}{momVal.toFixed(1)}%
                                                                </div>
                                                            );
                                                        })()}
                                                        <div className="text-[12px] text-white font-bold mt-1 tracking-wide opacity-90 font-jakarta">3-DAY VELOCITY</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[12px] text-white font-bold mb-0.5 tracking-wider font-jakarta">TARGET LOCK</div>
                                                        <div className={`text-sm font-mono font-bold ${data?.tripleA?.isTargetLock ? "text-amber-400 animate-pulse" : "text-white"}`}>
                                                            {data?.tripleA?.isTargetLock ? "LOCKED" : "SEARCHING"}
                                                        </div>
                                                        {/* Triple-A Checklist Dots */}
                                                        <div className="flex items-center gap-1.5 mt-1.5">
                                                            <div className="flex items-center gap-1">
                                                                <div className={`w-2 h-2 rounded-full ${data?.tripleA?.alignment ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                                                <span className="text-[12px] text-slate-300 font-jakarta">A</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className={`w-2 h-2 rounded-full ${data?.tripleA?.acceleration ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                                                <span className="text-[12px] text-slate-300 font-jakarta">A</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className={`w-2 h-2 rounded-full ${data?.tripleA?.accumulation ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                                                <span className="text-[12px] text-slate-300 font-jakarta">A</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-[12px] text-white font-bold mt-1 tracking-wide opacity-90 font-jakarta">
                                                            {data?.tripleA?.regime || "NEUTRAL"} REGIME
                                                        </div>
                                                        <div className={`text-[12px] font-medium mt-0.5 tracking-tight ${data?.tripleA?.regime === 'BULL' ? "text-emerald-400" :
                                                            data?.tripleA?.regime === 'BEAR' ? "text-rose-400" : "text-white"
                                                            }`}>
                                                            {data?.tripleA?.regime === 'BULL' ? t('bullRegime') :
                                                                data?.tripleA?.regime === 'BEAR' ? t('bearRegime') :
                                                                    t('neutralRegime')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : verdict.title ? (
                                            <>
                                                <div className="overflow-hidden mb-2">
                                                    <h4 className={`text-sm font-bold mb-2 uppercase tracking-wide ${verdict.color}`}>{verdict.title}</h4>
                                                    <div className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                                        {renderColoredText(verdict.desc)}
                                                    </div>
                                                </div>
                                                <div className="text-[12px] text-amber-500/50 font-mono mt-2 font-jakarta">Last session analysis</div>
                                            </>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                                        <Clock size={20} className="text-amber-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[13px] font-bold text-white/80">{t('insightPending')}</div>
                                                        <div className="text-[12px] text-slate-400 font-mono mt-1 font-jakarta">Regular Session 09:30-16:00 ET</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    </ProGate>

                                    {/* 2. SECTOR INTEL (Fill Rest, Bottom) */}
                                    <div className="flex-1 border border-slate-800 rounded-lg p-3.5 md:p-4 lg:p-6 relative shadow-2xl flex flex-col min-h-[400px] lg:min-h-0 overflow-hidden"
                                        style={{ background: 'radial-gradient(circle at 85% 15%, rgba(6,182,212,0.12) 0%, transparent 45%), radial-gradient(circle at 10% 80%, rgba(16,185,129,0.06) 0%, transparent 40%), rgba(10,14,20,1)' }}
                                    >
                                        {/* Infographic: Hexagonal Network Pattern */}
                                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
                                            <polygon points="320,40 340,50 340,70 320,80 300,70 300,50" fill="none" stroke="rgba(6,182,212,0.18)" strokeWidth="1" />
                                            <polygon points="360,60 380,70 380,90 360,100 340,90 340,70" fill="none" stroke="rgba(6,182,212,0.14)" strokeWidth="1" />
                                            <polygon points="320,80 340,90 340,110 320,120 300,110 300,90" fill="none" stroke="rgba(6,182,212,0.16)" strokeWidth="1" />
                                            <polygon points="280,60 300,70 300,90 280,100 260,90 260,70" fill="none" stroke="rgba(6,182,212,0.12)" strokeWidth="1" />
                                            <polygon points="360,100 380,110 380,130 360,140 340,130 340,110" fill="none" stroke="rgba(6,182,212,0.14)" strokeWidth="1" />
                                            <polygon points="320,120 340,130 340,150 320,160 300,150 300,130" fill="none" stroke="rgba(6,182,212,0.10)" strokeWidth="1" />
                                            <circle cx="320" cy="40" r="3" fill="rgba(6,182,212,0.25)" />
                                            <circle cx="360" cy="60" r="2" fill="rgba(6,182,212,0.20)" />
                                            <circle cx="280" cy="60" r="2" fill="rgba(6,182,212,0.18)" />
                                            <circle cx="320" cy="120" r="3" fill="rgba(6,182,212,0.22)" />
                                            <line x1="320" y1="40" x2="360" y2="60" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
                                            <line x1="320" y1="40" x2="280" y2="60" stroke="rgba(6,182,212,0.12)" strokeWidth="1" />
                                            <line x1="360" y1="60" x2="360" y2="100" stroke="rgba(6,182,212,0.10)" strokeWidth="1" />
                                            <line x1="280" y1="60" x2="320" y2="80" stroke="rgba(6,182,212,0.12)" strokeWidth="1" />
                                            <line x1="320" y1="80" x2="320" y2="120" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
                                        </svg>
                                        <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 border-b border-cyan-900/30 pb-2 flex-none font-jakarta">
                                            <GuardianTooltip sectionId="sectorIntel" position="right">
                                                <span>SECTOR INTEL</span>
                                            </GuardianTooltip>
                                            {selectedSector && <span className="text-slate-500 font-mono opacity-50 ml-2">:: {selectedSector.id}</span>}
                                        </h3>

                                        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                            {selectedSector ? (
                                                <div className="h-full flex flex-col">
                                                    <div className="flex justify-between items-baseline mb-3 flex-none">
                                                        <span className="text-lg font-bold text-white">{getSectorName(selectedSector.name, locale)}</span>
                                                        <span className={`text-xl font-mono ${selectedSector.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                            {selectedSector.change > 0 ? "+" : ""}{selectedSector.change.toFixed(2)}%
                                                        </span>
                                                    </div>

                                                    {/* [V6.0] 5-Day Trend Analysis Panel */}
                                                    {data?.rotationIntensity?.fiveDayData?.[intelSectorId!] && (() => {
                                                        const td = data.rotationIntensity.fiveDayData![intelSectorId!];
                                                        const dayLabels = ['D-4', 'D-3', 'D-2', 'D-1'];
                                                        const maxAbs = Math.max(...td.changes.map(Math.abs), 0.5);
                                                        const st = SECTOR_INTEL_TEXTS[(locale as SectorLocale) || 'ko'];
                                                        const rvolLabel = td.rvol >= 1.5 ? st.rvolSurging : td.rvol >= 1.0 ? st.rvolActive : td.rvol >= 0.7 ? st.rvolNormal : st.rvolLow;
                                                        const rvolColor = td.rvol >= 1.5 ? 'text-emerald-400' : td.rvol >= 1.0 ? 'text-cyan-400' : td.rvol >= 0.7 ? 'text-slate-400' : 'text-rose-400';
                                                        const consistencyLabel = td.consistency >= 0.75 ? st.consistencyStrong : td.consistency >= 0.5 ? st.consistencyMixed : st.consistencyUnstable;
                                                        const consistencyColor = td.consistency >= 0.75 ? 'text-emerald-400' : td.consistency >= 0.5 ? 'text-amber-400' : 'text-rose-400';

                                                        return (
                                                            <div className="mb-3 flex-none">
                                                                {/* Header */}
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-[12px] font-bold text-slate-400 uppercase tracking-widest font-jakarta">{st.trendAnalysis}</span>
                                                                    <span className={`text-xs font-mono font-bold ${td.cumReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                        {td.cumReturn > 0 ? '▲' : '▼'} {td.cumReturn > 0 ? '+' : ''}{td.cumReturn.toFixed(2)}%
                                                                    </span>
                                                                </div>

                                                                {/* Daily Change Bars - Horizontal */}
                                                                <div className="space-y-1.5 mb-3">
                                                                    {td.changes.map((c, i) => (
                                                                        <div key={i} className="flex items-center gap-2">
                                                                            <span className="text-[12px] text-slate-600 font-mono w-6 text-right shrink-0">{dayLabels[i] || `D${i}`}</span>
                                                                            <div className="flex-1 h-4 bg-slate-900 rounded overflow-hidden relative">
                                                                                {/* Center line */}
                                                                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700/50" />
                                                                                {/* Bar */}
                                                                                <div
                                                                                    className={`absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-500 ${c >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'
                                                                                        }`}
                                                                                    style={{
                                                                                        left: c >= 0 ? '50%' : `${50 - (Math.abs(c) / maxAbs) * 45}%`,
                                                                                        width: `${(Math.abs(c) / maxAbs) * 45}%`
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <span className={`text-[12px] font-mono font-bold w-12 text-right shrink-0 ${c >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                {c > 0 ? '+' : ''}{c.toFixed(1)}%
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Metric Cards */}
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {/* Volume Intensity */}
                                                                    <div className="bg-slate-900/80 rounded-lg px-3 py-2 border border-slate-800/50">
                                                                        <div className="text-[12px] text-slate-500 font-bold tracking-wider mb-1">{st.volumeIntensity}</div>
                                                                        <div className="flex items-baseline gap-1.5">
                                                                            <span className={`text-sm font-mono font-bold ${rvolColor}`}>{td.rvol.toFixed(2)}x</span>
                                                                            <span className={`text-[12px] font-medium ${rvolColor}`}>{rvolLabel}</span>
                                                                        </div>
                                                                    </div>
                                                                    {/* Trend Consistency */}
                                                                    <div className="bg-slate-900/80 rounded-lg px-3 py-2 border border-slate-800/50">
                                                                        <div className="text-[12px] text-slate-500 font-bold tracking-wider mb-1">{st.trendConsistency}</div>
                                                                        <div className="flex items-baseline gap-1.5">
                                                                            <span className={`text-sm font-mono font-bold ${consistencyColor}`}>{(td.consistency * 100).toFixed(0)}%</span>
                                                                            <span className={`text-[12px] font-medium ${consistencyColor}`}>{consistencyLabel}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Bounce Warning */}
                                                                {td.isBounce && (
                                                                    <div className="mt-2 flex items-center gap-2 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2">
                                                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                                        <span className="text-[12px] text-amber-300 font-medium">
                                                                            {st.noiseBounce(td.todayChange, td.cumReturn)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* LIVE TICKER TABLE */}
                                                    <div className="space-y-1">
                                                        {topMovers.length > 0 ? (
                                                            topMovers.map(stock => (
                                                                <Link key={stock.symbol} href={`/ticker?ticker=${stock.symbol}`} className="flex items-center justify-between text-xs py-2 px-2 rounded hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 transition-all group">
                                                                    {/* Left: Logo & Symbol */}
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 relative">
                                                                            <span className="text-[12px] font-bold text-slate-500 absolute">{stock.symbol.substring(0, 2)}</span>
                                                                            <img
                                                                                src={`/api/logo/${stock.symbol}`}
                                                                                alt={stock.symbol}
                                                                                className="w-full h-full object-contain relative z-10"
                                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                            />
                                                                        </div>
                                                                        <span className="text-[13px] font-bold text-slate-200 group-hover:text-cyan-300 w-10">{stock.symbol}</span>
                                                                    </div>

                                                                    {/* Right: Price + Change inline */}
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="text-[13px] text-slate-200 font-mono font-semibold">${stock.price.toFixed(2)}</span>
                                                                        <span className={`text-[13px] font-mono font-bold ${stock.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                                            {stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)}%
                                                                        </span>
                                                                    </div>
                                                                </Link>
                                                            ))
                                                        ) : (
                                                            <div className="text-xs text-slate-500 py-2 text-center">Loading live data...</div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-full flex flex-col">
                                                    {/* Top Movers auto-display when no sector selected */}
                                                    {data?.sectors && data.sectors.length > 0 ? (() => {
                                                        const sorted = [...data.sectors].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
                                                        return (
                                                            <>
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                                                    <span className="text-[12px] font-bold text-slate-300 uppercase tracking-widest font-jakarta">Today's Top Movers</span>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {sorted.map(s => (
                                                                        <button
                                                                            key={s.id}
                                                                            onClick={() => setSelectedSectorId(s.id)}
                                                                            className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 transition-all text-left group"
                                                                        >
                                                                            <span className="text-[13px] font-medium text-slate-200 group-hover:text-cyan-300 transition-colors">{getSectorName(s.name, locale)}</span>
                                                                            <span className={`text-[13px] font-mono font-bold ${s.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                {s.change > 0 ? '+' : ''}{s.change.toFixed(2)}%
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-3 text-[12px] text-slate-300 text-center">
                                                                    ↑ {locale === 'ko' ? '섹터를 선택하면 상세 분석을 볼 수 있습니다' : locale === 'ja' ? 'セクターを選択して詳細分析を表示' : 'Select a sector for detailed analysis'}
                                                                </div>
                                                            </>
                                                        );
                                                    })() : (
                                                        <div className="h-full flex flex-col items-center justify-center text-[12px] text-slate-300">
                                                            <Layers className="w-8 h-8 opacity-20 mb-2" />
                                                            SELECT A SECTOR ON MAP
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                        </div>

                    </div>
                </main>
            </div >
        </GuestWall >
    );
}
