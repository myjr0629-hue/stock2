"use client";

import React, { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/routing";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useRealtimeData } from "@/providers/WebSocketProvider";
import { calcPriceDisplay } from "@/utils/calcPriceDisplay";
import { getFlashStyle, usePriceFlash, tickerDelay } from "@/components/ui/PriceDisplay";
import { Radio } from "lucide-react";
import clsx from "clsx";

// ──── 1. Market Status Component ────

function MobileMarketPulse() {
    const market = useDashboardStore(s => s.market);
    const [statusLabel, setStatusLabel] = useState<string>('CLOSED');
    const [countdown, setCountdown] = useState<string>('');

    useEffect(() => {
        const updateStatus = () => {
            const now = new Date();
            const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const day = et.getDay();
            const min = et.getHours() * 60 + et.getMinutes();

            const isWeekend = day === 0 || day === 6;
            if (isWeekend || market?.isHoliday) {
                setStatusLabel(market?.isHoliday ? 'HOLIDAY' : 'WEEKEND');
                setCountdown('');
                return;
            }

            const PRE_OPEN = 4 * 60;
            const REG_OPEN = 9 * 60 + 30;
            const REG_CLOSE = 16 * 60;
            const AFTER_CLOSE = 20 * 60;

            let sLabel = 'CLOSED';
            let targetMin = PRE_OPEN + 24 * 60;

            if (min >= PRE_OPEN && min < REG_OPEN) { sLabel = 'PRE'; targetMin = REG_OPEN; }
            else if (min >= REG_OPEN && min < REG_CLOSE) { sLabel = 'OPEN'; targetMin = REG_CLOSE; }
            else if (min >= REG_CLOSE && min < AFTER_CLOSE) { sLabel = 'AFTER'; targetMin = AFTER_CLOSE; }
            else if (min < PRE_OPEN) { targetMin = PRE_OPEN; }

            setStatusLabel(sLabel);

            const diff = targetMin - min;
            const hrs = Math.floor(diff / 60);
            const m = diff % 60;
            setCountdown(hrs > 0 ? `${hrs}h ${m}m` : `${m}m`);
        };
        updateStatus();
        const intv = setInterval(updateStatus, 60000);
        return () => clearInterval(intv);
    }, [market]);

    const isLive = statusLabel === 'PRE' || statusLabel === 'OPEN' || statusLabel === 'AFTER';

    return (
        <div className="px-5 py-4 border-b border-white/[0.04] bg-[#050a14]">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black tracking-tight text-white mb-0.5 font-jakarta">Market Pulse</h1>
                    <div className="flex items-center gap-2">
                        {isLive ? (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-[10px] font-bold text-emerald-400 tracking-wide">{statusLabel}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                                <span className="text-[10px] font-bold text-slate-400 tracking-wide">{statusLabel}</span>
                            </div>
                        )}
                        {countdown && (
                            <span className="text-xs font-semibold text-slate-400 font-mono">
                                In {countdown}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ──── 2. Watchlist Item (Premium Native Row) ────

const WatchListRow = React.memo(function WatchListRow({ ticker }: { ticker: string }) {
    const data = useDashboardStore(s => s.tickers[ticker]);
    const fetchSingleTicker = useDashboardStore(s => s.fetchSingleTicker);
    const lastUpdated = useDashboardStore(s => s.lastUpdated);
    const router = useRouter();

    const formatGex = (val: number) => {
        if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(1) + 'B';
        if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + 'M';
        return val.toString();
    };

    const hasGammaSqueeze = data?.isGammaSqueeze;
    const hasWhale = data?.netGex && Math.abs(data.netGex) > 500000000;
    const alphaGrade = data?.alpha?.grade;
    const gexVal = data?.netGex;

    const extSession = (data?.session || 'CLOSED').toUpperCase();
    const extPriceVal = extSession === 'POST' || extSession === 'CLOSED' ? (data?.extended?.postPrice || 0) : (data?.extended?.prePrice || 0);
    const extPctVal = extSession === 'POST' || extSession === 'CLOSED' ? (data?.extended?.postChangePct || 0) : (data?.extended?.preChangePct || 0);
    const extLabelVal = extPriceVal > 0 ? (extSession === 'POST' || extSession === 'CLOSED' ? 'POST' : 'PRE') : undefined;

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
    const isPositive = mainChangePct >= 0;
    
    // EXT Price computation
    const extPrice = priceResult.activeExtPrice;
    const extChangePct = priceResult.activeExtPct;
    const extLabel = priceResult.activeExtLabel?.replace(/\s*\(.*\)/, '').replace(/\s*(CLOSE|CLOSED)$/i, '').trim() || priceResult.activeExtLabel;

    const wlFlash = usePriceFlash(mainPrice, tickerDelay(ticker));
    const wf = getFlashStyle(wlFlash);

    // Navigate to Detail Page (Command)
    const handleTap = () => {
        router.push(`/ticker/${ticker}?range=1d`);
    };

    return (
        <div 
            onClick={handleTap}
            className="flex items-center justify-between px-5 py-3 border-b border-white/[0.02] active:bg-white/[0.04] transition-colors"
        >
            <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-[#0d1424] border border-white/[0.04] flex items-center justify-center p-1.5 shadow-xl relative">
                    {data?.session && data.session !== 'CLOSED' && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#050a14]" />
                    )}
                    <img
                        loading="lazy"
                        src={`/api/logo/${ticker}`}
                        alt={ticker}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-[17px] text-white leading-tight font-jakarta">{ticker}</span>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {alphaGrade && (
                            <span className={clsx(
                                "px-1.5 py-px rounded text-[9px] font-black tracking-wider uppercase border",
                                alphaGrade.startsWith('A') || alphaGrade.startsWith('B') 
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                    : alphaGrade.startsWith('C') 
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            )}>
                                {alphaGrade}
                            </span>
                        )}
                        {hasGammaSqueeze && (
                            <span className="px-1.5 py-px rounded bg-indigo-500/20 border border-indigo-500/20 text-[9px] font-bold text-indigo-400">SQZ</span>
                        )}
                        {hasWhale && !hasGammaSqueeze && (
                            <span className="px-1.5 py-px rounded bg-purple-500/20 border border-purple-500/20 text-[9px] font-bold text-purple-400">WHALE</span>
                        )}
                        {gexVal != null && (
                            <span className={clsx(
                                "px-1.5 py-px rounded border text-[9px] font-bold",
                                gexVal > 0 ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400/80" : "bg-rose-500/5 border-rose-500/10 text-rose-400/80"
                            )}>
                                GEX {formatGex(gexVal)}
                            </span>
                        )}
                        {!hasGammaSqueeze && !hasWhale && !gexVal && !alphaGrade && (
                            <span className="text-xs text-slate-500 font-medium truncate max-w-[100px]">{ticker}</span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex flex-col items-end">
                {mainPrice > 0 ? (
                    <span className={clsx("font-mono text-[17px] tracking-tight font-medium", wf.color)} style={wf.style}>
                        ${mainPrice.toFixed(2)}
                    </span>
                ) : (
                    <div className="h-5 w-16 bg-white/5 animate-pulse rounded" />
                )}
                
                <div className="flex items-center gap-1.5 mt-0.5">
                    {/* Extended Hours Display */}
                    {extPrice > 0 && (
                        <span className={clsx(
                            "px-1 py-0.5 rounded text-[9px] font-bold font-mono tracking-tighter border",
                            extChangePct >= 0 ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        )}>
                            {extLabel}: {extChangePct > 0 ? "+" : ""}{extChangePct.toFixed(2)}%
                        </span>
                    )}
                    {/* Main Change % */}
                    {mainPrice > 0 ? (
                        <span className={clsx(
                            "px-1.5 py-0.5 rounded text-[11px] font-bold font-mono tracking-tight",
                            isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>
                            {isPositive ? "+" : ""}{mainChangePct.toFixed(2)}%
                        </span>
                    ) : (
                        <div className="h-4 w-12 bg-white/5 animate-pulse rounded" />
                    )}
                </div>
            </div>
        </div>
    );
});

// ──── 3. Main Dashboard Client ────

export function MobileDashboardClient({ initialTickers, initialQuotes }: { initialTickers: string[], initialQuotes: any }) {
    const dashboardTickers = useDashboardStore(s => s.dashboardTickers);
    const initializeStore = useDashboardStore(s => s.initializeStore);
    const fetchDashboardData = useDashboardStore(s => s.fetchDashboardData);
    const fetchPriceOnly = useDashboardStore(s => s.fetchPriceOnly);
    const updateRealtimePrice = useDashboardStore(s => s.updateRealtimePrice);
    
    const hasInitializedStore = useRef(false);
    if (!hasInitializedStore.current) {
        initializeStore(initialTickers, initialQuotes);
        hasInitializedStore.current = true;
    }

    const tickersRef = useRef(dashboardTickers);
    useEffect(() => { tickersRef.current = dashboardTickers; }, [dashboardTickers]);

    // Polling Logic
    useEffect(() => {
        let fullInterval: ReturnType<typeof setInterval> | null = null;
        let priceInterval: ReturnType<typeof setInterval> | null = null;
        const getTickerList = () => tickersRef.current.length > 0 ? tickersRef.current : undefined;

        const startPolling = () => {
            if (fullInterval) clearInterval(fullInterval);
            if (priceInterval) clearInterval(priceInterval);
            fullInterval = setInterval(() => fetchDashboardData(getTickerList()), 30000);
            priceInterval = setInterval(() => fetchPriceOnly(getTickerList()), 2000);
        };

        const stopPolling = () => {
            if (fullInterval) clearInterval(fullInterval);
            if (priceInterval) clearInterval(priceInterval);
        };

        const handleVisibility = () => {
            if (document.hidden) stopPolling();
            else {
                fetchPriceOnly(getTickerList());
                fetchDashboardData(getTickerList());
                startPolling();
            }
        };

        fetchPriceOnly(getTickerList());
        fetchDashboardData(getTickerList());
        startPolling();
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // WebSocket Injection
    const { prices: wsPrices } = useRealtimeData(dashboardTickers);
    const prevWsPricesRef = useRef<Map<string, any>>(new Map());
    useEffect(() => {
        if (!wsPrices || wsPrices.size === 0) return;
        wsPrices.forEach((update, ticker) => {
            const prev = prevWsPricesRef.current.get(ticker);
            if (prev && prev.price === update.price) return; 
            if (update.price > 0) updateRealtimePrice(ticker, update.price, update.changePct);
        });
        prevWsPricesRef.current = new Map(wsPrices);
    }, [wsPrices, updateRealtimePrice]);

    return (
        <div className="min-h-screen bg-[#050a14] pb-24 touch-pan-y">
            <MobileMarketPulse />
            
            <div className="flex flex-col">
                {dashboardTickers.map(ticker => (
                    <WatchListRow key={ticker} ticker={ticker} />
                ))}
            </div>

            {/* Micro Feed Pill */}
            <div className="px-5 mt-6 mb-8 flex justify-center">
                <div className="px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span className="text-xs font-semibold text-cyan-400">Live Signals Active in Details</span>
                </div>
            </div>
        </div>
    );
}
