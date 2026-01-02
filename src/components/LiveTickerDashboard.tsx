"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity, Loader2 } from "lucide-react";
import { StockData, OptionData, NewsItem } from "@/services/stockTypes";
import { OIChart } from "@/components/OIChart";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { GammaLevelsViz } from "@/components/GammaLevelsViz";
import { FlowSniper } from "@/components/FlowSniper";
import { FlowRadar } from "@/components/FlowRadar";

// [FIX] Dynamic import with SSR disabled - Recharts requires DOM measurements
const StockChart = dynamic(() => import("@/components/StockChart").then(mod => mod.StockChart), {
    ssr: false,
    loading: () => (
        <div className="h-[500px] flex items-center justify-center bg-slate-900/40 rounded-md border border-white/10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
    )
});

// [S-56.4.7] Imported or defined locally to avoid server-module leakage
interface ChartDiagnostics {
    ok: boolean;
    reasonKR?: string;
    code?: string;
    points?: number;
}

interface Props {
    ticker: string;
    initialStockData: StockData | null;
    initialNews: NewsItem[];
    range: string;
    buildId?: string;
    chartDiagnostics?: ChartDiagnostics; // [S-56.4.7] No-Silence UX
}

const DecisionGate = ({ ticker, displayPrice, session, structure, krNews }: any) => {
    let status: 'PASS' | 'WATCH' | 'FAIL' = 'WATCH';
    const reasons: string[] = [];
    let actionHint = "";

    const options_status = structure?.options_status;
    const pinZone = structure?.levels?.pinZone;
    const callWall = structure?.levels?.callWall;
    const putFloor = structure?.levels?.putFloor;
    const netGex = structure?.netGex;
    const gammaCoverage = structure?.gammaCoverage;

    const isFail = options_status !== 'OK';
    const isRthOrPre = session === 'RTH' || session === 'PRE' || session === 'MARKET';
    const inIdealPosition = (callWall && putFloor && displayPrice >= putFloor && displayPrice <= callWall) ||
        (pinZone && Math.abs(displayPrice - pinZone) / displayPrice <= 0.02);

    // 1. Base Status logic
    if (isFail) {
        status = 'FAIL';
    } else if (isRthOrPre && inIdealPosition) {
        status = 'PASS';
    } else {
        status = 'WATCH';
    }

    // 2. Specific Conditions & Reasons
    if (session === "CLOSED") {
        reasons.push("시장 폐장: 실행은 프리/정규장 기준으로 판단");
        if (status === 'PASS') status = 'WATCH';
    }

    if (isFail) {
        reasons.push("옵션 검증: 대기 중 → 구조 기반 트리거 비활성");
        actionHint = "옵션 데이터 회복 후 재평가";
    }

    if (!isFail && netGex === null && (gammaCoverage !== undefined && gammaCoverage < 80)) {
        status = 'WATCH';
        reasons.push("감마 커버리지 부족: GEX 해석 보류");
    }

    if (pinZone && Math.abs(displayPrice - pinZone) / displayPrice <= 0.02) {
        reasons.push("가격이 자석 구간 인근");
        if (netGex < 0) reasons.push("숏 감마 성향 → 변동성 확대 가능");
        if (netGex > 0) reasons.push("롱 감마 성향 → 변동성 완화 가능");
    }

    if (callWall && putFloor) {
        if (displayPrice >= putFloor && displayPrice <= callWall) {
            reasons.push("주요 레벨 사이");
        } else if (displayPrice > callWall) {
            reasons.push("상단 레벨 상회");
            if (status === 'PASS') status = 'WATCH';
        } else if (displayPrice < putFloor) {
            reasons.push("하단 레벨 하회");
            if (status === 'PASS') status = 'WATCH';
        }
    }


    // 3. News safety downgrade
    const hasMajorEvent = krNews.some((n: any) => {
        return n.ageHours <= 24 && (n.tag === 'EARNINGS' || n.tag === 'REGULATION');
    });
    // [New] Rumor Check (Gemini AI)
    const hasRumor = krNews.some((n: any) => n.isRumor && n.ageHours <= 24);

    if (hasMajorEvent) {
        reasons.push("중대 이벤트 뉴스: 보수 운용");
        if (status === 'PASS') status = 'WATCH';
        else if (status === 'WATCH') status = 'FAIL';
    }

    if (hasRumor) {
        reasons.push("⚠️ [AI 감지] 미확인 루머/찌라시 유입");
        // Rumors are high risk, but could be opportunity. We flag it ensuring visibility.
        // We force at least WATCH if currently PASS.
        if (status === 'PASS') status = 'WATCH';
    }

    if (!actionHint) {
        if (status === 'PASS') actionHint = "구조적 우위 확보: 분할 진입 고려";
        else if (status === 'WATCH') actionHint = "관찰 필요: 주요 레벨 도달 시 재진입";
        else actionHint = "진입 금지: 옵션 구조 불확실성 노출";
    }

    return (
        <Card className={`shadow-sm border-l-4 ${status === 'PASS' ? 'border-l-emerald-500 bg-emerald-950/20' :
            status === 'WATCH' ? 'border-l-amber-500 bg-amber-950/20' :
                'border-l-rose-500 bg-rose-950/20'
            } overflow-hidden hover:shadow-md transition-shadow border-t-0 border-r-0 border-b-0`}>
            <CardContent className="py-3 px-3">
                {/* Status Badge (Compact) */}
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] text-amber-500 font-bold">종합 리스크 통제실</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        status === 'WATCH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                        {status}
                    </span>
                </div>
                <div className="space-y-1.5 mb-2">
                    {reasons.slice(0, 4).map((r, i) => (
                        <div key={i} className="text-[11px] font-bold text-slate-400 flex items-start gap-2">
                            <span className="mt-1 w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                            <span className="leading-tight">{r}</span>
                        </div>
                    ))}
                    {reasons.length === 0 && <div className="text-[11px] text-slate-500 italic">특이 사항 없음 (안전)</div>}
                </div>
                {/* Rumor Detection Status (Always Shown) */}
                <div className="flex items-center justify-between text-[10px] mb-2 py-1.5 px-2 rounded bg-slate-800/50 border border-white/5">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">AI 루머 감지</span>
                    {hasRumor ? (
                        <span className="text-rose-400 font-black flex items-center gap-1">
                            <AlertCircle size={10} /> 감지됨
                        </span>
                    ) : (
                        <span className="text-emerald-400 font-black">✓ 미감지</span>
                    )}
                </div>
                <div className="text-[11px] font-black text-slate-400 border-t border-white/5 pt-2 flex items-center gap-2">
                    <Zap size={10} className="text-amber-400 shrink-0" />
                    <span className="truncate text-slate-300">{actionHint}</span>
                </div>
            </CardContent>
        </Card>
    );
};

