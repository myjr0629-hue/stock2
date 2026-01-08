"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity, Loader2, Info } from "lucide-react";
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
        <div className="flex flex-col h-full bg-transparent">
            {/* Standard Header Strip */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert size={10} />
                    Risk Control
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    status === 'WATCH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                    {status}
                </span>
            </div>

            {/* Content Area */}
            <div className={`p-3 space-y-3 relative ${status === 'PASS' ? 'bg-emerald-950/5' : status === 'WATCH' ? 'bg-amber-950/5' : 'bg-rose-950/5'}`}>
                {/* Side Border Indicator Replaced by Inner Tint or just clean */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${status === 'PASS' ? 'bg-emerald-500' : status === 'WATCH' ? 'bg-amber-500' : 'bg-rose-500'}`} />

                <div className="space-y-1.5 pl-2">
                    {reasons.slice(0, 4).map((r, i) => (
                        <div key={i} className="text-[11px] font-bold text-slate-400 flex items-start gap-2">
                            <span className="mt-1 w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                            <span className="leading-tight">{r}</span>
                        </div>
                    ))}
                    {reasons.length === 0 && <div className="text-[11px] text-slate-500 italic">특이 사항 없음 (안전)</div>}
                </div>
                {/* Rumor Detection Status (Compact) */}
                <div className="flex items-center justify-between text-[10px] py-1.5 px-2 rounded bg-slate-800/50 border border-white/5 ml-2">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">AI Rumor</span>
                    {hasRumor ? (
                        <span className="text-rose-400 font-black flex items-center gap-1">
                            <AlertCircle size={10} /> 감지됨
                        </span>
                    ) : (
                        <span className="text-emerald-400 font-black">✓ Clean</span>
                    )}
                </div>
                <div className="text-[10px] font-medium text-slate-400 border-t border-white/5 pt-2 flex items-center gap-2 pl-2">
                    <Zap size={10} className="text-amber-400 shrink-0" />
                    <span className="truncate">{actionHint}</span>
                </div>
            </div>
        </div>
    );
};

export function LiveTickerDashboard({ ticker, initialStockData, initialNews, range, buildId, chartDiagnostics }: Props) {
    // --- Live Data State ---
    const [liveQuote, setLiveQuote] = useState<any>(null);
    const [options, setOptions] = useState<any>(null);
    const [structure, setStructure] = useState<any>(null);
    const [krNews, setKrNews] = useState<any[]>(initialNews || []);
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
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[News] Network retry...");
            else console.error(e);
        } finally { setNewsLoading(false); }
    };
    const fetchQuote = async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/ticker?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setLiveQuote(data);
            }
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[Quote] Network retry...");
            else console.error(e);
        } finally { setQuoteLoading(false); }
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
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[Structure] Network retry...");
            else console.error(e);
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
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[Options] Network retry...");
            else console.error(e);
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

    // Derived Display Values (Truth Table from API)
    // [User Requirement] Main Price = Official Intraday Close ONLY.
    // Pre/Post prices must ONLY be shown in the badge.

    // [Fix] Trust API's display values normally, BUT enforce Regular Price for POST/CLOSED per user request.
    let displayPrice = liveQuote?.display?.price || liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose || 0;

    // [Fix] Use API's pre-calculated percentage (pct) directly
    let displayChangePct = liveQuote?.display?.changePctPct; // e.g. -2.59

    // [User Override] If POST/CLOSED, Main Display MUST be Regular Close (Intraday Final)
    if (effectiveSession === 'POST' || effectiveSession === 'CLOSED') {
        const regularClose = liveQuote?.prices?.regularCloseToday;
        // Only override if we have a valid regular close
        if (regularClose && regularClose > 0) {
            displayPrice = regularClose;

            // Also force change percent to be based on Regular Close vs Prev Close
            const prevClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose;
            if (prevClose > 0) {
                displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
            }
        }
    }

    if (displayChangePct === undefined || displayChangePct === null) {
        // Fallback for initial load
        displayChangePct = initialStockData.changePercent || 0;
    }

    // [User Requirement] IF SESSION IS 'PRE', Main Price (= Intraday) should be STATIC (Prev Close).
    // The "Pre-market Price" is shown in the badge only.
    if (effectiveSession === 'PRE') {
        const staticClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose;
        if (staticClose) {
            displayPrice = staticClose;
            // [Fix-Requested] Show Yesterday's change (Intraday Standard) until market opens.
            // Do NOT reset to 0.00%. Show "Last Regular Session Change".
            const prevDayChange = liveQuote?.prices?.prevChangePct ?? initialStockData.prevChangePercent;
            displayChangePct = prevDayChange ?? 0;
        }
    }

    // A. Main Display Price (White Big Number) - Fallback Logic
    if (!displayPrice || displayPrice === 0) {
        // ... existing fallbacks if needed ...
        if (effectiveSession === 'REG' || effectiveSession === 'RTH' || effectiveSession === 'MARKET') {
            displayPrice = liveQuote?.prices?.lastTrade || liveQuote?.price || displayPrice;
        }
    }

    // B. Sub-Badge (Extended Session Info)
    let activeExtPrice = 0;
    let activeExtType = ""; // 'PRE', 'PRE_CLOSE', 'POST'
    let activeExtLabel = "";

    if (effectiveSession === 'PRE') {
        activeExtPrice = liveQuote?.extended?.prePrice || liveQuote?.prices?.prePrice || 0;
        activeExtType = 'PRE';
        activeExtLabel = 'PRE';
    } else if (effectiveSession === 'REG' || effectiveSession === 'RTH' || effectiveSession === 'MARKET') {
        // Show Pre-Market Close if we are in Regular Session
        activeExtPrice = liveQuote?.extended?.preClose || liveQuote?.prices?.prePrice || 0;
        if (activeExtPrice > 0) {
            activeExtType = 'PRE_CLOSE';
            activeExtLabel = 'PRE CLOSE';
        }
    } else if (effectiveSession === 'POST') {
        activeExtPrice = liveQuote?.extended?.postPrice || liveQuote?.prices?.postPrice || 0;
        activeExtType = 'POST';
        activeExtLabel = 'POST';
    } else if (effectiveSession === 'CLOSED') {
        // [Fix] Allow Post-Market display even when CLOSED (e.g. Weekend)
        activeExtPrice = liveQuote?.extended?.postPrice || liveQuote?.prices?.postPrice || 0;
        if (activeExtPrice > 0) {
            activeExtType = 'POST';
            activeExtLabel = 'POST (CLOSED)';
        }
    }

    // C. Change Percentages (Strict Baselines)
    // [Fix] Trust API for Extended Change Percentages too
    let activeExtPct = 0;
    if (activeExtPrice > 0) {
        if (activeExtType === 'PRE' || activeExtType === 'PRE_CLOSE') {
            activeExtPct = liveQuote?.extended?.preChangePct !== undefined
                ? (liveQuote.extended.preChangePct * 100) // API returns fraction
                : 0;
        } else if (activeExtType === 'POST') {
            activeExtPct = liveQuote?.extended?.postChangePct !== undefined
                ? (liveQuote.extended.postChangePct * 100)
                : 0;
            // If CLOSED and using POST Badge, we might need manual calc if API didn't flag it as POST session
            if (effectiveSession === 'CLOSED' && activeExtType === 'POST') {
                // displayPrice is Regular Close. activeExtPrice is Post Close.
                if (displayPrice > 0) {
                    activeExtPct = ((activeExtPrice - displayPrice) / displayPrice) * 100;
                }
            }
        }
    }

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
                    {activeExtPrice > 0 && (
                        <div className="hidden sm:block pb-1.5">
                            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeExtType.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />

                                <div className="flex flex-col leading-none">
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {activeExtLabel}
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

            {/* [Phase 50] Tab Navigation (Holographic) */}
            <div className="flex items-center gap-1 bg-slate-900/40 w-fit p-1 rounded-lg border border-white/5 mb-6 backdrop-blur-sm shadow-lg">
                <button
                    onClick={() => setActiveTab('COMMAND')}
                    className={`px-6 py-2 text-[10px] font-black rounded-md transition-all uppercase tracking-[0.15em] flex items-center gap-2 ${activeTab === 'COMMAND' ? 'bg-indigo-600/90 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)] ring-1 ring-white/20' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                >
                    <Layers size={12} />
                    Command
                </button>
                <button
                    onClick={() => setActiveTab('FLOW')}
                    className={`px-6 py-2 text-[10px] font-black rounded-md transition-all uppercase tracking-[0.15em] flex items-center gap-2 ${activeTab === 'FLOW' ? 'bg-emerald-600/90 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-1 ring-white/20' : 'bg-slate-800/40 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 hover:shadow-lg'}`}
                >
                    <Target size={12} className={activeTab === 'FLOW' ? "" : "text-sky-500/70"} />
                    Flow Radar
                </button>
            </div>

            {/* 2. COMMAND GRID (12 Cols) */}
            {/* 2. COMMAND GRID (2 Columns: Main vs Sidebar) */}
            {activeTab === 'COMMAND' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[800px]">

                    {/* MAIN COLUMN (8 Cols) - Flex Structure */}
                    <div className="lg:col-span-8 flex flex-col items-stretch gap-4 h-full">
                        {/* A. Main Chart Section */}
                        {/* A. Main Chart Section (Height: 520px) */}
                        <div className="h-[520px] min-h-0 relative flex flex-col group shrink-0">
                            {/* Decorative Label (Absolute) */}
                            <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[9px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Price History
                            </div>

                            {/* Glass Card */}
                            <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-2xl relative backdrop-blur-md flex flex-col">
                                {/* Texture Overlay */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-20" />
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-indigo-900/10 pointer-events-none" />

                                <div className="flex-1 min-h-0 relative z-10 p-1 pb-12">
                                    <StockChart
                                        key={`${ticker}:${range}:${initialStockData.history.length}`}
                                        data={initialStockData.history}
                                        color={(displayChangePct || 0) >= 0 ? "#10b981" : "#f43f5e"}
                                        ticker={ticker}
                                        initialRange={range}
                                        currentPrice={liveQuote?.prices?.lastTrade || liveQuote?.price || displayPrice}
                                        prevClose={liveQuote?.prices?.prevRegularClose || (initialStockData as any)?.prices?.prevClose || initialStockData?.prevClose}
                                        rsi={initialStockData.rsi}
                                        return3d={initialStockData.return3d}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* B. Advanced Options Analysis (Fixed Height: 250px) */}
                        <div className="h-[250px] min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">

                            {/* 1. TACTICAL RANGE (Depth Gauge + Max Pain) */}
                            <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                {/* Header */}
                                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm animate-pulse" />
                                        Tactical Range
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-amber-500 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30 flex items-center gap-2 shadow-lg">
                                            <span className="text-[10px] font-black tracking-tighter">MAX PAIN</span>
                                            <span className="text-[9px] text-amber-300/60 font-medium uppercase tracking-tighter">(최대고통)</span>
                                            <span className="text-sm font-black pl-1 border-l border-amber-500/20">${structure?.maxPain || initialStockData.flow?.maxPain || "---"}</span>
                                            {(structure?.maxPain || initialStockData.flow?.maxPain) && (
                                                <span className={`text-[9px] font-bold ml-1 ${((displayPrice - (structure?.maxPain || initialStockData.flow?.maxPain)) / (structure?.maxPain || initialStockData.flow?.maxPain)) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                    ({((displayPrice - (structure?.maxPain || initialStockData.flow?.maxPain)) / (structure?.maxPain || initialStockData.flow?.maxPain) * 100).toFixed(1)}%)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Visual Body */}
                                <div className="flex-1 relative flex items-center justify-center p-4">
                                    {/* Range Bar Background */}
                                    <div className="w-2 h-full bg-slate-800 rounded-full relative overflow-hidden">
                                        <div className="absolute top-0 inset-x-0 h-1/3 bg-gradient-to-b from-rose-500/20 to-transparent" />
                                        <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-emerald-500/20 to-transparent" />

                                        {/* Max Pain "Gravity" Center Line */}
                                        <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-1 bg-amber-500/50 blur-[2px]" />
                                    </div>

                                    {/* Markers */}
                                    <div className="absolute inset-y-4 left-0 right-0 flex flex-col justify-between px-8">
                                        {/* Resistance (Call Wall) */}
                                        <div className="flex items-center gap-2 border-b border-rose-500/30 pb-1">
                                            <span className="text-[10px] font-bold text-rose-400 w-12 text-right">RESIST</span>
                                            <span className="text-sm font-black text-rose-200 tracking-wider">${structure?.levels?.callWall || "---"}</span>
                                        </div>

                                        {/* Max Pain Marker (Center Concept) */}
                                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex items-center justify-end pr-8 gap-2 opacity-90">
                                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Max Pain</span>
                                            <div className="w-12 h-[1px] bg-amber-500/50" />
                                        </div>


                                        {/* Current Price Indicator (Floating) */}
                                        <div className="w-full flex items-center gap-2 my-auto z-10 relative">
                                            <div className="h-[1px] flex-1 bg-indigo-500/50" />
                                            <div className="flex flex-col items-center">
                                                <div className="px-3 py-1 bg-indigo-600 rounded shadow-[0_0_15px_rgba(79,70,229,0.5)] border border-white/20 text-white font-black text-lg tracking-tight z-10 min-w-[100px] text-center">
                                                    ${displayPrice}
                                                </div>
                                            </div>
                                            <div className="h-[1px] flex-1 bg-indigo-500/50" />
                                        </div>

                                        {/* Support (Put Floor) */}
                                        <div className="flex items-center gap-2 border-t border-emerald-500/30 pt-1">
                                            <span className="text-[10px] font-bold text-emerald-400 w-12 text-right">SUPPORT</span>
                                            <span className="text-sm font-black text-emerald-200 tracking-wider">${structure?.levels?.putFloor || "---"}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. NET GAMMA ENGINE (Reactor) */}
                            <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                {/* Header */}
                                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={10} className={structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"} />
                                        NET GAMMA ENGINE
                                    </h4>
                                </div>

                                <div className="flex-1 flex items-center justify-between p-4 px-6 relative">
                                    {/* Background Glow */}
                                    <div className={`absolute inset-0 bg-radial-gradient from-${structure?.netGex > 0 ? "emerald" : "rose"}-500/05 to-transparent opacity-30`} />

                                    {/* Left: Reactor Core */}
                                    <div className="relative">
                                        {/* Outer Ring */}
                                        <div className={`w-24 h-24 rounded-full border-4 ${structure?.netGex > 0 ? "border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.6)] brightness-125" : "border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.6)] brightness-125"} flex items-center justify-center animate-[spin_10s_linear_infinite] border-dashed`} />

                                        {/* Inner Core */}
                                        <div className={`absolute inset-2 rounded-full bg-slate-900/80 flex flex-col items-center justify-center border ${structure?.netGex > 0 ? "border-emerald-500/50" : "border-rose-500/50"}`}>
                                            <div className="text-[8px] text-slate-500 uppercase font-bold mb-0.5">NET GEX</div>
                                            <div className={`text-lg font-black tracking-tighter ${structure?.netGex > 0 ? "text-emerald-100" : "text-rose-100"}`}>
                                                {structure?.netGex ? (structure.netGex / 1000000).toFixed(1) + "M" : "0.0M"}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Info & Logic */}
                                    <div className="flex-1 text-right pl-4 z-10">
                                        <div className={`text-sm font-black mb-2 tracking-tight ${structure?.netGex > 0 ? "text-emerald-400 drop-shadow-sm" : "text-rose-400 drop-shadow-sm"}`}>
                                            {structure?.netGex > 0 ? "STABLE (변동성 억제)" : "VOLATILE (변동성 확대)"}
                                        </div>

                                        <div className="space-y-3">
                                            <p className="text-xs text-slate-200 font-medium leading-normal break-keep bg-slate-950/30 p-2 rounded border border-white/5">
                                                {structure?.netGex > 0
                                                    ? "Positive Gamma: 주가 변동을 줄이는 방향으로 헷징 (Range Bound)."
                                                    : "Negative Gamma: 주가 변동을 키우는 방향으로 가속 (Acceleration)."}
                                            </p>
                                            <div className="inline-block px-2 py-1 rounded bg-slate-800 border border-white/10 text-[10px] text-slate-400 font-mono tracking-wide">
                                                Logic: Dealer Hedging Impact
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>


                        <div className="hidden">
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
                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 flex items-center justify-center gap-1">
                                                순 감마 에너지 (Net GEX)
                                                <span title={`시장 조성자(MM)들의 포지션에 따른 변동성 성향입니다.\n(+) 양수: 주가 변동 억제 (안정/지루함)\n(-) 음수: 주가 변동 증폭 (급등락/스퀴즈 위험)`}>
                                                    <Info size={10} className="text-slate-600 hover:text-slate-400 cursor-help" />
                                                </span>
                                            </div>

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


                        {/* C. ATM Chain (Raw) - REMOVED per user request (redundant with Flow Radar) */}
                        <section className="hidden">
                        </section>
                    </div>

                    {/* SIDEBAR (4 Cols) - Glass Stack */}
                    <div className="lg:col-span-4 flex flex-col gap-4 h-full">

                        {/* 1. Decision Gate - Fixed Height */}
                        <div className="shrink-0 relative rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden group hover:border-white/20 transition-colors shadow-2xl">
                            {/* Decorative Outline REMOVED because it conflicts with standard glass look */}
                            <DecisionGate
                                ticker={ticker}
                                displayPrice={displayPrice}
                                session={effectiveSession}
                                structure={structure}
                                krNews={krNews}
                            />
                        </div>

                        {/* 2. Flow Unit - Glass Card */}
                        <div className="shrink-0 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden relative group hover:border-white/20 transition-colors shadow-2xl">
                            <div className="p-2 border-b border-white/5 flex items-center justify-between bg-white/5">
                                <div className="flex items-center gap-2">
                                    <Activity size={10} className="text-sky-400" />
                                    <span className="text-[10px] font-black text-sky-200 uppercase tracking-widest">Flow Unit</span>
                                </div>
                                <span className="text-[8px] bg-slate-800/80 text-slate-500 px-1.5 py-0.5 rounded border border-white/5">INTRADAY</span>
                            </div>
                            <div className="p-1">
                                <FlowSniper
                                    netPremium={liveQuote?.flow?.netPremium || 0}
                                    callPremium={liveQuote?.flow?.callPremium || 0}
                                    putPremium={liveQuote?.flow?.putPremium || 0}
                                    optionsCount={liveQuote?.flow?.optionsCount || 0}
                                    onClickFlowRadar={() => setActiveTab('FLOW')}
                                />
                            </div>
                        </div>

                        {/* 3. Intel Feed Needs to fill remaining height */}
                        <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-2xl relative group">
                            {/* Background Pattern */}
                            {/* Background Pattern REMOVED for consistency */}

                            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 relative z-10 shrink-0">
                                <div className="flex items-center gap-2">
                                    <Newspaper size={12} className="text-slate-400" />
                                    <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Intel Feed (AI)</h3>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
                                {krNews.slice(0, 5).map((n: any, i) => (
                                    <a key={i} href={n.url || n.link || "#"} target="_blank" rel="noreferrer" className="block group/item border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors relative min-h-[80px]">
                                        {/* Hover Indicator */}
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500/0 group-hover/item:bg-indigo-500 transition-all duration-300" />

                                        <div className="p-3 flex flex-col justify-center h-full">
                                            <div className="text-[9px] text-indigo-300/80 font-bold mb-1 flex justify-between items-center">
                                                <span className="flex items-center gap-2">
                                                    {n.source || n.publisher || "Unknown"}
                                                    {n.isRumor && (
                                                        <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">RUMOR</span>
                                                    )}
                                                </span>
                                                <span className={n.sentiment === 'positive' ? 'text-emerald-500' : 'text-slate-600'}>
                                                    {n.sentiment === 'positive' ? 'BULLISH' : ''}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-300 font-medium leading-snug group-hover/item:text-white transition-colors line-clamp-2">
                                                {n.summaryKR || n.title}
                                            </div>
                                        </div>
                                    </a>
                                ))}
                                {krNews.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-slate-600 text-xs text-center p-4">
                                        No recent intel detected<br />Scanning global channels...
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                </div>
            ) : (
                <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <FlowRadar
                        ticker={ticker}
                        rawChain={liveQuote?.flow?.rawChain || initialStockData?.flow?.rawChain || []}
                        currentPrice={displayPrice}
                    />
                </div>
            )
            }
        </div >
    );
}
