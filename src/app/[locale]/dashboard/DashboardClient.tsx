"use client";

import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useShallow } from "zustand/react/shallow";
import { PriceDisplay, usePriceFlash, getFlashStyle, tickerDelay } from "@/components/ui/PriceDisplay";
import { useMobile } from "@/hooks/useMobile";
import { calcPriceDisplay } from "@/utils/calcPriceDisplay";
import { useRealtimeData } from "@/providers/WebSocketProvider";
import { ProGate, EliteGate } from "@/components/gate/FeatureGate";
import { useTier } from "@/contexts/TierContext";
import { Crown, Lock as LockIcon } from "lucide-react";
import { CardTooltip } from "@/components/ui/CardTooltip";
import { prefetchCommandData } from "@/utils/commandPrefetch";
import { useCardCustomize, DEFAULT_CARD_ORDER, ALL_CARDS } from "@/components/dashboard/CardCustomize";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";

// Dynamic import for StockChart (no SSR for chart component)
const StockChart = dynamic(() => import("@/components/StockChart").then(mod => mod.StockChart), {
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center text-slate-500">Loading...</div>
});
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Target,
    Zap,
    Radio,
    RefreshCw,
    ChevronRight,
    BarChart3,
    List,
    Loader2,
    X,
    Plus,
    BookOpen,
    Settings,
    Check,
    Anchor,
    Gauge,
    BarChart2,
    Layers,
    Brain,
    Gem,
} from "lucide-react";

// Market status badge colors
const STATUS_COLORS = {
    PRE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    OPEN: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    AFTER: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    CLOSED: "bg-slate-500/20 text-slate-400 border-slate-500/30"
};

const PHASE_LABELS_KEY: Record<string, string> = {
    BULLISH_EXPANSION: "phaseBullExpansion",
    BULLISH: "phaseBullish",
    NEUTRAL: "phaseNeutral",
    BEARISH: "phaseBearish",
    BEARISH_DECLINE: "phaseBearDecline",
    UNKNOWN: "—"
};

