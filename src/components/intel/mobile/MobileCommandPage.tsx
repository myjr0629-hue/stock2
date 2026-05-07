'use client';

// ============================================================================
// MobileCommandPage — Bloomberg-Class 5-Tab Command Terminal
// v1.0: Full data via /api/command/unified + IntelQuote instant fallback
// Architecture: Sticky Header → Score Row → Tab Nav → Tab Content
// ZERO desktop impact — fully isolated in mobile/ directory
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { ChevronLeft, Heart, Loader2 } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useLocale } from 'next-intl';
import useSWR from 'swr';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import { usePriceFlash, getFlashStyle } from '@/components/ui/PriceDisplay';
import dynamic from 'next/dynamic';
import { MobileWatchlistSwipeBar } from '@/components/mobile/MobileWatchlistSwipeBar';

// Tab sub-components
import { MobileCmdOverview } from './MobileCmdOverview';
import { MobileCmdMetrics } from './MobileCmdMetrics';
import { MobileCmdChart } from './MobileCmdChart';
import { MobileCmdOptions } from './MobileCmdOptions';

// 13F+Insider — mobile-optimized with toggle
import { MobileCmd13F } from './MobileCmd13F';


interface MobileCommandPageProps {
    // Path A: from Intel page (IntelQuote-based)
    quote?: IntelQuote;
    sectorLabel?: string;
    onBack?: () => void;
    // Path B: from Command page (SSR data-based)
    ticker?: string;
    initialStockData?: any;
    initialUnifiedData?: any;
}

const LOGO = (t: string) => `https://assets.parqet.com/logos/symbol/${t}?format=png`;

type TabKey = 'overview' | 'metrics' | 'chart' | 'options' | '13f';

const TABS: { key: TabKey; label: string; aiPrefix?: boolean }[] = [
    { key: 'chart', label: 'Chart' },
    { key: 'overview', label: 'Overview', aiPrefix: true },
    { key: 'metrics', label: 'Metrics' },
    { key: 'options', label: 'Options' },
    { key: '13f', label: '13-F' },
];

// ── Helpers ──
function fmt(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

function scoreColor(v: number) {
    if (v >= 70) return { ring: '#10b981', text: 'text-emerald-400', label: 'STRONG' };
    if (v >= 55) return { ring: '#60a5fa', text: 'text-blue-400', label: 'MODERATE' };
    if (v >= 40) return { ring: '#fbbf24', text: 'text-amber-400', label: 'MIXED' };
    return { ring: '#f87171', text: 'text-rose-400', label: 'WEAK' };
}

function flowTrend(whale: number) {
    if (whale >= 60) return { label: 'INFLOW', color: '#10b981', text: 'text-emerald-400' };
    if (whale >= 40) return { label: 'NEUTRAL', color: '#fbbf24', text: 'text-amber-400' };
    return { label: 'OUTFLOW', color: '#f87171', text: 'text-rose-400' };
}

// ── Ring Gauge SVG ──
function RingGauge({ value, size = 44, strokeWidth = 3, color }: { value: number; size?: number; strokeWidth?: number; color: string }) {
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    const offset = circumference * (1 - pct / 100);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="transition-all duration-700" />
        </svg>
    );
}

// ── SWR fetcher ──
const fetcher = (url: string) => fetch(url).then(r => r.json());

