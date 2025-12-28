"use client";

import React, { useState, useEffect, useMemo } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { DecisionBadge } from "@/components/DecisionBadge";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { AlertCircle, TrendingUp, TrendingDown, Activity, X, ChevronRight, Zap } from "lucide-react";

// Types
interface TickerItem {
    ticker: string;
    symbol: string;
    name?: string;
    price?: number;
    changePct?: number;
    rank?: number;
    alphaScore?: number;
    options_status?: string;
    role?: string;
    decisionSSOT?: {
        action: string;
        confidence: number;
        triggersKR: string[];
    };
    v71?: {
        gate?: string;
        gateStatus?: {
            eligible: string;
            summary: string;
        };
        decisionSSOT?: {
            action: string;
            confidence: number;
            triggersKR: string[];
        };
    };
}

interface ReportSnapshot {
    meta?: {
        id?: string;
        runId?: string;
        buildId?: string;
        universeSource?: string;
        validation?: {
            mode?: string;
            isValid?: boolean;
        };
        marketStatus?: any;
    };
    items?: TickerItem[];
    marketSentiment?: {
        regime?: string;
    };
    alphaGrid?: {
        top3?: TickerItem[];
    };
}

interface StorageDebug {
    ssot?: string;
    buildId?: string;
    itemsCount?: number;
    integrity?: {
        status?: string;
        reasons?: string[];
    };
    optionsStatus?: {
        state?: string;
        status?: string;
        coveragePct?: number;
        updatedAt?: string;
    };
}