// Market Countdown Component
function MarketCountdown({ marketStatus, isHoliday }: { marketStatus?: string; isHoliday?: boolean }) {
    const [countdown, setCountdown] = useState('');
    const [nextLabel, setNextLabel] = useState('');
    const [isNonTradingDay, setIsNonTradingDay] = useState(false);

    useEffect(() => {
        const calcCountdown = () => {
            const now = new Date();
            // Convert to ET (UTC-5 standard, UTC-4 DST)
            const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
            const et = new Date(etStr);
            const day = et.getDay();
            const hours = et.getHours();
            const minutes = et.getMinutes();
            const currentMinutes = hours * 60 + minutes;

            // Skip countdown on weekends and holidays
            if (day === 0 || day === 6 || isHoliday) {
                setIsNonTradingDay(true);
                setCountdown('');
                setNextLabel('');
                return;
            }
            setIsNonTradingDay(false);

            // Market sessions in ET minutes
            const PRE_OPEN = 4 * 60;       // 04:00
            const REG_OPEN = 9 * 60 + 30;  // 09:30
            const REG_CLOSE = 16 * 60;     // 16:00
            const AFTER_CLOSE = 20 * 60;   // 20:00

            let targetMinutes = 0;
            let label = '';

            if (currentMinutes < PRE_OPEN) {
                // Before pre-market
                targetMinutes = PRE_OPEN;
                label = 'Pre-Market Open';
            } else if (currentMinutes < REG_OPEN) {
                // During pre-market
                targetMinutes = REG_OPEN;
                label = 'Market Open';
            } else if (currentMinutes < REG_CLOSE) {
                // During regular hours
                targetMinutes = REG_CLOSE;
                label = 'Market Close';
            } else if (currentMinutes < AFTER_CLOSE) {
                // During after-hours
                targetMinutes = AFTER_CLOSE;
                label = 'After-Hours Close';
            } else {
                // After all sessions — next day pre-market
                targetMinutes = PRE_OPEN + 24 * 60;
                label = 'Pre-Market Open';
            }

            const diffMin = targetMinutes - currentMinutes;
            const h = Math.floor(diffMin / 60);
            const m = diffMin % 60;

            setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`);
            setNextLabel(label);
        };

        calcCountdown();
        const interval = setInterval(calcCountdown, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [marketStatus, isHoliday]);

    if (!countdown || isNonTradingDay) return null;

    return (
        <span style={{ fontSize: '12px' }} className="text-slate-300 ml-2">
            {nextLabel} <span className="text-cyan-400 font-semibold">{countdown}</span>
        </span>
    );
}

// Alpha Status Bar Component
function AlphaStatusBar() {
    const locale = useLocale();
    const tCommon = useTranslations('common');
    const market = useDashboardStore(s => s.market);
    const lastUpdated = useDashboardStore(s => s.lastUpdated);
    const isLoading = useDashboardStore(s => s.isLoading);
    const fetchDashboardData = useDashboardStore(s => s.fetchDashboardData);

    const handleRefresh = useCallback(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    return (
        <div className="hidden lg:flex items-center justify-between px-4 py-2 bg-[#0a0f1a] border-b border-white/5">
            {/* Left: intentionally empty — NQ/Phase info moved to global ticker bar */}
            <div />

            {/* Center: Market Status Indicator + Countdown */}
            <div className="flex items-center gap-2">
                {(() => {
                    // [FIX] Compute session status client-side — no API cache dependency
                    const now = new Date();
                    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
                    const et = new Date(etStr);
                    const etDay = et.getDay();
                    const etMinutes = et.getHours() * 60 + et.getMinutes();

                    const isWeekend = etDay === 0 || etDay === 6;
                    const isHoliday = market?.isHoliday || false;

                    // Determine session from ET time
                    let sessionLabel: 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED' = 'CLOSED';
                    if (!isWeekend && !isHoliday) {
                        if (etMinutes >= 240 && etMinutes < 570) sessionLabel = 'PRE';       // 04:00-09:29
                        else if (etMinutes >= 570 && etMinutes < 960) sessionLabel = 'OPEN';  // 09:30-15:59
                        else if (etMinutes >= 960 && etMinutes < 1200) sessionLabel = 'AFTER'; // 16:00-19:59
                    }

                    const isLive = sessionLabel !== 'CLOSED';

                    if (isHoliday) {
                        return (
                            <>
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                                </span>
                                <span className="text-[12px] uppercase tracking-wider text-amber-400 font-bold">HOLIDAY</span>
                                {market?.holidayName && (
                                    <span className="text-[12px] text-amber-300 font-semibold">· {market.holidayName}</span>
                                )}
                            </>
                        );
                    }

                    if (isLive) {
                        return (
                            <>
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                </span>
                                <span className="text-[12px] uppercase tracking-wider text-emerald-400 font-bold">LIVE</span>
                                <span className={`ml-1 px-2 py-0.5 text-[12px] uppercase font-bold rounded border ${STATUS_COLORS[sessionLabel]}`}>
                                    {sessionLabel}
                                </span>
                            </>
                        );
                    }

                    // CLOSED
                    return (
                        <>
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400" />
                            </span>
                            <span className="text-[12px] uppercase tracking-wider text-slate-300 font-bold">CLOSED</span>
                            {isWeekend && <span className="text-[12px] text-slate-400 font-semibold">· Weekend</span>}
                        </>
                    );
                })()}

                <MarketCountdown marketStatus={market?.marketStatus} isHoliday={market?.isHoliday} />
            </div>

            {/* Right: Guide Link + Last Updated & Refresh */}
            <div className="flex items-center gap-3">
                <Link href="/how-it-works" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/25 text-xs font-bold text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 transition-all backdrop-blur-sm" style={{ boxShadow: '0 0 12px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">GUIDE</span>
                </Link>
            </div>
        </div>
    );
}

// Mobile Sticky Hero — Extracted to be a DIRECT CHILD of the scroll container
// so that CSS sticky works correctly (no h-full parent constraint)
function MobileStickyHero() {
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    const data = useDashboardStore(s => s.tickers[s.selectedTicker]);
    const { tier } = useTier();
    const customize = useCardCustomize(tier);

    const p = calcPriceDisplay({
        livePrice: data?.display?.price || data?.underlyingPrice,
        liveChangePct: data?.display?.changePctPct ?? data?.changePercent,
        apiDisplayPrice: data?.display?.price || data?.underlyingPrice,
        apiDisplayChangePct: data?.display?.changePctPct ?? data?.intradayChangePct ?? data?.changePercent,
        session: data?.session || 'CLOSED',
        prevRegularClose: data?.prevRegularClose,
        prevClose: data?.prevClose,
        regularCloseToday: data?.regularCloseToday,
        prevChangePct: data?.prevChangePct,
        fallbackChangePct: data?.intradayChangePct ?? data?.changePercent ?? 0,
        lastTrade: data?.underlyingPrice,
        extended: data?.extended,
        prices: { prePrice: data?.extended?.prePrice, postPrice: data?.extended?.postPrice },
    });
    const mainPrice = p.displayPrice;
    const mainChangePct = p.displayChangePct;
    const isUp = mainChangePct >= 0;
    const extPrice = p.activeExtPrice;
    const extPct = p.activeExtPct;
    const extLabel = p.activeExtLabel?.replace(/\s*\(.*\)/, '').replace(/\s*(CLOSE|CLOSED)$/i, '').trim() || p.activeExtLabel;
    const hasExt = extPrice > 0 && extLabel;

    return (
        <div className="flex flex-col px-3 py-1.5 border-b border-white/5 gap-1 sticky top-0 z-30 bg-[#0a0f1a]" style={{ position: 'sticky' }} data-dashboard-hero-mobile>
            {/* Row 0: LIVE status + Market Countdown */}
            <div className="flex items-center justify-center gap-2">
                {(() => {
                    const now = new Date();
                    const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
                    const et = new Date(etStr);
                    const etDay = et.getDay();
                    const etMin = et.getHours() * 60 + et.getMinutes();
                    const isWeekend = etDay === 0 || etDay === 6;
                    let sLabel: 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED' = 'CLOSED';
                    if (!isWeekend) {
                        if (etMin >= 240 && etMin < 570) sLabel = 'PRE';
                        else if (etMin >= 570 && etMin < 960) sLabel = 'OPEN';
                        else if (etMin >= 960 && etMin < 1200) sLabel = 'AFTER';
                    }
                    const isLive = sLabel !== 'CLOSED';
                    return (
                        <>
                            <span className="relative flex h-2 w-2">
                                {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            </span>
                            <span className={`text-[11px] uppercase tracking-wider font-bold ${isLive ? 'text-emerald-400' : 'text-slate-400'}`}>{isLive ? 'LIVE' : 'CLOSED'}</span>
                            {isLive && <span className={`px-1.5 py-0.5 text-[10px] uppercase font-bold rounded border ${STATUS_COLORS[sLabel]}`}>{sLabel}</span>}
                        </>
                    );
                })()}
                <MarketCountdown marketStatus={data?.session} isHoliday={false} />
            </div>
            {/* Row 1: Logo + Ticker + Price + Change% */}
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-800 to-slate-700/50 border border-slate-600/50 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                    <img loading="lazy" decoding="async" src={`/api/logo/${selectedTicker}`} alt={selectedTicker} className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="text-[8px] font-bold text-slate-500 absolute">{selectedTicker?.slice(0, 2)}</span>
                </div>
                <span className="text-[20px] font-black text-white font-jakarta tracking-tight">{selectedTicker}</span>
                <span className="text-[19px] font-mono font-bold text-white ml-0.5">
                    ${mainPrice > 0 ? mainPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </span>
                <span className={`text-[14px] font-mono font-bold px-1.5 py-0.5 rounded ${isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                    {isUp ? '+' : ''}{mainChangePct.toFixed(2)}%
                </span>
            </div>
            {/* Row 2: PRE/POST pill + Customize */}
            <div className="flex items-center gap-2 ml-[36px]">
                {hasExt ? (
                    <div className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md border ${extLabel?.includes('PRE') ? 'bg-amber-500/10 border-amber-500/25' : 'bg-indigo-500/10 border-indigo-500/25'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${extLabel?.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                        <span className={`text-[11px] font-black uppercase tracking-wide leading-none ${extLabel?.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>{extLabel}</span>
                        <span className="text-[12px] font-mono font-bold text-slate-200 leading-none">${extPrice.toFixed(2)}</span>
                        <span className={`text-[11px] font-mono font-bold leading-none ${extPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{extPct > 0 ? '+' : ''}{extPct.toFixed(2)}%</span>
                    </div>
                ) : <div />}
                {(tier === 'pro' || tier === 'elite') && (
                    <button
                        onClick={() => customize.isEditing ? customize.setIsEditing(false) : customize.setIsEditing(true)}
                        className={`ml-auto inline-flex items-center gap-1 px-1.5 py-0 rounded text-[12px] font-semibold leading-none transition-all ${customize.isEditing
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-400/40'
                            : 'bg-slate-800/40 text-slate-400 border border-white/8'
                        }`}
                        style={{ height: '18px' }}
                    >
                        {customize.isEditing ? (
                            <><Check className="w-2.5 h-2.5" /> Done</>
                        ) : (
                            <><Settings className="w-2.5 h-2.5" /> Customize</>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

// Watchlist Item Component (Command-style price display)
const WatchlistItem = React.memo(function WatchlistItem({ ticker, isSelected }: { ticker: string; isSelected: boolean }) {
    const td = useTranslations('dashboard');
    const data = useDashboardStore(s => s.tickers[ticker]);
    const setSelectedTicker = useDashboardStore(s => s.setSelectedTicker);
    const toggleDashboardTicker = useDashboardStore(s => s.toggleDashboardTicker);
    const fetchSingleTicker = useDashboardStore(s => s.fetchSingleTicker);
    const lastUpdated = useDashboardStore(s => s.lastUpdated);
    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // [PREFETCH] On hover, fetch data if missing or stale (>60s)
    const locale = useLocale();
    const handleHoverPrefetch = useCallback(() => {
        hoverTimeout.current = setTimeout(() => {
            const isStale = !data || !data.underlyingPrice ||
                (lastUpdated && (Date.now() - new Date(lastUpdated).getTime() > 60000));
            if (isStale) fetchSingleTicker(ticker);
            // [PERF V74] Prefetch Command unified data for instant page transition
            prefetchCommandData(ticker, locale);
        }, 300);
    }, [ticker, data, lastUpdated, fetchSingleTicker, locale]);

    const handleHoverCancel = useCallback(() => {
        if (hoverTimeout.current) { clearTimeout(hoverTimeout.current); hoverTimeout.current = null; }
    }, []);

    const hasGammaSqueeze = data?.isGammaSqueeze;
    const hasWhale = data?.netGex && Math.abs(data.netGex) > 500000000;

    // [UNIFIED] Use shared calcPriceDisplay
    // [FIX V2] Feed liveExt fields from store's extended data for instant PRE/POST badge display
    const extSession = (data?.session || 'CLOSED').toUpperCase();
    const extPriceVal = extSession === 'POST' || extSession === 'CLOSED'
        ? (data?.extended?.postPrice || 0)
        : (data?.extended?.prePrice || 0);
    const extPctVal = extSession === 'POST' || extSession === 'CLOSED'
        ? (data?.extended?.postChangePct || 0)
        : (data?.extended?.preChangePct || 0);
    const extLabelVal = extPriceVal > 0
        ? (extSession === 'POST' || extSession === 'CLOSED' ? 'POST' : 'PRE')
        : undefined;

    const priceResult = calcPriceDisplay({
        livePrice: data?.display?.price || data?.underlyingPrice,
        liveChangePct: data?.display?.changePctPct ?? data?.changePercent,
        liveExtPrice: extPriceVal > 0 ? extPriceVal : undefined,
        liveExtChangePct: extPctVal,
        liveExtLabel: extLabelVal,
        apiDisplayPrice: data?.display?.price || data?.underlyingPrice,
        apiDisplayChangePct: data?.display?.changePctPct ?? data?.intradayChangePct ?? data?.changePercent,
        session: data?.session || 'CLOSED',
        prevRegularClose: data?.prevRegularClose,
        prevClose: data?.prevClose,
        regularCloseToday: data?.regularCloseToday,
        prevChangePct: data?.prevChangePct,
        fallbackChangePct: data?.intradayChangePct ?? data?.changePercent ?? 0,
        lastTrade: data?.underlyingPrice,
        extended: data?.extended,
        prices: { prePrice: data?.extended?.prePrice, postPrice: data?.extended?.postPrice },
    });

    const mainPrice = priceResult.displayPrice;
    const mainChangePct = priceResult.displayChangePct;
    const extPrice = priceResult.activeExtPrice;
    const extChangePct = priceResult.activeExtPct;
    const extLabel = priceResult.activeExtLabel;
    const isPositive = mainChangePct >= 0;
    const wlFlash = usePriceFlash(mainPrice, tickerDelay(ticker));
    const wf = getFlashStyle(wlFlash);
    const extColor = extLabel?.includes('PRE') ? 'text-amber-400' : extLabel?.includes('POST') ? 'text-purple-400' : 'text-indigo-400';
    // Simplify labels: "PRE CLOSE" -> "PRE", "POST (CLOSED)" -> "POST", etc.
    const displayExtLabel = extLabel?.replace(/\s*\(.*\)/, '').replace(/\s*(CLOSE|CLOSED)$/i, '').trim() || extLabel;

    return (
        <div className="group relative flex items-center">
            <button
                onClick={() => setSelectedTicker(ticker)}
                onMouseEnter={handleHoverPrefetch}
                onMouseLeave={handleHoverCancel}
                className={`flex-1 flex flex-row items-center justify-between md:grid md:grid-cols-[minmax(0,1fr)_72px_58px_58px] md:justify-start gap-x-1.5 px-3 py-2.5 md:py-2 rounded-lg transition-all duration-200
                    ${isSelected
                        ? "bg-cyan-500/10 border border-cyan-500/30"
                        : "bg-[#0d1829]/40 border border-transparent hover:border-white/8 hover:bg-[#0d1829]/70"
                    }
                    ${hasGammaSqueeze ? "animate-squeeze-glow" : ""}
                    ${hasWhale && !hasGammaSqueeze ? "animate-whale-glow" : ""}
                `}
            >
                {/* Col 1: Logo + Ticker + Live dot */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <img
                        loading="lazy"
                        decoding="async"
                        src={`/api/logo/${ticker}`}
                        alt={ticker}
                        className="w-4.5 h-4.5 rounded bg-[#1a2535] object-contain flex-shrink-0"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '';
                            (e.target as HTMLImageElement).className = 'w-4 h-4 rounded bg-slate-700 hidden';
                        }}
                    />
                    <div className="flex flex-col items-start min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`font-jakarta font-bold text-[14px] md:text-[13px] truncate ${isSelected ? "text-cyan-400" : "text-white"}`}>
                                {ticker}
                            </span>
                            {/* Live indicator dot — pulses during PRE/OPEN/AFTER */}
                            {data?.session && data.session !== 'CLOSED' && (
                                <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                </span>
                            )}
                        </div>
                        {/* Mobile: Ticker badges below the ticker */}
                        <div className="flex items-center gap-1 md:hidden mt-0.5">
                            {hasGammaSqueeze && (
                                <span className="px-1 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-[9px] font-bold text-indigo-400">SQZ</span>
                            )}
                            {hasWhale && !hasGammaSqueeze && (
                                <span className="px-1 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[9px] font-bold text-amber-400">WHALE</span>
                            )}
                            {isSelected && (
                                <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30 text-[9px] font-bold text-cyan-400">VIEWING</span>
                            )}
                        </div>
                    </div>

                    {/* Desktop: Ticker badges inline */}
                    <div className="hidden md:flex items-center gap-1 min-w-0 ml-1 mt-0.5">
                        {hasGammaSqueeze && (
                            <span className="px-0.5 text-[8px] font-bold text-indigo-400 flex-shrink-0">SQ</span>
                        )}
                        {hasWhale && !hasGammaSqueeze && (
                            <span className="px-0.5 text-[8px] font-bold text-amber-400 flex-shrink-0">WH</span>
                        )}
                    </div>
                </div>
                {/* Mobile: ONE LINE — evenly spaced columns */}
                <div className="flex items-center gap-3 md:hidden ml-auto flex-shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {mainPrice > 0 ? (
                        <span className={`font-mono text-[13px] font-bold text-right min-w-[52px] ${wf.color}`} style={wf.style}>{mainPrice.toFixed(2)}</span>
                    ) : (
                        <div className="h-3.5 w-[52px] bg-slate-700/50 rounded animate-pulse" />
                    )}
                    {mainPrice > 0 ? (
                        <span className={`font-mono text-[12px] font-semibold text-right min-w-[56px] ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {isPositive ? "+" : ""}{mainChangePct.toFixed(2)}%
                        </span>
                    ) : <span className="min-w-[56px]" />}
                    <span className={`font-mono text-[12px] font-medium text-right min-w-[72px] ${extPrice > 0 ? (extChangePct >= 0 ? "text-emerald-400/60" : "text-rose-400/60") : "text-slate-600"}`}>
                        {extPrice > 0 ? `${displayExtLabel}:${extChangePct > 0 ? "+" : ""}${extChangePct.toFixed(2)}%` : '—'}
                    </span>
                </div>

                {/* Col 2: Last Price (Desktop) */}
                <div className="text-center flex-shrink-0 hidden md:block">
                    {mainPrice > 0 ? (
                        <span className={`font-mono text-[14px] ${wf.color}`}
                            style={wf.style}>
                            {mainPrice.toFixed(2)}
                        </span>
                    ) : (
                        <div className="h-3.5 w-14 bg-slate-700 rounded animate-pulse mx-auto" />
                    )}
                </div>

                {/* Col 3: Chg% (Desktop) */}
                <div className="text-center flex-shrink-0 hidden md:block">
                    {mainPrice > 0 ? (
                        <span className={`font-mono text-[14px] font-medium ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                            {isPositive ? "+" : ""}{mainChangePct.toFixed(2)}%
                        </span>
                    ) : (
                        <div className="h-3.5 w-10 bg-slate-700 rounded animate-pulse mx-auto" />
                    )}
                </div>

                {/* Col 4: Ext% (Desktop) */}
                <div className="text-center flex-shrink-0 hidden md:block">
                    {extPrice > 0 ? (
                        <span className={`font-mono text-[14px] font-medium ${extChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {extChangePct > 0 ? "+" : ""}{extChangePct.toFixed(2)}%
                        </span>
                    ) : (
                        <span className="text-[12px] text-slate-600">—</span>
                    )}
                </div>
            </button>
            {/* Remove Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    toggleDashboardTicker(ticker);
                }}
                className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-rose-500/20 rounded text-rose-400 flex-shrink-0"
                title={td('removeFromDashboard')}
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
});

// Tier-based max ticker slots
const TIER_MAX_SLOTS: Record<string, number> = { guest: 3, free: 3, pro: 10, elite: 20 };

// Watchlist Panel
function WatchlistPanel() {
    const td = useTranslations('dashboard');
    const gt = useTranslations('gate');
    const tickerKeys = useDashboardStore(useShallow(s => Object.keys(s.tickers)));
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    const toggleDashboardTicker = useDashboardStore(s => s.toggleDashboardTicker);
    const dashboardTickers = useDashboardStore(s => s.dashboardTickers);
    const { tier } = useTier();
    const maxSlots = TIER_MAX_SLOTS[tier] ?? 3;
    const isAtLimit = dashboardTickers.length >= maxSlots;
    // dashboardTickers = sole source of truth for the visible list
    const tickerList = dashboardTickers;
    const [newTicker, setNewTicker] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputWrapRef = useRef<HTMLDivElement>(null);

    // Debounced autocomplete fetch
    const fetchSuggestions = useCallback((q: string) => {
        if (suggestTimer.current) clearTimeout(suggestTimer.current);
        if (!q || q.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
        suggestTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/tickers/search?q=${encodeURIComponent(q)}`);
                if (res.ok) {
                    const data = await res.json();
                    const filtered = (data.symbols || []).filter((s: string) => !dashboardTickers.includes(s));
                    setSuggestions(filtered);
                    setShowSuggestions(filtered.length > 0);
                    setHighlightIdx(-1);
                }
            } catch { /* silent */ }
        }, 150);
    }, [dashboardTickers]);

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (inputWrapRef.current && !inputWrapRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectTicker = useCallback((ticker: string) => {
        if (isAtLimit) return;
        if (ticker && !dashboardTickers.includes(ticker)) {
            toggleDashboardTicker(ticker, maxSlots);
        }
        setNewTicker('');
        setSuggestions([]);
        setShowSuggestions(false);
    }, [isAtLimit, dashboardTickers, toggleDashboardTicker, maxSlots]);

    const handleAddTicker = () => {
        if (isAtLimit) return;
        // If a suggestion is highlighted, select it
        if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
            selectTicker(suggestions[highlightIdx]);
            return;
        }
        const ticker = newTicker.trim().toUpperCase();
        if (ticker && !dashboardTickers.includes(ticker)) {
            toggleDashboardTicker(ticker, maxSlots);
            setNewTicker('');
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Determine ext header label from market session
    const market = useDashboardStore(s => s.market);
    // [FIX] Determine ext header label from market session (reactive)
    const extHeaderLabel = useMemo(() => {
        const ms = market?.marketStatus;
        if (ms === 'PRE') return 'PRE';
        if (ms === 'AFTER' || ms === 'CLOSED') return 'POST';

        // Derive from ET time as a fallback
        const now = new Date();
        const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
        const et = new Date(etStr);
        const etMinutes = et.getHours() * 60 + et.getMinutes();
        if (etMinutes >= 4 * 60 && etMinutes < 9 * 60 + 30) return 'PRE';
        return 'POST';
    }, [market?.marketStatus]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-jakarta">Watchlist</h2>
                <span style={{ fontSize: '12px' }} className={`font-jakarta font-bold ${isAtLimit ? 'text-amber-400' : 'text-slate-300'}`}>{dashboardTickers.length} / {maxSlots}</span>
            </div>
            {/* Add Ticker Input with Autocomplete */}
            <div className="p-2 border-b border-white/5" ref={inputWrapRef}>
                <div className="relative">
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={newTicker}
                            onChange={(e) => {
                                const v = e.target.value.toUpperCase();
                                setNewTicker(v);
                                fetchSuggestions(v);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { handleAddTicker(); }
                                else if (e.key === 'Escape') { setShowSuggestions(false); }
                                else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1)); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, -1)); }
                            }}
                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                            placeholder={isAtLimit ? (tier === 'free' || tier === 'guest' ? gt('watchlistLimitPro', { count: TIER_MAX_SLOTS.pro }) : tier === 'pro' ? gt('watchlistLimitElite', { count: TIER_MAX_SLOTS.elite }) : '') : td('searchPlaceholder')}
                            className={`flex-1 px-2 py-1.5 text-xs bg-[#0d1829] border rounded focus:outline-none ${isAtLimit ? 'border-amber-500/30 text-amber-400/60 placeholder-slate-300 cursor-not-allowed' : 'border-white/10 text-white placeholder-slate-300 focus:border-cyan-500/50'}`}
                            maxLength={6}
                            disabled={isAtLimit}
                            autoComplete="off"
                        />
                        {isAtLimit ? (
                            <Link href="/pricing" className="px-2 py-1.5 rounded transition-colors bg-amber-500/20 hover:bg-amber-500/30 text-amber-400">
                                <LockIcon className="w-4 h-4" />
                            </Link>
                        ) : (
                            <button
                                onClick={handleAddTicker}
                                className="px-2 py-1.5 rounded transition-colors bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400"
                                title={td('searchPlaceholder')}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    {/* Autocomplete Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-white/10 bg-[#0d1829] shadow-2xl overflow-hidden">
                            {suggestions.map((sym, idx) => (
                                <button
                                    key={sym}
                                    onClick={() => selectTicker(sym)}
                                    onMouseEnter={() => setHighlightIdx(idx)}
                                    className={`w-full px-3 py-1.5 text-left text-xs font-mono transition-colors ${
                                        idx === highlightIdx
                                            ? 'bg-cyan-500/20 text-cyan-300'
                                            : 'text-slate-300 hover:bg-white/5'
                                    }`}
                                >
                                    {sym}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* FOMO: Slot limit message */}
            {isAtLimit && tier !== 'elite' && (
                <div className="px-2 py-1.5 border-b border-amber-500/10 bg-amber-500/[0.04]">
                    <Link href="/pricing" className="flex items-center gap-1.5 group">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span className="text-[12px] text-amber-400/80 group-hover:text-amber-300 transition-colors">
                            {tier === 'free' || tier === 'guest'
                                ? gt('watchlistUpgradePro', { count: TIER_MAX_SLOTS.pro })
                                : gt('watchlistUpgradeElite', { count: TIER_MAX_SLOTS.elite })}
                        </span>
                    </Link>
                </div>
            )}
            {/* Column Headers — TradingView style */}
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_72px_58px_58px] items-center gap-x-1.5 pl-[14px] pr-[32px] py-1.5 border-b border-white/5">
                <span className="text-[12px] font-jakarta uppercase tracking-wider text-slate-300">Symbol</span>
                <span className="text-[12px] font-jakarta uppercase tracking-wider text-slate-300 text-center">Last</span>
                <span className="text-[12px] font-jakarta uppercase tracking-wider text-slate-300 text-center">Chg%</span>
                <span className="text-[12px] font-jakarta uppercase tracking-wider text-slate-300 text-center">{extHeaderLabel}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-1 py-0.5 space-y-0">
                {tickerList.map(ticker => (
                    <WatchlistItem
                        key={ticker}
                        ticker={ticker}
                        isSelected={ticker === selectedTicker}
                    />
                ))}
            </div>
        </div>
    );
}

// Main Chart Panel (GEX & Max Pain) - Uses FlowRadar and StockChart
function MainChartPanel() {
    const td = useTranslations('dashboard');
    const gt = useTranslations('gate');
    const { tier } = useTier();
    const customize = useCardCustomize(tier);
    const isMobile = useMobile();
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    // [PERF FIX] Subscribe only to the selected ticker's data, not all tickers
    const data = useDashboardStore(s => s.tickers[s.selectedTicker]);

    // Fetch chart history for StockChart
    const [chartHistory, setChartHistory] = useState<{ date: string; close: number }[]>([]);
    const [chartLoading, setChartLoading] = useState(true);
    const [prevClose, setPrevClose] = useState<number | undefined>(undefined);



    // [S-78] Daily history for premium table (5 days)
    const [dailyHistory, setDailyHistory] = useState<{
        date: string;
        close: number;
        changePct?: number;
        volume?: number;
        vwap?: number;
        gapPct?: number;
        rangePct?: number;
    }[]>([]);

    // Fetch prevClose from unified store data (no separate API call needed)
    useEffect(() => {
        if (data?.prevClose != null) {
            setPrevClose(data.prevClose);
        }
    }, [data?.prevClose]);

    // [S-78] Fetch daily history for premium table — with client-side cache
    const dailyHistoryCacheRef = React.useRef<Map<string, typeof dailyHistory>>(new Map());
    useEffect(() => {
        if (!selectedTicker) return;
        // Check cache first — instant display for revisited tickers
        const cached = dailyHistoryCacheRef.current.get(selectedTicker);
        if (cached) {
            setDailyHistory(cached);
            return;
        }
        const fetchDailyHistory = async () => {
            try {
                const res = await fetch(`/api/dashboard/daily-history?t=${selectedTicker}&days=5`);
                if (res.ok) {
                    const json = await res.json();
                    const data = json.data || [];
                    dailyHistoryCacheRef.current.set(selectedTicker, data);
                    setDailyHistory(data);
                }
            } catch (e) {
                console.error('[Dashboard] Daily history fetch error:', e);
            }
        };
        setDailyHistory([]);
        fetchDailyHistory();
    }, [selectedTicker]);

    // Fetch chart data for StockChart
    // [P2 FIX] Optimistic update: keep previous chart visible during ticker switch (no flicker)
    // Only show loading spinner on very first load when no chart data exists
    const lastTickerRef = React.useRef<string | null>(null);
    // [PERF] Client-side chart cache — instant display on ticker revisit
    const chartCacheRef = React.useRef<Map<string, { data: any[]; ts: number }>>(new Map());
    const CHART_CACHE_TTL_MS = 60_000; // 60s — fresh data, but instant on revisit

    // [SPEED] Prefetch ALL watchlist charts in parallel on mount
    // → Every ticker click is instant (cache always warm)
    const prefetchedRef = React.useRef(false);
    const dashboardTickers = useDashboardStore(s => s.dashboardTickers);
    useEffect(() => {
        if (prefetchedRef.current || dashboardTickers.length === 0) return;
        prefetchedRef.current = true;
        // Fire-and-forget parallel fetch for ALL watchlist tickers
        const prefetchAll = async () => {
            const promises = dashboardTickers.map(async (t) => {
                if (chartCacheRef.current.has(t)) return; // already cached
                try {
                    const res = await fetch(`/api/chart?symbol=${t}&range=1d`);
                    if (res.ok) {
                        const json = await res.json();
                        const d = json.data || [];
                        if (d.length > 0) {
                            chartCacheRef.current.set(t, { data: d, ts: Date.now() });
                        }
                    }
                } catch { /* silent */ }
            });
            await Promise.all(promises);
        };
        prefetchAll();
    }, [dashboardTickers]);

    const fetchChartData = useCallback(async () => {
        if (!selectedTicker) return;
        try {
            const res = await fetch(`/api/chart?symbol=${selectedTicker}&range=1d`);
            if (res.ok) {
                const json = await res.json();
                const newData = json.data || [];
                if (newData.length > 0) {
                    setChartHistory(newData);
                    // Update client-side cache
                    chartCacheRef.current.set(selectedTicker, { data: newData, ts: Date.now() });
                }
            }
        } catch (e) {
            console.error('[Dashboard] Chart fetch error:', e);
        }
        setChartLoading(false);
    }, [selectedTicker]);

    useEffect(() => {
        // [FIX] On ticker change, check client-side cache first (instant from prefetch)
        if (lastTickerRef.current && lastTickerRef.current !== selectedTicker) {
            const cached = chartCacheRef.current.get(selectedTicker);
            if (cached && (Date.now() - cached.ts) < CHART_CACHE_TTL_MS) {
                // ✅ Cache hit — instant display, no spinner
                setChartHistory(cached.data);
                setChartLoading(false);
            } else {
                // ❌ Cache miss — keep previous chart visible while loading (no flicker)
                if (chartHistory.length === 0) {
                    setChartLoading(true);
                }
            }
        } else if (!lastTickerRef.current) {
            // First mount — check prefetch cache
            const cached = chartCacheRef.current.get(selectedTicker);
            if (cached) {
                setChartHistory(cached.data);
                setChartLoading(false);
            }
        }
        lastTickerRef.current = selectedTicker;

        // Show spinner only on initial empty state (very first load)
        if (chartHistory.length === 0) setChartLoading(true);
        fetchChartData();

        // Silent background refresh every 15s
        const interval = setInterval(() => fetchChartData(), 15000);

        // [P2 FIX] Debounced handler for visibility + focus events
        // Without debounce, tab switch triggers BOTH visibilitychange + focus → 2x fetch
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchChartData(), 500);
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') debouncedRefresh();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', debouncedRefresh);

        return () => {
            clearInterval(interval);
            if (debounceTimer) clearTimeout(debounceTimer);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', debouncedRefresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTicker]);

    const isPositive = (data?.changePercent || 0) >= 0;
    const gexDisplay = data?.netGex
        ? `${data.netGex > 0 ? '+' : ''}${(data.netGex / 1e9).toFixed(2)}B`
        : "—";



    return (
        <div className="flex flex-col h-full" data-dashboard-main>
            {/* Header — Mobile/Desktop DOM bifurcation */}
            {isMobile ? null : (
            /* ===== DESKTOP HEADER — 100% PRESERVED, UNTOUCHED ===== */
            <div className="flex items-center justify-between p-4 border-b border-white/5 flex-wrap gap-2" data-dashboard-hero>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700 flex items-center justify-center overflow-hidden relative">
                        <img
                            loading="lazy"
                            decoding="async"
                            src={`/api/logo/${selectedTicker}`}
                            alt={selectedTicker}
                            className="w-5 h-5 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="text-[9px] font-bold text-slate-500 absolute">{selectedTicker?.slice(0, 2)}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">{selectedTicker}</h2>
                    {/* [CENTRALIZED] Main Price Display (Command style) */}
                    {(() => {
                        const p = calcPriceDisplay({
                            livePrice: data?.display?.price || data?.underlyingPrice,
                            liveChangePct: data?.display?.changePctPct ?? data?.changePercent,
                            apiDisplayPrice: data?.display?.price || data?.underlyingPrice,
                            apiDisplayChangePct: data?.display?.changePctPct ?? data?.intradayChangePct ?? data?.changePercent,
                            session: data?.session || 'CLOSED',
                            prevRegularClose: data?.prevRegularClose,
                            prevClose: data?.prevClose,
                            regularCloseToday: data?.regularCloseToday,
                            prevChangePct: data?.prevChangePct,
                            fallbackChangePct: data?.intradayChangePct ?? data?.changePercent ?? 0,
                            lastTrade: data?.underlyingPrice,
                            extended: data?.extended,
                            prices: { prePrice: data?.extended?.prePrice, postPrice: data?.extended?.postPrice },
                        });

                        return (
                            <PriceDisplay
                                intradayPrice={p.displayPrice}
                                intradayChangePct={p.displayChangePct}
                                extendedPrice={p.activeExtPrice}
                                extendedChangePct={p.activeExtPct}
                                extendedLabel={p.activeExtLabel}
                                sessionStatus={data?.session === 'CLOSED' ? 'CLOSED' : ''}
                                size="lg"
                                showExtended={p.activeExtPrice > 0}
                            />
                        );
                    })()}
                </div>

                {/* Status Badges + Alert + Customize Buttons */}
                <div className="flex items-center gap-2">
                    {/* Customize Button — prominent border */}
                    {(tier === 'pro' || tier === 'elite') && (
                        <button
                            onClick={() => customize.isEditing ? customize.setIsEditing(false) : customize.setIsEditing(true)}
                            className={`flex items-center gap-1.5 px-3 py-0.5 rounded-md text-[12px] font-medium transition-all ${customize.isEditing
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/60 shadow-[0_0_8px_rgba(34,211,238,0.25)]'
                                : 'bg-slate-800/60 text-slate-300 border border-cyan-500/30 hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:shadow-[0_0_6px_rgba(34,211,238,0.15)]'
                                }`}
                        >
                            {customize.isEditing ? (
                                <><Check className="w-3.5 h-3.5" /> Done</>
                            ) : (
                                <><Settings className="w-3.5 h-3.5" /> Customize</>
                            )}
                        </button>
                    )}
                    {data?.isGammaSqueeze && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg animate-squeeze-glow">
                            <Zap className="w-4 h-4 text-indigo-400 animate-pulse" />
                            <span className="text-xs font-bold uppercase text-indigo-400">GAMMA SQUEEZE</span>
                        </div>
                    )}
                    {data?.netGex && Math.abs(data.netGex) > 1000000000 && !data.isGammaSqueeze && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg animate-whale-glow">
                            <Target className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-bold uppercase text-amber-400">WHALE</span>
                        </div>
                    )}
                </div>
            </div>
            )}


            {/* ═══════ Metrics Grid: 3 Rows × 4 Cards ═══════ */}
            {/* [CUSTOMIZE] Select Cards button (only visible in edit mode) */}
            {customize.isEditing && (
                <div className="px-4 pt-3 pb-1 flex items-center justify-end gap-2">
                    <button
                        onClick={() => customize.setShowSelector(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium bg-slate-800/50 text-slate-400 border border-white/5 hover:border-white/10 transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" /> Select Cards
                    </button>
                </div>
            )}
            {customize.showSelector && (
                <customize.CardSelectorModal
                    visibleCards={customize.cardOrder}
                    onToggleCard={customize.toggleCard}
                    onClose={() => customize.setShowSelector(false)}
                    tier={tier}
                />
            )}
            <div className="px-4 pb-4 flex flex-col gap-1">
                {/* ── ROW 1: 구조 판단 (Structure) ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-dashboard-cards>
                    {/* Net GEX — PRO (peek: number visible, interpretation blurred) */}
                    {customize.cardOrder.includes('netGex') && <ProGate title="Net GEX" mode="peek" compact tooltipPosition="above" description={gt('descNetGamma')}>
                        <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${(data?.netGex || 0) < 0 ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {(data?.netGex || 0) < 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                            <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 50 Q12 20 24 35 T48 25 T72 40 T96 15" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /><path d="M0 55 Q16 40 32 45 T64 35 T96 30" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-300" /></svg>
                            <div className="relative z-10 flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Activity className="w-4 h-4 text-amber-400" />
                                <CardTooltip text={td('tipNetGex')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Net GEX</span></CardTooltip>
                            </div>
                            <div className="relative z-10 flex items-center gap-2">
                                <span className={`text-xl font-mono font-bold ${(data?.netGex || 0) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {gexDisplay}
                                </span>
                                <span className="text-xs text-white">{(data?.netGex || 0) > 0 ? td('gexStableInterpret') : td('gexVolatileInterpret')}</span>
                            </div>
                            {/* Net GEX Magnitude Bar — centered at zero */}
                            {(() => {
                                const gex = data?.netGex || 0;
                                const absGex = Math.abs(gex);
                                const maxScale = 5e9; // 5B scale
                                const pct = Math.min(absGex / maxScale * 50, 50);
                                return (
                                    <div className="relative z-10 mt-2">
                                        <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                                            {gex >= 0 ? (
                                                <div className="absolute top-0 h-full rounded-r-full bg-emerald-400/70"
                                                    style={{ left: '50%', width: `${pct}%` }} />
                                            ) : (
                                                <div className="absolute top-0 h-full rounded-l-full bg-rose-400/70"
                                                    style={{ left: `${50 - pct}%`, width: `${pct}%` }} />
                                            )}
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[12px] text-slate-300">-5B</span>
                                            <span className="text-[12px] text-slate-300">0</span>
                                            <span className="text-[12px] text-slate-300">+5B</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </ProGate>}

                    {/* Gamma Flip — PRO (blur: SpotGamma core data) */}
                    {customize.cardOrder.includes('gammaFlip') && <ProGate title="Gamma Flip" mode="blur" compact tooltipPosition="above" description={gt('descGexRegime')}>
                        <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${data?.gammaFlipLevel && (data?.underlyingPrice ?? 0) > 0 && data.underlyingPrice! < data.gammaFlipLevel ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {data?.gammaFlipLevel && (data?.underlyingPrice ?? 0) > 0 && data.underlyingPrice! < data.gammaFlipLevel && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                            <svg className="absolute right-1 bottom-1 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><circle cx="40" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400" /><line x1="40" y1="5" x2="40" y2="59" stroke="currentColor" strokeWidth="1" className="text-cyan-300" strokeDasharray="3 3" /><line x1="13" y1="32" x2="67" y2="32" stroke="currentColor" strokeWidth="1" className="text-cyan-300" strokeDasharray="3 3" /></svg>
                            <div className="relative z-10 flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Radio className="w-4 h-4 text-cyan-400" />
                                <CardTooltip text={td('tipGammaFlip')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Gamma Flip</span></CardTooltip>
                            </div>
                            <div className="relative z-10 flex items-center gap-2">
                                <span className="text-xl font-mono font-bold text-white">
                                    ${data?.gammaFlipLevel?.toFixed(0) || "—"}
                                </span>
                                {data?.gammaFlipLevel && (data?.underlyingPrice ?? 0) > 0 && (
                                    <span className={`text-xs font-medium ${data.underlyingPrice! > data.gammaFlipLevel ? "text-emerald-400" : "text-rose-400"}`}>
                                        {data.underlyingPrice! > data.gammaFlipLevel ? "LONG" : "SHORT"}
                                    </span>
                                )}
                            </div>
                            {/* Gamma Flip Distance Bar — price position relative to flip level */}
                            {data?.gammaFlipLevel && (data?.underlyingPrice ?? 0) > 0 && (() => {
                                const flip = data.gammaFlipLevel;
                                const price = data.underlyingPrice!;
                                const dist = ((price - flip) / flip) * 100;
                                const rangeMin = flip * 0.95;
                                const rangeMax = flip * 1.05;
                                const span = rangeMax - rangeMin;
                                const flipPos = span > 0 ? ((flip - rangeMin) / span * 100) : 50;
                                const pricePos = span > 0 ? Math.max(0, Math.min(100, ((price - rangeMin) / span * 100))) : 50;
                                const isLong = price > flip;
                                return (
                                    <div className="relative z-10 mt-2">
                                        <div className="relative h-1.5 bg-slate-700 rounded-full overflow-visible">
                                            {/* Short zone (left of flip) */}
                                            <div className="absolute left-0 top-0 h-full rounded-l-full bg-rose-500/30" style={{ width: `${flipPos}%` }} />
                                            {/* Long zone (right of flip) */}
                                            <div className="absolute top-0 h-full rounded-r-full bg-emerald-500/30" style={{ left: `${flipPos}%`, width: `${100 - flipPos}%` }} />
                                            {/* Flip level marker */}
                                            <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-cyan-400 rounded-full" style={{ left: `${flipPos}%` }} />
                                            {/* Price marker */}
                                            <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-white bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]" style={{ left: `${pricePos}%`, transform: 'translate(-50%, -50%)' }} />
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[12px] text-rose-300">SHORT</span>
                                            <span className="text-[12px] text-cyan-300">FLIP</span>
                                            <span className="text-[12px] text-emerald-300">LONG</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </ProGate>}

                    {/* Squeeze — PRO (peek: score visible, interpretation blurred) */}
                    {customize.cardOrder.includes('squeeze') && <ProGate title="Squeeze" fomoMessage={gt('fomoSqueeze')} mode="peek" compact tooltipAlign="left" tooltipPosition="above" description={gt('descSqueeze')}>
                        <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${data?.squeezeRisk === 'EXTREME' || data?.squeezeRisk === 'HIGH' ? 'bg-amber-500/15 backdrop-blur-md border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.4)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {(data?.squeezeRisk === 'EXTREME' || data?.squeezeRisk === 'HIGH') && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-400 animate-pulse" />}
                            <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 55 L12 35 L24 50 L36 20 L48 45 L60 15 L72 40 L84 10 L96 30" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /></svg>
                            {(() => {
                                const score = data?.squeezeScore ?? 0;
                                const risk = data?.squeezeRisk ?? 'LOW';
                                const color = risk === 'EXTREME' ? 'text-rose-400' : risk === 'HIGH' ? 'text-amber-400' : risk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400';
                                const bgColor = risk === 'EXTREME' ? 'bg-rose-500/80' : risk === 'HIGH' ? 'bg-amber-500/80' : risk === 'MEDIUM' ? 'bg-yellow-500/80 text-black' : 'bg-emerald-500/80';
                                return (
                                    <>
                                        <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                            <Zap className="w-4 h-4 text-indigo-400" />
                                            <CardTooltip text={td('tipSqueeze')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Squeeze</span></CardTooltip>
                                            <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${bgColor} text-white`}>{risk}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xl font-mono font-bold ${color}`}>{score}%</span>
                                            <span className="text-[12px] text-white">
                                                {score >= 70 ? td('sqzExtreme') : score >= 50 ? td('sqzCaution') : score >= 30 ? td('sqzNormal') : td('sqzStable')}
                                            </span>
                                        </div>
                                        {/* Squeeze Progress Bar */}
                                        <div className="mt-2">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${risk === 'EXTREME' ? 'bg-rose-400' : risk === 'HIGH' ? 'bg-amber-400' : risk === 'MEDIUM' ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                                                    style={{ width: `${Math.min(score, 100)}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[12px] text-slate-300">0%</span>
                                                <span className="text-[12px] text-slate-300">50%</span>
                                                <span className="text-[12px] text-slate-300">100%</span>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </ProGate>}

                    {/* VWAP 거리 (NEW) */}
                    {customize.cardOrder.includes('vwapDist') ? (() => {
                        const price = data?.underlyingPrice || 0;
                        const vwap = data?.vwap || 0;
                        const dist = vwap > 0 && price > 0 ? ((price - vwap) / vwap * 100) : 0;
                        const isAlert = Math.abs(dist) >= 1;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? (dist > 0 ? 'bg-emerald-500/10 backdrop-blur-md border-emerald-400/40 shadow-[0_0_25px_rgba(52,211,153,0.3)]' : 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]') : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${dist > 0 ? 'from-emerald-400 to-emerald-500' : 'from-rose-400 to-rose-500'}`} />}
                                <svg className="absolute right-1 bottom-0 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><rect x="5" y="30" width="10" height="30" rx="2" fill="currentColor" className="text-cyan-400" /><rect x="22" y="18" width="10" height="42" rx="2" fill="currentColor" className="text-cyan-400" /><rect x="39" y="24" width="10" height="36" rx="2" fill="currentColor" className="text-cyan-400" /><rect x="56" y="12" width="10" height="48" rx="2" fill="currentColor" className="text-cyan-400" /></svg>
                                <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                                    <CardTooltip text={td('tipVwapDist')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">{td('vwapDistance')}</span></CardTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-white'}`}>
                                        {vwap > 0 ? `${dist > 0 ? '+' : ''}${dist.toFixed(1)}%` : '—'}
                                    </span>
                                    <span className="text-xs font-mono text-slate-300">
                                        {vwap > 0 ? `$${vwap.toFixed(1)}` : ''}
                                    </span>
                                </div>
                                {/* VWAP Distance Bar — centered divergence */}
                                {vwap > 0 && (() => {
                                    const clampedDist = Math.max(-3, Math.min(3, dist));
                                    const pct = Math.abs(clampedDist) / 3 * 50;
                                    return (
                                        <div className="mt-2">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                                                {clampedDist >= 0 ? (
                                                    <div className="absolute top-0 h-full rounded-r-full bg-emerald-400/70"
                                                        style={{ left: '50%', width: `${pct}%` }} />
                                                ) : (
                                                    <div className="absolute top-0 h-full rounded-l-full bg-rose-400/70"
                                                        style={{ left: `${50 - pct}%`, width: `${pct}%` }} />
                                                )}
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[12px] text-slate-300">-3%</span>
                                                <span className="text-[12px] text-slate-300">VWAP</span>
                                                <span className="text-[12px] text-slate-300">+3%</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })() : null}

                    {/* ── Levels & Institutional ── */}
                    {/* Max Pain — PRO (peek: price visible, % distance blurred) */}
                    {customize.cardOrder.includes('maxPain') && <ProGate title="Max Pain" mode="peek" compact tooltipPosition="above" description={gt('descMaxPain')}>
                        {(() => {
                            const mp = data?.maxPain || 0;
                            const price = data?.underlyingPrice || 0;
                            const cw = data?.levels?.callWall || 0;
                            const pf = data?.levels?.putFloor || 0;
                            const dist = mp > 0 && price > 0 ? ((price - mp) / mp * 100) : 0;
                            const isAbove = dist > 0;
                            const isNear = Math.abs(dist) < 2;
                            const isAlert = isNear && mp > 0;

                            // Range bar calculation (Put Floor to Call Wall)
                            const rangeMin = pf > 0 ? pf : (mp > 0 ? mp * 0.95 : 0);
                            const rangeMax = cw > 0 ? cw : (mp > 0 ? mp * 1.05 : 0);
                            const rangeSpan = rangeMax - rangeMin;
                            const mpPos = rangeSpan > 0 ? ((mp - rangeMin) / rangeSpan * 100) : 50;
                            const pricePos = rangeSpan > 0 ? Math.max(0, Math.min(100, ((price - rangeMin) / rangeSpan * 100))) : 50;

                            return (
                                <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? 'bg-amber-500/10 backdrop-blur-md border-amber-400/40 shadow-[0_0_25px_rgba(251,191,36,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-500" />}
                                    <svg className="absolute right-1 bottom-1 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><circle cx="40" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400" /><circle cx="40" cy="32" r="14" fill="none" stroke="currentColor" strokeWidth="1" className="text-cyan-300" /><circle cx="40" cy="32" r="3" fill="currentColor" className="text-cyan-400" /></svg>
                                    <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                        <Target className="w-4 h-4 text-cyan-400" />
                                        <CardTooltip text={td('tipMaxPain')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Max Pain</span></CardTooltip>
                                        {isNear && mp > 0 && <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-amber-500/80 text-white">PIN</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl font-mono font-bold text-white">${mp || "—"}</span>
                                        {mp > 0 && price > 0 && (
                                            <span className={`text-[12px] font-mono font-semibold ${isAbove ? "text-emerald-400" : "text-rose-400"}`}>
                                                {isAbove ? '▲' : '▼'} {Math.abs(dist).toFixed(1)}%
                                            </span>
                                        )}
                                    </div>

                                    {/* Range Bar: Put Floor — Max Pain — Call Wall */}
                                    {mp > 0 && rangeSpan > 0 && (
                                        <div className="mt-3">
                                            <div className="relative h-2 bg-slate-700 rounded-full overflow-visible">
                                                {/* Put Floor → Max Pain zone (bearish side) */}
                                                <div className="absolute left-0 top-0 h-full rounded-l-full bg-rose-500/30" style={{ width: `${mpPos}%` }} />
                                                {/* Max Pain → Call Wall zone (bullish side) */}
                                                <div className="absolute top-0 h-full rounded-r-full bg-emerald-500/30" style={{ left: `${mpPos}%`, width: `${100 - mpPos}%` }} />
                                                {/* Max Pain marker */}
                                                <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-amber-400 rounded-full" style={{ left: `${mpPos}%` }} />
                                                {/* Current price marker — centered on bar */}
                                                <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-white bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]" style={{ left: `${pricePos}%`, transform: 'translate(-50%, -50%)' }} />
                                            </div>
                                            <div className="flex justify-between mt-1.5">
                                                <span className="text-[12px] font-mono text-rose-300">{pf > 0 ? `$${pf}` : ''}</span>
                                                <span className="text-[12px] font-mono text-amber-300">MP</span>
                                                <span className="text-[12px] font-mono text-emerald-300">{cw > 0 ? `$${cw}` : ''}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </ProGate>}

                    {/* Call Wall / Put Floor — PRO (blur: options level data) */}
                    {customize.cardOrder.includes('callPutWall') && <ProGate title="Call Wall / Put Floor" fomoMessage={gt('fomoDashCallPut')} mode="blur" compact tooltipPosition="above" description={gt('descPutFloorCallWall')}>
                        {(() => {
                            const cw = data?.levels?.callWall || 0;
                            const pf = data?.levels?.putFloor || 0;
                            const price = data?.underlyingPrice || 0;
                            const cwDist = cw > 0 && price > 0 ? ((cw - price) / price * 100) : 0;
                            const pfDist = pf > 0 && price > 0 ? ((price - pf) / price * 100) : 0;
                            const range = cw - pf;
                            const pricePos = range > 0 && price > 0 ? Math.max(0, Math.min(100, ((price - pf) / range * 100))) : 50;
                            return (
                                <div className="relative p-4 bg-[#0d1829]/80 rounded-xl border border-white/5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15">
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><line x1="0" y1="20" x2="96" y2="20" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" /><line x1="0" y1="44" x2="96" y2="44" stroke="currentColor" strokeWidth="1.5" className="text-rose-400" /><line x1="0" y1="32" x2="96" y2="32" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-white" /></svg>
                                    <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                                        <div className="flex flex-col leading-tight">
                                            <CardTooltip text={td('tipCallPutWall')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Call Wall</span></CardTooltip>
                                            <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Put Floor</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-mono font-bold text-emerald-400">${cw || "—"}</span>
                                        <span className="text-slate-500">/</span>
                                        <span className="text-lg font-mono font-bold text-rose-400">${pf || "—"}</span>
                                    </div>
                                    {cw > 0 && pf > 0 && price > 0 && (
                                        <div className="mt-2.5">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-visible">
                                                <div className="absolute left-0 top-0 h-full rounded-l-full bg-rose-500/40" style={{ width: `${pricePos}%` }} />
                                                <div className="absolute top-0 h-full rounded-r-full bg-emerald-500/40" style={{ left: `${pricePos}%`, width: `${100 - pricePos}%` }} />
                                                <div className="absolute top-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]" style={{ left: `${pricePos}%`, transform: 'translate(-50%, -50%)' }} />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[12px] font-mono text-rose-300">↓{pfDist.toFixed(1)}%</span>
                                                <span className="text-[12px] font-mono text-emerald-300">↑{cwDist.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </ProGate>}

                    {/* Dark Pool % — PRO (blur: institutional data, FlowAlgo $149) */}
                    {customize.cardOrder.includes('darkPool') && <ProGate title="Dark Pool %" fomoMessage={gt('fomoDarkPool')} mode="blur" compact tooltipAlign="left" tooltipPosition="above" description={gt('descDarkPool')}>
                        {(() => {
                            const dp = data?.darkPoolPct ?? 0;
                            const isAlert = dp >= 45;
                            const sessionLabel = data?.session === 'PRE' ? 'PRE' : data?.session === 'POST' ? 'POST' : null;
                            const sessionColor = data?.session === 'PRE' ? 'text-amber-400 bg-amber-500/20 border-amber-500/30'
                                : 'text-purple-400 bg-purple-500/20 border-purple-500/30';
                            return (
                                <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? 'bg-purple-500/10 backdrop-blur-md border-purple-400/40 shadow-[0_0_25px_rgba(168,85,247,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-400 to-purple-500" />}
                                    <svg className="absolute right-1 bottom-1 w-20 h-14 opacity-[0.06]" viewBox="0 0 80 56">{[0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={10 + i * 12} cy={10 + ((i * 17) % 30)} r="3" fill="currentColor" className="text-purple-400" />)}<path d="M10 10 L22 27 L34 20 L46 37 L58 14 L70 40" fill="none" stroke="currentColor" strokeWidth="1" className="text-purple-300" /></svg>
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Activity className="w-4 h-4 text-purple-400" />
                                            <CardTooltip text={td('tipDarkPool')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Dark Pool %</span></CardTooltip>
                                        </div>
                                        {dp >= 55 && <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-purple-500/80 text-white">HIGH</span>}
                                        {sessionLabel && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sessionColor}`}>{sessionLabel}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${dp >= 55 ? 'text-purple-400' : dp >= 45 ? 'text-purple-300' : 'text-white'}`}>
                                            {dp > 0 ? `${dp.toFixed(1)}%` : '—'}
                                        </span>
                                        <span className="text-xs text-white">{dp >= 55 ? td('dpInstitutionalHigh') : dp >= 45 ? td('dpInstitutionalActive') : td('dpNormal')}</span>
                                    </div>
                                    {/* Dark Pool Level Bar */}
                                    {dp > 0 && (
                                        <div className="mt-2">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${dp >= 55 ? 'bg-purple-400' : dp >= 45 ? 'bg-purple-300' : 'bg-slate-400'}`}
                                                    style={{ width: `${Math.min(dp, 100)}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[12px] text-slate-300">0%</span>
                                                <span className="text-[12px] text-slate-300">45%</span>
                                                <span className="text-[12px] text-slate-300">100%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </ProGate>}

                    {/* Short Vol % — PRO (blur: Ortex $49-149) */}
                    {customize.cardOrder.includes('shortVol') && <ProGate title="Short Vol %" fomoMessage={gt('fomoShortVol')} mode="blur" compact tooltipAlign="left" tooltipPosition="above" description={gt('descShortVol')}>
                        {(() => {
                            const sv = data?.shortVolPct ?? 0;
                            const dp = data?.darkPoolPct ?? 0;
                            const isAlert = sv >= 40;
                            const svHigh = sv >= 40;
                            const dpHigh = dp >= 40;
                            const crossSignal = svHigh && dpHigh ? { label: td('svCrossInstShort'), color: 'text-rose-400' }
                                : !svHigh && dpHigh ? { label: td('svCrossStealth'), color: 'text-emerald-400' }
                                    : svHigh && !dpHigh ? { label: td('svCrossRetailShort'), color: 'text-amber-400' }
                                        : { label: td('svCrossNeutral'), color: 'text-slate-400' };
                            return (
                                <div className={`relative py-3 px-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                                    <svg className="absolute right-1 bottom-0 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><rect x="5" y="10" width="10" height="50" rx="2" fill="currentColor" className="text-rose-400" /><rect x="22" y="20" width="10" height="40" rx="2" fill="currentColor" className="text-rose-400" /><rect x="39" y="28" width="10" height="32" rx="2" fill="currentColor" className="text-rose-400" /><rect x="56" y="36" width="10" height="24" rx="2" fill="currentColor" className="text-rose-300" /></svg>
                                    <div className="flex items-center gap-2 mb-1 whitespace-nowrap">
                                        <TrendingDown className="w-4 h-4 text-rose-400" />
                                        <CardTooltip text={td('tipShortVol')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Short Vol %</span></CardTooltip>
                                        {sv >= 50 && <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-rose-500/80 text-white">HIGH</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${sv >= 50 ? 'text-rose-400' : sv >= 40 ? 'text-amber-400' : 'text-white'}`}>
                                            {sv > 0 ? `${sv.toFixed(1)}%` : '—'}
                                        </span>
                                        <span className="text-[12px] text-white">{sv >= 50 ? td('svShortHigh') : sv >= 40 ? td('svShortActive') : td('svNormal')}</span>
                                    </div>
                                    {sv > 0 && dp > 0 && (
                                        <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap overflow-hidden">
                                            <span className="text-[12px] text-slate-300">vs DP {dp.toFixed(0)}%</span>
                                            <span className="text-[12px] text-slate-300">→</span>
                                            <span className={`text-[12px] font-semibold truncate ${crossSignal.color}`}>{crossSignal.label}</span>
                                        </div>
                                    )}
                                    {sv > 0 && (
                                        <div className="mt-2">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${sv >= 50 ? 'bg-rose-400' : sv >= 40 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                    style={{ width: `${Math.min(sv, 100)}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[10px] text-slate-300">0%</span>
                                                <span className="text-[10px] text-slate-300">40%</span>
                                                <span className="text-[10px] text-slate-300">100%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </ProGate>}

                    {/* ── Volatility & Intraday ── */}
                    {/* ATM IV — PRO (blur: advanced volatility surface, QuantData $99) */}
                    {customize.cardOrder.includes('atmIv') && <ProGate title="ATM IV" fomoMessage={gt('fomoAtmIv')} mode="blur" compact tooltipPosition="above" description={gt('descIvSkew')}>
                        <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${(data?.atmIv || 0) > 50 ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {(data?.atmIv || 0) > 50 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                            <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 32 Q12 10 24 32 T48 32 T72 32 T96 32" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400" /><path d="M0 32 Q12 48 24 32 T48 32 T72 32 T96 32" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-300" strokeDasharray="3 3" /></svg>
                            <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Activity className="w-4 h-4 text-purple-400" />
                                <CardTooltip text={td('tipAtmIv')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">ATM IV</span></CardTooltip>
                                <span className="text-[12px] text-white">{td('impliedVol')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-mono font-bold text-white">
                                    {data?.atmIv ? `${data.atmIv}%` : "—"}
                                </span>
                                <span className="text-[12px] text-white">{(data?.atmIv || 0) > 50 ? td('highVol') : td('lowVol')}</span>
                                {data?.atmIvExpiry && (
                                    <span className="text-[12px] text-yellow-400 font-mono font-semibold">
                                        {data.atmIvExpiry.slice(5).replace('-', '/')}
                                    </span>
                                )}
                            </div>
                            {/* IV Level Bar */}
                            {data?.atmIv != null && data.atmIv > 0 && (
                                <div className="mt-2">
                                    <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={`absolute left-0 top-0 h-full rounded-full transition-all ${data.atmIv >= 60 ? 'bg-rose-400' : data.atmIv >= 40 ? 'bg-amber-400' : 'bg-emerald-400'
                                                }`}
                                            style={{ width: `${Math.min(data.atmIv, 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-[12px] text-slate-300">0%</span>
                                        <span className="text-[12px] text-slate-300">50%</span>
                                        <span className="text-[12px] text-slate-300">100%</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ProGate>}

                    {/* P/C Ratio (VOLUME) - matches Flow page */}
                    {customize.cardOrder.includes('pcRatio') ? (() => {
                        const vpcr = data?.volumePcr ?? null;  // Instant from unified API cache
                        const isAlert = vpcr !== null && (vpcr >= 2.0 || vpcr <= 0.5);
                        const label = vpcr === null ? '—' : vpcr >= 2.0 ? td('pcrStrongCall') : vpcr >= 1.3 ? td('pcrCall') : vpcr <= 0.5 ? td('pcrStrongPut') : vpcr <= 0.75 ? td('pcrPut') : td('pcrBalanced');
                        const isBullish = vpcr !== null && vpcr >= 1.3;
                        const isBearish = vpcr !== null && vpcr <= 0.75;
                        const color = isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-white';
                        const callVol = data?.volumePcrCallVol ?? 0;
                        const putVol = data?.volumePcrPutVol ?? 0;
                        const hasVolData = callVol > 0 || putVol > 0;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? (isBullish ? 'bg-emerald-500/10 backdrop-blur-md border-emerald-400/40 shadow-[0_0_25px_rgba(52,211,153,0.3)]' : 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]') : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${isBullish ? 'from-emerald-400 to-emerald-500' : 'from-rose-400 to-rose-500'}`} />}
                                <svg className="absolute right-1 bottom-0 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><rect x="15" y="8" width="18" height="52" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" /><rect x="47" y="8" width="18" height="52" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-rose-400" /><line x1="0" y1="34" x2="80" y2="34" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-white" /></svg>
                                <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                    {isBullish ? (
                                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                                    ) : isBearish ? (
                                        <TrendingDown className="w-4 h-4 text-rose-400" />
                                    ) : (
                                        <Activity className="w-4 h-4 text-slate-400" />
                                    )}
                                    <CardTooltip text={td('tipPcRatio')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">P/C Ratio</span></CardTooltip>
                                    <span className="text-[12px] text-cyan-400 font-medium">VOLUME</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${color}`}>
                                        {vpcr !== null ? vpcr.toFixed(2) : '—'}
                                    </span>
                                    <span className={`text-sm font-bold ${color}`}>{label}</span>
                                </div>
                                {hasVolData && (
                                    <>
                                        <span className="text-[12px] text-white font-mono mt-1 block">
                                            C {(callVol / 1000).toFixed(0)}K / P {(putVol / 1000).toFixed(0)}K
                                        </span>
                                        {/* Call vs Put Volume Proportion Bar */}
                                        <div className="mt-2">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div className="absolute left-0 top-0 h-full rounded-l-full bg-emerald-400/60"
                                                    style={{ width: `${(callVol / (callVol + putVol)) * 100}%` }} />
                                                <div className="absolute top-0 h-full rounded-r-full bg-rose-400/60"
                                                    style={{ left: `${(callVol / (callVol + putVol)) * 100}%`, width: `${(putVol / (callVol + putVol)) * 100}%` }} />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[12px] text-emerald-300">Call</span>
                                                <span className="text-[12px] text-rose-300">Put</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })() : null}

                    {/* GEX REGIME — PRO (blur: SpotGamma Pro $249) */}
                    {customize.cardOrder.includes('gexRegime') && <EliteGate title="GEX Regime" fomoMessage={gt('fomoDashGexRegime')} compact tooltipAlign="left" tooltipPosition="above" description={gt('descGexRegime')}>
                        {(() => {
                            const price = data?.underlyingPrice || 0;
                            const flip = data?.gammaFlipLevel || 0;
                            const gex = data?.netGex || 0;
                            const atmConc = data?.gammaConcentration || 0;
                            const isLong = gex >= 0;
                            let regime: 'STABLE' | 'TRANSITION' | 'FLIP_ZONE' | 'EXPLOSIVE' = isLong ? 'STABLE' : 'EXPLOSIVE';
                            let flipDist = 0;
                            let flipDir = '';
                            let flipDistWeight = isLong ? 1.0 : 0.3;

                            if (flip > 0 && price > 0) {
                                flipDist = ((price - flip) / flip) * 100;
                                flipDir = flipDist > 0 ? '↑' : '↓';
                                if (flipDist > 5) { flipDistWeight = 1.2; regime = 'STABLE'; }
                                else if (flipDist > 2) { flipDistWeight = 1.0; regime = 'STABLE'; }
                                else if (flipDist > 0) { flipDistWeight = 0.5; regime = 'TRANSITION'; }
                                else if (flipDist > -2) { flipDistWeight = 0.3; regime = 'FLIP_ZONE'; }
                                else { flipDistWeight = 0.2; regime = 'EXPLOSIVE'; }
                            }

                            // DTE weight (matches FlowRadar exactly)
                            const expStr = data?.expiration;
                            let dte = -1;
                            if (expStr) {
                                const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
                                const todayStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, '0')}-${String(etNow.getDate()).padStart(2, '0')}`;
                                dte = Math.max(0, Math.round((new Date(expStr + 'T16:00:00').getTime() - new Date(todayStr + 'T09:30:00').getTime()) / 86400000));
                            }
                            const dteWeight = dte === 0 ? 1.0 : dte === 1 ? 0.7 : dte <= 3 ? 0.4 : 0.2;

                            // pinStrength = ATM concentration × flip weight × DTE weight (matches FlowRadar)
                            const pinStrength = Math.min(100, Math.round(atmConc * flipDistWeight * dteWeight));

                            const labels: Record<string, string> = { STABLE: td('gexStable'), TRANSITION: td('gexTransition'), FLIP_ZONE: td('gexFlipZone'), EXPLOSIVE: td('gexExplosive') };
                            const colors: Record<string, string> = { STABLE: 'text-emerald-400', TRANSITION: 'text-amber-400', FLIP_ZONE: 'text-orange-400', EXPLOSIVE: 'text-rose-400' };
                            const isAlert = regime === 'EXPLOSIVE' || regime === 'FLIP_ZONE';
                            const absDist = Math.abs(flipDist).toFixed(1);

                            return (
                                <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? 'bg-amber-500/10 backdrop-blur-md border-amber-400/40 shadow-[0_0_25px_rgba(251,191,36,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-500 animate-pulse" />}
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M48 58 A 38 38 0 0 1 10 58" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400" /><path d="M86 58 A 38 38 0 0 1 48 58" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /><circle cx="48" cy="58" r="3" fill="currentColor" className="text-white" /></svg>
                                    <div className="flex items-center gap-1.5 mb-2 whitespace-nowrap">
                                        <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                                        <CardTooltip text={td('tipGexRegime')}><span className="text-[12px] font-jakarta uppercase tracking-wide text-white">GEX Regime</span></CardTooltip>
                                        {expStr && (
                                            <span className="text-[12px] text-slate-300 font-mono">
                                                {expStr.slice(5)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${colors[regime]}`}>{pinStrength}%</span>
                                        <span className={`text-xs font-bold ${colors[regime]}`}>{labels[regime]}</span>
                                    </div>
                                    <span className="text-[12px] text-white font-mono block mt-0.5">
                                        {flip > 0 ? `FLIP $${flip.toFixed(0)} (${flipDir}${absDist}%)` : isLong ? td('gexLongGamma') : td('gexShortGamma')}
                                    </span>
                                    {/* GEX Regime Mini Gauge */}
                                    <div className="mt-2">
                                        <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`absolute left-0 top-0 h-full rounded-full transition-all ${regime === 'EXPLOSIVE' ? 'bg-rose-400' : regime === 'FLIP_ZONE' ? 'bg-orange-400' : regime === 'TRANSITION' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                style={{ width: `${pinStrength}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </EliteGate>}

                    {/* Implied Move — ELITE (blur: advanced derivatives) */}
                    {customize.cardOrder.includes('impliedMove') && <EliteGate title="Implied Move" fomoMessage={gt('fomoDashImpliedMove')} mode="blur" compact tooltipAlign="left" tooltipPosition="above" description={gt('descImpliedMove')}>
                        {(() => {
                            const im = data?.impliedMovePct ?? 0;
                            const dir = data?.impliedMoveDir ?? 'neutral';
                            const isAlert = im >= 3;
                            return (
                                <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isAlert ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M30 32 L10 20 M30 32 L10 44 M66 32 L86 20 M66 32 L86 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-cyan-400" /><line x1="30" y1="32" x2="66" y2="32" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-cyan-300" /></svg>
                                    <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                        <Activity className="w-4 h-4 text-cyan-400" />
                                        <CardTooltip text={td('tipImpliedMove')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Implied Move</span></CardTooltip>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${im >= 5 ? 'text-cyan-400' : im >= 3 ? 'text-cyan-300' : 'text-white'}`}>
                                            {im > 0 ? `±${im}%` : '—'}
                                        </span>
                                        {im >= 5 ? (
                                            <span className="text-[12px] font-bold px-1 py-0.5 rounded bg-cyan-500/80 text-white">{td('imSpike')}</span>
                                        ) : im >= 3 ? (
                                            <span className="text-xs text-cyan-300">{td('imVolatility')}</span>
                                        ) : (
                                            <span className="text-xs text-slate-400">{td('imStable')}</span>
                                        )}
                                    </div>
                                    <span className="text-[12px] text-white block mt-0.5">
                                        {dir === 'bullish' ? td('imBullish') : dir === 'bearish' ? td('imBearish') : td('imNeutral')}
                                    </span>
                                    {/* Implied Move Range Bar */}
                                    {im > 0 && (
                                        <div className="mt-2">
                                            <div className="relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                {/* Center point */}
                                                <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                                                {/* Move range spread */}
                                                <div
                                                    className={`absolute top-0 h-full rounded-full ${im >= 5 ? 'bg-cyan-400' : im >= 3 ? 'bg-cyan-400/70' : 'bg-cyan-400/40'}`}
                                                    style={{
                                                        left: `${50 - Math.min(im * 5, 45)}%`,
                                                        width: `${Math.min(im * 10, 90)}%`
                                                    }}
                                                />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[12px] text-slate-300">-{im}%</span>
                                                <span className="text-[12px] text-slate-300">0</span>
                                                <span className="text-[12px] text-slate-300">+{im}%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </EliteGate>}

                    {/* ── Additional Pool ── */}
                    {/* Context Score — PRO */}
                    {customize.cardOrder.includes('alphaScore') && <ProGate title="Context Score" mode="peek" compact tooltipPosition="above" description={gt('descAiDeep')}>
                        {(() => {
                            const alpha = data?.alpha;
                            const score = alpha?.score ?? 0;
                            const grade = alpha?.grade ?? '—';
                            const gradeColor = grade === 'A+' || grade === 'A' ? 'text-emerald-400' : grade === 'B+' || grade === 'B' ? 'text-cyan-400' : grade === 'C' ? 'text-amber-400' : 'text-slate-400';
                            const barWidth = Math.min(Math.abs(score), 100);
                            return (
                                <div className="relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 bg-[#0d1829]/80 border-white/5">
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 50 Q24 10 48 30 T96 15" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400" /></svg>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Crown className="w-4 h-4 text-emerald-400" />
                                        <CardTooltip text={td('tipAlphaScore')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Context Score</span></CardTooltip>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-2xl font-mono font-bold ${gradeColor}`}>{grade}</span>
                                        <span className="text-lg font-mono text-white">{score > 0 ? '+' : ''}{score}</span>
                                    </div>
                                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${score > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${barWidth}%` }} />
                                    </div>
                                    <p className="text-[12px] text-slate-300 mt-1.5">{grade === 'A+' || grade === 'A' ? td('alphaGradeA') : grade === 'B+' || grade === 'B' ? td('alphaGradeB') : grade === 'C' ? td('alphaGradeC') : td('alphaGradeD')}</p>
                                </div>
                            );
                        })()}
                    </ProGate>}

                    {/* Whale Index — PRO */}
                    {customize.cardOrder.includes('whaleIndex') && <ProGate title="Whale Index" mode="blur" compact tooltipPosition="above" description={gt('descAiDeep')}>
                        {(() => {
                            const wi = (data as any)?.whaleIndex ?? 0;
                            const conf = (data as any)?.whaleConfidence ?? '—';
                            const isHigh = Math.abs(wi) >= 50;
                            return (
                                <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isHigh ? 'bg-purple-500/10 border-purple-400/40' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><ellipse cx="48" cy="40" rx="36" ry="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400" /></svg>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Anchor className="w-4 h-4 text-purple-400" />
                                        <CardTooltip text={td('tipWhaleIndex')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Whale Index</span></CardTooltip>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${wi > 0 ? 'text-emerald-400' : wi < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{wi > 0 ? '+' : ''}{wi}</span>
                                        <span className="text-[12px] text-slate-300">{conf}</span>
                                    </div>
                                    <div className="mt-2 relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                                        <div className={`absolute top-0 h-full rounded-full ${wi > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ left: wi > 0 ? '50%' : `${50 - Math.min(Math.abs(wi) / 2, 50)}%`, width: `${Math.min(Math.abs(wi) / 2, 50)}%` }} />
                                    </div>
                                    <p className="text-[12px] text-slate-300 mt-1.5">{wi > 20 ? td('whaleBullish') : wi < -20 ? td('whaleBearish') : td('whaleNeutral')}</p>
                                </div>
                            );
                        })()}
                    </ProGate>}

                    {/* RSI 14 — FREE */}
                    {customize.cardOrder.includes('rsi14') && (() => {
                        const rsi = data?._rsi14 ?? data?.rsi14 ?? null;
                        const isOverbought = rsi !== null && rsi >= 70;
                        const isOversold = rsi !== null && rsi <= 30;
                        const label = rsi === null ? '—' : isOverbought ? td('labelOverbought') : isOversold ? td('labelOversold') : td('labelNeutral');
                        const color = isOverbought ? 'text-rose-400' : isOversold ? 'text-emerald-400' : 'text-slate-300';
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isOverbought || isOversold ? 'bg-amber-500/10 border-amber-400/30' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 32 Q24 10 48 32 T96 32" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /></svg>
                                <div className="flex items-center gap-2 mb-2">
                                    <Gauge className="w-4 h-4 text-amber-400" />
                                    <CardTooltip text={td('tipRsi14')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">RSI 14</span></CardTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${color}`}>{rsi !== null ? rsi.toFixed(1) : '—'}</span>
                                    <span className={`text-[12px] ${color}`}>{label}</span>
                                </div>
                                <div className="mt-2 relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="absolute left-[30%] top-0 w-px h-full bg-emerald-500/30" />
                                    <div className="absolute left-[70%] top-0 w-px h-full bg-rose-500/30" />
                                    {rsi !== null && <div className="absolute top-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]" style={{ left: `${Math.min(rsi, 100)}%`, transform: 'translate(-50%,-50%)' }} />}
                                </div>
                                <p className="text-[12px] text-slate-300 mt-1.5">{isOverbought ? td('rsiOverbought') : isOversold ? td('rsiOversold') : td('rsiNeutralRange')}</p>
                            </div>
                        );
                    })()}

                    {/* Return 3D — FREE */}
                    {customize.cardOrder.includes('return3d') && (() => {
                        const ret = data?._return3D ?? data?.return3D ?? null;
                        const isPositive = ret !== null && ret > 0;
                        return (
                            <div className="relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 bg-[#0d1829]/80 border-white/5">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                                    <CardTooltip text={td('tipReturn3d')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Return 3D</span></CardTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${isPositive ? 'text-emerald-400' : ret !== null ? 'text-rose-400' : 'text-slate-400'}`}>
                                        {ret !== null ? `${ret > 0 ? '+' : ''}${ret.toFixed(2)}%` : '—'}
                                    </span>
                                </div>
                                <div className="mt-2 relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                                    {ret !== null && <div className={`absolute top-0 h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ left: isPositive ? '50%' : `${50 - Math.min(Math.abs(ret) * 5, 50)}%`, width: `${Math.min(Math.abs(ret) * 5, 50)}%` }} />}
                                </div>
                                <p className="text-[12px] text-slate-300 mt-1.5">{ret !== null ? (ret > 1 ? td('ret3dStrong') : ret < -1 ? td('ret3dWeak') : td('ret3dFlat')) : ''}</p>
                            </div>
                        );
                    })()}

                    {/* Rel Volume — FREE */}
                    {customize.cardOrder.includes('relVolume') && (() => {
                        const rv = data?._relVol ?? data?.relVol ?? null;
                        const isHigh = rv !== null && rv >= 2.0;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isHigh ? 'bg-cyan-500/10 border-cyan-400/30' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <BarChart2 className="w-4 h-4 text-cyan-400" />
                                    <CardTooltip text={td('tipRelVolume')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Rel Volume</span></CardTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${isHigh ? 'text-cyan-400' : 'text-white'}`}>{rv !== null ? `${rv.toFixed(1)}x` : '—'}</span>
                                    <span className="text-[12px] text-slate-300">{rv !== null ? (rv >= 2 ? td('labelHigh') : rv >= 1.2 ? td('labelNormal') : td('labelLow')) : ''}</span>
                                </div>
                                <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-cyan-500/60 transition-all" style={{ width: `${rv !== null ? Math.min(rv * 25, 100) : 0}%` }} />
                                </div>
                                <p className="text-[12px] text-slate-300 mt-1.5">{rv !== null ? (rv >= 2 ? td('relVolHigh') : rv >= 1.2 ? td('relVolNormal') : td('relVolLow')) : ''}</p>
                            </div>
                        );
                    })()}

                    {/* OPI — FREE (pricing matrix: full access) */}
                    {customize.cardOrder.includes('opi') && <>
                        {(() => {
                            const pcr = data?.volumePcr ?? data?.pcr ?? null;
                            const gex = data?.netGex ?? null;
                            const opi = pcr !== null && gex !== null ? Math.round(((pcr > 1 ? -1 : 1) * 50) + ((gex ?? 0) > 0 ? 20 : -20)) : null;
                            return (
                                <div className="relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 bg-[#0d1829]/80 border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Layers className="w-4 h-4 text-indigo-400" />
                                        <CardTooltip text={td('tipOpi')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">OPI</span></CardTooltip>
                                        <span className="text-[12px] text-slate-500">Options Position</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${(opi ?? 0) > 0 ? 'text-emerald-400' : (opi ?? 0) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                            {opi !== null ? `${opi > 0 ? '+' : ''}${opi}` : '—'}
                                        </span>
                                    </div>
                                    <div className="mt-2 relative h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                                    </div>
                                    <p className="text-[12px] text-slate-300 mt-1.5">{(opi ?? 0) > 0 ? td('opiCallPressure') : (opi ?? 0) < 0 ? td('opiPutPressure') : td('opiBalanced')}</p>
                                </div>
                            );
                        })()}
                    </>}

                    {/* Smart Money — ELITE */}
                    {customize.cardOrder.includes('smartMoney') && <EliteGate title="Smart Money" compact tooltipAlign="left" tooltipPosition="above" description={gt('descAiDeep')}>
                        {(() => {
                            const dp = data?.darkPoolPct ?? 0;
                            const sv = data?.shortVolPct ?? 0;
                            const smartScore = dp > 0 ? Math.round((dp * 0.6) + (sv * 0.4)) : null;
                            const label = smartScore === null ? '—' : smartScore >= 50 ? td('labelActive') : td('labelQuiet');
                            return (
                                <div className="relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 bg-[#0d1829]/80 border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Brain className="w-4 h-4 text-purple-400" />
                                        <CardTooltip text={td('tipSmartMoney')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Smart Money</span></CardTooltip>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${(smartScore ?? 0) >= 50 ? 'text-purple-400' : 'text-slate-400'}`}>
                                            {smartScore !== null ? `${smartScore}%` : '—'}
                                        </span>
                                        <span className="text-[12px] text-slate-300">{label}</span>
                                    </div>
                                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-purple-500/60 transition-all" style={{ width: `${smartScore ?? 0}%` }} />
                                    </div>
                                    <p className="text-[12px] text-slate-300 mt-1.5">{(smartScore ?? 0) >= 50 ? td('smartActive') : td('smartQuiet')}</p>
                                </div>
                            );
                        })()}
                    </EliteGate>}

                    {/* IV Rank — PRO */}
                    {customize.cardOrder.includes('ivRank') && <ProGate title="IV Rank" mode="peek" compact tooltipAlign="left" tooltipPosition="above" description={gt('descAiDeep')}>
                        {(() => {
                            const iv = data?.atmIv ?? 0;
                            const ivRank = iv > 0 ? Math.min(Math.round(iv * 1.5), 100) : null;
                            const isHigh = (ivRank ?? 0) >= 60;
                            return (
                                <div className={`relative p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:border-white/15 ${isHigh ? 'bg-amber-500/10 border-amber-400/30' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Gem className="w-4 h-4 text-amber-400" />
                                        <CardTooltip text={td('tipIvRank')}><span className="text-[12px] font-jakarta uppercase tracking-wider text-white">IV Rank</span></CardTooltip>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${isHigh ? 'text-amber-400' : 'text-white'}`}>{ivRank !== null ? `${ivRank}%` : '—'}</span>
                                        <span className="text-[12px] text-slate-300">{ivRank !== null ? (ivRank >= 60 ? td('labelHigh') : ivRank >= 30 ? td('labelMedium') : td('labelLow')) : ''}</span>
                                    </div>
                                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${isHigh ? 'bg-amber-500/60' : 'bg-slate-500/40'}`} style={{ width: `${ivRank ?? 0}%` }} />
                                    </div>
                                    <p className="text-[12px] text-slate-300 mt-1.5">{ivRank !== null ? (ivRank >= 60 ? td('ivRankHigh') : ivRank >= 30 ? td('ivRankMedium') : td('ivRankLow')) : ''}</p>
                                </div>
                            );
                        })()}
                    </ProGate>}
                </div>
            </div>

            {/* Chart Area: Fixed height to prevent layout shift when 5-Day table loads */}
            <div className="px-4 pb-4">
                {/* Price History (StockChart) */}
                <div className="h-[480px] bg-[#0d1829]/60 rounded-xl border border-white/5 overflow-hidden flex flex-col">
                    <div className="flex items-center gap-2 p-3 border-b border-white/5">
                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Price History</span>
                    </div>
                    <div className="flex-1 min-h-0">
                        {chartLoading ? (
                            <div className="h-full flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                            </div>
                        ) : chartHistory.length > 0 ? (
                            <div className="animate-fade-in h-full">
                                <StockChart
                                    data={chartHistory}
                                    ticker={selectedTicker}
                                    currentPrice={
                                        // POST/PRE/CLOSED(with afterhours): use extended price so chart tracks after-hours movement
                                        // [FIX] Must include CLOSED session — on weekends, underlyingPrice === prevClose → lines overlap
                                        (data?.session === 'POST' || data?.session === 'PRE' || data?.session === 'CLOSED') && (data?.extended?.postPrice || data?.extended?.prePrice)
                                            ? (data?.extended?.postPrice || data?.extended?.prePrice) ?? undefined
                                            : (data?.underlyingPrice ?? undefined)
                                    }
                                    prevClose={
                                        // POST/CLOSED(with afterhours): reference line = today's regular close (Command page standard)
                                        (data?.session === 'POST' || (data?.session === 'CLOSED' && (data?.extended?.postPrice ?? 0) > 0))
                                            && data?.regularCloseToday
                                            ? data.regularCloseToday
                                            : (data?.prevRegularClose || prevClose)
                                    }
                                    alphaLevels={{
                                        callWall: data?.levels?.callWall ?? undefined,
                                        putFloor: data?.levels?.putFloor ?? undefined,
                                        maxPain: data?.maxPain ?? undefined
                                    }}
                                    session={data?.session || 'CLOSED'}
                                    hideHeaderExtras={true}
                                />
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                {td('noChartData')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* [S-78] 5-Day Daily Price Table */}
            {dailyHistory.length > 0 && (
                <div className="px-4 pb-4">
                    <div className="bg-[#0d1829]/60 rounded-xl border border-white/5 overflow-hidden">
                        <div className="flex items-center gap-2 p-3 border-b border-white/5">
                            <List className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-[13px] font-bold uppercase tracking-wider text-slate-400">5-Day History</span>
                        </div>

                        {/* PC Table View */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/10 text-white">
                                        <th className="px-3 py-2 text-left font-semibold">Date</th>
                                        <th className="px-3 py-2 text-right font-semibold">Close</th>
                                        <th className="px-3 py-2 text-right font-semibold">Change</th>
                                        <th className="px-3 py-2 text-right font-semibold">Volume</th>
                                        <th className="px-3 py-2 text-right font-semibold">VWAP</th>
                                        <th className="px-3 py-2 text-right font-semibold">Gap</th>
                                        <th className="px-3 py-2 text-right font-semibold">Range</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyHistory.map((day: any, idx: number) => (
                                        <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                                            <td className="px-3 py-2 text-white font-mono">{day.date}</td>
                                            <td className="px-3 py-2 text-right text-white font-mono">${day.close?.toFixed(2)}</td>
                                            <td className={`px-3 py-2 text-right font-mono ${(day.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {day.changePct != null ? `${day.changePct > 0 ? '+' : ''}${day.changePct.toFixed(2)}%` : '—'}
                                            </td>
                                            <td className={`px-3 py-2 text-right font-mono ${(() => {
                                                const prevVolume = dailyHistory[idx + 1]?.volume;
                                                if (!prevVolume || !day.volume) return 'text-white';
                                                return day.volume > prevVolume ? 'text-emerald-400' : 'text-rose-400';
                                            })()
                                                }`}>
                                                {day.volume ? `${(day.volume / 1e6).toFixed(1)}M` : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right text-white font-mono">
                                                ${day.vwap?.toFixed(2) || '—'}
                                            </td>
                                            <td className={`px-3 py-2 text-right font-mono ${(day.gapPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {day.gapPct != null ? `${day.gapPct > 0 ? '+' : ''}${day.gapPct.toFixed(2)}%` : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right text-amber-400 font-mono">
                                                {day.rangePct != null ? `${day.rangePct.toFixed(2)}%` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="block sm:hidden flex-col divide-y divide-white/5">
                            {dailyHistory.map((day: any, idx: number) => (
                                <div key={idx} className="p-3 hover:bg-white/5 transition-colors">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-white font-mono font-bold tracking-wider">{day.date}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-mono font-bold">${day.close?.toFixed(2)}</span>
                                            <span className={`font-mono text-xs font-bold ${(day.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {day.changePct != null ? `${day.changePct > 0 ? '+' : ''}${day.changePct.toFixed(2)}%` : '—'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-[12px] font-mono">
                                        <div>
                                            <div className="text-slate-500 font-sans tracking-wide text-[10px] mb-0.5 font-semibold">VOL</div>
                                            <div className={(() => {
                                                    const prevVolume = dailyHistory[idx + 1]?.volume;
                                                    if (!prevVolume || !day.volume) return 'text-white';
                                                    return day.volume > prevVolume ? 'text-emerald-400' : 'text-rose-400';
                                                })()}>
                                                {day.volume ? `${(day.volume / 1e6).toFixed(1)}M` : '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500 font-sans tracking-wide text-[10px] mb-0.5 font-semibold">VWAP</div>
                                            <div className="text-white">${day.vwap?.toFixed(2) || '—'}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500 font-sans tracking-wide text-[10px] mb-0.5 font-semibold">GAP</div>
                                            <div className={(day.gapPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                {day.gapPct != null ? `${day.gapPct > 0 ? '+' : ''}${day.gapPct.toFixed(2)}%` : '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500 font-sans tracking-wide text-[10px] mb-0.5 font-semibold">RNG</div>
                                            <div className="text-amber-400">{day.rangePct != null ? `${day.rangePct.toFixed(2)}%` : '—'}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Signal Feed Item - Glassmorphism with Logo
// [LOCALIZATION] i18n signal messages via messageKey + params
// [TYPOGRAPHY] Min font size 11px, font-jakarta for consistency

// Signal message translation map (ko/en/ja)
const SIGNAL_MESSAGES: Record<string, Record<string, string>> = {
    signalBuyPutFloor: { ko: '지지선 지지 구간 (Put Floor ${putFloor})', en: 'Support Zone Active (Put Floor ${putFloor})', ja: 'サポートゾーン活性化 (Put Floor ${putFloor})' },
    signalBuyCallBullish: { ko: '콜 우위 관측 (PCR ${pcr})', en: 'Call Dominance Observed (PCR ${pcr})', ja: 'コール優位観測 (PCR ${pcr})' },
    signalSellCallWall: { ko: '저항 레벨 접근 (Call Wall ${callWall})', en: 'Approaching Resistance (Call Wall ${callWall})', ja: '抵抗レベル接近 (Call Wall ${callWall})' },
    signalSellPutHedge: { ko: '풋 볼륨 증가 관측 (PCR ${pcr})', en: 'Put Volume Elevated (PCR ${pcr})', ja: 'プットボリューム増加観測 (PCR ${pcr})' },
    signalWhaleGex: { ko: '${size} 고래 GEX (${gex})', en: '${size} Whale GEX (${gex})', ja: '${size} クジラ GEX (${gex})' },
    signalGammaSqueeze: { ko: '⚡ 감마 스퀴즈 감지', en: '⚡ Gamma Squeeze Detected', ja: '⚡ ガンマスクイーズ検知' },
    signalHighIv: { ko: '📈 고변동성 구간 (IV ${iv}%)', en: '📈 Elevated IV Zone (IV ${iv}%)', ja: '📈 高IV圏 (IV ${iv}%)' },
    signalCallWallBreak: { ko: '🚀 Call Wall 돌파 ($${callWall})', en: '🚀 Call Wall Breach ($${callWall})', ja: '🚀 Call Wall 突破 ($${callWall})' },
    signalPutFloorBreak: { ko: '💥 Put Floor 이탈 ($${putFloor})', en: '💥 Put Floor Breach ($${putFloor})', ja: '💥 Put Floor 割れ ($${putFloor})' },
    signalDarkPool: { ko: '🏦 Dark Pool 집중 (${pct}%) - 기관 블록 거래', en: '🏦 Dark Pool Concentration (${pct}%) - Block Trade', ja: '🏦 Dark Pool 集中 (${pct}%) - ブロック取引' },
    signalShortVol: { ko: '📉 Short Vol 확대 (${pct}%)', en: '📉 Short Vol Elevated (${pct}%)', ja: '📉 Short Vol 拡大 (${pct}%)' },
    signalImpliedMove: { ko: '⚡ Implied Move ±${pct}%', en: '⚡ Implied Move ±${pct}%', ja: '⚡ Implied Move ±${pct}%' },
};

function translateSignalMessage(signal: { message: string; messageKey?: string; params?: Record<string, any> }, locale: string): string {
    if (!signal.messageKey || !SIGNAL_MESSAGES[signal.messageKey]) {
        return signal.message; // Fallback to raw message
    }
    const template = SIGNAL_MESSAGES[signal.messageKey][locale] || SIGNAL_MESSAGES[signal.messageKey].en || signal.message;
    if (!signal.params) return template;
    return template.replace(/\$\{(\w+)\}/g, (_, key) => String(signal.params?.[key] ?? key));
}

function SignalItem({ signal, locale }: { signal: { time: string; ticker: string; type: string; message: string; messageKey?: string; params?: Record<string, any> }, locale: string }) {
    const styles: Record<string, { card: string; bar: string; text: string }> = {
        BULLISH: {
            card: 'bg-emerald-500/10 border-emerald-500/30',
            bar: 'bg-emerald-400',
            text: 'text-emerald-400'
        },
        BEARISH: {
            card: 'bg-rose-500/10 border-rose-500/30',
            bar: 'bg-rose-400',
            text: 'text-rose-400'
        },
        WHALE: {
            card: 'bg-amber-500/10 border-amber-500/30',
            bar: 'bg-amber-400',
            text: 'text-amber-400'
        },
        ALERT: {
            card: 'bg-purple-500/10 border-purple-500/30',
            bar: 'bg-purple-400',
            text: 'text-purple-400'
        }
    };

    const style = styles[signal.type] || styles.ALERT;

    // Format time fixed to EST/EDT (America/New_York)
    const formattedTime = new Date(signal.time).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // Translate message based on locale
    const translatedMessage = translateSignalMessage(signal, locale);

    return (
        <div className={`relative p-2.5 rounded-lg border backdrop-blur-sm ${style.card}`}>
            {/* Left accent bar */}
            <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${style.bar}`} />

            {/* Header */}
            <div className="flex items-center gap-2 pl-2 mb-1">
                {/* Ticker Logo */}
                <div className="w-5 h-5 rounded bg-slate-800/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                        loading="lazy"
                        decoding="async"
                        src={`/api/logo/${signal.ticker}`}
                        alt=""
                        className="w-3.5 h-3.5 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
                <span className="font-jakarta font-semibold text-xs text-white">{signal.ticker}</span>
                <span className={`text-[12px] font-jakarta font-bold ${style.text}`}>{signal.type}</span>
                <span className="text-[11px] font-jakarta text-slate-400 ml-auto flex items-center gap-1 bg-slate-800/50 px-1.5 py-0.5 rounded">
                    {formattedTime} <span className="text-[9px] font-bold text-slate-500">ET</span>
                </span>
            </div>

            {/* Message */}
            <p className="text-xs font-jakarta text-white leading-snug pl-2">{translatedMessage}</p>
        </div>
    );
}


// Signal Feed Panel
// [24H] Always active — fetches signals from DynamoDB + merges with store signals
// [LOCALIZATION] Uses locale for time formatting, [SORTING] Newest signals first
function SignalFeedPanel() {
    const signals = useDashboardStore(s => s.signals);
    const session = useDashboardStore(s => s.tickers[s.selectedTicker]?.session || 'CLOSED');
    const locale = useLocale();
    const td = useTranslations('dashboard');
    const isOpen = session === 'REG';

    // [24H] Fetch DynamoDB signals (persisted 24h)
    const [dbSignals, setDbSignals] = useState<any[]>([]);
    useEffect(() => {
        const fetchSignals = async () => {
            try {
                const res = await fetch('/api/dashboard/signals');
                if (res.ok) {
                    const data = await res.json();
                    setDbSignals(data.signals || []);
                }
            } catch { /* silent */ }
        };
        fetchSignals();
        const interval = setInterval(fetchSignals, 60000); // Refresh every 60s
        return () => clearInterval(interval);
    }, []);

    // Signal type display config
    const SIGNAL_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
        GEX_FLIP_LONG: { icon: '🟢', color: 'text-emerald-400', label: 'GEX Long Flip' },
        GEX_FLIP_SHORT: { icon: '🔴', color: 'text-rose-400', label: 'GEX Short Flip' },
        DARK_SURGE: { icon: '🏦', color: 'text-purple-400', label: 'Dark Pool Surge' },
        SQUEEZE_HIGH: { icon: '⚡', color: 'text-amber-400', label: 'Squeeze Alert' },
        IV_SPIKE: { icon: '📊', color: 'text-cyan-400', label: 'IV Spike' },
        ALPHA_JUMP: { icon: '🔥', color: 'text-orange-400', label: 'Alpha Jump' },
    };

    // Merge store signals + Redis signals, deduplicate, sort newest first
    const mergedSignals = useMemo(() => {
        const signalMap = new Map<string, any>();

        const addSignal = (s: any) => {
            const ts = new Date(s.timestamp || s.time || s.ts || Date.now()).getTime();
            // Deduplicate by ticker + type + minute bucket to prevent near-duplicates
            const minuteKey = Math.floor(ts / 60000);
            const key = `${s.ticker}-${s.type}-${minuteKey}`;
            
            if (!signalMap.has(key) || signalMap.get(key).timestamp < ts) {
                signalMap.set(key, {
                    ticker: s.ticker,
                    type: s.type,
                    message: s.message,
                    messageKey: s.messageKey,
                    params: s.params,
                    timestamp: ts,
                    source: 'store',
                });
            }
        };

        // Store signals (from unified API, current session)
        for (const s of signals) addSignal(s);

        // Redis signals (persisted from daily cache)
        for (const s of dbSignals) addSignal(s);

        return Array.from(signalMap.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20);
    }, [signals, dbSignals]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Radio className={`w-3.5 h-3.5 ${isOpen ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
                    <h2 className="text-xs font-jakarta font-bold uppercase tracking-wider text-slate-300">Signal Feed</h2>
                    {isOpen ? (
                        <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            LIVE
                        </span>
                    ) : (
                        <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                            PREV SESSION
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '12px' }} className="text-slate-300">{mergedSignals.length}</span>
            </div>
            <div className="overflow-y-auto p-2 space-y-1.5 max-h-[calc(100vh-200px)]">
                {mergedSignals.length > 0 ? (
                    mergedSignals.map((signal, i) => {
                        return <SignalItem key={`sig-${i}`} signal={{ ...signal, time: new Date(signal.timestamp).toISOString() }} locale={locale} />;
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                        <Radio className="w-5 h-5 text-slate-500" />
                        <p className="text-slate-300 text-sm text-center font-medium">{td('signalWaiting')}</p>
                        <p style={{ fontSize: '12px' }} className="text-slate-400">Signals are generated during market hours</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Mobile Tab Component
function MobileTabBar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) {
    const td = useTranslations('dashboard');
    const signals = useDashboardStore(s => s.signals);

    const tabs = [
        { id: 'chart', label: td('mobileTabChart'), icon: BarChart3 },
        { id: 'list', label: td('mobileTabList'), icon: List },
        { id: 'signal', label: td('mobileTabSignal'), icon: Radio, badge: signals.length }
    ];

    return (
        <div className="lg:hidden sticky top-[56px] z-40 bg-[#0a0f1a]/95 backdrop-blur-xl border-b border-white/10 px-2 py-1.5" data-dashboard-tab>
            <div className="flex justify-around">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex flex-col items-center py-2 px-3 rounded-lg transition-colors
                            ${activeTab === tab.id ? "bg-cyan-500/10 text-cyan-400" : "text-slate-400 hover:text-white"}
                        `}
                    >
                        <div className="relative">
                            <tab.icon className="w-5 h-5" />
                            {tab.badge && tab.badge > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 text-[12px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center">
                                    {tab.badge > 9 ? '9+' : tab.badge}
                                </span>
                            )}
                        </div>
                        <span className="text-[12px] mt-1 font-medium">{tab.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// Main Dashboard Client Component
export function DashboardClient({ initialTickers, initialQuotes }: { initialTickers: string[], initialQuotes: any }) {
    const searchParams = useSearchParams();
    const setSelectedTicker = useDashboardStore(s => s.setSelectedTicker);
    const fetchDashboardData = useDashboardStore(s => s.fetchDashboardData);
    const fetchPriceOnly = useDashboardStore(s => s.fetchPriceOnly);
    const isLoading = useDashboardStore(s => s.isLoading);
    const dashboardTickers = useDashboardStore(s => s.dashboardTickers);
    const initializeStore = useDashboardStore(s => s.initializeStore);
    const updateRealtimePrice = useDashboardStore(s => s.updateRealtimePrice);
    const [initialized, setInitialized] = useState(false);
    const [mobileTab, setMobileTab] = useState('chart');

    // ── [P0 FIX] Ref to always read latest dashboardTickers inside intervals ──
    // Without this, dashboardTickers array reference changes (e.g. Zustand persist hydration)
    // would cause useEffect to re-run → clearInterval → re-fetch → data flicker
    const tickersRef = useRef(dashboardTickers);
    useEffect(() => { tickersRef.current = dashboardTickers; }, [dashboardTickers]);

    // [SSR PROGRESSIVE] Hydrate store synchronously on mount before polling starts
    const hasInitializedStore = useRef(false);
    if (!hasInitializedStore.current) {
        initializeStore(initialTickers, initialQuotes);
        hasInitializedStore.current = true;
    }

    // Initialize from URL params + load tickers from Supabase
    useEffect(() => {
        const ticker = searchParams.get('t');
        if (ticker) {
            setSelectedTicker(ticker.toUpperCase());
        }
        // SSR already loaded dashboard tickers via Supabase, set to true immediately
        setInitialized(true);
    }, [searchParams, setSelectedTicker]);

    // [V4] Clean visibility-aware polling — price and indicators are independent
    // Price (2s): fetchPriceOnly → writes ONLY price fields
    // Indicators (30s): fetchDashboardData → writes ONLY indicator fields
    // No chain needed — they can never overwrite each other
    useEffect(() => {
        if (!initialized) return;

        const getTickerList = () => tickersRef.current.length > 0 ? tickersRef.current : undefined;
        let fullInterval: ReturnType<typeof setInterval> | null = null;
        let priceInterval: ReturnType<typeof setInterval> | null = null;

        const startPolling = () => {
            if (fullInterval) clearInterval(fullInterval);
            if (priceInterval) clearInterval(priceInterval);
            fullInterval = setInterval(() => fetchDashboardData(getTickerList()), 30000);
            priceInterval = setInterval(() => fetchPriceOnly(getTickerList()), 2000);
        };

        const stopPolling = () => {
            if (fullInterval) { clearInterval(fullInterval); fullInterval = null; }
            if (priceInterval) { clearInterval(priceInterval); priceInterval = null; }
        };

        const handleVisibility = () => {
            if (document.hidden) {
                stopPolling();
            } else {
                // TAB 복귀: 즉시 refresh
                fetchPriceOnly(getTickerList());
                fetchDashboardData(getTickerList());
                startPolling();
            }
        };

        // Initial fetch — price first (instant), then indicators (slower)
        fetchPriceOnly(getTickerList());
        fetchDashboardData(getTickerList());
        startPolling();
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    // [WEBSOCKET] Real-time price injection — WebSocket Push → dashboardStore
    const { prices: wsPrices, rlsi: wsRlsi } = useRealtimeData(dashboardTickers);

    // Bridge WebSocket prices to store
    const prevWsPricesRef = useRef<Map<string, any>>(new Map());
    useEffect(() => {
        if (!wsPrices || wsPrices.size === 0) return;
        wsPrices.forEach((update, ticker) => {
            const prev = prevWsPricesRef.current.get(ticker);
            if (prev && prev.price === update.price) return; // Skip unchanged
            if (update.price > 0) {
                updateRealtimePrice(ticker, update.price, update.changePct);
            }
        });
        prevWsPricesRef.current = new Map(wsPrices);
    }, [wsPrices, updateRealtimePrice]);

    return (
        <div className="min-h-screen bg-[#050a14] text-white flex flex-col">
            {/* Site Header */}
            {/* Alpha Status Bar */}
            <AlphaStatusBar />

            {/* Desktop: ~23:52:25 Bento Grid - Fixed Height */}
            <div className="hidden lg:grid flex-1 grid-cols-[0.92fr_2.08fr_1fr] gap-0.5 bg-white/5 p-0.5 h-[calc(100vh-120px)] overflow-hidden">
                {/* Left Panel - Watchlist (25%) */}
                <div className="bg-[#0a0f1a] rounded-l-lg overflow-y-auto">
                    <WatchlistPanel />
                </div>

                {/* Center Panel - Main Chart (50%) */}
                <div className="bg-[#0a0f1a] overflow-y-auto flex flex-col">
                    <MainChartPanel />
                </div>

                {/* Right Panel - Signal Feed (25%) */}
                <div className="bg-[#0a0f1a] rounded-r-lg overflow-y-auto">
                    <SignalFeedPanel />
                </div>
            </div>

            {/* Mobile: Vertical Stack Native Layout */}
            <div className="lg:hidden flex-1 bg-[#0a0f1a] overflow-y-auto w-full pb-8">
                <div className="flex flex-col">
                    {/* Sticky hero — DIRECT child of scroll container for CSS sticky to work */}
                    <MobileStickyHero />
                    <MainChartPanel />

                    {/* Left Panel: Watchlist (Stacked) */}
                    <div className="h-[400px] border-t border-white/10 mt-6 pt-1">
                        <WatchlistPanel />
                    </div>

                    {/* Right Panel: Signal Feed (Stacked) */}
                    <div className="h-[400px] border-t border-white/10 mt-6 pt-1">
                        <SignalFeedPanel />
                    </div>
                </div>
            </div>
        </div>
    );
}

