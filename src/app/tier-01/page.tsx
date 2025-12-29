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
const getRegimeColor = (regime?: string) => {
    if (regime === "RISK_ON") return "bg-emerald-500";
    if (regime === "RISK_OFF") return "bg-rose-500";
    return "bg-amber-500";
};

const getRegimeText = (regime?: string) => {
    if (regime === "RISK_ON") return "위험선호";
    if (regime === "RISK_OFF") return "위험회피";
    return "중립";
};

const getTierStyle = (tier?: string) => {
    if (tier === "ACTIONABLE") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (tier === "WATCH") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    return "bg-slate-500/15 text-slate-400 border-slate-500/30";
};

const getOptionsStatus = (status?: string) => {
    if (status === "OK" || status === "READY") return { label: "OK", color: "bg-emerald-500" };
    if (status === "PARTIAL") return { label: "PARTIAL", color: "bg-amber-500" };
    if (status === "NO_OPTIONS") return { label: "N/A", color: "bg-slate-600" };
    if (status === "FAILED" || status === "ERR") return { label: "ERR", color: "bg-rose-500" };
    return { label: "N/A", color: "bg-slate-500" };
};

const getActionStyle = (action?: string) => {
    if (action === "ENTER" || action === "STRONG_BUY") return "text-emerald-400 bg-emerald-500/15";
    if (action === "MAINTAIN") return "text-sky-400 bg-sky-500/15";
    if (action === "EXIT" || action === "REPLACE") return "text-rose-400 bg-rose-500/15";
    if (action === "NO_TRADE") return "text-slate-400 bg-slate-500/15";
    return "text-amber-400 bg-amber-500/15";
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Gate Badge Component
function GateBadge({ label, pass }: { label: string; pass: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold ${pass ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
            }`}>
            {pass ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            <span>{label}</span>
        </div>
    );
}

// Evidence Card Component
function EvidenceCardUI({ card }: { card: EvidenceCard }) {
    const statusColor = {
        BULLISH: "border-l-emerald-500",
        BEARISH: "border-l-rose-500",
        NEUTRAL: "border-l-amber-500",
        PENDING: "border-l-slate-500"
    }[card.status];

    const confidenceLabel = { A: "공식 2+소스", B: "1소스+반응", C: "추정값" }[card.confidence];

    return (
        <div className={`bg-slate-900/70 border border-slate-800 rounded-lg p-4 border-l-4 ${statusColor}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                        {card.icon}
                    </div>
                    <div>
                        <h4 className="text-[11px] font-black text-white tracking-tight">{card.titleKR}</h4>
                        <p className="text-[9px] text-slate-500 uppercase tracking-widest">{card.title}</p>
                    </div>
                </div>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${card.confidence === "A" ? "bg-emerald-500/20 text-emerald-400" :
                    card.confidence === "B" ? "bg-amber-500/20 text-amber-400" :
                        "bg-slate-500/20 text-slate-400"
                    }`}>{card.confidence}</span>
            </div>

            <div className="space-y-2 text-[11px]">
                <div className="flex gap-2">
                    <span className="text-slate-500 w-10 shrink-0">의미</span>
                    <span className="text-slate-300">{card.meaning}</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-slate-500 w-10 shrink-0">해석</span>
                    <span className="text-slate-200 font-medium">{card.interpretation}</span>
                </div>
                <div className="flex gap-2">
                    <span className="text-slate-500 w-10 shrink-0">행동</span>
                    <span className={`font-bold ${card.status === "BULLISH" ? "text-emerald-400" :
                        card.status === "BEARISH" ? "text-rose-400" :
                            "text-amber-400"
                        }`}>{card.action}</span>
                </div>
            </div>
        </div>
    );
}

// Top3 Execution Card
function Top3Card({ item, rank }: { item: TickerItem; rank: number }) {
    const action = item.decisionSSOT?.action || "CAUTION";
    const isNoTrade = action === "NO_TRADE" || action === "EXIT";

    return (
        <div className={`relative bg-slate-900/80 border rounded-xl p-5 ${isNoTrade ? "border-rose-500/50 opacity-60" : "border-indigo-500/30"
            }`}>
            {/* Rank Badge */}
            <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white">
                {rank}
            </div>

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white">{item.ticker}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getActionStyle(action)}`}>
                            {action}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-500">{item.name || item.sector || "—"}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm font-mono font-bold text-white">${item.price?.toFixed(2) || "—"}</p>
                    <p className={`text-[10px] font-bold ${(item.changePct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {(item.changePct || 0) >= 0 ? "+" : ""}{item.changePct?.toFixed(2) || 0}%
                    </p>
                </div>
            </div>

            {/* Execution Levels */}
            {!isNoTrade ? (
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-slate-500 mb-1">Entry Band</p>
                        <p className="text-white font-mono font-bold">
                            ${item.entryBand?.low?.toFixed(2) || "—"} - ${item.entryBand?.high?.toFixed(2) || "—"}
                        </p>
                    </div>
                    <div className="bg-rose-500/10 rounded-lg p-2">
                        <p className="text-rose-400 mb-1">Hard Cut</p>
                        <p className="text-rose-300 font-mono font-bold">${item.hardCut?.toFixed(2) || "—"}</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-2">
                        <p className="text-emerald-400 mb-1">TP1</p>
                        <p className="text-emerald-300 font-mono font-bold">${item.tp1?.toFixed(2) || "—"}</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-lg p-2">
                        <p className="text-emerald-400 mb-1">TP2</p>
                        <p className="text-emerald-300 font-mono font-bold">${item.tp2?.toFixed(2) || "—"}</p>
                    </div>
                </div>
            ) : (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 text-center">
                    <Lock className="w-6 h-6 text-rose-400 mx-auto mb-2" />
                    <p className="text-rose-400 font-bold text-sm">NO TRADE</p>
                    <p className="text-rose-300/60 text-[10px] mt-1">
                        {item.decisionSSOT?.triggersKR?.[0] || "이벤트 임박 또는 게이트 충돌"}
                    </p>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// DRAWER COMPONENT (Ticker Evidence)
// ============================================================================
function TickerEvidenceDrawer({ item, onClose }: { item: TickerItem; onClose: () => void }) {
    if (!item) return null;

    const action = item.decisionSSOT?.action || "CAUTION";
    const tier = item.qualityTier || "WATCH";
    const opt = getOptionsStatus(item.options_status);

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer Content */}
            <div className="relative w-full max-w-md h-full bg-slate-950 border-l border-slate-800 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 p-6 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-2xl font-black text-white">{item.ticker}</h2>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getTierStyle(tier)}`}>{tier}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${getActionStyle(action)}`}>
                                {action}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                                Alpha {item.alphaScore?.toFixed(1) || "—"}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* 1. Decision Evidence */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                            <Target className="w-4 h-4 text-indigo-500" />
                            <span>Decision Evidence</span>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-sm font-bold text-slate-200">Trigger Logic</span>
                                <span className="text-[10px] text-indigo-400 font-mono">
                                    Conf. {item.decisionSSOT?.confidencePct || 0}%
                                </span>
                            </div>
                            <ul className="space-y-2">
                                {(item.decisionSSOT?.triggersKR || ["No specific triggers"]).map((t, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                                        <div className="w-1 h-1 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                        {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* 2. Options Structure */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                            <BarChart3 className="w-4 h-4 text-amber-500" />
                            <span>Options Structure</span>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm font-bold text-slate-200">Status</span>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                                    <span className="text-xs text-slate-400 font-medium">{opt.label}</span>
                                </div>
                            </div>

                            {/* Simple visual representation if data available, else text */}
                            <div className="grid grid-cols-2 gap-3 text-center">
                                <div className="bg-slate-950 rounded p-2 border border-slate-800">
                                    <span className="block text-[9px] text-slate-500 uppercase">Call Wall</span>
                                    <span className="block text-xs font-mono font-bold text-white">—</span>
                                </div>
                                <div className="bg-slate-950 rounded p-2 border border-slate-800">
                                    <span className="block text-[9px] text-slate-500 uppercase">Put Floor</span>
                                    <span className="block text-xs font-mono font-bold text-white">—</span>
                                </div>
                            </div>
                            <p className="mt-3 text-[10px] text-slate-500 text-center italic">
                                * 상세 옵션 레벨은 Ticker Detail에서 확인 가능
                            </p>
                        </div>
                    </div>

                    {/* 3. Execution Plan */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                            <Zap className="w-4 h-4 text-emerald-500" />
                            <span>Execution Plan</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-800/20 border border-slate-800 rounded-lg p-3">
                                <span className="block text-[10px] text-slate-500 mb-1">Entry Band</span>
                                <span className="block text-sm font-mono font-bold text-white">
                                    {item.entryBand ? `$${item.entryBand.low.toFixed(2)} - $${item.entryBand.high.toFixed(2)}` : "미산출"}
                                </span>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                                <span className="block text-[10px] text-rose-400 mb-1">Hard Cut</span>
                                <span className="block text-sm font-mono font-bold text-rose-300">
                                    {item.hardCut ? `$${item.hardCut.toFixed(2)}` : "미산출"}
                                </span>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                                <span className="block text-[10px] text-emerald-400 mb-1">Target 1</span>
                                <span className="block text-sm font-mono font-bold text-emerald-300">
                                    {item.tp1 ? `$${item.tp1.toFixed(2)}` : "미산출"}
                                </span>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                                <span className="block text-[10px] text-emerald-400 mb-1">Target 2</span>
                                <span className="block text-sm font-mono font-bold text-emerald-300">
                                    {item.tp2 ? `$${item.tp2.toFixed(2)}` : "미산출"}
                                </span>
                            </div>
                        </div>
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
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Alpha12 Scan</h2>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-slate-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Ticker</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Tier</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Alpha</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Action</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Options</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {items.slice(0, 12).map((item, i) => {
                                    const opt = getOptionsStatus(item.options_status);
                                    const action = item.decisionSSOT?.action || "CAUTION";
                                    const tier = item.qualityTier || (i < 3 ? "ACTIONABLE" : i < 8 ? "WATCH" : "FILLER");

                                    return (
                                        <tr
                                            key={item.ticker}
                                            className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                                            // [Changed] Open drawer on row click
                                            onClick={() => setSelectedTickerItem(item)}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] font-mono text-slate-600">{String(i + 1).padStart(2, "0")}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[12px] font-bold text-white">{item.ticker}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[9px] font-bold px-2 py-1 rounded border ${getTierStyle(tier)}`}>
                                                    {tier}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[11px] font-bold text-indigo-400">{item.alphaScore?.toFixed(1) || "—"}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded ${getActionStyle(action)}`}>
                                                    {action}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`w-2 h-2 rounded-full inline-block ${opt.color}`} title={opt.label} />
                                                <span className="text-[10px] text-slate-500 ml-2">{opt.label}</span>
                                            </td>
                                            {/* [Changed] Details Button ONLY for navigation */}
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // Prevent drawer
                                                        router.push(`/ticker?ticker=${item.ticker}`);
                                                    }}
                                                    className="p-1 hover:bg-slate-700 rounded transition-colors"
                                                >
                                                    <ChevronRight className="w-4 h-4 text-slate-600 hover:text-white" />
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
