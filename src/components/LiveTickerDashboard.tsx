"use client";

import React, { useEffect, useState } from 'react';
import { StockChart } from "@/components/StockChart";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity } from "lucide-react";
import { StockData, OptionData, NewsItem } from "@/services/stockTypes";
import { OIChart } from "@/components/OIChart";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { GammaLevelsViz } from "@/components/GammaLevelsViz";
import { FlowSniper } from "@/components/FlowSniper";

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
    const displayChangePct = liveQuote?.changePct ?? initialStockData.changePercent;

    // Extended Selection
    const activeExtType = e?.postPrice ? 'POST' : (e?.prePrice ? 'PRE' : null);
    const activeExtPrice = activeExtType === 'POST' ? e?.postPrice : e?.prePrice;
    const activeExtPctFrac = activeExtType === 'POST' ? e?.postChangePct : e?.preChangePct;
    const activeExtPct = activeExtPctFrac !== null && activeExtPctFrac !== undefined
        ? activeExtPctFrac * 100
        : null;

    // Price Source Badge
    const pSource = liveQuote?.priceSource || initialStockData?.priceSource;
    let pTag = "";
    let pTagStyle = "";

    if (pSource === "OFFICIAL_CLOSE") { pTag = "CLOSE"; pTagStyle = "text-slate-500 bg-slate-100 border-slate-200"; }
    else if (pSource === "POST_CLOSE") { pTag = "POST"; pTagStyle = "text-indigo-600 bg-indigo-50 border-indigo-200"; }
    else if (pSource === "PRE_OPEN") { pTag = "PRE"; pTagStyle = "text-amber-600 bg-amber-50 border-amber-200"; }
    else if (pSource === "LIVE_SNAPSHOT") { pTag = "LIVE"; pTagStyle = "text-emerald-600 bg-emerald-50 border-emerald-200"; }

    // ATM Integrity
    const showOptionsTable = options && options.options_status !== 'PENDING' && options.atmSlice && options.atmSlice.length > 0;
    const optionsPending = !options || options.options_status === 'PENDING' || !options.atmSlice || options.atmSlice.length === 0;
    const showStructure = structure && structure.structure && structure.structure.strikes?.length > 0;

    return (
        <div className="w-full max-w-[1600px] mx-auto space-y-6">

            {/* 1. TOP HEADER (Ticker & Price) */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-6 border-b border-white/10">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl lg:text-6xl font-black text-slate-900 tracking-tighter mb-2">{ticker}</h1>
                        <FavoriteToggle ticker={ticker} />
                        {quoteLoading && <RefreshCw className="animate-spin text-slate-300" size={14} />}
                    </div>
                    <p className="text-xl text-slate-500 font-medium tracking-tight uppercase">{initialStockData.name}</p>
                </div>

                <div className="text-right">
                    <div className="text-5xl lg:text-6xl font-black text-slate-900 tracking-tighter tabular-nums">
                        ${displayPrice?.toFixed(2)}
                    </div>
                    <div className={`text-xl font-bold font-mono tracking-tighter ${displayChangePct && displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {displayChangePct && displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* 2. COMMAND GRID (12 Cols) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

                {/* LEFT: STRATEGY (3 Cols) */}
                <div className="xl:col-span-3 space-y-6">
                    <DecisionGate
                        ticker={ticker}
                        displayPrice={displayPrice}
                        session={effectiveSession}
                        structure={structure}
                        krNews={krNews}
                    />

                    {/* Gamma Levels Visualizer */}
                    <div className="h-[450px]">
                        <GammaLevelsViz
                            currentPrice={displayPrice}
                            callWall={structure?.levels?.callWall}
                            putFloor={structure?.levels?.putFloor}
                            pinZone={structure?.levels?.pinZone}
                        />
                    </div>
                </div>

                {/* CENTER: BATTLEFIELD (6 Cols) */}
                <div className="xl:col-span-6 space-y-6">
                    {/* Main Chart */}
                    <div className="h-[500px] rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative">
                        <StockChart
                            key={`${ticker}:${range}:${initialStockData.history.length}`}
                            data={initialStockData.history}
                            color={(displayChangePct || 0) >= 0 ? "#10b981" : "#f43f5e"}
                            ticker={ticker}
                            initialRange={range}
                        />
                    </div>

                    {/* Flow Sniper Bar */}
                    <FlowSniper
                        netPremium={liveQuote?.flow?.netPremium || 0}
                        callPremium={liveQuote?.flow?.callPremium || 0}
                        putPremium={liveQuote?.flow?.putPremium || 0}
                        optionsCount={liveQuote?.flow?.optionsCount || 0}
                    />
                </div>

                {/* RIGHT: EVIDENCE (3 Cols) */}
                <div className="xl:col-span-3 space-y-6">
                    {/* Advanced Options Card (Existing NetGex) */}
                    <Card className="border-slate-200 shadow-sm overflow-hidden h-fit">
                        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-900">Advanced Structure</CardTitle>
                                <Layers size={14} className="text-indigo-500" />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6 p-4">
                            {/* Net Gex */}
                            <div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Gex</span>
                                <div className={`text-3xl font-black ${structure?.netGex > 0 ? "text-emerald-500" : structure?.netGex < 0 ? "text-rose-500" : "text-slate-900"}`}>
                                    {structure?.netGex ? (structure.netGex > 0 ? "+" : "") + (structure.netGex / 1000000).toFixed(2) + "M" : "—"}
                                </div>
                            </div>

                            {/* OI Chart Minimal */}
                            <div className="h-40">
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

                    {/* Live Chain Table */}
                    <Card className="border-slate-200 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/30">
                            <CardTitle className="text-sm font-bold text-slate-700">ATM Chain</CardTitle>
                            {optionsPending && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">PENDING</span>}
                        </CardHeader>
                        <CardContent className="p-0">
                            {showOptionsTable ? (
                                <table className="w-full text-[10px] font-mono">
                                    <thead className="bg-slate-50 text-slate-500">
                                        <tr>
                                            <th className="px-2 py-1 text-right">Strike</th>
                                            <th className="px-2 py-1 text-center">Type</th>
                                            <th className="px-2 py-1 text-right">OI</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(options.atmSlice as any[]).slice(0, 5).map((row, idx) => (
                                            <tr key={idx}>
                                                <td className={`px-2 py-1 text-right font-bold ${Math.abs(row.strike - displayPrice) < displayPrice * 0.005 ? "text-blue-600" : "text-slate-700"}`}>{row.strike}</td>
                                                <td className={`px-2 py-1 text-center font-bold ${row.type === 'call' ? "text-emerald-600" : "text-rose-500"}`}>{row.type === 'call' ? "C" : "P"}</td>
                                                <td className="px-2 py-1 text-right">{row.oi?.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <div className="p-4 text-center text-xs text-slate-400">Loading...</div>}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