export function MobileCommandPage({ quote: rawQuote, sectorLabel, onBack, ticker: rawTicker, initialStockData, initialUnifiedData }: MobileCommandPageProps) {
    const locale = useLocale();
    const [activeTab, setActiveTab] = useState<TabKey>('chart');
    const tabsRef = useRef<HTMLDivElement>(null);

    // ══ Watchlist (Dashboard) ══
    const toggleDashboardTicker = useDashboardStore(s => s.toggleDashboardTicker);
    const isDashboardTicker = useDashboardStore(s => s.isDashboardTicker);

    // ══════════════════════════════════════════════════════
    // RESOLVE: Build effective ticker + quote from either path
    // Path A (Intel): quote is provided directly
    // Path B (Command): build quote from initialStockData
    // ══════════════════════════════════════════════════════
    const effectiveTicker = rawQuote?.ticker || rawTicker || '';

    const effectiveQuote: IntelQuote = useMemo(() => {
        if (rawQuote) return rawQuote;
        // Build synthetic IntelQuote from Command page SSR data
        const sd = initialStockData || {};
        const ud = initialUnifiedData || {};
        const s = ud.structure || {};
        return {
            ticker: effectiveTicker,
            price: sd.price || ud._dynamoPrice?.price || 0,
            changePct: sd.changePercent || ud._dynamoPrice?.changePct || 0,
            prevClose: sd.prevClose || 0,
            extendedPrice: sd.extended?.prePrice || sd.extended?.postPrice || 0,
            extendedChangePct: (() => {
                const ext = sd.extended?.prePrice || sd.extended?.postPrice || 0;
                const prev = sd.prevClose || 0;
                return ext > 0 && prev > 0 ? ((ext - prev) / prev) * 100 : 0;
            })(),
            extendedLabel: sd.extended?.prePrice ? 'PRE' : sd.extended?.postPrice ? 'POST' : '',
            session: sd.session || 'CLOSED',
            gex: s.netGex || 0,
            pcr: s.pcRatio || ud.options?.pcr || 0,
            maxPain: s.maxPain || 0,
            callWall: s.levels?.callWall || 0,
            putFloor: s.levels?.putFloor || 0,
            gammaRegime: s.gammaRegime || 'NEUTRAL',
            netPremium: 0,
            whaleIndex: ud.smartFlow || 0,
            darkPoolPct: 0,
            squeezeScore: 0,
            ivSkew: 0,
            impliedMovePct: 0,
            alphaScore: ud.alpha?.score || 0,
            grade: ud.alpha?.grade || '',
            volume: sd.volume || 0,
            rsi: 0,
            rvol: 0,
            sparkline: [],
        } as IntelQuote;
    }, [rawQuote, initialStockData, initialUnifiedData, effectiveTicker]);

    // ══════════════════════════════════════════════════════
    // DATA: SWR fetch from /api/command/unified (full data)
    // If initialUnifiedData is provided (Command page SSR), use as fallback
    // ══════════════════════════════════════════════════════
    const { data: swrUnified, isLoading: unifiedLoading } = useSWR(
        effectiveTicker ? `/api/command/unified?t=${effectiveTicker}&lang=${locale}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            revalidateIfStale: true,
            dedupingInterval: 10_000,
            refreshInterval: 30_000,
            fallbackData: initialUnifiedData || undefined,
        }
    );
    const unified = swrUnified || initialUnifiedData || null;

    // ── Live Price (same hooks as desktop LiveTickerDashboard) ──
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.isHoliday || marketStatus.market === 'closed';
    const livePrice = useLivePrice(effectiveTicker, marketStatus.market);
    const { getPrice: wsGetPrice } = useRealtimeData([effectiveTicker]);
    const wsPrice = wsGetPrice(effectiveTicker);

    // [FIX 2026-05-06] Ticker API에서 prevChangePct 확보 (PRE 마켓 본장 등락률용)
    // Flow 페이지와 동일한 데이터 소스 — ticker API가 daily aggs에서 2거래일 전 종가를 제공
    const { data: tickerApiData } = useSWR(
        effectiveTicker ? `/api/live/ticker?t=${effectiveTicker}&skip_alpha=1` : null,
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000, refreshInterval: 60_000 }
    );

    // Session — identical to desktop LiveTickerDashboard L856
    const effectiveSession = isClosed
        ? 'CLOSED'
        : (effectiveQuote.session || 'CLOSED').toUpperCase();

    // ── calcPriceDisplay — SAME function, SAME params as desktop ──
    // [FIX] prevChangePct 전달: ticker API → prices.prevChangePct
    //   PRE 시 calcPriceDisplay L100: prevChangePct가 있으면 이것을 본장 등락률로 사용
    const { displayPrice: price, displayChangePct: changePct, activeExtPrice, activeExtLabel, activeExtPct } = calcPriceDisplay({
        livePrice: wsPrice?.price || livePrice?.price,
        liveChangePct: wsPrice?.changePct || livePrice?.changePercent,
        liveExtPrice: livePrice?.extendedPrice,
        liveExtChangePct: livePrice?.extendedChangePercent,
        liveExtLabel: livePrice?.extendedLabel
            ? (effectiveSession === 'CLOSED'
                ? `${livePrice.extendedLabel} (CLOSED)`
                : livePrice.extendedLabel)
            : undefined,
        apiDisplayPrice: effectiveQuote.price || 0,
        apiDisplayChangePct: effectiveQuote.changePct || 0,
        session: effectiveSession,
        prevRegularClose: tickerApiData?.prices?.prevRegularClose || effectiveQuote.prevClose || null,
        prevClose: tickerApiData?.prevClose || effectiveQuote.prevClose || 0,
        regularCloseToday: tickerApiData?.prices?.regularCloseToday || ((effectiveSession === 'POST' || effectiveSession === 'CLOSED') ? (initialStockData?.todayClose || undefined) : undefined),
        prevChangePct: tickerApiData?.prices?.prevChangePct,
        fallbackChangePct: effectiveQuote.changePct || 0,
        lastTrade: tickerApiData?.prices?.lastTrade || effectiveQuote.price || 0,
        extended: tickerApiData?.extended || initialStockData?.extended || {},
        prices: tickerApiData?.prices || {},
    });
    const up = changePct >= 0;

    // Price flash — same as desktop LiveTickerDashboard L1234
    const priceFlash = usePriceFlash(price || 0);
    const pf = getFlashStyle(priceFlash);

    const hasExt = activeExtPrice > 0 && activeExtLabel;

    const contextScore = useMemo(() => {
        if (unified?.alpha?.score != null) return unified.alpha.score;
        if (unified?.fundamentals?.score != null) return unified.fundamentals.score;
        return effectiveQuote.alphaScore || 0;
    }, [unified, effectiveQuote.alphaScore]);

    const smartFlow = useMemo(() => {
        if (unified?.smartFlow != null) return unified.smartFlow;
        return effectiveQuote.whaleIndex || 0;
    }, [unified, effectiveQuote.whaleIndex]);

    const ctx = scoreColor(contextScore);
    const flow = flowTrend(smartFlow);

    const sectorTag = useMemo(() => {
        if (unified?.overview?.overview?.sectorEN) return unified.overview.overview.sectorEN;
        if (unified?.fundamentals?.sector) return unified.fundamentals.sector;
        return sectorLabel || '';
    }, [unified, sectorLabel]);

    // ── Tab scroll to active ──
    useEffect(() => {
        if (!tabsRef.current) return;
        const activeEl = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeTab]);

    const handleTabSwitch = useCallback((tab: TabKey) => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
        setActiveTab(tab);
    }, []);

    return (
        <div className="w-full flex flex-col min-h-screen bg-[#050a14] pb-24 relative z-10">

            {/* ═══ STICKY HEADER ═══ */}
            <div className="fixed top-14 left-0 right-0 z-30 bg-[#050a14]/95 border-b border-white/[0.06]"
                style={{ WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}>

                {/* Row 1: Logo + Ticker + ♥ ← → Price + Change (한 줄) */}
                <div className="px-4 pt-2.5 pb-2 flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="-ml-1 shrink-0 active:scale-90 transition-transform touch-manipulation"
                            style={{ WebkitTapHighlightColor: 'transparent' }}>
                            <ChevronLeft className="w-5 h-5 text-blue-400" />
                        </button>
                    )}
                    <div className="w-10 h-10 rounded-xl bg-black border border-white/10 overflow-hidden relative flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-bold text-white/40 absolute">{effectiveQuote.ticker.slice(0, 2)}</span>
                        <img src={LOGO(effectiveQuote.ticker)} alt="" className="w-full h-full object-cover absolute inset-0 rounded-xl"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                    <span className="text-[18px] font-extrabold text-white tracking-tight">{effectiveQuote.ticker}</span>
                    <button
                        onClick={() => toggleDashboardTicker(effectiveQuote.ticker)}
                        className="active:scale-90 transition-transform touch-manipulation shrink-0"
                        style={{ WebkitTapHighlightColor: 'transparent' }}>
                        <Heart className={`w-4.5 h-4.5 transition-colors ${isDashboardTicker(effectiveQuote.ticker) ? 'text-rose-500 fill-rose-500' : 'text-slate-500'}`} />
                    </button>
                    <div className="ml-auto flex items-baseline gap-1.5 shrink-0">
                        <span className={`text-[20px] font-bold tracking-tight tabular-nums font-mono leading-none ${pf.color}`}
                            style={pf.style}>${price.toFixed(2)}</span>
                        <span className={`text-[13px] font-bold tabular-nums tracking-tight font-mono ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {up ? '+' : ''}{changePct.toFixed(2)}%
                        </span>
                    </div>
                </div>

                {/* Row 3: Extended Session + Sector Tag (겹침 방지) */}
                <div className="px-4 pb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {hasExt && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-purple-500/20 shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
                                <span className="text-[10px] font-bold text-purple-300 whitespace-nowrap">{activeExtLabel}</span>
                                <span className="text-[11px] font-bold text-slate-200 font-mono tabular-nums">${activeExtPrice.toFixed(2)}</span>
                                <span className={`text-[11px] font-bold font-mono tabular-nums ${activeExtPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {activeExtPct >= 0 ? '+' : ''}{activeExtPct.toFixed(2)}%
                                </span>
                            </div>
                        )}
                        {unifiedLoading && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />}
                    </div>
                    {sectorTag && <span className="text-[9px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md truncate max-w-[140px] shrink-0">{sectorTag}</span>}
                </div>

                {/* ─── DUAL SCORE ROW ─── */}
                <div className="px-4 pb-2.5 flex items-center gap-3">
                    {/* Context Score */}
                    <div className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border
                        ${contextScore >= 55 ? 'border-emerald-500/25 bg-emerald-500/[0.06]' :
                            contextScore >= 40 ? 'border-amber-500/25 bg-amber-500/[0.06]' :
                                'border-rose-500/25 bg-rose-500/[0.06]'}`}>
                        <div className="relative shrink-0">
                            <RingGauge value={contextScore} size={40} strokeWidth={2.5} color={ctx.ring} />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[13px] font-bold ${ctx.text}`}>{Math.round(contextScore)}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Context</div>
                            <div className={`text-[13px] font-bold ${ctx.text}`}>{ctx.label}</div>
                        </div>
                    </div>

                    {/* Smart Flow */}
                    <div className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border
                        ${smartFlow >= 60 ? 'border-emerald-500/25 bg-emerald-500/[0.06]' :
                            smartFlow >= 40 ? 'border-amber-500/25 bg-amber-500/[0.06]' :
                                'border-rose-500/25 bg-rose-500/[0.06]'}`}>
                        <div className="relative shrink-0">
                            <RingGauge value={smartFlow} size={40} strokeWidth={2.5} color={flow.color} />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[13px] font-bold ${flow.text}`}>{Math.round(smartFlow)}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Smart Flow</div>
                            <div className={`text-[13px] font-bold ${flow.text}`}>{flow.label}</div>
                        </div>
                    </div>
                </div>

                {/* ─── TAB NAVIGATION ─── */}
                <div ref={tabsRef} className="flex gap-0 overflow-x-auto border-t border-white/[0.04]"
                    style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                data-tab={tab.key}
                                onClick={() => handleTabSwitch(tab.key)}
                                className={`flex-1 shrink-0 min-w-[72px] py-3 text-center transition-colors relative touch-manipulation
                                    ${isActive ? 'text-white' : 'text-slate-500 active:text-slate-300'}`}
                                style={{ WebkitTapHighlightColor: 'transparent', scrollSnapAlign: 'center' }}
                            >
                                <span className="text-[12px] font-bold tracking-wide">
                                    {tab.aiPrefix && <span className="text-cyan-400 mr-0.5">AI</span>}
                                    {tab.label}
                                </span>
                                {isActive && (
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-blue-400" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══ SPACER for fixed header — matches sticky header height ═══ */}
            <div className="shrink-0" style={{ height: hasExt ? 250 : 220 }} />

            {/* ═══ TAB CONTENT ═══ */}
            <div className="px-4 space-y-4">
                {activeTab === 'overview' && (
                    <MobileCmdOverview
                        ticker={effectiveQuote.ticker}
                        quote={effectiveQuote}
                        unified={unified}
                        unifiedLoading={unifiedLoading}
                    />
                )}
                {activeTab === 'metrics' && (
                    <MobileCmdMetrics ticker={effectiveQuote.ticker} quote={effectiveQuote} unified={unified} unifiedLoading={unifiedLoading} />
                )}
                {activeTab === 'chart' && (
                    <MobileCmdChart ticker={effectiveQuote.ticker} quote={effectiveQuote} unified={unified} unifiedLoading={unifiedLoading} initialStockData={initialStockData} />
                )}
                {activeTab === 'options' && (
                    <MobileCmdOptions ticker={effectiveQuote.ticker} quote={effectiveQuote} unified={unified} unifiedLoading={unifiedLoading} initialStockData={initialStockData} />
                )}
                {activeTab === '13f' && (
                    <MobileCmd13F ticker={effectiveQuote.ticker} />
                )}

            </div>

            {/* ═══ WATCHLIST SWIPE BAR — fixed above bottom nav ═══ */}
            <MobileWatchlistSwipeBar currentTicker={effectiveTicker} targetPage="command" />
        </div>
    );
}
