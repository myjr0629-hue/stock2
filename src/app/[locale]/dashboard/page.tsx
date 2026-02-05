"use client";

import React, { useEffect, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/stores/dashboardStore";
import { LandingHeader } from "@/components/landing/LandingHeader";

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
    Loader2
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
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">SPY</span>
                    <span className="font-mono text-sm text-white">
                        ${market?.spy?.price?.toFixed(2) || "—"}
                    </span>
                    {market?.spy?.change !== undefined && (
                        <span className={`text-xs font-medium ${market.spy.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {market.spy.change >= 0 ? "+" : ""}{market.spy.change.toFixed(2)}%
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
    const { tickers, setSelectedTicker } = useDashboardStore();
    const data = tickers[ticker];

    const isPositive = (data?.changePercent || 0) >= 0;
    const hasGammaSqueeze = data?.isGammaSqueeze;
    const hasWhale = data?.netGex && Math.abs(data.netGex) > 500000000;

    // [S-78] Extended session logic (Command style)
    const session = data?.session || 'CLOSED';
    const extended = data?.extended;
    let extPrice = 0;
    let extPct = 0;
    let extLabel = '';
    let extColor = '';

    if (session === 'POST' || session === 'CLOSED') {
        if (extended?.postPrice && extended.postPrice > 0) {
            extPrice = extended.postPrice;
            extPct = (extended.postChangePct || 0) * 100;
            extLabel = session === 'CLOSED' ? 'POST' : 'POST';
            extColor = 'text-indigo-400';
        }
    } else if (session === 'PRE') {
        if (extended?.prePrice && extended.prePrice > 0) {
            extPrice = extended.prePrice;
            extPct = (extended.preChangePct || 0) * 100;
            extLabel = 'PRE';
            extColor = 'text-amber-400';
        }
    }

    return (
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
            {/* Left: Logo + Ticker */}
            <div className="flex items-center gap-2">
                <img
                    src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
                    alt={ticker}
                    className="w-6 h-6 rounded bg-[#1a2535] object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = '';
                        (e.target as HTMLImageElement).className = 'w-6 h-6 rounded bg-slate-700 hidden';
                    }}
                />
                <div className="flex items-center gap-1.5">
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
            </div>

            {/* Right: Price (Command style - horizontal layout) */}
            <div className="flex items-center gap-3">
                {/* Main Price + Change */}
                <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm text-white">
                        ${data?.underlyingPrice?.toFixed(2) || "—"}
                    </span>
                    <span className={`text-[10px] font-medium ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPositive ? "+" : ""}{data?.changePercent?.toFixed(2) || "0.00"}%
                    </span>
                </div>
                {/* Separator + Extended Session (POST/PRE) */}
                {extPrice > 0 && (
                    <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                        <span className={`text-[8px] font-bold uppercase ${extColor}`}>{extLabel}</span>
                        <span className="text-xs text-white font-mono">${extPrice.toFixed(2)}</span>
                        <span className={`text-[9px] font-mono ${extPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {extPct > 0 ? "+" : ""}{extPct.toFixed(2)}%
                        </span>
                    </div>
                )}
            </div>
        </button>
    );
}

// Watchlist Panel
function WatchlistPanel() {
    const { tickers, selectedTicker } = useDashboardStore();
    const tickerList = Object.keys(tickers);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Watchlist</h2>
                <span className="text-[10px] text-slate-500">{tickerList.length} 종목</span>
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
                    {/* Main Price + Change */}
                    <span className="font-mono text-xl text-white">
                        ${data?.underlyingPrice?.toFixed(2) || "—"}
                    </span>
                    <span className={`text-lg font-medium ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPositive ? "+" : ""}{data?.changePercent?.toFixed(2) || "0.00"}%
                    </span>
                    {/* POST/PRE Extended Price */}
                    {(() => {
                        const session = data?.session || 'CLOSED';
                        const extended = data?.extended;
                        let extPrice = 0;
                        let extPct = 0;
                        let extLabel = '';
                        let extColor = '';

                        if (extended?.postPrice && extended.postPrice > 0) {
                            extPrice = extended.postPrice;
                            extPct = (extended.postChangePct || 0) * 100;
                            extLabel = 'POST';
                            extColor = 'text-indigo-400';
                        } else if (extended?.prePrice && extended.prePrice > 0) {
                            extPrice = extended.prePrice;
                            extPct = (extended.preChangePct || 0) * 100;
                            extLabel = 'PRE';
                            extColor = 'text-amber-400';
                        }

                        return extPrice > 0 ? (
                            <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
                                <span className={`text-xs font-bold uppercase ${extColor}`}>{extLabel}</span>
                                <span className="text-base text-white font-mono">${extPrice.toFixed(2)}</span>
                                <span className={`text-sm font-mono ${extPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {extPct > 0 ? "+" : ""}{extPct.toFixed(2)}%
                                </span>
                            </div>
                        ) : null;
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

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-4 p-4">
                <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.netGex || 0) < 0 ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                    {(data?.netGex || 0) < 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                    <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Net GEX</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-mono font-bold ${(data?.netGex || 0) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {gexDisplay}
                        </span>
                        <span className="text-[9px] text-white">{(data?.netGex || 0) > 0 ? "안정적" : "변동성 ↑"}</span>
                    </div>
                </div>

                <div className="p-4 bg-[#0d1829]/80 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-cyan-400" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Max Pain</span>
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
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Put/Call Ratio</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-mono font-bold ${(data?.pcr || 1) < 0.7 ? "text-emerald-400" : (data?.pcr || 1) > 1.3 ? "text-rose-400" : "text-white"}`}>
                            {data?.pcr?.toFixed(2) || "—"}
                        </span>
                        <span className="text-[9px] text-white">
                            {(data?.pcr || 1) < 0.7 ? "콜 우위" : (data?.pcr || 1) > 1.3 ? "풋 우위" : "중립"}
                        </span>
                    </div>
                </div>

                <div className="p-4 bg-[#0d1829]/80 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <div className="flex flex-col leading-tight">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">Call Wall</span>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">Put Floor</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-mono font-bold text-emerald-400">${data?.levels?.callWall || "—"}</span>
                        <span className="text-slate-500">/</span>
                        <span className="text-lg font-mono font-bold text-rose-400">${data?.levels?.putFloor || "—"}</span>
                    </div>
                </div>
            </div>

            {/* Premium Metrics Row 2 */}
            <div className="grid grid-cols-4 gap-4 px-4">
                <div className={`relative p-4 rounded-xl border overflow-hidden ${(data?.atmIv || 0) > 50 ? 'bg-cyan-500/10 backdrop-blur-md border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                    {(data?.atmIv || 0) > 50 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-cyan-500" />}
                    <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">ATM IV</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-mono font-bold text-white">
                            {data?.atmIv ? `${data.atmIv}%` : "—"}
                        </span>
                        <span className="text-[9px] text-white">{(data?.atmIv || 0) > 50 ? "고변동" : "저변동"}</span>
                    </div>
                </div>

                {/* Gamma Flip */}
                <div className={`relative p-4 rounded-xl border overflow-hidden ${data?.gammaFlipLevel && data?.underlyingPrice && data.underlyingPrice < data.gammaFlipLevel ? 'bg-rose-500/10 backdrop-blur-md border-rose-400/40 shadow-[0_0_25px_rgba(251,113,133,0.3)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                    {data?.gammaFlipLevel && data?.underlyingPrice && data.underlyingPrice < data.gammaFlipLevel && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-400 to-rose-500" />}
                    <div className="flex items-center gap-2 mb-2">
                        <Radio className="w-4 h-4 text-cyan-400" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Gamma Flip</span>
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

                <div className="p-4 bg-[#0d1829]/80 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Net GEX Flow</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-mono font-bold ${(data?.netGex || 0) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {data?.netGex ? `${data.netGex > 0 ? '+' : ''}${(data.netGex / 1e6).toFixed(1)}M` : "—"}
                        </span>
                        <span className="text-[9px] text-white">{(data?.netGex || 0) > 0 ? "매수세" : "매도세"}</span>
                    </div>
                </div>

                <div className={`relative p-4 rounded-xl border overflow-hidden ${data?.isGammaSqueeze ? 'bg-amber-500/15 backdrop-blur-md border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.4)]' : 'bg-[#0d1829]/80 border-white/5'}`}>
                    {data?.isGammaSqueeze && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-400 animate-pulse" />}
                    <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">Squeeze</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {data?.isGammaSqueeze ? (
                            <span className="text-xl font-bold text-indigo-400 animate-pulse">🔥 ON</span>
                        ) : (
                            <span className="text-xl font-mono font-bold text-slate-500">OFF</span>
                        )}
                        <span className="text-[9px] text-white">{data?.isGammaSqueeze ? "급등 가능" : "정상"}</span>
                    </div>
                </div>
            </div>

            {/* Chart Area: Full height StockChart */}
            <div className="flex-1 overflow-hidden p-4">
                {/* Price History (StockChart) */}
                <div className="h-full bg-[#0d1829]/60 rounded-xl border border-white/5 overflow-hidden flex flex-col">
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
                            <div className="animate-fade-in">
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

// Signal Feed Item with Glassmorphism
function SignalItem({ signal }: { signal: { time: string; ticker: string; type: string; message: string } }) {
    // Glassmorphism styles by type
    const glassStyles: Record<string, { card: string; bar: string; badge: string }> = {
        BUY: {
            card: 'bg-emerald-500/15 backdrop-blur-md border-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.25)]',
            bar: 'from-emerald-400 to-emerald-500',
            badge: 'bg-emerald-500/30 text-emerald-400 border-emerald-400/50'
        },
        SELL: {
            card: 'bg-rose-500/15 backdrop-blur-md border-rose-400/40 shadow-[0_0_20px_rgba(251,113,133,0.25)]',
            bar: 'from-rose-400 to-rose-500',
            badge: 'bg-rose-500/30 text-rose-400 border-rose-400/50'
        },
        WHALE: {
            card: 'bg-amber-500/15 backdrop-blur-md border-amber-400/40 shadow-[0_0_20px_rgba(251,191,36,0.25)]',
            bar: 'from-amber-400 to-amber-500',
            badge: 'bg-amber-500/30 text-amber-400 border-amber-400/50'
        },
        ALERT: {
            card: 'bg-purple-500/15 backdrop-blur-md border-purple-400/40 shadow-[0_0_20px_rgba(168,85,247,0.25)]',
            bar: 'from-purple-400 to-purple-500',
            badge: 'bg-purple-500/30 text-purple-400 border-purple-400/50'
        }
    };

    const style = glassStyles[signal.type] || glassStyles.ALERT;

    return (
        <div className={`relative p-3 rounded-lg border overflow-hidden transition-all hover:scale-[1.02] ${style.card}`}>
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${style.bar}`} />

            <div className="flex items-center justify-between mb-1 pl-2">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">{signal.ticker}</span>
                    <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase rounded border ${style.badge}`}>
                        {signal.type}
                    </span>
                </div>
                <span className="text-[10px] text-slate-400">{signal.time}</span>
            </div>
            <p className="text-xs text-white/90 pl-2">{signal.message}</p>
        </div>
    );
}


// Signal Feed Panel
function SignalFeedPanel() {
    const { signals } = useDashboardStore();

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-cyan-400" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Signal Feed</h2>
                </div>
                <span className="text-[10px] text-slate-500">{signals.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {signals.length > 0 ? (
                    signals.map((signal, i) => (
                        <SignalItem key={i} signal={signal} />
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
    const { setSelectedTicker, fetchDashboardData, isLoading } = useDashboardStore();
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

        fetchDashboardData();

        const interval = setInterval(() => {
            fetchDashboardData();
        }, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [initialized, fetchDashboardData]);

    return (
        <div className="min-h-screen bg-[#050a14] text-white flex flex-col">
            {/* Site Header */}
            <LandingHeader />

            {/* Alpha Status Bar */}
            <AlphaStatusBar />

            {/* Desktop: 25:50:25 Bento Grid */}
            <div className="hidden lg:grid flex-1 grid-cols-[1fr_2fr_1fr] gap-0.5 bg-white/5 p-0.5">
                {/* Left Panel - Watchlist (25%) */}
                <div className="bg-[#0a0f1a] rounded-l-lg overflow-hidden">
                    <WatchlistPanel />
                </div>

                {/* Center Panel - Main Chart (50%) */}
                <div className="bg-[#0a0f1a] overflow-hidden">
                    <MainChartPanel />
                </div>

                {/* Right Panel - Signal Feed (25%) */}
                <div className="bg-[#0a0f1a] rounded-r-lg overflow-hidden">
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

