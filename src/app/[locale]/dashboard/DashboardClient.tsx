"use client";

import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useShallow } from "zustand/react/shallow";
import { PriceDisplay, usePriceFlash, getFlashStyle, tickerDelay } from "@/components/ui/PriceDisplay";
import { calcPriceDisplay } from "@/utils/calcPriceDisplay";
import { ProGate, EliteGate } from "@/components/gate/FeatureGate";

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
    BookOpen
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
        <div className="flex items-center justify-between px-4 py-2 bg-[#0a0f1a] border-b border-white/5">
            {/* Left: intentionally empty — NQ/Phase info moved to global ticker bar */}
            <div />

            {/* Center: Market Status Indicator + Countdown */}
            <div className="flex items-center gap-2">
                {market?.marketStatus && market.marketStatus !== 'CLOSED' && !market?.isHoliday ? (
                    <>
                        {/* LIVE — Pre-Market, Regular, After-Hours */}
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <span className="text-[12px] uppercase tracking-wider text-emerald-400 font-bold">LIVE</span>
                        <span className={`ml-1 px-2 py-0.5 text-[12px] uppercase font-bold rounded border ${STATUS_COLORS[market.marketStatus]}`}>
                            {market.marketStatus}
                        </span>
                    </>
                ) : (
                    <>
                        {/* CLOSED — no pulse */}
                        <span className="relative flex h-2.5 w-2.5">
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${market?.isHoliday ? 'bg-amber-500' : 'bg-slate-400'}`} />
                        </span>
                        {market?.isHoliday ? (
                            <>
                                <span className="text-[12px] uppercase tracking-wider text-amber-400 font-bold">HOLIDAY</span>
                                {market.holidayName && (
                                    <span className="text-[12px] text-amber-300 font-semibold">· {market.holidayName}</span>
                                )}
                            </>
                        ) : (() => {
                            // Check if weekend (client-side ET calculation)
                            const now = new Date();
                            const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
                            const etDay = new Date(etStr).getDay();
                            const isWeekend = etDay === 0 || etDay === 6;
                            return isWeekend ? (
                                <>
                                    <span className="text-[12px] uppercase tracking-wider text-slate-300 font-bold">CLOSED</span>
                                    <span className="text-[12px] text-slate-400 font-semibold">· Weekend</span>
                                </>
                            ) : (
                                <span className="text-[12px] uppercase tracking-wider text-slate-300 font-bold">CLOSED</span>
                            );
                        })()}
                    </>
                )}

                <MarketCountdown marketStatus={market?.marketStatus} isHoliday={market?.isHoliday} />
            </div>

            {/* Right: Guide Link + Last Updated & Refresh */}
            <div className="flex items-center gap-3">
                <Link
                    href="/how-it-works/dashboard"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/[0.08] backdrop-blur-sm transition-all duration-300 group"
                >
                    <BookOpen className="w-3 h-3 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                    <span className="text-[12px] text-slate-300 group-hover:text-cyan-300 font-medium transition-colors">{tCommon('guideLink')}</span>
                </Link>
                <button
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="p-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
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
    const handleHoverPrefetch = useCallback(() => {
        hoverTimeout.current = setTimeout(() => {
            const isStale = !data || !data.underlyingPrice ||
                (lastUpdated && (Date.now() - new Date(lastUpdated).getTime() > 60000));
            if (isStale) fetchSingleTicker(ticker);
        }, 300);
    }, [ticker, data, lastUpdated, fetchSingleTicker]);

    const handleHoverCancel = useCallback(() => {
        if (hoverTimeout.current) { clearTimeout(hoverTimeout.current); hoverTimeout.current = null; }
    }, []);

    const hasGammaSqueeze = data?.isGammaSqueeze;
    const hasWhale = data?.netGex && Math.abs(data.netGex) > 500000000;

    // [UNIFIED] Use shared calcPriceDisplay
    const priceResult = calcPriceDisplay({
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
                className={`flex-1 flex items-center justify-between p-3 rounded-lg transition-all duration-200
                    ${isSelected
                        ? "bg-cyan-500/10 border border-cyan-500/30"
                        : "bg-[#0d1829]/60 border border-white/5 hover:border-white/10"
                    }
                    ${hasGammaSqueeze ? "animate-squeeze-glow" : ""}
                    ${hasWhale && !hasGammaSqueeze ? "animate-whale-glow" : ""}
                `}
            >
                {/* Left: Logo + Ticker (fixed width) */}
                <div className="flex items-center gap-2 w-16 flex-shrink-0">
                    <img
                        src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
                        alt={ticker}
                        className="w-5 h-5 rounded bg-[#1a2535] object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '';
                            (e.target as HTMLImageElement).className = 'w-5 h-5 rounded bg-slate-700 hidden';
                        }}
                    />
                    <span className={`font-jakarta font-bold text-[13px] ${isSelected ? "text-cyan-400" : "text-white"}`}>
                        {ticker}
                    </span>
                    {hasGammaSqueeze && (
                        <span className="px-1 py-0.5 text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-400 rounded">SQ</span>
                    )}
                    {hasWhale && !hasGammaSqueeze && (
                        <span className="px-1 py-0.5 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 rounded">WH</span>
                    )}
                </div>

                {/* Right: Price (aligned to right edge) */}
                <div className="flex-1 flex items-center justify-end gap-2">

                    {/* Main Price + Change - Skeleton when loading */}
                    {mainPrice > 0 ? (
                        <div className="flex items-center gap-1.5">
                            <span className={`font-mono text-sm ${wf.color}`}
                                style={wf.style}>
                                ${mainPrice.toFixed(2)}
                            </span>
                            <span className={`text-[13px] font-medium ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                                {isPositive ? "+" : ""}{mainChangePct.toFixed(2)}%
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 animate-pulse">
                            <div className="h-4 w-16 bg-slate-700 rounded" />
                            <div className="h-3 w-10 bg-slate-700 rounded" />
                        </div>
                    )}
                    {/* Extended Session Badge (Command-style pill) */}
                    {extPrice > 0 && (
                        <div className="flex items-baseline gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/50">
                            <div className={`w-1.5 h-1.5 rounded-full ${displayExtLabel === 'PRE' ? 'bg-amber-500' : displayExtLabel === 'POST' ? 'bg-indigo-500' : 'bg-cyan-500'
                                } animate-pulse`} />
                            <span className={`text-[12px] font-black uppercase tracking-wider ${extColor}`}>{displayExtLabel}</span>
                            <span className={`text-[13px] font-mono font-bold ${extChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {extChangePct > 0 ? "+" : ""}{extChangePct.toFixed(2)}%
                            </span>
                        </div>
                    )}
                </div>
            </button>
            {/* Remove Button - inline on the right, appears on hover */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    toggleDashboardTicker(ticker);
                }}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 rounded text-rose-400 flex-shrink-0"
                title={td('removeFromDashboard')}
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
});

// Watchlist Panel
function WatchlistPanel() {
    const td = useTranslations('dashboard');
    const tickerKeys = useDashboardStore(useShallow(s => Object.keys(s.tickers)));
    const selectedTicker = useDashboardStore(s => s.selectedTicker);
    const toggleDashboardTicker = useDashboardStore(s => s.toggleDashboardTicker);
    const dashboardTickers = useDashboardStore(s => s.dashboardTickers);
    // dashboardTickers = sole source of truth for the visible list
    const tickerList = dashboardTickers;
    const [newTicker, setNewTicker] = useState('');

    const handleAddTicker = () => {
        const ticker = newTicker.trim().toUpperCase();
        if (ticker && !dashboardTickers.includes(ticker)) {
            toggleDashboardTicker(ticker);
            setNewTicker('');
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-jakarta">Watchlist</h2>
                <span style={{ fontSize: '12px' }} className="text-slate-300 font-jakarta font-bold">{dashboardTickers.length} / 10</span>
            </div>
            {/* Add Ticker Input */}
            <div className="p-2 border-b border-white/5">
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={newTicker}
                        onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                        placeholder={td('searchPlaceholder')}
                        className="flex-1 px-2 py-1.5 text-xs bg-[#0d1829] border border-white/10 rounded text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                        maxLength={6}
                    />
                    <button
                        onClick={handleAddTicker}
                        className="px-2 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded transition-colors"
                        title={td('searchPlaceholder')}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
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

    // [S-78] Fetch daily history for premium table
    useEffect(() => {
        const fetchDailyHistory = async () => {
            if (!selectedTicker) return;
            try {
                const res = await fetch(`/api/dashboard/daily-history?t=${selectedTicker}&days=5`);
                if (res.ok) {
                    const json = await res.json();
                    setDailyHistory(json.data || []);
                }
            } catch (e) {
                console.error('[Dashboard] Daily history fetch error:', e);
            }
        };
        fetchDailyHistory();
    }, [selectedTicker]);

    // Fetch chart data for StockChart
    // [S-78] Silent refresh: Only show loading on first load or ticker change, background updates thereafter
    const lastTickerRef = React.useRef<string | null>(null);

    const fetchChartData = useCallback(async (showLoading: boolean = false) => {
        if (!selectedTicker) return;
        if (showLoading) setChartLoading(true);
        try {
            const res = await fetch(`/api/chart?symbol=${selectedTicker}&range=1d`);
            if (res.ok) {
                const json = await res.json();
                const newData = json.data || [];
                if (newData.length > 0) setChartHistory(newData);
            }
        } catch (e) {
            console.error('[Dashboard] Chart fetch error:', e);
        }
        setChartLoading(false);
    }, [selectedTicker]);

    useEffect(() => {
        const isTickerChange = lastTickerRef.current !== selectedTicker;
        lastTickerRef.current = selectedTicker;

        // Show loading on ticker change or first load
        fetchChartData(isTickerChange || chartHistory.length === 0);

        // Silent background refresh every 30s
        const interval = setInterval(() => fetchChartData(false), 30000);

        // [P2 FIX] Debounced handler for visibility + focus events
        // Without debounce, tab switch triggers BOTH visibilitychange + focus → 2x fetch
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchChartData(false), 500);
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
    }, [selectedTicker, fetchChartData]);

    const isPositive = (data?.changePercent || 0) >= 0;
    const gexDisplay = data?.netGex
        ? `${data.netGex > 0 ? '+' : ''}${(data.netGex / 1e9).toFixed(2)}B`
        : "—";

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700 flex items-center justify-center overflow-hidden relative">
                        <img
                            src={`https://financialmodelingprep.com/image-stock/${selectedTicker}.png`}
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

                {/* Status Badges */}
                <div className="flex items-center gap-2">
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

            {/* ═══════ Metrics Grid: 3 Rows × 4 Cards (No Gap Between Rows) ═══════ */}
            <div className="px-4 pt-4 pb-4 flex flex-col gap-1">
                {/* ── ROW 1: 구조 판단 (Structure) ── */}
                <div className="grid grid-cols-4 gap-3">
                    {/* Net GEX — PRO (peek: number visible, interpretation blurred) */}
                    <ProGate fomoMessage="Net GEX — SpotGamma $99+" mode="peek" compact>
                        <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.netGex || 0) < 0 ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {(data?.netGex || 0) < 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                            <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 50 Q12 20 24 35 T48 25 T72 40 T96 15" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /><path d="M0 55 Q16 40 32 45 T64 35 T96 30" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-300" /></svg>
                            <div className="relative z-10 flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Activity className="w-4 h-4 text-amber-400" />
                                <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Net GEX</span>
                            </div>
                            <div className="relative z-10 flex items-center gap-2">
                                <span className={`text-xl font-mono font-bold ${(data?.netGex || 0) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {gexDisplay}
                                </span>
                                <span className="text-xs text-white">{(data?.netGex || 0) > 0 ? td('gexStableInterpret') : td('gexVolatileInterpret')}</span>
                            </div>
                        </div>
                    </ProGate>

                    {/* Gamma Flip — PRO (blur: SpotGamma core data) */}
                    <ProGate fomoMessage="Gamma Flip Level — SpotGamma $99+" mode="blur" compact>
                        <div className={`relative p-4 rounded-xl border overflow-hidden ${data?.gammaFlipLevel && data?.underlyingPrice && data.underlyingPrice < data.gammaFlipLevel ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {data?.gammaFlipLevel && data?.underlyingPrice && data.underlyingPrice < data.gammaFlipLevel && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                            <svg className="absolute right-1 bottom-1 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><circle cx="40" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400" /><line x1="40" y1="5" x2="40" y2="59" stroke="currentColor" strokeWidth="1" className="text-cyan-300" strokeDasharray="3 3" /><line x1="13" y1="32" x2="67" y2="32" stroke="currentColor" strokeWidth="1" className="text-cyan-300" strokeDasharray="3 3" /></svg>
                            <div className="relative z-10 flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Radio className="w-4 h-4 text-cyan-400" />
                                <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Gamma Flip</span>
                            </div>
                            <div className="relative z-10 flex items-center gap-2">
                                <span className="text-xl font-mono font-bold text-white">
                                    ${data?.gammaFlipLevel?.toFixed(0) || "—"}
                                </span>
                                {data?.gammaFlipLevel && data?.underlyingPrice && (
                                    <span className={`text-xs font-medium ${data.underlyingPrice > data.gammaFlipLevel ? "text-emerald-400" : "text-rose-400"}`}>
                                        {data.underlyingPrice > data.gammaFlipLevel ? "LONG" : "SHORT"}
                                    </span>
                                )}
                            </div>
                        </div>
                    </ProGate>

                    {/* Squeeze */}
                    <div className={`relative p-4 rounded-xl border overflow-hidden ${data?.squeezeRisk === 'EXTREME' || data?.squeezeRisk === 'HIGH' ? 'bg-amber-500/15 backdrop-blur-md border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.4)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
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
                                        <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Squeeze</span>
                                        <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${bgColor} text-white`}>{risk}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${color}`}>{score}%</span>
                                        <span className="text-[12px] text-white">
                                            {score >= 70 ? td('sqzExtreme') : score >= 50 ? td('sqzCaution') : score >= 30 ? td('sqzNormal') : td('sqzStable')}
                                        </span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* VWAP 거리 (NEW) */}
                    {(() => {
                        const price = data?.underlyingPrice || 0;
                        const vwap = data?.vwap || 0;
                        const dist = vwap > 0 && price > 0 ? ((price - vwap) / vwap * 100) : 0;
                        const isAlert = Math.abs(dist) >= 1;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? (dist > 0 ? 'bg-emerald-500/10 backdrop-blur-md border-emerald-400/40 shadow-[0_0_25px_rgba(52,211,153,0.3)]' : 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]') : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${dist > 0 ? 'from-emerald-400 to-emerald-500' : 'from-rose-400 to-rose-500'}`} />}
                                <svg className="absolute right-1 bottom-0 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><rect x="5" y="30" width="10" height="30" rx="2" fill="currentColor" className="text-cyan-400" /><rect x="22" y="18" width="10" height="42" rx="2" fill="currentColor" className="text-cyan-400" /><rect x="39" y="24" width="10" height="36" rx="2" fill="currentColor" className="text-cyan-400" /><rect x="56" y="12" width="10" height="48" rx="2" fill="currentColor" className="text-cyan-400" /></svg>
                                <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                                    <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">{td('vwapDistance')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${dist > 0 ? 'text-emerald-400' : dist < 0 ? 'text-rose-400' : 'text-white'}`}>
                                        {vwap > 0 ? `${dist > 0 ? '+' : ''}${dist.toFixed(1)}%` : '—'}
                                    </span>
                                    <span className="text-xs font-mono text-slate-400">
                                        {vwap > 0 ? `$${vwap.toFixed(1)}` : ''}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* ── ROW 2: 가격 레벨 + 기관 (Levels & Institutional) ── */}
                <div className="grid grid-cols-4 gap-3">
                    {/* Max Pain — PRO (peek: price visible, % distance blurred) */}
                    <ProGate fomoMessage="Max Pain Level — UW $50+" mode="peek" compact>
                        <div className="relative p-4 bg-[#0d1829]/80 rounded-xl border border-white/5 overflow-hidden">
                            <svg className="absolute right-1 bottom-1 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><circle cx="40" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400" /><circle cx="40" cy="32" r="14" fill="none" stroke="currentColor" strokeWidth="1" className="text-cyan-300" /><circle cx="40" cy="32" r="3" fill="currentColor" className="text-cyan-400" /></svg>
                            <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Target className="w-4 h-4 text-cyan-400" />
                                <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Max Pain</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-mono font-bold text-white">${data?.maxPain || "—"}</span>
                                {data?.maxPain && data?.underlyingPrice && (
                                    <span className={`text-xs font-mono ${data.underlyingPrice > data.maxPain ? "text-emerald-400" : "text-rose-400"}`}>
                                        {((data.underlyingPrice - data.maxPain) / data.maxPain * 100).toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    </ProGate>

                    {/* Call Wall / Put Floor — PRO (blur: options level data) */}
                    <ProGate fomoMessage="Call Wall / Put Floor — SpotGamma $99+" mode="blur" compact>
                        <div className="relative p-4 bg-[#0d1829]/80 rounded-xl border border-white/5 overflow-hidden">
                            <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><line x1="0" y1="20" x2="96" y2="20" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" /><line x1="0" y1="44" x2="96" y2="44" stroke="currentColor" strokeWidth="1.5" className="text-rose-400" /><line x1="0" y1="32" x2="96" y2="32" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-white" /></svg>
                            <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <div className="flex flex-col leading-tight">
                                    <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Call Wall</span>
                                    <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Put Floor</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-lg font-mono font-bold text-emerald-400">${data?.levels?.callWall || "—"}</span>
                                <span className="text-slate-500">/</span>
                                <span className="text-lg font-mono font-bold text-rose-400">${data?.levels?.putFloor || "—"}</span>
                            </div>
                        </div>
                    </ProGate>

                    {/* Dark Pool % — PRO (blur: institutional data, FlowAlgo $149) */}
                    <ProGate fomoMessage="Dark Pool % — FlowAlgo $149" mode="blur" compact>
                        {(() => {
                            const dp = data?.darkPoolPct ?? 0;
                            const isAlert = dp >= 45;
                            const sessionLabel = data?.session === 'PRE' ? 'PRE' : data?.session === 'POST' ? 'POST' : null;
                            const sessionColor = data?.session === 'PRE' ? 'text-amber-400 bg-amber-500/20 border-amber-500/30'
                                : 'text-purple-400 bg-purple-500/20 border-purple-500/30';
                            return (
                                <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-purple-500/10 backdrop-blur-md border-purple-400/40 shadow-[0_0_25px_rgba(168,85,247,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-400 to-purple-500" />}
                                    <svg className="absolute right-1 bottom-1 w-20 h-14 opacity-[0.06]" viewBox="0 0 80 56">{[0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={10 + i * 12} cy={10 + ((i * 17) % 30)} r="3" fill="currentColor" className="text-purple-400" />)}<path d="M10 10 L22 27 L34 20 L46 37 L58 14 L70 40" fill="none" stroke="currentColor" strokeWidth="1" className="text-purple-300" /></svg>
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Activity className="w-4 h-4 text-purple-400" />
                                            <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Dark Pool %</span>
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
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* Short Vol % — PRO (blur: Ortex $49-149) */}
                    <ProGate fomoMessage="Short Volume % — Ortex $49+" mode="blur" compact>
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
                                <div className={`relative py-3 px-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                                    <svg className="absolute right-1 bottom-0 w-20 h-16 opacity-[0.06]" viewBox="0 0 80 64"><rect x="5" y="10" width="10" height="50" rx="2" fill="currentColor" className="text-rose-400" /><rect x="22" y="20" width="10" height="40" rx="2" fill="currentColor" className="text-rose-400" /><rect x="39" y="28" width="10" height="32" rx="2" fill="currentColor" className="text-rose-400" /><rect x="56" y="36" width="10" height="24" rx="2" fill="currentColor" className="text-rose-300" /></svg>
                                    <div className="flex items-center gap-2 mb-1 whitespace-nowrap">
                                        <TrendingDown className="w-4 h-4 text-rose-400" />
                                        <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Short Vol %</span>
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
                                </div>
                            );
                        })()}
                    </ProGate>
                </div>

                {/* ── ROW 3: 변동성 + 당일 매매 (Volatility & Intraday) ── */}
                <div className="grid grid-cols-4 gap-3">
                    {/* ATM IV — PRO (blur: advanced volatility surface, QuantData $99) */}
                    <ProGate fomoMessage="ATM IV — QuantData $99" mode="blur" compact>
                        <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.atmIv || 0) > 50 ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                            {(data?.atmIv || 0) > 50 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                            <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M0 32 Q12 10 24 32 T48 32 T72 32 T96 32" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400" /><path d="M0 32 Q12 48 24 32 T48 32 T72 32 T96 32" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-300" strokeDasharray="3 3" /></svg>
                            <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                <Activity className="w-4 h-4 text-purple-400" />
                                <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">ATM IV</span>
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
                                        <span className="text-[12px] text-slate-400">0%</span>
                                        <span className="text-[12px] text-slate-400">50%</span>
                                        <span className="text-[12px] text-slate-400">100%</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ProGate>

                    {/* P/C Ratio (VOLUME) - matches Flow page */}
                    {(() => {
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
                            <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? (isBullish ? 'bg-emerald-500/10 backdrop-blur-md border-emerald-400/40 shadow-[0_0_25px_rgba(52,211,153,0.3)]' : 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]') : 'bg-[#0d1829]/80 border-white/5'}`}>
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
                                    <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">P/C Ratio</span>
                                    <span className="text-[12px] text-cyan-400 font-medium">VOLUME</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${color}`}>
                                        {vpcr !== null ? vpcr.toFixed(2) : '—'}
                                    </span>
                                    <span className={`text-sm font-bold ${color}`}>{label}</span>
                                </div>
                                {hasVolData && (
                                    <span className="text-[12px] text-white font-mono mt-1 block">
                                        C {(callVol / 1000).toFixed(0)}K / P {(putVol / 1000).toFixed(0)}K
                                    </span>
                                )}
                            </div>
                        );
                    })()}

                    {/* GEX REGIME — PRO (blur: SpotGamma Pro $249) */}
                    <ProGate fomoMessage="GEX Regime — SpotGamma $249" mode="blur" compact>
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
                                <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-amber-500/10 backdrop-blur-md border-amber-400/40 shadow-[0_0_25px_rgba(251,191,36,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-500 animate-pulse" />}
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M48 58 A 38 38 0 0 1 10 58" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400" /><path d="M86 58 A 38 38 0 0 1 48 58" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400" /><circle cx="48" cy="58" r="3" fill="currentColor" className="text-white" /></svg>
                                    <div className="flex items-center gap-1.5 mb-2 whitespace-nowrap">
                                        <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                                        <span className="text-[12px] font-jakarta uppercase tracking-wide text-white">GEX Regime</span>
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
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* Implied Move — ELITE (blur: advanced derivatives) */}
                    <EliteGate fomoMessage="Implied Move — ELITE" mode="blur" compact>
                        {(() => {
                            const im = data?.impliedMovePct ?? 0;
                            const dir = data?.impliedMoveDir ?? 'neutral';
                            const isAlert = im >= 3;
                            return (
                                <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                    {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                                    <svg className="absolute right-0 bottom-0 w-24 h-16 opacity-[0.06]" viewBox="0 0 96 64"><path d="M30 32 L10 20 M30 32 L10 44 M66 32 L86 20 M66 32 L86 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-cyan-400" /><line x1="30" y1="32" x2="66" y2="32" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-cyan-300" /></svg>
                                    <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
                                        <Activity className="w-4 h-4 text-cyan-400" />
                                        <span className="text-[12px] font-jakarta uppercase tracking-wider text-white">Implied Move</span>
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
                                </div>
                            );
                        })()}
                    </EliteGate>
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
                                        // POST/PRE: use extended price so chart tracks after-hours movement
                                        (data?.session === 'POST' || data?.session === 'PRE') && (data?.extended?.postPrice || data?.extended?.prePrice)
                                            ? (data?.session === 'POST' ? data?.extended?.postPrice : data?.extended?.prePrice) ?? undefined
                                            : (data?.underlyingPrice ?? undefined)
                                    }
                                    prevClose={
                                        // POST: reference line = today's regular close (Yahoo/TradingView standard)
                                        data?.session === 'POST' && data?.regularCloseToday
                                            ? data.regularCloseToday
                                            : prevClose
                                    }
                                    alphaLevels={{
                                        callWall: data?.levels?.callWall ?? undefined,
                                        putFloor: data?.levels?.putFloor ?? undefined,
                                        maxPain: data?.maxPain ?? undefined
                                    }}
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
                        <div className="overflow-x-auto">
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
    signalBuyPutFloor: { ko: '지지선 매수 기회 (Put Floor ${putFloor})', en: 'Support Buy Opportunity (Put Floor ${putFloor})', ja: 'サポートライン買い機会 (Put Floor ${putFloor})' },
    signalBuyCallBullish: { ko: '콜 강세 (PCR ${pcr}) - 상승 추세', en: 'Call Bullish (PCR ${pcr}) - Uptrend', ja: 'コール強気 (PCR ${pcr}) - 上昇トレンド' },
    signalSellCallWall: { ko: '저항선 도달 - 익절 고려 (Call Wall ${callWall})', en: 'Resistance Hit - Take Profit (Call Wall ${callWall})', ja: '抵抗線到達 - 利確検討 (Call Wall ${callWall})' },
    signalSellPutHedge: { ko: '풋 헤징 증가 (PCR ${pcr}) - 하락 주의', en: 'Put Hedging Rising (PCR ${pcr}) - Caution', ja: 'プットヘッジ増加 (PCR ${pcr}) - 下落注意' },
    signalWhaleGex: { ko: '${size} 고래 GEX (${gex})', en: '${size} Whale GEX (${gex})', ja: '${size} クジラ GEX (${gex})' },
    signalGammaSqueeze: { ko: '🔥 감마 스퀴즈 - 급등 임박!', en: '🔥 Gamma Squeeze - Surge Imminent!', ja: '🔥 ガンマスクイーズ - 急騰間近！' },
    signalHighIv: { ko: '📈 고변동성 (IV ${iv}%) - 큰 움직임 예상', en: '📈 High Volatility (IV ${iv}%) - Big Move Expected', ja: '📈 高ボラティリティ (IV ${iv}%) - 大きな動き予想' },
    signalCallWallBreak: { ko: '🚀 Call Wall 돌파 ($${callWall}) - 신규 고점', en: '🚀 Call Wall Break ($${callWall}) - New High', ja: '🚀 Call Wall 突破 ($${callWall}) - 新高値' },
    signalPutFloorBreak: { ko: '💥 Put Floor 이탈 ($${putFloor}) - 손절 고려', en: '💥 Put Floor Break ($${putFloor}) - Stop Loss', ja: '💥 Put Floor 割れ ($${putFloor}) - 損切り検討' },
    signalDarkPool: { ko: '🏦 Dark Pool 집중 (${pct}%) - 기관 대량 거래', en: '🏦 Dark Pool Focus (${pct}%) - Institutional Block', ja: '🏦 Dark Pool 集中 (${pct}%) - 機関大口取引' },
    signalShortVol: { ko: '📉 Short Vol 급증 (${pct}%) - 공매도 공세', en: '📉 Short Vol Surge (${pct}%) - Bearish Pressure', ja: '📉 Short Vol 急増 (${pct}%) - 空売り攻勢' },
    signalImpliedMove: { ko: '⚡ Implied Move ±${pct}% - 대폭 변동 예상', en: '⚡ Implied Move ±${pct}% - Major Swing Expected', ja: '⚡ Implied Move ±${pct}% - 大幅変動予想' },
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
        BUY: {
            card: 'bg-emerald-500/10 border-emerald-500/30',
            bar: 'bg-emerald-400',
            text: 'text-emerald-400'
        },
        SELL: {
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

    // Format time based on locale
    const localeMap: Record<string, string> = { ko: 'ko-KR', ja: 'ja-JP', en: 'en-US' };
    const formattedTime = new Date(signal.time).toLocaleTimeString(localeMap[locale] || 'en-US', {
        hour: '2-digit',
        minute: '2-digit'
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
                        src={`https://financialmodelingprep.com/image-stock/${signal.ticker}.png`}
                        alt=""
                        className="w-3.5 h-3.5 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
                <span className="font-jakarta font-semibold text-xs text-white">{signal.ticker}</span>
                <span className={`text-[12px] font-jakarta font-bold ${style.text}`}>{signal.type}</span>
                <span className="text-[12px] font-jakarta text-slate-300 ml-auto">{formattedTime}</span>
            </div>

            {/* Message */}
            <p className="text-xs font-jakarta text-white leading-snug pl-2">{translatedMessage}</p>
        </div>
    );
}


// Signal Feed Panel
// [LOCALIZATION] Uses locale for time formatting, [SORTING] Newest signals first
// [MARKET HOURS] Only active during regular trading session (OPEN)
function SignalFeedPanel() {
    const signals = useDashboardStore(s => s.signals);
    const session = useDashboardStore(s => s.tickers[s.selectedTicker]?.session || 'CLOSED');
    const locale = useLocale();
    const td = useTranslations('dashboard');
    const isOpen = session === 'REG';

    // Sort signals by time - newest first, limit to 15
    const sortedSignals = [...signals]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 15);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Radio className={`w-3.5 h-3.5 ${isOpen ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
                    <h2 className="text-xs font-jakarta font-bold uppercase tracking-wider text-slate-300">Signal Feed</h2>
                </div>
                {isOpen ? (
                    <span className="text-[12px] text-slate-400">{signals.length}</span>
                ) : (
                    <span className="text-[12px] font-jakarta font-bold px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">CLOSED</span>
                )}
            </div>
            <div className="overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-200px)]">
                {!isOpen ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                        <Radio className="w-5 h-5 text-slate-500" />
                        <p className="text-slate-300 text-sm text-center font-medium">{td('signalClosedMsg')}</p>
                        <p className="text-slate-400 text-xs">9:30 AM ~ 4:00 PM ET</p>
                    </div>
                ) : sortedSignals.length > 0 ? (
                    sortedSignals.map((signal, i) => (
                        <SignalItem key={i} signal={signal} locale={locale} />
                    ))
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-400 text-xs">{td('signalWaiting')}</p>
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
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0f1a] border-t border-white/10 px-2 py-2 safe-area-pb">
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

    // [OPTIMIZED] Visibility-aware polling — pauses when tab hidden, resumes on focus
    // Price interval: 2s for near-real-time feel
    useEffect(() => {
        if (!initialized) return;

        const getTickerList = () => tickersRef.current.length > 0 ? tickersRef.current : undefined;
        let fullInterval: ReturnType<typeof setInterval> | null = null;
        let priceInterval: ReturnType<typeof setInterval> | null = null;

        const startPolling = () => {
            if (fullInterval) clearInterval(fullInterval);
            if (priceInterval) clearInterval(priceInterval);

            fullInterval = setInterval(() => {
                fetchDashboardData(getTickerList());
            }, 30000);

            priceInterval = setInterval(() => {
                fetchPriceOnly(getTickerList());
            }, 2000);
        };

        const stopPolling = () => {
            if (fullInterval) { clearInterval(fullInterval); fullInterval = null; }
            if (priceInterval) { clearInterval(priceInterval); priceInterval = null; }
        };

        const handleVisibility = () => {
            if (document.hidden) {
                stopPolling();
            } else {
                fetchPriceOnly(getTickerList());
                fetchDashboardData(getTickerList());
                startPolling();
            }
        };

        // [PROGRESSIVE] Fire price-only FIRST for instant price display
        // Now guaranteed to run AFTER Supabase load since initialized is true
        fetchPriceOnly(getTickerList());
        // Then fire full data for option indicators (slower)
        fetchDashboardData(getTickerList());
        startPolling();
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialized]);

    return (
        <div className="min-h-screen bg-[#050a14] text-white flex flex-col">
            {/* Site Header */}
            {/* Alpha Status Bar */}
            <AlphaStatusBar />

            {/* Desktop: 25:50:25 Bento Grid - Fixed Height */}
            <div className="hidden lg:grid flex-1 grid-cols-[1fr_2fr_1fr] gap-0.5 bg-white/5 p-0.5 h-[calc(100vh-120px)] overflow-hidden">
                {/* Left Panel - Watchlist (25%) */}
                <div className="bg-[#0a0f1a] rounded-l-lg overflow-y-auto">
                    <WatchlistPanel />
                </div>

                {/* Center Panel - Main Chart (50%) */}
                <div className="bg-[#0a0f1a] overflow-hidden flex flex-col">
                    <MainChartPanel />
                </div>

                {/* Right Panel - Signal Feed (25%) */}
                <div className="bg-[#0a0f1a] rounded-r-lg overflow-y-auto">
                    <SignalFeedPanel />
                </div>
            </div>

            {/* Mobile: Tabbed Content */}
            <div className="lg:hidden flex-1 bg-[#0a0f1a] pb-20">
                {mobileTab === 'chart' && <MainChartPanel />}
                {mobileTab === 'list' && <WatchlistPanel />}
                {mobileTab === 'signal' && <SignalFeedPanel />}
            </div>

            {/* Mobile Tab Bar */}
            <MobileTabBar activeTab={mobileTab} setActiveTab={setMobileTab} />
        </div>
    );
}