// Fetch report data
async function fetchReportData(): Promise<{ snapshot: ReportSnapshot; storageDebug: StorageDebug }> {
    try {
        const res = await fetch("/api/reports/latest", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch report");
        const data = await res.json();
        return {
            snapshot: data.snapshot || { items: [], meta: {} },
            storageDebug: data.debug || {}
        };
    } catch (e) {
        console.error("Report fetch error:", e);
        return {
            snapshot: { items: [], meta: {} },
            storageDebug: {}
        };
    }
}

export default function Tier01Page() {
    const [snapshot, setSnapshot] = useState<ReportSnapshot>({ items: [], meta: {} });
    const [storageDebug, setStorageDebug] = useState<StorageDebug>({});
    const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const { status: marketStatus } = useMarketStatus();
    const { snapshot: macroData } = useMacroSnapshot();

    useEffect(() => {
        async function load() {
            setLoading(true);
            const { snapshot, storageDebug } = await fetchReportData();
            setSnapshot(snapshot);
            setStorageDebug(storageDebug);
            setLoading(false);
        }
        load();
    }, []);

    const meta = snapshot.meta || {};
    const items = snapshot.items || [];
    const universeCount = items.length;

    // Derived data
    const final12 = useMemo(() => items.slice(0, 12), [items]);
    const alphaItems = useMemo(() => final12.filter((i: any) => i.role === "ALPHA").slice(0, 3), [final12]);
    const coreItems = useMemo(() => final12.filter((i: any) => i.role === "CORE").slice(0, 7), [final12]);
    const highRiskItems = useMemo(() => final12.filter((i: any) => i.role === "HIGH_RISK").slice(0, 2), [final12]);

    // Integrity checks
    const isSelectionContractValid = final12.length >= 3;
    const isSSOTValid = final12.length > 0 && isSelectionContractValid;
    const validationMode = meta.validation?.mode || "PARTIAL";
    const isMetaValid = meta.validation?.isValid === true && validationMode === "PASS";
    const isReportIntegrityOK = isMetaValid && isSSOTValid;
    const integrityFailReason = !isSSOTValid
        ? "SSOT_MISSING_OR_INVALID"
        : !isMetaValid
            ? validationMode === "PARTIAL" ? "PENDING_BACKFILL" : "VALIDATION_FAILED"
            : null;

    const isInstitutional = isReportIntegrityOK;
    const isSimulation = process.env.NODE_ENV !== "production" && !isInstitutional;

    // Selected ticker data
    const selectedTickerData = selectedTicker ? items.find((i: any) => i.ticker === selectedTicker || i.symbol === selectedTicker) : null;

    // Options status helper
    const getOptionsStatusColor = (status?: string) => {
        if (status === "OK") return "bg-emerald-500";
        if (status === "PARTIAL") return "bg-amber-500";
        if (status === "PENDING") return "bg-slate-500";
        return "bg-rose-500";
    };

    // Decision action helper
    const getDecisionColor = (action?: string) => {
        if (action === "MAINTAIN" || action === "ENTER") return "text-emerald-400";
        if (action === "EXIT" || action === "REPLACE") return "text-rose-400";
        if (action === "CAUTION" || action === "WATCH") return "text-amber-400";
        return "text-slate-400";
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0F1419] text-slate-200 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Activity className="w-8 h-8 text-indigo-500 animate-pulse" />
                    <span className="text-sm font-bold text-slate-500">Loading Engine Data...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0F1419] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
            <LandingHeader />

            {/* [S-56.4.4] NON-BLOCKING STATUS STRIP */}
            <div className="flex items-center justify-between bg-[#1A1F26] border-b border-white/5 py-2 px-4 sticky top-[48px] z-40">
                {/* LEFT: Options Status */}
                <div className="flex items-center gap-3">
                    {(() => {
                        const st = storageDebug?.optionsStatus;
                        const isPartial = st?.state === "PARTIAL" || st?.status === "PARTIAL";
                        const isPending = st?.state === "PENDING" || st?.status === "PENDING";
                        const coverage = st?.coveragePct || 0;

                        if (isPending || isPartial) {
                            return (
                                <div className="flex items-center gap-2 px-2 py-0.5 bg-amber-950/30 border border-amber-900/50 rounded text-[10px] text-amber-500 font-bold animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    Options Collecting ({coverage}%)
                                    <span className="text-amber-500/60 font-medium ml-1 hidden sm:inline">
                                        - Some data replaced by price structure
                                    </span>
                                </div>
                            );
                        }
                        return (
                            <div className="flex items-center gap-2 text-[10px] text-emerald-500/80 font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Options Data OK (100%)
                            </div>
                        );
                    })()}
                </div>

                {/* RIGHT: Engine ID & Refresh */}
                <div className="flex items-center gap-3">
                    <span className="text-[9px] text-slate-600 font-mono hidden sm:inline">
                        Build: {meta.buildId?.slice(0, 7) || storageDebug?.buildId?.slice(0, 7) || "LOCAL"}
                    </span>
                    <div className="h-3 w-px bg-slate-800 hidden sm:block" />
                    <span className="text-[9px] text-slate-500">
                        {storageDebug?.optionsStatus?.updatedAt ? `Updated: ${storageDebug.optionsStatus.updatedAt.split("T")[1]?.slice(0, 5)} ET` : ""}
                    </span>
                </div>
            </div>

            {/* Engine Status Console */}
            <div className="sticky top-[80px] z-40 bg-[#0F1419]/95 backdrop-blur-sm border-b border-slate-700/40 select-none">
                <div className="max-w-full mx-auto px-4 lg:px-6 h-11 flex items-center justify-between">
                    <div className="flex items-center divide-x divide-slate-700">
                        {/* Integrity Status */}
                        <div className="px-3 flex flex-col justify-center">
                            <span className="text-[8px] font-bold text-slate-500 mb-0.5">Status</span>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${isReportIntegrityOK ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" : integrityFailReason === "SSOT_MISSING_OR_INVALID" ? "bg-rose-400" : "bg-amber-400"}`}></div>
                                <span className={`text-[10px] font-bold ${isReportIntegrityOK ? "text-emerald-400" : integrityFailReason === "SSOT_MISSING_OR_INVALID" ? "text-rose-400" : "text-amber-400"}`}>
                                    {isReportIntegrityOK ? "OK" : integrityFailReason === "SSOT_MISSING_OR_INVALID" ? "FAIL" : "PENDING"}
                                </span>
                            </div>
                        </div>

                        {/* Market Session */}
                        <div className="px-3 flex flex-col justify-center">
                            <span className="text-[8px] font-bold text-slate-500 mb-0.5">Market</span>
                            <div className="flex items-center gap-1.5">
                                <MarketStatusBadge status={marketStatus} variant="live" />
                            </div>
                        </div>

                        {/* Market Regime */}
                        <div className="px-3 flex flex-col justify-center">
                            <span className="text-[8px] font-bold text-slate-500 mb-0.5">Regime</span>
                            <span className="text-[10px] font-bold text-slate-200">
                                {(snapshot as any).marketSentiment?.regime === "Risk-On" ? "RISK ON" :
                                    (snapshot as any).marketSentiment?.regime === "Risk-Off" ? "RISK OFF" : "NEUTRAL"}
                            </span>
                        </div>

                        {/* VIX */}
                        <div className="px-3 flex flex-col justify-center">
                            <span className="text-[8px] font-bold text-slate-500 mb-0.5">VIX</span>
                            <span className={`text-[10px] font-bold ${(macroData?.factors?.vix?.level || 0) > 20 ? "text-rose-400" : "text-emerald-400"}`}>
                                {macroData?.factors?.vix?.level?.toFixed(2) || "-"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isInstitutional ? (
                            <div className="px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded text-[9px] font-bold text-emerald-400">
                                INSTITUTIONAL
                            </div>
                        ) : isSimulation ? (
                            <div className="px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 rounded text-[9px] font-bold text-amber-400 animate-pulse">
                                SIMULATION
                            </div>
                        ) : null}
                        <div className="px-2 py-0.5 border border-slate-600 rounded text-[8px] font-bold text-slate-500">
                            V8.1
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-black text-white tracking-tight mb-2">Tier 0.1 - Alpha Terminal</h1>
                    <p className="text-sm text-slate-500">Real-time engine analysis and Top 12 portfolio</p>
                </div>

                {/* Top 12 Table */}
                <div className="bg-[#1A1F26] border border-slate-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/50 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Ticker</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Alpha</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Action</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Options</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {final12.map((t: TickerItem, i: number) => {
                                    const decision = t.decisionSSOT || t.v71?.decisionSSOT;
                                    const action = decision?.action || "CAUTION";
                                    const optStatus = t.options_status || "PENDING";

                                    return (
                                        <tr
                                            key={t.ticker || t.symbol}
                                            className="hover:bg-slate-800/30 cursor-pointer transition-colors group"
                                            onClick={() => setSelectedTicker(t.ticker || t.symbol)}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] font-mono text-slate-600">{(i + 1).toString().padStart(2, "0")}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] font-bold text-slate-100 group-hover:text-indigo-400">{t.symbol || t.ticker}</span>
                                                    {t.role === "ALPHA" && <span className="text-[7px] font-bold text-indigo-400 bg-indigo-500/15 px-1 py-0.5 rounded">A</span>}
                                                    {/* [S-56.4.4] Options Status Dot */}
                                                    {optStatus !== "OK" && (
                                                        <span title={`Options: ${optStatus}`} className={`w-1.5 h-1.5 rounded-full ${getOptionsStatusColor(optStatus)}`} />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[11px] font-bold text-indigo-400">{t.alphaScore?.toFixed(1) || "-"}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className={`text-[10px] font-black ${getDecisionColor(action)} tracking-tight`}>
                                                        {action}
                                                    </span>
                                                    <span className="text-[8px] text-slate-500 font-medium truncate max-w-[100px]">
                                                        {decision?.triggersKR?.[0] || "Analyzing..."}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${optStatus === "OK" ? "bg-emerald-500/20 text-emerald-400" :
                                                    optStatus === "PARTIAL" ? "bg-amber-500/20 text-amber-400" :
                                                        "bg-slate-500/20 text-slate-400"
                                                    }`}>
                                                    {optStatus}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 inline" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Alpha Grid Summary */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {alphaItems.slice(0, 3).map((t: TickerItem, i: number) => {
                        const decision = t.decisionSSOT || t.v71?.decisionSSOT;
                        return (
                            <div
                                key={t.ticker || t.symbol}
                                className="bg-gradient-to-br from-indigo-900/20 to-slate-900/50 border border-indigo-500/20 rounded-xl p-4 cursor-pointer hover:border-indigo-500/40 transition-all"
                                onClick={() => setSelectedTicker(t.ticker || t.symbol)}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded">A{i + 1}</span>
                                        <span className="text-lg font-black text-white">{t.symbol || t.ticker}</span>
                                    </div>
                                    <DecisionBadge tickerData={t} />
                                </div>
                                <div className="text-[11px] text-slate-400">
                                    {decision?.triggersKR?.[0] || "Analysis pending..."}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedTicker && selectedTickerData && (
                <div className="fixed inset-0 z-50 flex items-center justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTicker(null)} />
                    <div className="relative w-full max-w-lg h-full bg-[#0F1419] border-l border-slate-800 overflow-y-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-[#0F1419]/95 backdrop-blur-sm border-b border-slate-800 p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl font-black text-white">{selectedTickerData.symbol || selectedTickerData.ticker}</span>
                                <DecisionBadge tickerData={selectedTickerData} />
                            </div>
                            <button onClick={() => setSelectedTicker(null)} className="p-2 hover:bg-slate-800 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6">
                            {/* Rank & Context */}
                            <div className="space-y-4">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rank & Context</span>
                                <div className="grid grid-cols-2 gap-4 border-l border-slate-800 pl-4 py-2">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Absolute Rank</span>
                                        <span className="text-xl font-black text-white italic">#{selectedTickerData.rank || "N/A"} / {universeCount}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Percentile</span>
                                        <span className="text-xl font-black text-indigo-400">
                                            {universeCount > 1 ? (Math.max(0, 100 - ((selectedTickerData.rank || 0) - 1) / (universeCount - 1) * 100)).toFixed(0) : "100"}%
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Engine Source</span>
                                        <span className="text-[11px] font-black text-slate-400 font-mono uppercase">{meta.universeSource || "market"}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Alpha Score</span>
                                        <span className="text-[11px] font-black text-indigo-400 uppercase">
                                            {selectedTickerData.alphaScore?.toFixed(1) || "-"}
                                        </span>
                                    </div>
                                </div>

                                {/* [S-56.4.4] Legacy Modal Section Handler */}
                                {selectedTickerData.v71?.gateStatus?.eligible === "FAIL" && (
                                    <div className="flex flex-col mt-4 pt-4 border-t border-slate-800">
                                        <span className="text-[9px] font-bold text-slate-600 uppercase mb-1">Legacy Check (v7.1)</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-rose-950 text-rose-400 px-1.5 rounded font-black">FAIL</span>
                                            <span className="text-[9px] text-slate-500 truncate">{selectedTickerData.v71?.gateStatus?.summary}</span>
                                        </div>
                                        <p className="text-[8px] text-slate-600 mt-1">
                                            *Decision SSOT (top badge) takes priority. This is for reference only.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Decision Analysis */}
                            <div className="space-y-4">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Decision Analysis</span>
                                {(() => {
                                    const decision = selectedTickerData.decisionSSOT || selectedTickerData.v71?.decisionSSOT;
                                    if (!decision) {
                                        return <p className="text-sm text-slate-500">No analysis data available.</p>;
                                    }

                                    const confidence = decision.confidence >= 70 ? "HIGH" :
                                        decision.confidence >= 40 ? "MEDIUM" : "LOW";

                                    return (
                                        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-lg font-black ${getDecisionColor(decision.action)}`}>
                                                    {decision.action}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${confidence === "HIGH" ? "bg-emerald-500/20 text-emerald-400" :
                                                    confidence === "LOW" ? "bg-rose-500/20 text-rose-400" :
                                                        "bg-amber-500/20 text-amber-400"
                                                    }`}>
                                                    Confidence: {confidence}
                                                </span>
                                            </div>
                                            <ul className="space-y-1">
                                                {decision.triggersKR?.map((trigger: string, idx: number) => (
                                                    <li key={idx} className="text-[11px] text-slate-400 flex items-start gap-2">
                                                        <span className="w-1 h-1 rounded-full bg-slate-600 mt-1.5 shrink-0" />
                                                        {trigger}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="absolute bottom-8 left-8 right-8">
                            <button
                                onClick={() => setSelectedTicker(null)}
                                className="w-full border border-slate-700 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-white transition-all"
                            >
                                [ Back to Terminal ]
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