export function LiveTickerDashboard({ ticker, initialStockData, initialNews, range, buildId, chartDiagnostics }: Props) {
    // --- Live Data State ---
    const [liveQuote, setLiveQuote] = useState<any>(null);
    const [options, setOptions] = useState<any>(null);
    const [structure, setStructure] = useState<any>(null);
    const [krNews, setKrNews] = useState<any[]>([]);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [structLoading, setStructLoading] = useState(false);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [newsLoading, setNewsLoading] = useState(false);
    const [selectedExp, setSelectedExp] = useState<string>("");

    // [Phase 50] Tab Navigation
    const [activeTab, setActiveTab] = useState<'COMMAND' | 'FLOW'>('COMMAND');

    // [S-45] SSOT Integration
    const { status: marketStatus } = useMarketStatus();
    // [S-46] Macro SSOT Integration
    const { snapshot: macroData } = useMacroSnapshot();

    // SSOT Override for session status (S-45)SOT says Closed/Holiday, we force "CLOSED" even if liveQuote says "PRE"
    const effectiveSession = (marketStatus.isHoliday || marketStatus.market === 'closed')
        ? 'CLOSED'
        : liveQuote?.session || 'CLOSED'; // Fallback if liveQuote null

    const displayLabel = marketStatus.isHoliday
        ? `CLOSED (${marketStatus.holidayName})`
        : marketStatus.market === 'closed'
            ? 'CLOSED'
            : liveQuote?.session || 'CLOSED';

    // --- Fetchers ---
    const fetchKrNews = async () => {
        setNewsLoading(true);
        try {
            const res = await fetch(`/api/live/news?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setKrNews(data.items || []);
            }
        } catch (e) { console.error(e); } finally { setNewsLoading(false); }
    };
    const fetchQuote = async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/ticker?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setLiveQuote(data);
            }
        } catch (e) { console.error(e); } finally { setQuoteLoading(false); }
    };

    const fetchStructure = async (exp?: string) => {
        setStructLoading(true);
        try {
            const url = `/api/live/options/structure?t=${ticker}${exp ? `&exp=${exp}` : ""}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setStructure(data);
                if (!exp && data.expiration) setSelectedExp(data.expiration);
            }
        } catch (e) {
            console.error(e);
        } finally { setStructLoading(false); }
    };

    const fetchOptions = async () => {
        setOptionsLoading(true);
        try {
            const atmRes = await fetch(`/api/live/options/atm?t=${ticker}`);
            if (atmRes.ok) {
                const data = await atmRes.json();
                setOptions(data);
            }
            await fetchStructure();
        } catch (e) {
            console.error(e);
            setOptions({ options_status: "PENDING" });
        } finally { setOptionsLoading(false); }
    };

    // Initial Load & Polling
    useEffect(() => {
        fetchQuote();
        fetchKrNews();
        const interval = setInterval(fetchQuote, 10000); // Poll quote every 10s
        return () => {
            clearInterval(interval);
        };
    }, [ticker]);

    useEffect(() => {
        fetchOptions();
    }, [ticker]);

    if (!initialStockData) return <div>Data Unavailable</div>;

    // Derived Display Values (Truth Table from API)
    // [User Requirement] Main Price = Official Intraday Close ONLY.
    // Pre/Post prices must ONLY be shown in the badge.

    // Get key reference prices
    // CRITICAL: "Intraday Close" = LAST Regular Session Close.
    // API returns: regularCloseToday (today's close if market closed) or prevRegularClose (yesterday's close).
    // During Pre-Market Jan 2, prevRegularClose = Dec 31 Close ($186.50)
    const officialClose = liveQuote?.prices?.regularCloseToday   // Today's Close (if market already closed today)
        || liveQuote?.prices?.prevRegularClose   // Last Trading Day's Close
        || liveQuote?.prevClose                  // Legacy fallback
        || initialStockData.prevClose;           // SSR fallback

    // prevDayClose = The day BEFORE the officialClose (for change % calculation)
    // If officialClose is Dec 31, prevDayClose should be Dec 30 close.
    // API now exposes prevPrevRegularClose for this purpose.
    const prevDayClose = liveQuote?.prices?.prevPrevRegularClose
        || liveQuote?.baseline?.value
        || initialStockData.prevClose;

    // 1. Determine Main Display Price (Intraday ONLY)
    // ALWAYS show officialClose. During REG session, we can show live price,
    // but user wants Intraday (Close) to be fixed, not live ticking.
    // Actually re-reading user: "항상 intraday 가격만 나오게 하라고" = ALWAYS Intraday only.
    // So even during REG, we show the LATEST official close, not live tick.
    // Wait, that doesn't make sense during REG...
    // Let me re-interpret: Main = Intraday Close (not Pre/Post price).
    // During REG, intraday close IS the live price (it updates tick by tick).
    // During PRE/POST/CLOSED, intraday close is locked to last REG close.
    let displayPrice = officialClose; // Default to Official Close

    if (effectiveSession === 'REG' || effectiveSession === 'RTH' || effectiveSession === 'MARKET') {
        // Regular Session: Use live price (this IS the current intraday price)
        displayPrice = liveQuote?.prices?.lastTrade || liveQuote?.price || officialClose;
    }
    // For PRE, POST, CLOSED: displayPrice remains as officialClose (locked)

    // 2. Determine Extended Price (for Badge)
    let activeExtPrice = 0;
    let activeExtType = "";

    if (effectiveSession === "PRE") {
        // API returns extended.prePrice and prices.prePrice
        activeExtPrice = liveQuote?.extended?.prePrice || liveQuote?.prices?.prePrice || initialStockData.extPrice || 0;
        activeExtType = "PRE";
    } else if (effectiveSession === "POST") {
        activeExtPrice = liveQuote?.extended?.postPrice || liveQuote?.prices?.postPrice || initialStockData.extPrice || 0;
        activeExtType = "POST";
    }

    // 3. Change Calculation (Main Price vs Previous Day Close)
    // Example: If officialClose = 186.50 and prevDayClose = 187.54, change = -0.55%
    let displayChangePct = 0;

    if (displayPrice && prevDayClose && prevDayClose > 0) {
        displayChangePct = ((displayPrice - prevDayClose) / prevDayClose) * 100;
    } else {
        displayChangePct = initialStockData.changePercent || 0;
    }

    // [Fix] Calculate Extended Percent for Badge - ALWAYS calculate locally for consistency
    // PRE: vs officialClose (가장 최근 Intraday 종가)
    // POST: vs displayPrice (당일 Regular 종가)
    let activeExtPct = 0;
    if (activeExtPrice && activeExtType) {
        const refPrice = activeExtType === 'PRE' ? officialClose : displayPrice;
        if (refPrice > 0) {
            activeExtPct = ((activeExtPrice - refPrice) / refPrice) * 100;
        }
    }

    // Price Source Badge
    const pSource = liveQuote?.priceSource || initialStockData?.priceSource;
    let pTag = "";
    let pTagStyle = "";

    if (pSource === "OFFICIAL_CLOSE") { pTag = "CLOSE"; pTagStyle = "text-slate-400 bg-slate-800 border-slate-700"; }
    else if (pSource === "POST_CLOSE") { pTag = "POST"; pTagStyle = "text-indigo-400 bg-indigo-950/50 border-indigo-500/30"; }
    else if (pSource === "PRE_OPEN") { pTag = "PRE"; pTagStyle = "text-amber-400 bg-amber-950/50 border-amber-500/30"; }
    else if (pSource === "LIVE_SNAPSHOT") { pTag = "LIVE"; pTagStyle = "text-emerald-400 bg-emerald-950/50 border-emerald-500/30"; }

    // ATM Integrity
    const showOptionsTable = options && options.options_status !== 'PENDING' && options.atmSlice && options.atmSlice.length > 0;
    const optionsPending = !options || options.options_status === 'PENDING' || !options.atmSlice || options.atmSlice.length === 0;
    const showStructure = structure && structure.structure && structure.structure.strikes?.length > 0;

    return (
        <div className="w-full max-w-[1600px] mx-auto space-y-6">

            {/* 1. TOP HEADER (Consolidated Left Layout) */}
            <div className="flex flex-col gap-4 pb-6 border-b border-white/10">
                {/* Row 1: Identity & Price & Extended (Inline) */}
                <div className="flex items-end gap-x-6 flex-wrap">
                    {/* Identity Group */}
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                            <img
                                src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                alt={`${ticker} logo`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).parentElement!.classList.add('hidden');
                                }}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter">{ticker}</h1>
                                <FavoriteToggle ticker={ticker} />
                                {quoteLoading && <RefreshCw className="animate-spin text-slate-500" size={14} />}
                            </div>
                            <p className="text-sm text-slate-500 font-bold tracking-tight uppercase">{initialStockData.name}</p>
                        </div>
                    </div>

                    {/* Main Price Group (Inline, Reduced Size) */}
                    {/* [Fix] ALWAYS use displayPrice = Intraday Close. No fallback to lastTrade. */}
                    <div className="hidden sm:block pb-1">
                        <div className="flex items-baseline gap-3">
                            <div className="text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums">
                                ${displayPrice?.toFixed(2) || '—'}
                            </div>
                            <div className={`text-lg font-bold font-mono tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    {/* Extended Session Badge (Inline with Price) */}
                    {activeExtPrice && (
                        <div className="hidden sm:block pb-1.5">
                            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeExtType === 'PRE' ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />

                                <div className="flex flex-col leading-none">
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeExtType === 'PRE' ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {activeExtType === 'PRE' ? 'Pre' : 'Post'}
                                        </span>
                                        <span className="text-xs font-bold text-slate-200 tabular-nums">
                                            ${activeExtPrice.toFixed(2)}
                                        </span>
                                        <span className={`text-[10px] font-mono font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Mobile Only: Price & Extended Row */}
                {/* [Fix] ALWAYS use displayPrice = Intraday Close. No fallback to lastTrade. */}
                <div className="flex flex-col gap-2 sm:hidden">
                    <div className="flex items-baseline gap-3">
                        <div className="text-4xl font-black text-white tracking-tighter tabular-nums">
                            ${displayPrice?.toFixed(2) || '—'}
                        </div>
                        <div className={`text-xl font-bold font-mono tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                        </div>
                    </div>

                    {/* Extended Mobile */}
                    {activeExtPrice && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md w-fit">
                            <div className={`w-1.5 h-1.5 rounded-full ${activeExtType === 'PRE' ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                            <div className="flex items-baseline gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${activeExtType === 'PRE' ? 'text-amber-400' : 'text-indigo-400'}`}>
                                    {activeExtType === 'PRE' ? 'Pre' : 'Post'}
                                </span>
                                <span className="text-sm font-bold text-slate-200 tabular-nums">
                                    ${activeExtPrice.toFixed(2)}
                                </span>
                                <span className={`text-xs font-mono font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* [Phase 50] Tab Navigation */}
            <div className="flex items-center gap-1 bg-slate-900/50 w-fit p-1 rounded-md border border-white/5 mb-6">
                <button
                    onClick={() => setActiveTab('COMMAND')}
                    className={`px-6 py-2 text-[10px] font-black rounded-md transition-all uppercase tracking-[0.15em] ${activeTab === 'COMMAND' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                >
                    Command
                </button>
                <button
                    onClick={() => setActiveTab('FLOW')}
                    className={`px-6 py-2 text-[10px] font-black rounded-md transition-all uppercase tracking-[0.15em] flex items-center gap-2 ${activeTab === 'FLOW' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                >
                    <Target size={12} />
                    Flow Radar
                </button>
            </div>

            {/* 2. COMMAND GRID (12 Cols) */}
            {/* 2. COMMAND GRID (2 Columns: Main vs Sidebar) */}
            {activeTab === 'COMMAND' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* MAIN COLUMN (8 Cols) - Breathing Room */}
                    <div className="lg:col-span-8 space-y-8">
                        {/* A. Main Chart Section */}
                        <section className="space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Price History</h3>
                            </div>
                            <div className="h-[500px] rounded-md border border-white/10 bg-slate-900/40 overflow-hidden shadow-sm relative backdrop-blur-sm">
                                <StockChart
                                    key={`${ticker}:${range}:${initialStockData.history.length}`}
                                    data={initialStockData.history} // [Restore] Data prop required
                                    color={(displayChangePct || 0) >= 0 ? "#10b981" : "#f43f5e"}
                                    ticker={ticker}
                                    initialRange={range}
                                    // [Fix] Pass ACTIVE price (Pre/Post or Regular) to chart for live reference
                                    currentPrice={activeExtPrice || displayPrice}
                                    prevClose={liveQuote?.prices?.prevRegularClose || (initialStockData as any)?.prices?.prevClose || initialStockData?.prevClose}
                                    rsi={initialStockData.rsi}
                                    return3d={initialStockData.return3d}
                                />
                            </div>
                        </section>

                        {/* B. Advanced Options Analysis */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                                <div className="w-1 h-4 bg-purple-500 rounded-full" />
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Advanced Options Analysis</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Gamma Structure */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-3 bg-slate-500 rounded-full" /> Key Market Levels
                                        </h4>
                                        {(structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone) && (
                                            <span className="text-[10px] text-amber-500 font-black">
                                                Max Pain (최대고통): ${structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone}
                                            </span>
                                        )}
                                    </div>
                                    <Card className="border-white/10 bg-slate-900/40 shadow-sm p-0 overflow-hidden">
                                        <CardContent className="p-0 h-[300px]">
                                            <GammaLevelsViz
                                                currentPrice={displayPrice}
                                                callWall={structure?.levels?.callWall || initialStockData.flow?.callWall}
                                                putFloor={structure?.levels?.putFloor || initialStockData.flow?.putFloor}
                                                pinZone={structure?.levels?.pinZone || initialStockData.flow?.pinZone}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Net GEX & Strikes */}
                                <div className="space-y-2">
                                    <div className="flex items-center px-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-3 bg-slate-500 rounded-full" /> Net Gamma Exposure
                                        </h4>
                                    </div>
                                    <Card className="border-white/10 bg-slate-900/40 shadow-sm p-0 overflow-hidden">
                                        <CardContent className="pt-6 px-4 space-y-6">
                                            <div className="text-center">
                                                <div className={`text-4xl font-black ${structure?.netGex > 0 ? "text-emerald-400" : structure?.netGex < 0 ? "text-rose-400" : "text-white"}`}>
                                                    {structure?.netGex ? (structure.netGex > 0 ? "+" : "") + (structure.netGex / 1000000).toFixed(2) + "M" : "—"}
                                                </div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">순 감마 에너지 (Net GEX)</div>

                                                {/* 0DTE Pulse Indicator (New) */}
                                                {structure?.gexZeroDteRatio !== undefined && (
                                                    <div className="mt-3 px-4">
                                                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1 tracking-wider uppercase">
                                                            <span className="flex items-center gap-1"><Zap size={10} className="text-amber-400" /> 0DTE Velocity</span>
                                                            <span className={structure.gexZeroDteRatio > 0.3 ? "text-amber-400" : "text-slate-600"}>{(structure.gexZeroDteRatio * 100).toFixed(0)}% Impact</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${structure.gexZeroDteRatio > 0.3 ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-slate-600"} transition-all duration-1000`}
                                                                style={{ width: `${Math.min(100, Math.max(5, (structure.gexZeroDteRatio || 0) * 100))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Expert Interpretation */}
                                                <div className={`mt-4 text-[10px] font-bold px-2 py-1 rounded inline-block ${structure?.netGex > 0 ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20" : structure?.netGex < 0 ? "bg-rose-950/30 text-rose-400 border border-rose-500/20" : "bg-slate-800 text-slate-400"}`}>
                                                    {structure?.netGex > 0 ? "지지력 강화 (변동성 축소)" : structure?.netGex < 0 ? "변동성 확대 (가속 구간)" : "중립 (방향성 부재)"}
                                                </div>
                                                <div className="mt-4 flex justify-center gap-4 text-[9px] font-medium text-slate-500 border-t border-white/5 pt-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                                        <span>(+) 안전지대</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                                                        <span>(-) 가속구간</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="h-auto min-h-[250px]">
                                                {showStructure && (
                                                    <OIChart
                                                        strikes={structure.structure.strikes}
                                                        callsOI={structure.structure.callsOI}
                                                        putsOI={structure.structure.putsOI}
                                                        currentPrice={displayPrice}
                                                        maxPain={structure.maxPain}
                                                        callWall={structure.levels?.callWall}
                                                        putFloor={structure.levels?.putFloor}
                                                    />
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </section>

                        {/* C. ATM Chain (Raw) - REMOVED per user request (redundant with Flow Radar) */}
                        <section className="hidden">
                        </section>
                    </div>

                    {/* SIDEBAR (4 Cols) - Strategy & Intel */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* 1. Decision Gate (Sticky Removed per user feedback) */}
                        <div>
                            <div className="mb-2 flex items-center gap-2">
                                <ShieldAlert size={14} className="text-slate-500" />
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Decision Gate</span>
                            </div>
                            <DecisionGate
                                ticker={ticker}
                                displayPrice={displayPrice}
                                session={effectiveSession}
                                structure={structure}
                                krNews={krNews}
                            />
                        </div>

                        {/* 2. Flow Dynamics */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                                <div className="flex items-center gap-2">
                                    <Activity size={12} className="text-sky-400" />
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Flow Unit</span>
                                </div>
                                <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-sm">INTRADAY(당일)</span>
                            </div>
                            <Card className="border-white/10 bg-slate-900/40 p-0 overflow-hidden">
                                <CardContent className="p-1">
                                    <FlowSniper
                                        netPremium={liveQuote?.flow?.netPremium || 0}
                                        callPremium={liveQuote?.flow?.callPremium || 0}
                                        putPremium={liveQuote?.flow?.putPremium || 0}
                                        optionsCount={liveQuote?.flow?.optionsCount || 0}
                                        onClickFlowRadar={() => setActiveTab('FLOW')}
                                    />
                                </CardContent>
                            </Card>
                        </div>

                        {/* 4. Intel Feed (Native KR) */}
                        <div className="space-y-2 h-full">
                            <div className="flex items-center gap-2 pt-2">
                                <Newspaper size={14} className="text-slate-500" />
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Intel Feed (Global AI)</h3>
                            </div>

                            {/* Consolidated Card for Height Alignment */}
                            <Card className="border-white/5 bg-slate-900/30 min-h-[340px] h-full overflow-hidden flex flex-col">
                                <CardContent className="p-0 flex-1 flex flex-col">
                                    {krNews.slice(0, 3).map((n, i) => (
                                        <a key={i} href={n.link} target="_blank" rel="noreferrer" className="block group flex-1 border-b border-white/5 last:border-0 hover:bg-slate-800/50 transition-colors relative">
                                            {/* Hover Accent */}
                                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500/0 group-hover:bg-indigo-500 transition-all duration-300" />

                                            <div className="p-4 flex flex-col h-full justify-center">
                                                <div className="text-[9px] text-indigo-400 font-bold mb-1.5 flex justify-between">
                                                    <span>{n.publisher}</span>
                                                    <span className={n.sentiment === 'positive' ? 'text-emerald-500' : 'text-slate-600'}>
                                                        {n.sentiment === 'positive' ? 'Bullish' : ''}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-300 font-medium leading-snug group-hover:text-white transition-colors line-clamp-2">
                                                    {n.title}
                                                </div>
                                                <div className="text-[9px] text-slate-600 mt-2">
                                                    {n.time.split('T')[0]}
                                                </div>
                                            </div>
                                        </a>
                                    ))}
                                    {krNews.length === 0 && (
                                        <div className="flex-1 flex items-center justify-center text-slate-600 text-xs">
                                            No recent intel
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                    </div>

                </div>
            ) : (
                <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FlowRadar
                        rawChain={liveQuote?.flow?.rawChain || initialStockData?.flow?.rawChain || []}
                        currentPrice={displayPrice}
                    />
                </div>
            )}
        </div>
    );
}
