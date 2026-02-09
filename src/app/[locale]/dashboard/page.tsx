"use client";

import React, { useEffect, useCallback, useState } from "react";
import { useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/stores/dashboardStore";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { getDisplayPrices } from "@/utils/priceDisplay";

// Dynamic import for StockChart (no SSR for chart component)
const StockChart = dynamic(() => import("@/components/StockChart").then(mod => mod.StockChart), {
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center text-slate-500">차트 로딩...</div>
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
    Plus
} from "lucide-react";

// Market status badge colors
const STATUS_COLORS = {
    PRE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    OPEN: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    AFTER: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    CLOSED: "bg-slate-500/20 text-slate-400 border-slate-500/30"
};

const PHASE_LABELS: Record<string, string> = {
    BULLISH_EXPANSION: "상승 확장",
    BULLISH: "상승세",
    NEUTRAL: "중립",
    BEARISH: "하락세",
    BEARISH_DECLINE: "하락 확장",
    UNKNOWN: "—"
};

// Alpha Status Bar Component
function AlphaStatusBar() {
    const { market, lastUpdated, isLoading, fetchDashboardData } = useDashboardStore();

    const handleRefresh = useCallback(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    return (
        <div className="flex items-center justify-between px-4 py-2 bg-[#0a0f1a] border-b border-white/5">
            {/* Left: Market Status */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">NQ 100</span>
                    <span className="font-mono text-sm text-white">
                        {market?.nq?.price ? market.nq.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}
                    </span>
                    {market?.nq?.change !== undefined && (
                        <span className={`text-xs font-medium ${market.nq.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {market.nq.change >= 0 ? "+" : ""}{market.nq.change.toFixed(2)}%
                        </span>
                    )}
                </div>

                <div className="h-4 w-px bg-white/10" />

                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Phase</span>
                    <span className="text-sm text-cyan-400 font-medium">
                        {PHASE_LABELS[market?.phase || "UNKNOWN"]}
                    </span>
                </div>
            </div>

            {/* Center: LIVE Indicator */}
            <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">LIVE</span>

                {market?.marketStatus && (
                    <span className={`ml-2 px-2 py-0.5 text-[9px] uppercase font-bold rounded border ${STATUS_COLORS[market.marketStatus]}`}>
                        {market.marketStatus}
                    </span>
                )}
            </div>

            {/* Right: Last Updated & Refresh */}
            <div className="flex items-center gap-3">
                {lastUpdated && (
                    <span className="text-[10px] text-slate-500">
                        Updated: {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                )}
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
function WatchlistItem({ ticker, isSelected }: { ticker: string; isSelected: boolean }) {
    const { tickers, setSelectedTicker, toggleDashboardTicker } = useDashboardStore();
    const data = tickers[ticker];

    const hasGammaSqueeze = data?.isGammaSqueeze;
    const hasWhale = data?.netGex && Math.abs(data.netGex) > 500000000;

    // [CENTRALIZED] Use shared price display utility
    const priceInfo = getDisplayPrices({
        underlyingPrice: data?.underlyingPrice || null,
        prevClose: data?.prevClose || null,
        regularCloseToday: data?.regularCloseToday || null,
        intradayChangePct: data?.intradayChangePct || null,
        changePercent: data?.changePercent || null,
        session: data?.session || 'CLOSED',
        extended: data?.extended
    });

    const { mainPrice, mainChangePct, extPrice, extChangePct, extLabel } = priceInfo;
    const isPositive = mainChangePct >= 0;
    const extColor = extLabel === 'PRE' ? 'text-amber-400' : extLabel === 'POST' ? 'text-purple-400' : 'text-indigo-400';
    // Simplify labels: PRE CLOSE -> PRE
    const displayExtLabel = extLabel === 'PRE CLOSE' ? 'PRE' : extLabel;

    return (
        <div className="group relative">
            <button
                onClick={() => setSelectedTicker(ticker)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200
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
                    <span className={`font-bold text-xs ${isSelected ? "text-cyan-400" : "text-white"}`}>
                        {ticker}
                    </span>
                    {hasGammaSqueeze && (
                        <span className="px-1 py-0.5 text-[6px] font-bold uppercase bg-indigo-500/20 text-indigo-400 rounded">SQ</span>
                    )}
                    {hasWhale && !hasGammaSqueeze && (
                        <span className="px-1 py-0.5 text-[6px] font-bold uppercase bg-amber-500/20 text-amber-400 rounded">WH</span>
                    )}
                </div>

                {/* Right: Price (aligned to right edge) */}
                <div className="flex-1 flex items-center justify-end gap-2">

                    {/* Main Price + Change - Skeleton when loading */}
                    {mainPrice > 0 ? (
                        <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm text-white">
                                ${mainPrice.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-medium ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                                {isPositive ? "+" : ""}{mainChangePct.toFixed(2)}%
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 animate-pulse">
                            <div className="h-4 w-16 bg-slate-700 rounded" />
                            <div className="h-3 w-10 bg-slate-700 rounded" />
                        </div>
                    )}
                    {/* Separator + Extended Session (POST/PRE) */}
                    {extPrice > 0 && (
                        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                            <span className={`text-[8px] font-bold uppercase ${extColor}`}>{displayExtLabel}</span>
                            <span className="text-xs text-white font-mono">${extPrice.toFixed(2)}</span>
                            <span className={`text-[9px] font-mono ${extChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {extChangePct > 0 ? "+" : ""}{extChangePct.toFixed(2)}%
                            </span>
                        </div>
                    )}
                </div>
            </button>
            {/* Remove Button - appears on hover */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    toggleDashboardTicker(ticker);
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-500/20 rounded text-rose-400"
                title="대시보드에서 제거"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
}

// Watchlist Panel
function WatchlistPanel() {
    const { tickers, selectedTicker, toggleDashboardTicker, dashboardTickers } = useDashboardStore();
    const tickerList = Object.keys(tickers);
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
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Watchlist</h2>
                <span className="text-[10px] text-slate-500">{tickerList.length} 종목</span>
            </div>
            {/* Add Ticker Input */}
            <div className="p-2 border-b border-white/5">
                <div className="flex gap-1">
                    <input
                        type="text"
                        value={newTicker}
                        onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                        placeholder="티커 추가..."
                        className="flex-1 px-2 py-1.5 text-xs bg-[#0d1829] border border-white/10 rounded text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                        maxLength={6}
                    />
                    <button
                        onClick={handleAddTicker}
                        className="px-2 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded transition-colors"
                        title="티커 추가"
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
    const { selectedTicker, tickers } = useDashboardStore();
    const data = tickers[selectedTicker];

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

    // Fetch prevClose from ticker API
    useEffect(() => {
        const fetchPrevClose = async () => {
            if (!selectedTicker) return;
            try {
                const res = await fetch(`/api/live/ticker?t=${selectedTicker}`);
                if (res.ok) {
                    const json = await res.json();
                    setPrevClose(json.prices?.prevRegularClose ?? json.prevClose ?? undefined);
                }
            } catch (e) {
                console.error('[Dashboard] PrevClose fetch error:', e);
            }
        };

        fetchPrevClose();
        const interval = setInterval(fetchPrevClose, 60000);
        return () => clearInterval(interval);
    }, [selectedTicker]);

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

    useEffect(() => {
        const isTickerChange = lastTickerRef.current !== selectedTicker;
        lastTickerRef.current = selectedTicker;

        const fetchChartData = async (showLoading: boolean = false) => {
            if (!selectedTicker) return;

            // Show loading only on ticker change, not on periodic refresh
            if (showLoading) {
                setChartLoading(true);
            }

            try {
                const res = await fetch(`/api/chart?symbol=${selectedTicker}&range=1d`);
                if (res.ok) {
                    const json = await res.json();
                    const newData = json.data || [];
                    // Only update if data actually changed (prevents unnecessary re-render)
                    if (newData.length > 0) {
                        setChartHistory(newData);
                    }
                }
            } catch (e) {
                console.error('[Dashboard] Chart fetch error:', e);
            }
            setChartLoading(false);
        };

        // Show loading on ticker change or first load
        fetchChartData(isTickerChange || chartHistory.length === 0);

        // Silent background refresh every 30s (leverages API cache)
        const interval = setInterval(() => fetchChartData(false), 30000);
        return () => clearInterval(interval);
    }, [selectedTicker]);

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
                        const priceInfo = getDisplayPrices({
                            underlyingPrice: data?.underlyingPrice || null,
                            prevClose: data?.prevClose || null,
                            regularCloseToday: data?.regularCloseToday || null,
                            intradayChangePct: data?.intradayChangePct || null,
                            changePercent: data?.changePercent || null,
                            session: data?.session || 'CLOSED',
                            extended: data?.extended
                        });

                        return (
                            <PriceDisplay
                                intradayPrice={priceInfo.mainPrice}
                                intradayChangePct={priceInfo.mainChangePct}
                                extendedPrice={priceInfo.extPrice}
                                extendedChangePct={priceInfo.extChangePct}
                                extendedLabel={priceInfo.extLabel}
                                sessionStatus={data?.session === 'CLOSED' ? 'CLOSED' : ''}
                                size="md"
                                showExtended={priceInfo.showExtended}
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
                    {/* Net GEX */}
                    <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.netGex || 0) < 0 ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                        {(data?.netGex || 0) < 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-amber-400" />
                            <span className="text-[10px] uppercase tracking-wider text-white">Net GEX</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-xl font-mono font-bold ${(data?.netGex || 0) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {gexDisplay}
                            </span>
                            <span className="text-xs text-white">{(data?.netGex || 0) > 0 ? "안정적" : "변동성 ↑"}</span>
                        </div>
                    </div>

                    {/* Gamma Flip */}
                    <div className={`relative p-4 rounded-xl border overflow-hidden ${data?.gammaFlipLevel && data?.underlyingPrice && data.underlyingPrice < data.gammaFlipLevel ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                        {data?.gammaFlipLevel && data?.underlyingPrice && data.underlyingPrice < data.gammaFlipLevel && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                        <div className="flex items-center gap-2 mb-2">
                            <Radio className="w-4 h-4 text-cyan-400" />
                            <span className="text-[10px] uppercase tracking-wider text-white">Gamma Flip</span>
                        </div>
                        <div className="flex items-center gap-2">
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

                    {/* Squeeze */}
                    <div className={`relative p-4 rounded-xl border overflow-hidden ${data?.squeezeRisk === 'EXTREME' || data?.squeezeRisk === 'HIGH' ? 'bg-amber-500/15 backdrop-blur-md border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.4)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                        {(data?.squeezeRisk === 'EXTREME' || data?.squeezeRisk === 'HIGH') && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-400 animate-pulse" />}
                        {(() => {
                            const score = data?.squeezeScore ?? 0;
                            const risk = data?.squeezeRisk ?? 'LOW';
                            const color = risk === 'EXTREME' ? 'text-rose-400' : risk === 'HIGH' ? 'text-amber-400' : risk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400';
                            const bgColor = risk === 'EXTREME' ? 'bg-rose-500/80' : risk === 'HIGH' ? 'bg-amber-500/80' : risk === 'MEDIUM' ? 'bg-yellow-500/80 text-black' : 'bg-emerald-500/80';
                            return (
                                <>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Zap className="w-4 h-4 text-indigo-400" />
                                        <span className="text-[10px] uppercase tracking-wider text-white">Squeeze</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${bgColor} text-white`}>{risk}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xl font-mono font-bold ${color}`}>{score}%</span>
                                        <span className="text-[9px] text-white">
                                            {score >= 70 ? '급등/급락 가능' : score >= 50 ? '변동성 주의' : score >= 30 ? '보통' : '안정'}
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
                                <div className="flex items-center gap-2 mb-2">
                                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                                    <span className="text-[10px] uppercase tracking-wider text-white">VWAP 거리</span>
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
                    {/* Max Pain */}
                    <div className="p-4 bg-[#0d1829]/80 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-cyan-400" />
                            <span className="text-[10px] uppercase tracking-wider text-white">Max Pain</span>
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

                    {/* Call Wall / Put Floor */}
                    <div className="p-4 bg-[#0d1829]/80 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            <div className="flex flex-col leading-tight">
                                <span className="text-[10px] uppercase tracking-wider text-white">Call Wall</span>
                                <span className="text-[10px] uppercase tracking-wider text-white">Put Floor</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-mono font-bold text-emerald-400">${data?.levels?.callWall || "—"}</span>
                            <span className="text-slate-500">/</span>
                            <span className="text-lg font-mono font-bold text-rose-400">${data?.levels?.putFloor || "—"}</span>
                        </div>
                    </div>

                    {/* Dark Pool % (NEW) */}
                    {(() => {
                        const dp = data?.darkPoolPct ?? 0;
                        const isAlert = dp >= 45;
                        const sessionLabel = data?.session === 'PRE' ? 'PRE' : data?.session === 'POST' ? 'POST' : data?.session === 'REG' ? 'LIVE' : 'CLOSED';
                        const sessionColor = data?.session === 'PRE' ? 'text-amber-400 bg-amber-500/20 border-amber-500/30'
                            : data?.session === 'POST' ? 'text-purple-400 bg-purple-500/20 border-purple-500/30'
                                : data?.session === 'REG' ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'
                                    : 'text-slate-400 bg-slate-500/20 border-slate-500/30';
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-purple-500/10 backdrop-blur-md border-purple-400/40 shadow-[0_0_25px_rgba(168,85,247,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-400 to-purple-500" />}
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity className="w-4 h-4 text-purple-400" />
                                    <span className="text-[10px] uppercase tracking-wider text-white">Dark Pool %</span>
                                    {dp >= 55 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple-500/80 text-white">HIGH</span>}
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ml-auto ${sessionColor}`}>{sessionLabel}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${dp >= 55 ? 'text-purple-400' : dp >= 45 ? 'text-purple-300' : 'text-white'}`}>
                                        {dp > 0 ? `${dp.toFixed(1)}%` : '—'}
                                    </span>
                                    <span className="text-xs text-white">{dp >= 55 ? '기관 집중' : dp >= 45 ? '기관 활동' : '보통'}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Short Vol % (NEW) */}
                    {(() => {
                        const sv = data?.shortVolPct ?? 0;
                        const isAlert = sv >= 40;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingDown className="w-4 h-4 text-rose-400" />
                                    <span className="text-[10px] uppercase tracking-wider text-white">Short Vol %</span>
                                    {sv >= 50 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-rose-500/80 text-white">HIGH</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${sv >= 50 ? 'text-rose-400' : sv >= 40 ? 'text-amber-400' : 'text-white'}`}>
                                        {sv > 0 ? `${sv.toFixed(1)}%` : '—'}
                                    </span>
                                    <span className="text-xs text-white">{sv >= 50 ? '공매도 집중' : sv >= 40 ? '공매도 활동' : '보통'}</span>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* ── ROW 3: 변동성 + 당일 매매 (Volatility & Intraday) ── */}
                <div className="grid grid-cols-4 gap-3">
                    {/* ATM IV */}
                    <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.atmIv || 0) > 50 ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                        {(data?.atmIv || 0) > 50 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-purple-400" />
                            <span className="text-[10px] uppercase tracking-wider text-white">ATM IV</span>
                            <span className="text-[9px] text-slate-400">내재변동성</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-mono font-bold text-white">
                                {data?.atmIv ? `${data.atmIv}%` : "—"}
                            </span>
                            <span className="text-xs text-white">{(data?.atmIv || 0) > 50 ? "고변동" : "저변동"}</span>
                        </div>
                    </div>

                    {/* P/C Ratio */}
                    <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.pcr || 1) < 0.7 ? 'bg-emerald-500/10 backdrop-blur-md border-emerald-400/40 shadow-[0_0_25px_rgba(52,211,153,0.3)]' : (data?.pcr || 1) > 1.3 ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                        {(data?.pcr || 1) < 0.7 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-500" />}
                        {(data?.pcr || 1) > 1.3 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                        <div className="flex items-center gap-2 mb-2">
                            {(data?.pcr || 1) < 0.7 ? (
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                            ) : (data?.pcr || 1) > 1.3 ? (
                                <TrendingDown className="w-4 h-4 text-rose-400" />
                            ) : (
                                <Activity className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="text-[10px] uppercase tracking-wider text-white">P/C Ratio</span>
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${(data?.pcr || 1) < 0.7 ? 'bg-emerald-500/60 text-white' : (data?.pcr || 1) > 1.3 ? 'bg-rose-500/60 text-white' : 'bg-slate-600/60 text-slate-300'}`}>
                                {(data?.pcr || 1) < 0.7 ? '콜 우위' : (data?.pcr || 1) > 1.3 ? '풋 우위' : '중립'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-xl font-mono font-bold ${(data?.pcr || 1) < 0.7 ? "text-emerald-400" : (data?.pcr || 1) > 1.3 ? "text-rose-400" : "text-white"}`}>
                                {data?.pcr?.toFixed(2) || "—"}
                            </span>
                            <span className="text-[10px] text-slate-400">Put/Call</span>
                        </div>
                    </div>

                    {/* 0DTE Impact (NEW) */}
                    {(() => {
                        const zdte = data?.zeroDtePct ?? 0;
                        const isAlert = zdte >= 30;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-amber-500/10 backdrop-blur-md border-amber-400/40 shadow-[0_0_25px_rgba(251,191,36,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-500 animate-pulse" />}
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap className="w-4 h-4 text-amber-400" />
                                    <span className="text-[10px] uppercase tracking-wider text-white">0DTE Impact</span>
                                    {zdte >= 60 && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/80 text-white">극심</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${zdte >= 60 ? 'text-amber-400' : zdte >= 30 ? 'text-yellow-400' : 'text-white'}`}>
                                        {zdte > 0 ? `${zdte}%` : '—'}
                                    </span>
                                    <span className="text-xs text-white">{zdte >= 60 ? '큰 움직임' : zdte >= 30 ? '변동성 확대' : '보통'}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Implied Move (NEW) */}
                    {(() => {
                        const im = data?.impliedMovePct ?? 0;
                        const isAlert = im >= 3;
                        return (
                            <div className={`relative p-4 rounded-xl border overflow-hidden ${isAlert ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                                {isAlert && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity className="w-4 h-4 text-cyan-400" />
                                    <span className="text-[10px] uppercase tracking-wider text-white">Implied Move</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-mono font-bold ${im >= 5 ? 'text-cyan-400' : im >= 3 ? 'text-cyan-300' : 'text-white'}`}>
                                        {im > 0 ? `±${im}%` : '—'}
                                    </span>
                                    {im >= 5 ? (
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-cyan-500/80 text-white">급등/급락</span>
                                    ) : im >= 3 ? (
                                        <span className="text-xs text-cyan-300">변동 예고</span>
                                    ) : (
                                        <span className="text-xs text-slate-400">안정</span>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
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
                                    currentPrice={data?.underlyingPrice ?? undefined}
                                    prevClose={prevClose}
                                    alphaLevels={{
                                        callWall: data?.levels?.callWall ?? undefined,
                                        putFloor: data?.levels?.putFloor ?? undefined,
                                        maxPain: data?.maxPain ?? undefined
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                차트 데이터 없음
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
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">5-Day History</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
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
// [LOCALIZATION] Format time based on user's locale
function SignalItem({ signal, locale }: { signal: { time: string; ticker: string; type: string; message: string }, locale: string }) {
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
                <span className="font-semibold text-xs text-white">{signal.ticker}</span>
                <span className={`text-[9px] font-medium ${style.text}`}>{signal.type}</span>
                <span className="text-[9px] text-white/70 ml-auto">{formattedTime}</span>
            </div>

            {/* Message */}
            <p className="text-[11px] text-white leading-relaxed pl-2">{signal.message}</p>
        </div>
    );
}


// Signal Feed Panel
// [LOCALIZATION] Uses locale for time formatting, [SORTING] Newest signals first
// [MARKET HOURS] Only active during regular trading session (OPEN)
function SignalFeedPanel() {
    const { signals, selectedTicker, tickers } = useDashboardStore();
    const locale = useLocale();
    const data = tickers[selectedTicker];
    const session = data?.session || 'CLOSED';
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
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Signal Feed</h2>
                </div>
                {isOpen ? (
                    <span className="text-[10px] text-slate-500">{signals.length}</span>
                ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500">CLOSED</span>
                )}
            </div>
            <div className="overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-200px)]">
                {!isOpen ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                        <Radio className="w-5 h-5 text-slate-600" />
                        <p className="text-slate-500 text-xs text-center">본장 시간에만 활성화</p>
                        <p className="text-slate-600 text-[10px]">9:30 AM ~ 4:00 PM ET</p>
                    </div>
                ) : sortedSignals.length > 0 ? (
                    sortedSignals.map((signal, i) => (
                        <SignalItem key={i} signal={signal} locale={locale} />
                    ))
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-500 text-xs">시그널 대기 중...</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Mobile Tab Component
function MobileTabBar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) {
    const { signals } = useDashboardStore();

    const tabs = [
        { id: 'chart', label: '차트', icon: BarChart3 },
        { id: 'list', label: '종목', icon: List },
        { id: 'signal', label: '시그널', icon: Radio, badge: signals.length }
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
                                <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center">
                                    {tab.badge > 9 ? '9+' : tab.badge}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// Main Dashboard Page
export default function DashboardPage() {
    const searchParams = useSearchParams();
    const { setSelectedTicker, fetchDashboardData, isLoading, dashboardTickers } = useDashboardStore();
    const [initialized, setInitialized] = useState(false);
    const [mobileTab, setMobileTab] = useState('chart');

    // Initialize from URL params
    useEffect(() => {
        const ticker = searchParams.get('t');
        if (ticker) {
            setSelectedTicker(ticker.toUpperCase());
        }
        setInitialized(true);
    }, [searchParams, setSelectedTicker]);

    // Fetch data on mount and set up auto-refresh
    useEffect(() => {
        if (!initialized) return;

        // Use dashboardTickers if available, otherwise use default
        const tickersToFetch = dashboardTickers.length > 0 ? dashboardTickers : undefined;
        fetchDashboardData(tickersToFetch);

        const interval = setInterval(() => {
            const currentTickers = dashboardTickers.length > 0 ? dashboardTickers : undefined;
            fetchDashboardData(currentTickers);
        }, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [initialized, fetchDashboardData, dashboardTickers]);

    return (
        <div className="min-h-screen bg-[#050a14] text-white flex flex-col">
            {/* Site Header */}
            <LandingHeader />

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

