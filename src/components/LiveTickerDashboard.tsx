"use client";

import React, { useEffect, useState } from 'react';
import { StockChart } from "@/components/StockChart";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { StockData, OptionData, NewsItem } from "@/services/stockTypes";
import { OIChart } from "@/components/OIChart";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";

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
    if (hasMajorEvent) {
        reasons.push("중대 이벤트 뉴스: 보수 운용");
        if (status === 'PASS') status = 'WATCH';
        else if (status === 'WATCH') status = 'FAIL';
    }

    if (!actionHint) {
        if (status === 'PASS') actionHint = "구조적 우위 확보: 분할 진입 고려";
        else if (status === 'WATCH') actionHint = "관찰 필요: 주요 레벨 도달 시 재진입";
        else actionHint = "진입 금지: 옵션 구조 불확실성 노출";
    }

    return (
        <Card className={`shadow-sm border-l-4 ${status === 'PASS' ? 'border-l-emerald-500 bg-white' :
            status === 'WATCH' ? 'border-l-amber-500 bg-white' :
                'border-l-rose-500 bg-white'
            } overflow-hidden hover:shadow-md transition-shadow`}>
            <CardContent className="py-4 px-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-50">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className={`h-4 w-4 ${status === 'PASS' ? 'text-emerald-500' :
                            status === 'WATCH' ? 'text-amber-500' :
                                'text-rose-500'
                            }`} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Decision Gate</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${status === 'PASS' ? 'bg-emerald-500 text-white' :
                        status === 'WATCH' ? 'bg-amber-500 text-white' :
                            'bg-rose-500 text-white'
                        }`}>
                        {status}
                    </span>
                </div>
                <div className="space-y-1.5 mb-3">
                    {reasons.slice(0, 4).map((r, i) => (
                        <div key={i} className="text-[11px] font-bold text-slate-600 flex items-start gap-2">
                            <span className="mt-1 w-1 h-1 rounded-full bg-slate-200 shrink-0" />
                            <span className="leading-tight">{r}</span>
                        </div>
                    ))}
                    {reasons.length === 0 && <div className="text-[11px] text-slate-400 italic">특이 사항 없음</div>}
                </div>
                <div className="text-[11px] font-black text-slate-500 border-t border-slate-100 pt-2 flex items-center gap-2">
                    <Zap size={10} className="text-amber-400 shrink-0" />
                    <span className="truncate">{actionHint}</span>
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
    // fetchMarketStatus removed in favor of hook

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
    const d = liveQuote?.display;
    const e = liveQuote?.extended;

    const displayPrice = d?.price ?? initialStockData.price;
    // [S-52.2.2] UI Fix: Use changePctPct for display (already percent), fallback to initial if live is missing
    const displayChangePct = d?.changePctPct; // New SSOT field
    const displayChangeVal = displayChangePct ?? initialStockData.changePercent; // Fallback to initial

    const isUp = (displayChangeVal ?? 0) >= 0;
    const vwap = liveQuote?.vwap;

    // Extended Selection (Requirement 3: Prefer POST, else PRE)
    const activeExtType = e?.postPrice ? 'POST' : (e?.prePrice ? 'PRE' : null);
    const activeExtPrice = activeExtType === 'POST' ? e?.postPrice : e?.prePrice;
    const activeExtPct = activeExtType === 'POST' ? e?.postChangePct : e?.preChangePct;

    // T-6 Market Context Logic
    const pinZone = structure?.levels?.pinZone;
    const callWall = structure?.levels?.callWall;
    const putFloor = structure?.levels?.putFloor;
    const distToPinPct = (pinZone && displayPrice) ? Math.abs(displayPrice - pinZone) / displayPrice * 100 : null;
    const distToCallPct = (callWall && displayPrice) ? Math.abs(displayPrice - callWall) / displayPrice * 100 : null;
    const distToPutPct = (putFloor && displayPrice) ? Math.abs(displayPrice - putFloor) / displayPrice * 100 : null;

    let marketContext = "";
    if (pinZone && distToPinPct !== null && distToPinPct <= 0.5) {
        marketContext = "현재가가 Pin Zone에 매우 근접: 수렴/횡보 가능성 체크";
    } else if (pinZone && distToPinPct !== null && distToPinPct <= 1.5) {
        marketContext = "현재가가 Pin Zone 근접: 단기 변동성 수렴 가능성";
    } else if (callWall && displayPrice >= callWall && distToCallPct !== null && distToCallPct <= 1.0) {
        marketContext = "Call Wall 상단 테스트: 돌파 유지 여부 관찰";
    } else if (putFloor && displayPrice <= putFloor && distToPutPct !== null && distToPutPct <= 1.0) {
        marketContext = "Put Floor 하단 테스트: 방어/붕괴 리스크 관찰";
    } else if (callWall && putFloor) {
        marketContext = `구조 범위: $${putFloor} ~ $${callWall} 사이, 레인지 반응 확인`;
    } else {
        marketContext = "옵션 구조 레벨 일부 부재: 가격/추세 중심으로 관찰";
    }

    if (effectiveSession === "PRE" && e?.prePrice) marketContext += " · PRE 변동 반영 중";
    if (effectiveSession === "POST" && e?.postPrice) marketContext += " · POST 변동 반영 중";

    // ATM Integrity
    const showOptionsTable = options && options.options_status !== 'PENDING' && options.atmSlice && options.atmSlice.length > 0;
    const optionsPending = !options || options.options_status === 'PENDING' || !options.atmSlice || options.atmSlice.length === 0;

    // Structure Integrity
    const structPending = !structure || structure.options_status === 'PENDING';
    const showStructure = structure && structure.structure && structure.structure.strikes?.length > 0;

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">

            {/* Macro SSOT Top Bar */}
            <div className="w-full bg-[#1A1F26] border-b border-white/5 py-1.5 px-4 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-4">
                    <MarketStatusBadge status={marketStatus} variant="header" />
                    <div className="w-px h-3 bg-white/10 mx-2"></div>
                    <div className="flex items-center gap-3">
                        {/* NDX */}
                        <span className="flex items-center gap-1.5">
                            NDX
                            <span className={`font-mono ${macroData?.factors?.nasdaq100?.chgPct == null ? "text-slate-500" : macroData.factors.nasdaq100.chgPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {macroData?.factors?.nasdaq100?.level ? macroData.factors.nasdaq100.level.toLocaleString() : "—"}
                                <span className="opacity-70 ml-1">
                                    ({macroData?.factors?.nasdaq100?.chgPct != null ? (macroData.factors.nasdaq100.chgPct > 0 ? "+" : "") + macroData.factors.nasdaq100.chgPct.toFixed(2) + "%" : "—"})
                                </span>
                            </span>
                        </span>
                        {/* VIX */}
                        <span className="flex items-center gap-1.5">
                            VIX
                            <span className={`font-mono ${macroData?.factors?.vix?.level == null ? "text-slate-500" : macroData.factors.vix.level > 20 ? "text-rose-400" : "text-slate-300"}`}>
                                {macroData?.factors?.vix?.level ? macroData.factors.vix.level.toFixed(2) : "—"}
                            </span>
                        </span>
                        {/* US10Y */}
                        <span className="flex items-center gap-1.5">
                            US10Y
                            <span className={`font-mono ${macroData?.factors?.us10y?.level == null ? "text-slate-500" : macroData.factors.us10y.level > 4.5 ? "text-rose-400" : "text-slate-300"}`}>
                                {macroData?.factors?.us10y?.level ? macroData.factors.us10y.level.toFixed(2) + "%" : "—"}
                            </span>
                        </span>
                        {/* DXY */}
                        <span className="flex items-center gap-1.5">
                            DXY
                            <span className={`font-mono ${macroData?.factors?.dxy?.level == null ? "text-slate-500" : "text-slate-300"}`}>
                                {macroData?.factors?.dxy?.level ? macroData.factors.dxy.level.toFixed(2) : "—"}
                                <span className="opacity-70 ml-1">
                                    ({macroData?.factors?.dxy?.chgPct != null ? (macroData.factors.dxy.chgPct > 0 ? "+" : "") + macroData.factors.dxy.chgPct.toFixed(2) + "%" : "—"})
                                </span>
                            </span>
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span>{macroData?.asOfET?.substring(0, 16) || "—"} ET</span>
                </div>
            </div>

            {/* HEADER SECTION */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-6 border-b border-slate-200">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight mb-2">{ticker}</h1>
                        <FavoriteToggle ticker={ticker} />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${displayLabel === 'RTH'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                            {displayLabel === 'RTH'
                                ? 'MARKET'
                                : marketStatus?.session === 'regular' ? 'MARKET' : displayLabel}
                        </span>
                        {quoteLoading && <RefreshCw className="animate-spin text-slate-300" size={12} />}
                    </div>
                    <p className="text-lg text-slate-500 font-medium">{initialStockData.name}</p>
                </div>

                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-4 flex-wrap justify-end">
                        {/* I. Extended Hours Box (Restored Left Pill) */}
                        {activeExtPrice && (
                            <div className="flex flex-col items-start bg-slate-50 border border-slate-200 rounded-md px-2 py-1 shadow-sm h-fit">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-black tracking-widest px-1 py-0.5 rounded ${activeExtType === 'PRE' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {activeExtType}
                                    </span>
                                    <div className="flex items-center gap-1.5 font-mono font-bold text-sm">
                                        <span className="text-slate-700">${activeExtPrice.toFixed(2)}</span>
                                        {activeExtPct !== null && (
                                            <span className={activeExtPct >= 0 ? "text-emerald-600" : "text-rose-500"}>
                                                {activeExtPct.toFixed(2)}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {(e?.asOfET) && (
                                    <div className="text-[8px] text-slate-400 font-bold mt-0.5 ml-0.5 uppercase tracking-tighter">
                                        As of {e.asOfET} ET
                                    </div>
                                )}
                            </div>
                        )}

                        {/* II. Main Price */}
                        <div className="flex flex-col items-end">
                            <div className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter tabular-nums">
                                ${typeof displayPrice === 'number' ? displayPrice.toFixed(2) : "—"}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                {(() => {
                                    const fresh = liveQuote?.freshness || initialStockData?.freshness;
                                    if (!fresh) {
                                        return `As of ${liveQuote?.main?.asOfET || liveQuote?.display?.asOfET || "—"} ET · ${d?.baselineLabel || liveQuote?.main?.label || displayLabel}`;
                                    }
                                    return (
                                        <div className="flex items-center gap-2 justify-end">
                                            {fresh.isStale && (
                                                <span className="bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                                    과거 (참고)
                                                </span>
                                            )}
                                            <span>업데이트: {fresh.asOfET} ({fresh.message})</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* III. VWAP Detail */}
                        <div className="flex items-center gap-2 bg-slate-900/5 border border-slate-200 rounded-md px-2 py-1 h-fit">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">VWAP</span>
                            <span className="text-sm font-bold font-mono text-slate-700">${vwap ? vwap.toFixed(2) : "—"}</span>
                            {vwap && typeof displayPrice === 'number' && (
                                <span className={`text-[10px] px-1 rounded font-black tabular-nums ${displayPrice >= vwap ? "text-emerald-600" : "text-rose-600"}`}>
                                    ({(displayPrice >= vwap ? "+" : "") + (displayPrice - vwap).toFixed(2)})
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 text-lg font-mono font-medium mt-2">
                        <span className={isUp ? "text-emerald-500" : "text-rose-500"}>
                            {displayChangePct !== null && displayChangePct !== undefined
                                ? `${displayChangePct > 0 ? "+" : ""}${displayChangePct.toFixed(2)}%`
                                : (initialStockData.changePercent ? `${initialStockData.changePercent > 0 ? "+" : ""}${initialStockData.changePercent.toFixed(2)}%` : "—")}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="text-slate-400 text-xs uppercase tracking-widest font-bold">Massive Live</span>
                        {/* [S-52.3] Debug: BuildId + Baseline Source */}
                        {(liveQuote?.meta?.buildId || buildId) && (
                            <span className="text-[8px] text-slate-500 font-mono ml-2" title={`Baseline: ${liveQuote?.baseline?.source} = ${liveQuote?.baseline?.value}`}>
                                [{(liveQuote?.meta?.buildId || buildId)?.slice(-8)}]
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* T-6 Market Context Comment */}
            <div className="flex items-center gap-2 px-1 mt-[-24px] mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] truncate">
                    Market Context: {marketContext}
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 space-y-6">
                    {/* CHART */}
                    <div className="relative">
                        <StockChart
                            key={`${ticker}:${range}:${initialStockData.history.length}:${initialStockData.freshness?.asOfET}`}
                            data={initialStockData.history}
                            color={isUp ? "#10b981" : "#f43f5e"}
                            ticker={ticker}
                            initialRange={range}
                        />
                        {chartDiagnostics && !chartDiagnostics.ok && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 border border-slate-200 rounded-xl">
                                <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                                <div className="text-lg font-bold text-slate-700">차트 데이터 없음</div>
                                <div className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full mt-2">
                                    {chartDiagnostics.reasonKR || "데이터 소스 연결 실패"}
                                </div>
                                <div className="text-xs text-slate-400 font-mono mt-1">
                                    [{chartDiagnostics.code || "ERR"}] {chartDiagnostics.points || 0} points
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ADVANCED OPTIONS ANALYSIS (Structure) */}
                    <Card className="border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between bg-white gap-4">
                            <div className="flex items-center gap-2 min-w-0">
                                <BarChart3 className="h-4 w-4 text-indigo-500 shrink-0" />
                                <CardTitle className="text-base font-bold text-slate-900 truncate">Advanced Options Analysis</CardTitle>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                                {structLoading && <RefreshCw className="animate-spin text-slate-300" size={14} />}

                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Exp.</span>
                                    <select
                                        className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                                        value={selectedExp}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedExp(val);
                                            fetchStructure(val);
                                        }}
                                    >
                                        {structure?.availableExpirations ? (
                                            structure.availableExpirations.map((exp: string) => (
                                                <option key={exp} value={exp}>{exp}</option>
                                            ))
                                        ) : (
                                            <option value="">Nearest</option>
                                        )}
                                    </select>
                                </div>

                                {structPending && (
                                    <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                                        <AlertCircle size={12} />
                                        <span>PENDING</span>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6 bg-white">
                            {/* TOP LEVEL METRICS (Net GEX Focus) */}
                            <div className="grid grid-cols-1 gap-4">
                                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between relative group overflow-hidden">
                                    {/* Background soft gradient for premium feel */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-100/50 pointer-events-none"></div>

                                    <div className="relative z-10 flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1.5">Net Gamma Exposure</span>
                                        <div className={`text-4xl font-black tabular-nums tracking-tighter ${structure?.netGex > 0 ? "text-emerald-600" : structure?.netGex < 0 ? "text-rose-600" : "text-slate-900"}`}>
                                            {structure?.netGex ? (structure.netGex > 0 ? "+" : "") + (structure.netGex / 1000000).toFixed(2) + "M" : <span className="text-slate-300">—</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${structure?.netGex > 0 ? "bg-emerald-50 text-emerald-700" : structure?.netGex < 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                                                {structure?.netGex > 0 ? "Dealer Long Gamma" : structure?.netGex < 0 ? "Dealer Short Gamma" : "Neutral Positioning"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="relative z-10 text-right flex flex-col items-end">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</div>
                                        <span
                                            className={`text-xs font-black px-2 py-1 rounded border uppercase ${structure?.options_status === "OK"
                                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                : "bg-amber-50 text-amber-600 border-amber-100"
                                                }`}
                                        >
                                            {structure?.options_status || "Unknown"}
                                        </span>
                                        {structure?.debug?.gammaCoverage !== undefined && (
                                            <span className="text-[9px] font-bold text-slate-400 mt-2">Coverage: {(structure.debug.gammaCoverage * 100).toFixed(0)}%</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* KEY LEVELS SUB-SECTION */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                    <div className="h-px bg-slate-100 flex-grow"></div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Key Market Levels</span>
                                    <div className="h-px bg-slate-100 flex-grow"></div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    {/* Call Wall */}
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center transition-all hover:bg-slate-100/50">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Call Wall</span>
                                        <div className="text-xl font-black text-slate-900 tabular-nums">
                                            {structure?.levels?.callWall ? `$${structure.levels.callWall}` : <span className="text-slate-300">—</span>}
                                        </div>
                                        <span className="text-[9px] font-bold text-indigo-500/80 mt-1 uppercase tracking-tighter">Resistance</span>
                                    </div>

                                    {/* Pin Zone / Max Pain */}
                                    <div className="p-3 rounded-xl bg-slate-900/[0.03] border border-slate-200/60 flex flex-col items-center justify-center transition-all hover:bg-slate-900/[0.05]">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Pin Zone</span>
                                        <div className="text-xl font-black text-slate-900 tabular-nums underline decoration-indigo-400/30 decoration-2 underline-offset-4">
                                            {structure?.levels?.pinZone ? `$${structure.levels.pinZone}` : <span className="text-slate-300">—</span>}
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">Magnet</span>
                                    </div>

                                    {/* Put Floor */}
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center transition-all hover:bg-slate-100/50">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Put Floor</span>
                                        <div className="text-xl font-black text-slate-900 tabular-nums">
                                            {structure?.levels?.putFloor ? `$${structure.levels.putFloor}` : <span className="text-slate-300">—</span>}
                                        </div>
                                        <span className="text-[9px] font-bold text-rose-500/80 mt-1 uppercase tracking-tighter">Support</span>
                                    </div>
                                </div>

                                <div className="px-2 py-2 rounded-lg bg-indigo-50/30 border border-indigo-100/50 text-[10px] font-medium text-slate-600 text-center leading-relaxed">
                                    Options structure suggests a
                                    <span className="font-bold text-indigo-700 mx-1">
                                        {Math.abs((structure?.levels?.pinZone || 0) - displayPrice) < displayPrice * 0.02 ? "Magnification Effect" : "Standard Volatility"}
                                    </span>
                                    around the {structure?.expiration} expiration horizon.
                                </div>
                            </div>

                            {/* DATA QUALITY AUDIT LINE (Compact) */}
                            {structure && (
                                <div className="flex items-center justify-between px-3 text-[9px] font-bold text-slate-400 bg-slate-50 py-1.5 rounded-lg border border-slate-100">
                                    <div className="flex items-center gap-4">
                                        <span>Contracts: {structure.debug?.contractsFetched}</span>
                                        <span>Pages: {structure.debug?.pagesFetched}</span>
                                    </div>
                                    <span className="text-indigo-400 uppercase tracking-widest text-[8px]">Massive Analysis Verified</span>
                                </div>
                            )}

                            {/* CHART AREA */}
                            <div className="pt-2">
                                {showStructure ? (
                                    <OIChart
                                        strikes={structure.structure.strikes}
                                        callsOI={structure.structure.callsOI}
                                        putsOI={structure.structure.putsOI}
                                        currentPrice={displayPrice}
                                        maxPain={structure.maxPain}
                                        callWall={structure.levels?.callWall}
                                        putFloor={structure.levels?.putFloor}
                                    />
                                ) : (
                                    <div className="h-40 flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <div className="text-center">
                                            <div className="text-xl font-bold text-slate-300 mb-1 italic">Visualizing Structure...</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scanning contracts for {selectedExp}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ATM OPTIONS CHAIN */}
                    <Card className="border-slate-200 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/30">
                            <CardTitle className="text-sm font-bold text-slate-700">ATM Chain (Raw)</CardTitle>
                            {optionsPending && (
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                                    <AlertCircle size={12} />
                                    <span>{options?.options_status === "PENDING" ? "Options: PENDING" : "Unavailable"}</span>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            {optionsLoading && !options ? (
                                <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading Massive chain...</div>
                            ) : showOptionsTable ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs font-mono">
                                        <thead className="bg-slate-50 text-slate-500">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-semibold">Exp</th>
                                                <th className="px-3 py-2 text-right font-semibold">Strike</th>
                                                <th className="px-3 py-2 text-center font-semibold">Type</th>
                                                <th className="px-3 py-2 text-right font-semibold">Last</th>
                                                <th className="px-3 py-2 text-right font-semibold">IV</th>
                                                <th className="px-3 py-2 text-right font-semibold">OI</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(options.atmSlice as any[]).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-3 py-2 text-slate-400">{row.expiration}</td>
                                                    <td className={`px-3 py-2 text-right font-bold ${Math.abs(row.strike - displayPrice) < displayPrice * 0.005 ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}>
                                                        {row.strike}
                                                    </td>
                                                    <td className={`px-3 py-2 text-center font-bold ${row.type === 'call' ? "text-emerald-600" : "text-rose-500"}`}>
                                                        {row.type === 'call' ? "C" : "P"}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-slate-900">{row.last ? row.last.toFixed(2) : "-"}</td>
                                                    <td className="px-3 py-2 text-right text-slate-500">{row.iv ? (row.iv * 100).toFixed(1) + "%" : "-"}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">
                                                        {row.oi !== null ? row.oi.toLocaleString() : <span className="text-amber-400 italic">PENDING</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="p-2 text-[10px] text-center text-slate-400 bg-slate-50 border-t border-slate-100">
                                        Live Data (Massive) • 30s Cache • {options.options_status === "PENDING" ? "OI Verification Pending" : "Source: Polygon.io"}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50/50">
                                    Raw chain unavailable.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* SIDEBAR (Technical + News) */}
                <div className="space-y-6">
                    <DecisionGate
                        ticker={ticker}
                        displayPrice={displayPrice}
                        session={effectiveSession}
                        structure={structure}
                        krNews={krNews}
                    />
                    <Card className="shadow-sm border-slate-200 bg-white hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2.5 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-indigo-500" /> Technical Pulse
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-100">
                                {/* RSI */}
                                <div className="p-3 hover:bg-slate-50 transition-colors cursor-default group">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-500 transition-colors">RSI (14)</span>
                                        <span className={`text-xl font-black font-mono tracking-tighter tabular-nums ${initialStockData.rsi && (initialStockData.rsi >= 70 ? "text-rose-500" : initialStockData.rsi <= 30 ? "text-emerald-500" : "text-slate-900")}`}>
                                            {initialStockData.rsi ? Math.round(initialStockData.rsi) : "N/A"}
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-500 bg-slate-100/60 px-2 py-0.5 rounded inline-block">
                                        {initialStockData.rsi ? (
                                            initialStockData.rsi >= 70 ? "과매수 (하락 경계)" :
                                                initialStockData.rsi <= 30 ? "과매도 (반등 기대)" :
                                                    "중립 (추세 탐색)"
                                        ) : "데이터 분석 중..."}
                                    </p>
                                </div>

                                {/* 3D Return Gauge */}
                                <div className="p-3 hover:bg-slate-50 transition-colors cursor-default group">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-500 transition-colors">3D Return</span>
                                        <span className={`text-xl font-black font-mono tracking-tighter tabular-nums ${initialStockData.return3d && initialStockData.return3d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                            {initialStockData.return3d ? (initialStockData.return3d > 0 ? "+" : "") + initialStockData.return3d.toFixed(2) + "%" : "N/A"}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
                                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-300/40 z-10"></div>
                                        <div
                                            className={`h-full absolute transition-all duration-1000 ease-out shadow-sm ${initialStockData.return3d && initialStockData.return3d >= 0 ? "bg-gradient-to-r from-emerald-400 to-emerald-500 left-1/2" : "bg-gradient-to-l from-rose-400 to-rose-500 right-1/2"}`}
                                            style={{
                                                width: `${Math.min(50, Math.abs(initialStockData.return3d || 0) * 8)}%`
                                            }}
                                        ></div>
                                    </div>
                                </div>

                                {/* PCR (Put/Call Ratio) */}
                                <div className="p-3 hover:bg-slate-50 transition-colors cursor-default group border-b-0">
                                    <div className="flex justify-between items-end mb-1.5">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-500 transition-colors">P/C OI Ratio</span>
                                        <span className="text-xl font-black font-mono tracking-tighter tabular-nums text-slate-900">
                                            {(() => {
                                                const puts = structure?.structure?.putsOI?.reduce((a: number, b: any) => a + (b || 0), 0) || 0;
                                                const calls = structure?.structure?.callsOI?.reduce((a: number, b: any) => a + (b || 0), 0) || 0;
                                                return calls > 0 ? (puts / calls).toFixed(2) : "—";
                                            })()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const puts = structure?.structure?.putsOI?.reduce((a: number, b: any) => a + (b || 0), 0) || 0;
                                            const calls = structure?.structure?.callsOI?.reduce((a: number, b: any) => a + (b || 0), 0) || 0;
                                            const pcr = calls > 0 ? puts / calls : 0;
                                            if (!structure) return <span className="text-[10px] text-slate-400 italic">스캔 중...</span>;

                                            const isBullish = pcr < 0.7;
                                            const isBearish = pcr > 1.0;

                                            return (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shadow-sm transition-all ${isBullish ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                    isBearish ? "bg-rose-50 text-rose-700 border-rose-100" :
                                                        "bg-slate-50 text-slate-600 border-slate-100"
                                                    }`}>
                                                    {isBullish ? "강세 (Bullish)" : isBearish ? "약세 (Bearish)" : "중립 (Neutral)"}
                                                </span>
                                            );
                                        })()}
                                        <p className="text-[10px] text-slate-400 font-bold group-hover:text-slate-500 transition-colors">
                                            OI 감정 분석
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-slate-200 bg-white hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Newspaper className="h-4 w-4 text-accent" /> Intel Feed (Native KR)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            {(() => {
                                const getOptionsContext = (tag: string) => {
                                    if (optionsPending || structPending) return "옵션 구조 해석 불가";

                                    const pinZone = structure?.levels?.pinZone;
                                    const gex = structure?.netGex;
                                    const isNearPin = pinZone && Math.abs(displayPrice - pinZone) <= (displayPrice * 0.02);
                                    const isPositiveGex = gex > 0;

                                    if (tag === "EARNINGS") {
                                        if (isNearPin) return "실적 이벤트를 앞두고 가격이 옵션 자석 구간에 위치";
                                        return "실적 발표에 따른 변동성 노출 구간 진입";
                                    }
                                    if (tag === "VOLATILITY") {
                                        if (!isPositiveGex) return "딜러 숏 감마 구간으로 변동성 확대 위험";
                                        return "딜러 롱 감마 구간으로 변동성 완화 작용 예상";
                                    }
                                    if (tag === "REGULATION") {
                                        if (!isNearPin) return "옵션 구조상 가격 안정 구간을 벗어난 상태";
                                        return "이슈 발생에도 현재 가격은 마그넷 구간 내 위치";
                                    }
                                    if (tag === "GUIDANCE" || tag === "MACRO") {
                                        if (isNearPin) return "거시/전망 이슈와 함께 옵션 핀 효과 진행 중";
                                        return "주요 레벨 이탈 여부에 따른 변동성 확장 구간";
                                    }
                                    return isPositiveGex ? "현재 옵션 구조는 가격 변동 완화 기조 유지" : "현재 옵션 구조는 변동성 증폭 취약 구간";
                                };

                                return newsLoading && krNews.length === 0 ? (
                                    <p className="text-sm text-slate-500 animate-pulse">Scanning KR feed...</p>
                                ) : krNews.length > 0 ? krNews.map((item, i) => (
                                    <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="block group cursor-pointer border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${item.tag === 'EARNINGS' ? 'bg-amber-100 text-amber-700' :
                                                    item.tag === 'VOLATILITY' ? 'bg-rose-100 text-rose-700' :
                                                        item.tag === 'REGULATION' ? 'bg-indigo-100 text-indigo-700' :
                                                            item.tag === 'MACRO' ? 'bg-slate-100 text-slate-700' :
                                                                'bg-slate-50 text-slate-500'
                                                    }`}>
                                                    {item.tag}
                                                </span>
                                            </div>
                                            <div className="text-sm font-medium text-slate-700 group-hover:text-primary transition-colors line-clamp-2 leading-snug">{item.title}</div>
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{item.source}</span>
                                                <span>{item.publishedAtEt}</span>
                                                <span className="text-indigo-400 opacity-80">(약 {item.ageHours}시간 전)</span>
                                            </div>
                                            <div className="text-[10px] font-medium text-slate-400 border-l-2 border-slate-100 pl-2 mt-1 truncate">
                                                {getOptionsContext(item.tag)}
                                            </div>
                                        </div>
                                    </a>
                                )) : (
                                    <p className="text-sm text-slate-400 italic">No recent KR news (48h)</p>
                                );
                            })()}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
