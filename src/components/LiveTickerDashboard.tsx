"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity, Loader2, Info, TrendingUp, TrendingDown } from "lucide-react";
import { StockData, OptionData, NewsItem } from "@/services/stockTypes";
import { OIChart } from "@/components/OIChart";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { GammaLevelsViz } from "@/components/GammaLevelsViz";
import { FlowSniper } from "@/components/FlowSniper";
import { FlowRadar } from "@/components/FlowRadar";
import { useTranslations, useLocale } from 'next-intl';

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
    const t = useTranslations('command');
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
        reasons.push(t('marketClosed'));
        if (status === 'PASS') status = 'WATCH';
    }

    if (isFail) {
        reasons.push(t('optionsVerify'));
        actionHint = t('optionsRecovery');
    }

    if (!isFail && netGex === null && (gammaCoverage !== undefined && gammaCoverage < 80)) {
        status = 'WATCH';
        reasons.push(t('gammaCoverageLow'));
    }

    if (pinZone && Math.abs(displayPrice - pinZone) / displayPrice <= 0.02) {
        reasons.push(t('priceNearMagnet'));
        if (netGex < 0) reasons.push(t('shortGammaVolUp'));
        if (netGex > 0) reasons.push(t('longGammaVolDown'));
    }

    if (callWall && putFloor) {
        if (displayPrice >= putFloor && displayPrice <= callWall) {
            reasons.push(t('betweenLevels'));
        } else if (displayPrice > callWall) {
            reasons.push(t('aboveResistance'));
            if (status === 'PASS') status = 'WATCH';
        } else if (displayPrice < putFloor) {
            reasons.push(t('belowSupport'));
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
        reasons.push(t('majorEventNews'));
        if (status === 'PASS') status = 'WATCH';
        else if (status === 'WATCH') status = 'FAIL';
    }

    if (hasRumor) {
        reasons.push(t('rumorDetected'));
        // Rumors are high risk, but could be opportunity. We flag it ensuring visibility.
        // We force at least WATCH if currently PASS.
        if (status === 'PASS') status = 'WATCH';
    }

    if (!actionHint) {
        if (status === 'PASS') actionHint = t('structuralAdvantage');
        else if (status === 'WATCH') actionHint = t('observeNeeded');
        else actionHint = t('entryProhibited');
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
                    {reasons.length === 0 && <div className="text-[11px] text-slate-500 italic">{t('noIssues')}</div>}
                </div>
                {/* Rumor Detection Status (Compact) */}
                <div className="flex items-center justify-between text-[10px] py-1.5 px-2 rounded bg-slate-800/50 border border-white/5 ml-2">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">AI Rumor</span>
                    {hasRumor ? (
                        <span className="text-rose-400 font-black flex items-center gap-1">
                            <AlertCircle size={10} /> {t('detected')}
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

    // i18n translations
    const t = useTranslations('command');
    const tIntel = useTranslations('intel');
    const locale = useLocale();

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
        // [FIX] Reset structure state when ticker changes to prevent stale data
        setStructure(null);
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
        const prevClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose;

        // Only override if we have a valid regular close
        if (regularClose && regularClose > 0) {
            displayPrice = regularClose;

            // [FIX] Detect "No New Trading Day" scenario:
            // If regularCloseToday === prevRegularClose, it means today's regular session hasn't happened yet.
            // In this case, we should show the LAST session's change (prevChangePct), NOT 0.00%.
            const isNewTradingDay = Math.abs(regularClose - prevClose) > 0.001; // Tolerance for floating point

            if (isNewTradingDay && prevClose > 0) {
                // Normal case: calculate today's change
                displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
            } else {
                // [FIX] No new trading day yet (weekend/holiday/pre-open)
                // Show the PREVIOUS session's change percentage
                const prevDayChange = liveQuote?.prices?.prevChangePct;
                if (prevDayChange !== undefined && prevDayChange !== null) {
                    displayChangePct = prevDayChange;
                } else {
                    // Ultimate fallback: use initialStockData
                    displayChangePct = initialStockData.changePercent || 0;
                }
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

                        {/* B. Advanced Options Analysis (Fixed Height: 380px) */}
                        <div className="h-[380px] min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">

                            {/* 1. TACTICAL RANGE (Depth Gauge + Max Pain) */}
                            <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                {/* Header */}
                                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm animate-pulse" />
                                            Tactical Range
                                        </h4>
                                        {structure?.expiration && (() => {
                                            const expDate = new Date(structure.expiration + 'T16:00:00-05:00');
                                            const now = new Date();
                                            const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                            return diffDays >= 0 ? (
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${diffDays <= 1 ? 'bg-rose-950/50 text-rose-400 border border-rose-500/30' : 'bg-cyan-950/50 text-cyan-400 border border-cyan-500/30'}`}>
                                                    D-{diffDays}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-amber-500 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30 flex items-center gap-2 shadow-lg">
                                            <span className="text-[10px] font-black tracking-tighter">MAX PAIN</span>
                                            <span className="text-[9px] text-amber-300/60 font-medium uppercase tracking-tighter">({t('maxPainLabel')})</span>
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

                                {/* Tactical Metrics - Small Grid */}
                                <div className="px-3 py-2 border-t border-white/5 bg-slate-950/20 grid grid-cols-2 gap-2">
                                    {/* Max Pain Distance % */}
                                    {(() => {
                                        const maxPain = structure?.maxPain || 0;
                                        const distance = maxPain ? ((displayPrice - maxPain) / maxPain * 100) : 0;
                                        const absDistance = Math.abs(distance);
                                        const color = absDistance < 1 ? "text-amber-400" : distance > 0 ? "text-rose-400" : "text-emerald-400";
                                        return (
                                            <div className="bg-slate-800/40 rounded-md px-2 py-1.5 border border-white/5">
                                                <div className="text-[8px] text-slate-500 font-bold uppercase">{t('maxPainDistance')}</div>
                                                <div className={`text-sm font-black ${color}`}>
                                                    {distance > 0 ? "+" : ""}{distance.toFixed(1)}%
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Range Width % */}
                                    {(() => {
                                        const resist = structure?.levels?.callWall || displayPrice * 1.05;
                                        const support = structure?.levels?.putFloor || displayPrice * 0.95;
                                        const rangeWidth = resist && support ? ((resist - support) / displayPrice * 100) : 0;
                                        const color = rangeWidth > 10 ? "text-rose-400" : rangeWidth > 5 ? "text-amber-400" : "text-emerald-400";
                                        return (
                                            <div className="bg-slate-800/40 rounded-md px-2 py-1.5 border border-white/5">
                                                <div className="text-[8px] text-slate-500 font-bold uppercase">{t('rangeWidth')}</div>
                                                <div className={`text-sm font-black ${color}`}>
                                                    {rangeWidth.toFixed(1)}%
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Insight Footer */}
                                <div className="px-4 py-2 border-t border-white/5 bg-slate-950/30">
                                    <p className="text-[10px] text-white/70 leading-relaxed">
                                        {displayPrice > (structure?.maxPain || 0)
                                            ? t('aboveMaxPain')
                                            : displayPrice < (structure?.maxPain || 0)
                                                ? t('belowMaxPain')
                                                : t('nearMaxPain')}
                                    </p>
                                </div>
                            </div>

                            {/* 2. NET GAMMA ENGINE (Infographic Style) */}
                            <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                {/* Header */}
                                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={10} className={structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"} />
                                        NET GAMMA ENGINE
                                    </h4>
                                    {structure?.expiration && (
                                        <span className="text-xs text-white font-mono">EXP: {structure.expiration}</span>
                                    )}
                                </div>

                                {/* Main Content - Infographic Layout */}
                                <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
                                    {/* Top Row: Core GEX + Status + P/C OI Circle */}
                                    <div className="flex items-center justify-between gap-4">
                                        {/* Left: Reactor Core (GEX Only) */}
                                        <div className="relative shrink-0">
                                            <div className={`w-20 h-20 rounded-full border-4 border-dashed ${structure?.netGex > 0 ? "border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.5)]"} flex items-center justify-center animate-[spin_10s_linear_infinite]`} />
                                            <div className={`absolute inset-2 rounded-full bg-slate-900/95 flex flex-col items-center justify-center border ${structure?.netGex > 0 ? "border-emerald-500/50" : "border-rose-500/50"}`}>
                                                <div className="text-[8px] text-slate-500 uppercase font-bold">NET GEX</div>
                                                <div className={`text-lg font-black ${structure?.netGex > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                                    {structure?.netGex ? (structure.netGex / 1000000).toFixed(1) + "M" : "0.0M"}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Center: Status */}
                                        <div className="flex-1">
                                            <div className={`text-sm font-black ${structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {structure?.netGex > 0 ? "⚡ STABLE" : "⚡ VOLATILE"}
                                            </div>
                                            <div className="text-[11px] text-white/80 leading-snug mt-0.5">
                                                {structure?.netGex > 0
                                                    ? t('netGexStable')
                                                    : t('netGexVolatile')}
                                            </div>
                                        </div>

                                        {/* Right: P/C & OI Circle (White Dashed) */}
                                        <div className="relative shrink-0">
                                            <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center" />
                                            <div className="absolute inset-1 rounded-full bg-slate-900/80 flex flex-col items-center justify-center">
                                                {(() => {
                                                    const callsTotal = structure?.structure?.callsOI?.reduce((a: number, b: number) => a + (b || 0), 0) || 0;
                                                    const putsTotal = structure?.structure?.putsOI?.reduce((a: number, b: number) => a + (b || 0), 0) || 0;
                                                    const pcr = callsTotal > 0 ? (putsTotal / callsTotal) : 0;
                                                    const totalOI = callsTotal + putsTotal;
                                                    const oiFormatted = totalOI >= 1000000 ? (totalOI / 1000000).toFixed(1) + "M"
                                                        : totalOI >= 1000 ? (totalOI / 1000).toFixed(0) + "K" : totalOI.toString();
                                                    const pcrColor = pcr > 1.2 ? "text-rose-400" : pcr < 0.8 ? "text-emerald-400" : "text-white";
                                                    return (
                                                        <>
                                                            <div className="text-[9px] text-white/80 uppercase font-bold">P/C Ratio</div>
                                                            <div className={`text-sm font-black ${pcrColor}`}>{pcr.toFixed(2)}</div>
                                                            <div className="text-[9px] text-white/80 uppercase font-bold mt-1">Total OI</div>
                                                            <div className="text-sm font-black text-indigo-300">{oiFormatted}</div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gamma Flip Level - Infographic Style (No Emoji) */}
                                    {/* [V7.2] Show loading state until options_status === "OK" for accurate data */}
                                    {structure?.gammaFlipLevel && structure?.options_status === "OK" ? (
                                        <div className="relative p-3 rounded-xl bg-gradient-to-r from-amber-950/50 via-amber-900/30 to-amber-950/50 border border-amber-500/40 overflow-hidden">
                                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.15),transparent_70%)]" />

                                            <div className="relative z-10 flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    {/* Infographic Icon (No Emoji) */}
                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-600/20 flex items-center justify-center border border-amber-500/40">
                                                        <div className="w-4 h-4 border-2 border-amber-400 rounded-full relative">
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                <div className="w-1 h-3 bg-amber-400 rounded-full" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-amber-400 font-black uppercase tracking-wider flex items-center gap-2">
                                                            Gamma Flip Level
                                                            <span className="text-[8px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold">READY</span>
                                                        </div>
                                                        <div className="text-[11px] text-white/70">{t('gammaFlipLevel')}</div>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <div className="text-2xl font-black text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">
                                                        ${structure.gammaFlipLevel}
                                                    </div>
                                                    {displayPrice && (
                                                        <div className={`text-[10px] font-bold ${displayPrice > structure.gammaFlipLevel ? "text-emerald-400" : "text-rose-400"}`}>
                                                            {displayPrice > structure.gammaFlipLevel
                                                                ? t('longGammaZone')
                                                                : t('shortGammaZone')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Position Bar with Labels */}
                                            <div className="relative z-10">
                                                <div className="flex justify-between text-[9px] mb-0.5">
                                                    <span className="text-rose-400 font-bold">{t('shortGammaLabel')}</span>
                                                    <span className="text-white/50">← Flip →</span>
                                                    <span className="text-emerald-400 font-bold">{t('longGammaLabel')}</span>
                                                </div>
                                                <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    {(() => {
                                                        const flip = structure.gammaFlipLevel;
                                                        const low = flip * 0.93;
                                                        const high = flip * 1.07;
                                                        const range = high - low;
                                                        const pos = Math.min(100, Math.max(0, ((displayPrice - low) / range) * 100));
                                                        return (
                                                            <>
                                                                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-600/60 to-rose-500/40" style={{ width: '50%' }} />
                                                                <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-600/60 to-emerald-500/40" style={{ width: '50%' }} />
                                                                <div
                                                                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] border-2 border-slate-700"
                                                                    style={{ left: `${pos}%`, transform: 'translate(-50%, -50%)' }}
                                                                />
                                                                <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" style={{ left: '50%' }} />
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex justify-between text-[9px] text-white/60 mt-0.5">
                                                    <span>${(structure.gammaFlipLevel * 0.93).toFixed(0)}</span>
                                                    <span className="text-amber-300 font-bold">${structure.gammaFlipLevel}</span>
                                                    <span>${(structure.gammaFlipLevel * 1.07).toFixed(0)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : structure && structure.options_status !== "OK" ? (
                                        /* Loading State - Show while options data is being fetched */
                                        <div className="relative p-3 rounded-xl bg-gradient-to-r from-slate-900/50 via-slate-800/30 to-slate-900/50 border border-slate-600/40 overflow-hidden">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-600/40 animate-pulse">
                                                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                                                </div>
                                                <div>
                                                    <div className="text-xs text-slate-400 font-black uppercase tracking-wider flex items-center gap-2">
                                                        Gamma Flip Level
                                                        <span className="text-[8px] bg-slate-600/80 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">LOADING</span>
                                                    </div>
                                                    <div className="text-[11px] text-white/50">{t('optionsDataLoading')}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : structure && structure.options_status === "OK" && !structure.gammaFlipLevel ? (
                                        /* [V7.5] Context-Aware Empty State - Show meaningful message based on netGex */
                                        (() => {
                                            const netGex = structure?.netGex;
                                            // [FIX] Low liquidity = netGex is null AND gammaCoverage is low
                                            // If netGex exists (even if 0), data is sufficient
                                            const gammaCoverage = structure?.debug?.gammaCoverage || structure?.gammaCoverage || 0;
                                            const isLowLiquidity = netGex === null && gammaCoverage < 0.5;

                                            // Determine message based on gamma state
                                            let message = "";
                                            let badgeText = "N/A";
                                            let badgeColor = "bg-slate-700/80 text-slate-300";

                                            if (isLowLiquidity) {
                                                message = t('lowOptionsLiquidity');
                                            } else if (netGex !== null && netGex < 0) {
                                                message = t('allShortGammaNoFlip');
                                                badgeText = "SHORT";
                                                badgeColor = "bg-rose-600/80 text-white";
                                            } else if (netGex !== null && netGex > 0) {
                                                message = t('allLongGammaNoFlip');
                                                badgeText = "LONG";
                                                badgeColor = "bg-emerald-600/80 text-white";
                                            } else if (netGex !== null && netGex === 0) {
                                                message = t('gexBalanceNoFlip');
                                            } else {
                                                message = t('gammaDataUnavailable');
                                            }

                                            return (
                                                <div className="relative p-3 rounded-xl bg-gradient-to-r from-slate-900/50 via-slate-800/30 to-slate-900/50 border border-slate-600/40 overflow-hidden">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${netGex < 0 ? 'bg-rose-900/30 border-rose-500/40' : netGex > 0 ? 'bg-emerald-900/30 border-emerald-500/40' : 'bg-slate-800/50 border-slate-600/40'}`}>
                                                            {netGex < 0 ? <TrendingDown className="w-4 h-4 text-rose-400" /> :
                                                                netGex > 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> :
                                                                    <AlertCircle className="w-4 h-4 text-slate-500" />}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-slate-400 font-black uppercase tracking-wider flex items-center gap-2">
                                                                Gamma Flip Level
                                                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${badgeColor}`}>{badgeText}</span>
                                                            </div>
                                                            <div className="text-[11px] text-white/50">{message}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    ) : null}

                                    {/* Infographic Grid - 0DTE & Squeeze Risk */}
                                    <div className="grid grid-cols-2 gap-2">
                                        {/* 0DTE Impact */}
                                        <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[9px] text-white/80 font-bold uppercase">0DTE Impact</span>
                                                <Zap size={10} className={structure?.gexZeroDteRatio > 0.3 ? "text-amber-400" : "text-slate-600"} />
                                            </div>
                                            <div className={`text-lg font-black ${structure?.gexZeroDteRatio > 0.3 ? "text-amber-400" : "text-slate-300"}`}>
                                                {structure?.gexZeroDteRatio ? (structure.gexZeroDteRatio * 100).toFixed(0) : "0"}%
                                            </div>
                                        </div>

                                        {/* Squeeze Risk */}
                                        <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[9px] text-white/80 font-bold uppercase">Squeeze Risk</span>
                                            </div>
                                            {(() => {
                                                const risk = structure?.netGex < 0 && structure?.gexZeroDteRatio > 0.3 ? "HIGH"
                                                    : structure?.netGex < 0 ? "MED" : "LOW";
                                                const color = risk === "HIGH" ? "text-rose-400" : risk === "MED" ? "text-amber-400" : "text-emerald-400";
                                                return <div className={`text-lg font-black ${color}`}>{risk}</div>;
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* MM Insight Footer (Simplified) */}
                                <div className="px-3 py-2 border-t border-white/5 bg-slate-950/30">
                                    <p className="text-[10px] text-white/70 leading-relaxed">
                                        {structure?.netGex > 0 ? t('shortGammaWarning') : t('longGammaStable')}
                                    </p>
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
                                                {/* [S-75] Locale-based display: ko=summaryKR, ja=summaryJP, en=original title */}
                                                {locale === 'ko'
                                                    ? (n.summaryKR || n.title)
                                                    : locale === 'ja'
                                                        ? (n.summaryJP || n.summaryKR || n.title)
                                                        : n.title
                                                }
                                            </div>
                                        </div>
                                    </a>
                                ))}
                                {krNews.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-amber-400/70 text-xs text-center p-4 italic">
                                        {tIntel('translating')}
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
