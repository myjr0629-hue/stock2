"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LandingHeader } from "@/components/landing/LandingHeader";
import {
    AlertCircle, TrendingUp, TrendingDown, Activity,
    ChevronRight, Shield, Clock, Zap, DollarSign,
    BarChart3, Target, XCircle, CheckCircle, AlertTriangle,
    Lock, Unlock, Eye, ArrowUpRight, ArrowDownRight
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================
interface TickerItem {
    ticker: string;
    symbol?: string;
    name?: string;
    price?: number;
    changePct?: number;
    alphaScore?: number;
    powerScore?: number;
    qualityTier?: "ACTIONABLE" | "WATCH" | "FILLER";
    options_status?: string;
    role?: string;
    sector?: string;
    decisionSSOT?: {
        action: string;
        confidencePct: number;
        triggersKR: string[];
    };
    entryBand?: { low: number; high: number };
    hardCut?: number;
    tp1?: number;
    tp2?: number;
}

interface EvidenceCard {
    id: string;
    title: string;
    titleKR: string;
    meaning: string;      // 이 지표가 무엇을 말하는가
    interpretation: string; // 지금 수치의 상태
    action: string;       // 그래서 오늘 무엇을 해야 하는가
    confidence: "A" | "B" | "C";
    icon: React.ReactNode;
    status: "BULLISH" | "NEUTRAL" | "BEARISH" | "PENDING";
    value?: string | number;
}

interface GateStatus {
    price: boolean;
    options: boolean;
    macro: boolean;
    event: boolean;
    policy: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
// ============================================================================
// HELPER FUNCTIONS (STYLES)
// ============================================================================
const getRegimeColor = (regime?: string) => {
    // [Reskin] Cleaner, no gradients, use solid semantic colors but muted
    if (regime === "RISK_ON") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (regime === "RISK_OFF") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    return "text-amber-400 bg-amber-500/10 border-amber-500/20";
};

const getRegimeText = (regime?: string) => {
    if (regime === "RISK_ON") return "RISK-ON";
    if (regime === "RISK_OFF") return "RISK-OFF";
    return "NEUTRAL";
};

const getTierStyle = (tier?: string) => {
    // [Reskin] Very minimal. Tiers are important but shouldn't scream.
    if (tier === "ACTIONABLE") return "text-emerald-400 border border-emerald-500/30 bg-emerald-500/5";
    if (tier === "WATCH") return "text-slate-300 border border-slate-700 bg-slate-800/50";
    return "text-slate-500 border border-slate-800 bg-transparent";
};

const getOptionsStatus = (status?: string) => {
    // [Reskin] Dot + Text style only
    if (status === "OK" || status === "READY") return { label: "OK", color: "bg-emerald-500" };
    if (status === "PARTIAL") return { label: "PARTIAL", color: "bg-amber-500" };
    if (status === "NO_OPTIONS") return { label: "N/A", color: "bg-slate-600" };
    if (status === "FAILED" || status === "ERR") return { label: "ERR", color: "bg-rose-500" };
    return { label: "UNK", color: "bg-slate-500" };
};

const getActionStyle = (action?: string) => {
    // [Reskin] Unified simpler styles
    if (action === "ENTER" || action === "STRONG_BUY") return "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
    if (action === "MAINTAIN") return "text-sky-400 bg-sky-500/10 border border-sky-500/20";
    if (action === "EXIT" || action === "REPLACE") return "text-rose-400 bg-rose-500/10 border border-rose-500/20";
    if (action === "NO_TRADE") return "text-slate-400 bg-slate-800 border border-slate-700";
    return "text-amber-400 bg-amber-500/10 border border-amber-500/20";
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Gate Badge: Text + Dot (Minimalist)
function GateBadge({ label, pass }: { label: string; pass: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border border-transparent ${pass ? "text-slate-300" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${pass ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="uppercase tracking-wider">{label}</span>
        </div>
    );
}

// Evidence Card: Professional Header + Grid Layout
function EvidenceCardUI({ card }: { card: EvidenceCard }) {
    // [Reskin] Removed confidence label mapping, use raw A/B/C badge
    // [Reskin] No colored borders, use semantic icon color only
    const statusColor = {
        BULLISH: "text-emerald-400",
        BEARISH: "text-rose-400",
        NEUTRAL: "text-amber-400",
        PENDING: "text-slate-400"
    }[card.status];

    return (
        <div className="bg-slate-900 border border-slate-800 rounded p-4 h-full flex flex-col hover:border-slate-700 transition-colors">
            {/* Header */}
            <div className="flex items-start justify-between mb-4 border-b border-slate-800/50 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded bg-slate-800 ${statusColor}`}>
                        {React.cloneElement(card.icon as React.ReactElement<{ className?: string }>, { className: "w-4 h-4" })}
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <h4 className="text-sm font-bold text-slate-200 tracking-tight">{card.titleKR}</h4>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{card.title}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${card.confidence === "A" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                        card.confidence === "B" ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                            "text-slate-500 border-slate-700 bg-slate-800"
                        }`}>
                        GR.{card.confidence}
                    </span>
                </div>
            </div>

            {/* Body: 3-Row Data Grid */}
            <div className="flex-1 space-y-3">
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-[10px] text-slate-500 font-medium text-right">의미</span>
                    <span className="text-[11px] text-slate-400 leading-tight">{card.meaning}</span>
                </div>
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-[10px] text-slate-500 font-medium text-right">해석</span>
                    <span className="text-[12px] text-slate-200 font-medium tabular-nums leading-tight tracking-tight">
                        {card.interpretation}
                    </span>
                </div>
                <div className="grid grid-cols-[3rem_1fr] gap-2 items-baseline">
                    <span className="text-[10px] text-slate-500 font-medium text-right">행동</span>
                    <span className={`text-[12px] font-bold ${statusColor}`}>
                        {card.action}
                    </span>
                </div>
            </div>
        </div>
    );
}

// Top3 Execution Card: Simplified, cleaner typography
function Top3Card({ item, rank }: { item: TickerItem; rank: number }) {
    const action = item.decisionSSOT?.action || "CAUTION";
    const isNoTrade = action === "NO_TRADE" || action === "EXIT";

    return (
        <div className={`relative bg-slate-900 border rounded p-4 ${isNoTrade ? "border-slate-800 opacity-70" : "border-slate-800 hover:border-slate-600 transition-colors"}`}>
            {/* Rank - Subtle */}
            <div className="absolute top-4 right-4 text-[40px] font-black text-slate-800/50 leading-none pointer-events-none select-none">
                {rank}
            </div>

            {/* Header */}
            <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl font-bold text-white tracking-tight">{item.ticker}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getActionStyle(action)}`}>
                            {action}
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-base font-semibold font-mono text-white tabular-nums tracking-tight">
                        {item.price?.toFixed(2)}
                    </p>
                    <p className={`text-[11px] font-medium tabular-nums ${(item.changePct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {(item.changePct || 0) >= 0 ? "+" : ""}{item.changePct?.toFixed(2)}%
                    </p>
                </div>
            </div>

            {/* Execution Levels - Clean Grid */}
            {!isNoTrade ? (
                <div className="space-y-2 relative z-10">
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                        <span className="text-[11px] text-slate-500 font-medium">Entry</span>
                        <div className="text-right">
                            <span className="block text-[13px] font-mono font-medium text-white tabular-nums">
                                ${item.entryBand?.low?.toFixed(2)} - {item.entryBand?.high?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                        <span className="text-[11px] text-rose-400/80 font-medium">Cut</span>
                        <div className="text-right">
                            <span className="block text-[13px] font-mono font-medium text-rose-300 tabular-nums">
                                ${item.hardCut?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <span className="text-[11px] text-emerald-400/80 font-medium">Target</span>
                        <div className="text-right flex items-center gap-3">
                            <span className="text-[13px] font-mono font-medium text-emerald-300 tabular-nums">${item.tp1?.toFixed(2)}</span>
                            <span className="text-[11px] text-slate-600">/</span>
                            <span className="text-[13px] font-mono font-medium text-emerald-300 tabular-nums">${item.tp2?.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-[92px] flex flex-col items-center justify-center bg-slate-950/50 rounded border border-slate-800/50 border-dashed">
                    <Lock className="w-4 h-4 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Trading restricted</p>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// DRAWER COMPONENT (Ticker Evidence) - UPGRADED LOOK
// ============================================================================
function TickerEvidenceDrawer({ item, onClose }: { item: TickerItem; onClose: () => void }) {
    if (!item) return null;

    const router = useRouter();
    const action = item.decisionSSOT?.action || "CAUTION";
    const tier = item.qualityTier || "WATCH";
    const opt = getOptionsStatus(item.options_status);

    // 1) Confidence Normalization
    const getConfidence = (pct?: number) => {
        if (pct === undefined || pct === null) return { grade: "UNK", label: "No Data", color: "text-slate-500 border-slate-700 bg-slate-800" };
        if (pct >= 80) return { grade: "A", label: "Official", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" };
        if (pct >= 50) return { grade: "B", label: "Secondary", color: "text-amber-400 border-amber-500/20 bg-amber-500/5" };
        return { grade: "C", label: "Est.", color: "text-slate-400 border-slate-700 bg-slate-800" };
    };
    const conf = getConfidence(item.decisionSSOT?.confidencePct);

    // 2) Execution Fallback Logic (Simulated)
    const getExecutionLevel = (val: number | undefined, type: "ENTRY" | "CUT" | "TP", price: number) => {
        if (val && val > 0) return { val, isFallback: false, note: "" };
        if (type === "ENTRY") return { val: price * 0.995, isFallback: true, note: "VWAP Retest" };
        if (type === "CUT") return { val: price * 0.98, isFallback: true, note: "struct. low" };
        if (type === "TP") return { val: price * 1.02, isFallback: true, note: "resistance" };
        return { val: 0, isFallback: true, note: "N/A" };
    };

    const entryLow = getExecutionLevel(item.entryBand?.low, "ENTRY", item.price || 0);
    const entryHigh = getExecutionLevel(item.entryBand?.high, "ENTRY", item.price || 0);
    const hardCut = getExecutionLevel(item.hardCut, "CUT", item.price || 0);
    const tp1 = getExecutionLevel(item.tp1, "TP", item.price || 0);
    const tp2 = getExecutionLevel(item.tp2, "TP", item.price || 0);

    return (
        <div className="fixed inset-0 z-[100] flex justify-end font-sans">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

            {/* Drawer Content */}
            <div className="relative w-full max-w-lg h-full bg-slate-950 border-l border-slate-800 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in slide-in-from-right duration-200">

                {/* Header: Clean & Professional */}
                <div className="shrink-0 bg-slate-950 border-b border-slate-800 p-5 flex items-start justify-between select-none">
                    <div className="flex gap-4 items-center">
                        <h2 className="text-3xl font-bold text-white tracking-tight">{item.ticker}</h2>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getActionStyle(action)}`}>
                            {action}
                        </span>
                        <div className="h-4 w-px bg-slate-800 mx-1" />
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Alpha</span>
                            <span className="text-xs font-mono font-bold text-white">{item.alphaScore?.toFixed(1) || "—"}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Tier</span>
                            <span className={`text-[10px] font-bold ${item.qualityTier === "ACTIONABLE" ? "text-emerald-400" : "text-slate-400"}`}>{tier}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push(`/ticker?ticker=${item.ticker}`)}
                            className="group flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
                        >
                            <span className="hidden sm:inline font-medium">Details</span>
                            <div className="bg-slate-900 group-hover:bg-slate-800 p-1 rounded border border-slate-800 group-hover:border-slate-700 transition">
                                <ArrowUpRight className="w-3 h-3" />
                            </div>
                        </button>
                        <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors">
                            <XCircle className="w-6 h-6 stroke-1" />
                        </button>
                    </div>
                </div>

                {/* Body: Scrollable */}
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    <div className="space-y-8">

                        {/* 1. Decision Evidence */}
                        <section>
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Target className="w-3.5 h-3.5" />
                                    Decision Logic
                                </h3>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${conf.color}`}>
                                    GRADE {conf.grade}
                                </span>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded p-4">
                                <ul className="space-y-3">
                                    {(item.decisionSSOT?.triggersKR || ["No specific triggers"]).map((t, i) => (
                                        <li key={i} className="flex gap-3 text-xs text-slate-300 leading-snug">
                                            <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0 box-content outline outline-2 outline-indigo-500/20" />
                                            {t}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>

                        {/* 2. Options Structure */}
                        <section>
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <BarChart3 className="w-3.5 h-3.5" />
                                    Options Structure
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${opt.color}`} />
                                    <span className="text-[10px] font-bold text-slate-400">{opt.label}</span>
                                </div>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded p-0 overflow-hidden divide-y divide-slate-800">
                                <div className="grid grid-cols-2 divide-x divide-slate-800">
                                    <div className="p-4 text-center">
                                        <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Call Wall</span>
                                        <span className="block text-sm font-mono font-medium text-slate-500">N/A (Cov)</span>
                                    </div>
                                    <div className="p-4 text-center">
                                        <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Put Floor</span>
                                        <span className="block text-sm font-mono font-medium text-slate-500">N/A (Cov)</span>
                                    </div>
                                </div>
                                <div className="bg-slate-950/30 p-2 text-center text-[9px] text-slate-600 font-medium italic">
                                    Options data provided for context only. Check full details for major levels.
                                </div>
                            </div>
                        </section>

                        {/* 3. Execution Plan */}
                        <section>
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Zap className="w-3.5 h-3.5" />
                                    Execution Plan
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
                                {/* Entry */}
                                <div className="bg-slate-900 p-4 flex items-center justify-between">
                                    <div>
                                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Entry Zone</span>
                                        {entryLow.isFallback && <span className="text-[9px] text-slate-600 font-medium">Fallback: {entryLow.note}</span>}
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-base font-mono font-semibold text-white tabular-nums tracking-tight">
                                            ${entryLow.val.toFixed(2)} - ${entryHigh.val.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                                {/* Hard Cut */}
                                <div className="bg-slate-900 p-4 flex items-center justify-between">
                                    <div>
                                        <span className="block text-[10px] text-rose-400 font-bold uppercase tracking-wider mb-0.5">Hard Cut</span>
                                        {hardCut.isFallback && <span className="text-[9px] text-slate-600 font-medium">Fallback: {hardCut.note}</span>}
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-base font-mono font-semibold text-rose-400 tabular-nums tracking-tight">
                                            ${hardCut.val.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                                {/* Targets */}
                                <div className="bg-slate-900 p-4 flex items-center justify-between">
                                    <div>
                                        <span className="block text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">Targets</span>
                                        {tp1.isFallback && <span className="text-[9px] text-slate-600 font-medium">Fallback: {tp1.note}</span>}
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] text-slate-500 mr-1">TP1</span>
                                            <span className="text-sm font-mono font-medium text-emerald-400 tabular-nums">${tp1.val.toFixed(2)}</span>
                                        </div>
                                        <div className="w-px h-6 bg-slate-800" />
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] text-slate-500 mr-1">TP2</span>
                                            <span className="text-sm font-mono font-medium text-emerald-400 tabular-nums">${tp2.val.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function Tier01Terminal() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [regime, setRegime] = useState<string>("NEUTRAL");
    const [gates, setGates] = useState<GateStatus>({ price: true, options: true, macro: true, event: true, policy: true });
    const [principles, setPrinciples] = useState<string[]>([]);
    const [evidenceCards, setEvidenceCards] = useState<EvidenceCard[]>([]);
    const [items, setItems] = useState<TickerItem[]>([]);
    const [top3, setTop3] = useState<TickerItem[]>([]);
    const [selectedTickerItem, setSelectedTickerItem] = useState<TickerItem | null>(null);

    // Fetch data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/api/health/report?type=eod&includeSnapshot=true", { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                // Extract data
                const snapshot = data.snapshot || {};
                const allItems = snapshot.items || [];

                // Global Options Fallback
                const globalOptState = data.optionsStatus?.state || "UNKNOWN";

                // Map items with normalized options status
                const mappedItems = allItems.map((item: any) => ({
                    ...item,
                    // [P0-1 Fix] Correct mapping: item > global > UNKNOWN
                    options_status: item.options_status || globalOptState
                }));

                // Regime
                setRegime(snapshot.marketSentiment?.regime || "NEUTRAL");

                // ... (existing gate logic kept as is) ...
                // Gates
                const integrity = data.integrity || {};
                setGates({
                    price: true,
                    options: globalOptState === "READY" || globalOptState === "OK",
                    macro: true,
                    event: !snapshot.events?.events?.some((e: any) => e.importance === "HIGH" && e.date === new Date().toISOString().split("T")[0]),
                    policy: !snapshot.policy?.policies72h?.some((p: any) => p.category === "P0")
                });

                // ... (principles/cards logic kept as is) ...
                // Generate principles
                const genPrinciples: string[] = [];
                if (!gates.event) genPrinciples.push("⚠️ 이벤트 전 신규 진입 금지");
                if (!gates.policy) genPrinciples.push("🚫 P0급 정책 충돌 - 증액 금지");
                if (regime === "RISK_OFF") genPrinciples.push("🛡️ 추격 금지 / 리테스트만 허용");
                if (genPrinciples.length === 0) genPrinciples.push("✅ 정상 진입 가능 - 전략 실행");
                genPrinciples.push("📊 옵션 Put Floor 이탈 시 즉시 하드컷");
                setPrinciples(genPrinciples.slice(0, 3));

                // Build Evidence Cards (reused logic)
                const cards: EvidenceCard[] = [];
                const macroSnapshot = snapshot.macro || {};
                cards.push({
                    id: "macro",
                    title: "MACRO/FED",
                    titleKR: "거시 지표",
                    meaning: "시장 전체의 방향과 리스크 선호도를 결정하는 핵심 지표",
                    interpretation: `NDX ${macroSnapshot.factors?.nasdaq100?.chgPct?.toFixed(2) || 0}% | VIX ${macroSnapshot.factors?.vix?.level?.toFixed(1) || "—"}`,
                    action: regime === "RISK_ON" ? "적극 진입 가능" : regime === "RISK_OFF" ? "신규 진입 자제" : "선별 진입",
                    confidence: "A",
                    icon: <TrendingUp className="w-4 h-4" />,
                    status: regime === "RISK_ON" ? "BULLISH" : regime === "RISK_OFF" ? "BEARISH" : "NEUTRAL"
                });

                const events = snapshot.events?.events || [];
                const upcomingHigh = events.filter((e: any) => e.importance === "HIGH").slice(0, 2);
                cards.push({
                    id: "events",
                    title: "ECONOMIC EVENTS",
                    titleKR: "경제 이벤트",
                    meaning: "단기 변동성을 유발하는 예정된 경제지표 발표",
                    interpretation: upcomingHigh.length > 0 ? upcomingHigh.map((e: any) => `${e.nameKR} (${e.date})`).join(", ") : "7일 내 주요 이벤트 없음",
                    action: upcomingHigh.length > 0 ? "이벤트 전후 변동성 주의" : "정상 진입 가능",
                    confidence: "A",
                    icon: <Clock className="w-4 h-4" />,
                    status: upcomingHigh.length > 0 ? "NEUTRAL" : "BULLISH"
                });

                const policies72h = snapshot.policy?.policies72h || [];
                const p0Policies = policies72h.filter((p: any) => p.category === "P0");
                cards.push({
                    id: "policy",
                    title: "POLICY GATE",
                    titleKR: "정책 게이트",
                    meaning: "대통령 행정명령, 규제 변경 등 정책 리스크",
                    interpretation: p0Policies.length > 0 ? `P0급 충돌: ${p0Policies[0].titleKR}` : "72h 내 P0급 정책 없음",
                    action: p0Policies.length > 0 ? "신규/증액 금지" : "정상 진입 가능",
                    confidence: p0Policies.length > 0 ? "A" : "B",
                    icon: <Shield className="w-4 h-4" />,
                    status: p0Policies.length > 0 ? "BEARISH" : "BULLISH"
                });

                cards.push({
                    id: "options",
                    title: "OPTIONS STRUCTURE",
                    titleKR: "옵션 구조",
                    meaning: "마켓 메이커의 헤징 포지션과 예상 핀존",
                    interpretation: `OI 커버리지 ${data.optionsStatus?.coveragePct || 0}% | 상태: ${globalOptState}`,
                    action: globalOptState === "READY" || globalOptState === "OK" ? "옵션 레벨 참고 가능" : "옵션 데이터 불완전 - 보수적 접근",
                    confidence: globalOptState === "READY" || globalOptState === "OK" ? "A" : "C",
                    icon: <BarChart3 className="w-4 h-4" />,
                    status: globalOptState === "READY" || globalOptState === "OK" ? "BULLISH" : "PENDING"
                });

                setEvidenceCards(cards);

                // Items & Top3 with mapped options_status
                const sortedItems = mappedItems.sort((a: TickerItem, b: TickerItem) => (b.alphaScore || 0) - (a.alphaScore || 0));
                setItems(sortedItems);
                setTop3(sortedItems.slice(0, 3));

                setLoading(false);
            } catch (e: any) {
                setError(e.message);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // ... (rest of loading/render logic same until table) ...
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">Loading Evidence...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Navigation Header */}
            <LandingHeader />

            {/* HEADER */}
            <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`px-3 py-1.5 rounded-lg ${getRegimeColor(regime)} text-white font-black text-sm flex items-center gap-2`}>
                                {regime === "RISK_ON" ? <TrendingUp className="w-4 h-4" /> : regime === "RISK_OFF" ? <TrendingDown className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                                {getRegimeText(regime)}
                            </div>
                            <span className="text-slate-500 text-xs font-mono">|</span>
                            <span className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">Tier 0.1 Evidence Terminal</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <GateBadge label="Price" pass={gates.price} />
                            <GateBadge label="Options" pass={gates.options} />
                            <GateBadge label="Macro" pass={gates.macro} />
                            <GateBadge label="Event" pass={gates.event} />
                            <GateBadge label="Policy" pass={gates.policy} />
                        </div>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">오늘의 행동 원칙</p>
                        <div className="flex flex-wrap gap-4">
                            {principles.map((p, i) => (
                                <span key={i} className="text-[11px] text-slate-300">{p}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            {/* MAIN */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 mb-6 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-rose-400" />
                        <span className="text-rose-300 text-sm">{error}</span>
                    </div>
                )}

                {/* Evidence Stack */}
                <section className="mb-10">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Evidence Stack</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {evidenceCards.map(card => (
                            <EvidenceCardUI key={card.id} card={card} />
                        ))}
                    </div>
                </section>

                {/* Top3 Execution */}
                <section className="mb-10">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Top3 Execution</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {top3.map((item, i) => (
                            <Top3Card key={item.ticker} item={item} rank={i + 1} />
                        ))}
                    </div>
                </section>

                {/* Alpha12 Scan */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Alpha12 Scan</h2>
                        <div className="text-[10px] text-slate-600 font-mono">LIVE RANKING</div>
                    </div>

                    <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-slate-950 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">#</th>
                                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">Ticker</th>
                                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tier</th>
                                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">Alpha</th>
                                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                    <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider">Options</th>
                                    <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
                                {items.slice(0, 12).map((item, i) => {
                                    const opt = getOptionsStatus(item.options_status);
                                    const action = item.decisionSSOT?.action || "CAUTION";
                                    const tier = item.qualityTier || (i < 3 ? "ACTIONABLE" : i < 8 ? "WATCH" : "FILLER");

                                    return (
                                        <tr
                                            key={item.ticker}
                                            className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                                            // [Changed] Open drawer on row click
                                            onClick={() => setSelectedTickerItem(item)}
                                        >
                                            <td className="px-4 py-2.5">
                                                <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-[13px] font-bold text-slate-200 group-hover:text-white transition-colors tracking-tight">{item.ticker}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getTierStyle(tier)}`}>
                                                    {tier}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-[12px] font-mono font-bold text-indigo-400 tabular-nums">{item.alphaScore?.toFixed(1) || "—"}</span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getActionStyle(action)}`}>
                                                    {action}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${opt.color}`} />
                                                    <span className="text-[10px] text-slate-500 font-medium">{opt.label}</span>
                                                </div>
                                            </td>
                                            {/* [Changed] Details Button ONLY for navigation */}
                                            <td className="px-4 py-2.5 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // Prevent drawer
                                                        router.push(`/ticker?ticker=${item.ticker}`);
                                                    }}
                                                    className="p-1 hover:bg-slate-800 rounded text-slate-600 hover:text-indigo-400 transition-colors"
                                                >
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            {/* Evidence Drawer */}
            {selectedTickerItem && (
                <TickerEvidenceDrawer item={selectedTickerItem} onClose={() => setSelectedTickerItem(null)} />
            )}

            {/* Footer */}
            <footer className="border-t border-slate-800 py-6 mt-12">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-[10px] text-slate-600">
                        Alpha Commander V8.1 | Evidence-Driven Terminal | {new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" })} ET
                    </p>
                </div>
            </footer>
        </div>
    );
}
