"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
    Check,
    Lock,
    Eye,
    AlertTriangle,
    Crown,
    Zap,
    Shield,
    Activity,
    Brain,
    BarChart3,
    Smartphone,
    Bell,
    ChevronDown,
    ArrowRight,
    Sparkles,
    Target,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
type FeatureStatus = "full" | "lock" | "peek" | "limited" | "elite" | "speed";

interface FeatureRow {
    label: string;
    free: FeatureStatus | string;
    pro: FeatureStatus | string;
    elite: FeatureStatus | string;
    freeNote?: string;
    proNote?: string;
    eliteNote?: string;
}

interface FeatureCategory {
    icon: React.ReactNode;
    title: string;
    rows: FeatureRow[];
}

// ============================================================
// STATUS CELL RENDERER
// ============================================================
function StatusCell({ status, note }: { status: FeatureStatus | string; note?: string; isEliteCol?: boolean }) {
    const baseClass = "flex items-center justify-center gap-1.5 text-sm font-medium";

    switch (status) {
        case "full":
            return (
                <div className={baseClass}>
                    <Check className="w-4.5 h-4.5 text-emerald-400" />
                    {note && <span className="text-emerald-400/90 text-xs">{note}</span>}
                </div>
            );
        case "lock":
            return (
                <div className={baseClass}>
                    <Lock className="w-4 h-4 text-slate-600" />
                    {note && <span className="text-slate-500 text-xs">{note}</span>}
                </div>
            );
        case "peek":
            return (
                <div className={baseClass}>
                    <Eye className="w-4 h-4 text-amber-400" />
                    {note && <span className="text-amber-400/90 text-xs">{note}</span>}
                </div>
            );
        case "limited":
            return (
                <div className={baseClass}>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    {note && <span className="text-amber-400/90 text-xs">{note}</span>}
                </div>
            );
        case "elite":
            return (
                <div className={baseClass}>
                    <Crown className="w-4.5 h-4.5 text-cyan-400" />
                    {note && <span className="text-cyan-400 text-xs font-bold">{note}</span>}
                </div>
            );
        default:
            // Speed or custom text
            return (
                <div className={baseClass}>
                    <span className={note || "text-slate-400 text-xs"}>{status}</span>
                </div>
            );
    }
}

// ============================================================
// FAQ ITEM
// ============================================================
function FaqItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-b border-white/[0.06]">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between py-6 text-left group"
            >
                <span className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors pr-4">{q}</span>
                <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 pb-6" : "max-h-0"}`}>
                <p className="text-sm text-slate-300 leading-[1.7]">{a}</p>
            </div>
        </div>
    );
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function PricingPage() {
    const t = useTranslations("pricing");
    const [isAnnual, setIsAnnual] = useState(false);

    // Prices
    const proPriceMonthly = 69;
    const proFoundingMonthly = 49;
    const elitePriceMonthly = 149;
    const eliteFoundingMonthly = 79;
    const proAnnualMonthly = 39;   // Founding annual: $49 base, ~20% off  → $39/mo ($468/yr)
    const eliteAnnualMonthly = 59; // Founding annual: $79 base, ~25% off → $59/mo ($708/yr)

    const proPrice = isAnnual ? proAnnualMonthly : proFoundingMonthly;
    const proOriginal = isAnnual ? proFoundingMonthly : proPriceMonthly;
    const elitePrice = isAnnual ? eliteAnnualMonthly : eliteFoundingMonthly;
    const eliteOriginal = isAnnual ? eliteFoundingMonthly : elitePriceMonthly;

    // ============================================================
    // FEATURE MATRIX DATA
    // ============================================================
    const featureCategories: FeatureCategory[] = [
        {
            icon: <Zap className="w-4 h-4 text-cyan-400" />,
            title: t("matrix.coreEngine"),
            rows: [
                {
                    label: t("matrix.refreshSpeed"),
                    free: "60s",
                    pro: "15s",
                    elite: "5s",
                    freeNote: "text-slate-500 text-xs font-mono",
                    proNote: "text-blue-400 text-xs font-bold font-mono",
                    eliteNote: "text-cyan-400 text-xs font-bold font-mono",
                },
            ],
        },
        {
            icon: <Target className="w-4 h-4 text-amber-400" />,
            title: "COMMAND",
            rows: [
                { label: t("matrix.priceChart"), free: "full", pro: "full", elite: "full" },
                { label: t("matrix.hudPeek"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.peekOnly") },
                { label: t("matrix.tacticalRange"), free: "lock", pro: "full", elite: "full", freeNote: t("matrix.blurred") },
                { label: t("matrix.instRadar"), free: "lock", pro: "full", elite: "full", freeNote: t("matrix.blurred") },
                { label: t("matrix.aiInsight"), free: "lock", pro: "full", elite: "full", freeNote: t("matrix.blurred") },
                { label: t("matrix.signalCore"), free: "lock", pro: "lock", elite: "elite" },
                { label: t("matrix.flowUnit"), free: "lock", pro: "lock", elite: "elite" },
            ],
        },
        {
            icon: <Activity className="w-4 h-4 text-emerald-400" />,
            title: "FLOW",
            rows: [
                { label: t("matrix.opiPcRatio"), free: "full", pro: "full", elite: "full" },
                { label: t("matrix.flowIndicators"), free: "lock", pro: "full", elite: "full" },
                { label: t("matrix.classifiedFlow"), free: "lock", pro: "lock", elite: "elite", eliteNote: t("matrix.realtime") },
                { label: t("matrix.darkPoolBlock"), free: "lock", pro: "lock", elite: "elite", eliteNote: t("matrix.realtime") },
                { label: t("matrix.dex"), free: "lock", pro: "lock", elite: "elite" },
                { label: t("matrix.smartMoney"), free: "lock", pro: "lock", elite: "elite" },
                { label: t("matrix.darkPoolShort"), free: "lock", pro: "full", elite: "full" },
            ],
        },
        {
            icon: <Brain className="w-4 h-4 text-purple-400" />,
            title: "INTEL",
            rows: [
                { label: t("matrix.aiReport"), free: "full", pro: "full", elite: "full", freeNote: t("matrix.m7Only") },
                { label: t("matrix.alphaScore"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.rank3Only"), proNote: t("matrix.fullRank") },
                { label: t("matrix.m7Analysis"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.fiveOf7"), proNote: t("matrix.sevenOf7") },
                { label: t("matrix.m7PostMarket"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.fiveOf7"), proNote: t("matrix.sevenOf7") },
                { label: t("matrix.sectorIntel"), free: "lock", pro: "full", elite: "full" },
                { label: t("matrix.postMarketBrief"), free: "lock", pro: "full", elite: "full" },
                { label: t("matrix.premiumSectors"), free: "lock", pro: "lock", elite: "elite" },
            ],
        },
        {
            icon: <Shield className="w-4 h-4 text-cyan-400" />,
            title: "GUARDIAN",
            rows: [
                { label: t("matrix.gravityGauge"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.gaugeOnly") },
                { label: t("matrix.rlsiTactical"), free: "lock", pro: "full", elite: "full" },
            ],
        },
        {
            icon: <BarChart3 className="w-4 h-4 text-amber-400" />,
            title: t("matrix.personalization"),
            rows: [
                { label: t("matrix.dashboardHud"), free: "limited", pro: "full", elite: "full", freeNote: "2/12", proNote: "12/12" },
                { label: t("matrix.watchlist"), free: "limited", pro: "full", elite: "elite", freeNote: "3", proNote: "10", eliteNote: "20" },
                { label: t("matrix.portfolio"), free: "lock", pro: "full", elite: "elite", proNote: t("matrix.basic"), eliteNote: t("matrix.advanced") },
            ],
        },
        {
            icon: <Bell className="w-4 h-4 text-rose-400" />,
            title: t("matrix.alerts"),
            rows: [
                { label: t("matrix.whaleAlert"), free: "lock", pro: "lock", elite: "elite" },
            ],
        },
        {
            icon: <Smartphone className="w-4 h-4 text-cyan-400" />,
            title: t("matrix.special"),
            rows: [
                { label: t("matrix.mobileApp"), free: "lock", pro: "lock", elite: "elite", proNote: t("matrix.futurePaid"), eliteNote: t("matrix.lifetimeFree") },
            ],
        },
    ];

    // ============================================================
    // COMPETITOR DATA
    // ============================================================
    const competitors = [
        { name: "Unusual Whales", price: "$50/mo", scope: t("competitors.uw") },
        { name: "SpotGamma", price: "$99–249/mo", scope: t("competitors.sg") },
        { name: "FlowAlgo", price: "$149/mo", scope: t("competitors.fa") },
        { name: "Ortex", price: "$49–149/mo", scope: t("competitors.ortex") },
        { name: "SIGNUM HQ", price: "$49/mo~", scope: t("competitors.signum"), highlight: true },
    ];

    // ============================================================
    // FAQ DATA
    // ============================================================
    const faqs = [
        { q: t("faq.q1"), a: t("faq.a1") },
        { q: t("faq.q2"), a: t("faq.a2") },
        { q: t("faq.q3"), a: t("faq.a3") },
        { q: t("faq.q4"), a: t("faq.a4") },
        { q: t("faq.q5"), a: t("faq.a5") },
    ];

    return (
        <div className="min-h-screen bg-[#0d1220] text-slate-200">
            {/* ============================================================ */}
            {/* HERO SECTION */}
            {/* ============================================================ */}
            <section className="relative pt-20 pb-20 px-6 overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-radial from-cyan-500/10 via-transparent to-transparent blur-[120px]" />
                    <div className="absolute top-[30%] left-1/4 w-[400px] h-[400px] bg-gradient-radial from-amber-500/5 via-transparent to-transparent blur-[100px]" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto text-center">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-10">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-[0.15em] font-jakarta">
                            {t("heroBadge")}
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-5 tracking-tight leading-[1.1] font-jakarta">
                        {t("heroTitle1")}
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-amber-400 to-cyan-400">
                            {t("heroTitle2")}
                        </span>
                    </h1>

                    <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-12 leading-relaxed">
                        {t("heroDesc")}
                    </p>

                    {/* Monthly / Annual Toggle */}
                    <div className="inline-flex items-center gap-4 p-1.5 rounded-xl bg-white/[0.04] border border-white/10">
                        <button
                            onClick={() => setIsAnnual(false)}
                            className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all font-jakarta ${!isAnnual
                                ? "bg-white/10 text-white shadow-lg"
                                : "text-slate-400 hover:text-white"
                                }`}
                        >
                            {t("monthly")}
                        </button>
                        <button
                            onClick={() => setIsAnnual(true)}
                            className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 font-jakarta ${isAnnual
                                ? "bg-white/10 text-white shadow-lg"
                                : "text-slate-400 hover:text-white"
                                }`}
                        >
                            {t("annual")}
                            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full">
                                {t("twoMonthsFree")}
                            </span>
                        </button>
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* TIER CARDS */}
            {/* ============================================================ */}
            <section className="px-6 pb-24">
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {/* FREE Card — Left (Budget anchor) */}
                    <div className="relative p-8 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all duration-500 shadow-[0_0_20px_rgba(148,163,184,0.04)] hover:shadow-[0_0_30px_rgba(148,163,184,0.08)]">
                        <div className="mb-7">
                            <h3 className="text-xl font-black text-white mb-1.5 font-jakarta">FREE</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{t("freeDesc")}</p>
                        </div>
                        <div className="mb-7">
                            <span className="text-5xl font-black text-white font-jakarta">$0</span>
                            <span className="text-slate-400 text-base ml-1.5">/mo</span>
                        </div>
                        <ul className="space-y-3.5 mb-9 text-sm">
                            {[t("freeF1"), t("freeF2"), t("freeF3"), t("freeF4")].map((f, i) => (
                                <li key={i} className="flex items-start gap-3 text-slate-300 leading-relaxed">
                                    <Check className="w-4.5 h-4.5 text-slate-500 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                        <Link
                            href="/login"
                            className="block w-full text-center py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider border border-white/20 text-white/70 hover:bg-white/5 hover:text-white transition-all font-jakarta"
                        >
                            {t("freeCta")}
                        </Link>
                    </div>

                    {/* PRO Card — Center */}
                    <div className="relative p-8 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-amber-500/20 hover:border-amber-500/35 transition-all duration-500 shadow-[0_0_20px_rgba(245,158,11,0.06)] hover:shadow-[0_0_35px_rgba(245,158,11,0.12)]">
                        <div className="mb-7">
                            <h3 className="text-xl font-black text-white mb-1.5 font-jakarta">PRO</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{t("proDesc")}</p>
                        </div>
                        <div className="mb-7 flex items-baseline flex-wrap gap-x-1">
                            <span className="text-lg text-red-500 line-through font-bold font-jakarta">${proOriginal}</span>
                            <span className="text-5xl font-black text-white font-jakarta">${proPrice}</span>
                            <span className="text-slate-400 text-base ml-0.5">/mo</span>
                            {!isAnnual ? (
                                <span className="ml-2 text-[11px] text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full font-bold font-jakarta">
                                    FOUNDING
                                </span>
                            ) : (
                                <span className="ml-2 text-[11px] text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full font-bold font-jakarta">
                                    SAVE 20%
                                </span>
                            )}
                        </div>
                        <ul className="space-y-3.5 mb-9 text-sm">
                            {[t("proF1"), t("proF2"), t("proF3"), t("proF4"), t("proF5")].map((f, i) => (
                                <li key={i} className="flex items-start gap-3 text-slate-300 leading-relaxed">
                                    <Check className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                        <button className="w-full py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:brightness-110 transition-all shadow-[0_0_20px_rgba(245,158,11,0.15)] font-jakarta">
                            {t("proCta")}
                        </button>
                    </div>

                    {/* 👑 ELITE Card — Right (Visual Dominance) */}
                    <div className="relative p-8 pt-9 rounded-2xl bg-white/[0.04] border border-cyan-500/30 transition-all duration-500 shadow-[0_0_40px_rgba(34,211,238,0.12),inset_0_0_30px_rgba(34,211,238,0.03)] md:scale-105 md:-mt-3 md:mb-[-12px]">
                        {/* MOST POPULAR badge */}
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-[11px] font-black text-black uppercase tracking-[0.15em] shadow-[0_0_20px_rgba(34,211,238,0.3)] font-jakarta">
                            MOST POPULAR
                        </div>


                        <div className="mb-7 mt-2">
                            <h3 className="text-xl font-black text-white mb-1.5 font-jakarta">ELITE</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{t("eliteDesc")}</p>
                        </div>
                        <div className="mb-7 flex items-baseline flex-wrap gap-x-1">
                            <span className="text-lg text-red-500 line-through font-bold font-jakarta">${eliteOriginal}</span>
                            <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white font-jakarta">${elitePrice}</span>
                            <span className="text-slate-400 text-base ml-0.5">/mo</span>
                            {!isAnnual ? (
                                <span className="ml-2 text-[11px] text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full font-bold font-jakarta">
                                    FOUNDING
                                </span>
                            ) : (
                                <span className="ml-2 text-[11px] text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full font-bold font-jakarta">
                                    SAVE 25%
                                </span>
                            )}
                        </div>
                        <ul className="space-y-3.5 mb-9 text-sm">
                            {[t("eliteF1"), t("eliteF2"), t("eliteF3"), t("eliteF4"), t("eliteF5"), t("eliteF6")].map((f, i) => (
                                <li key={i} className="flex items-start gap-3 text-slate-300 leading-relaxed">
                                    <Crown className="w-4.5 h-4.5 text-cyan-400 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                        <button className="w-full py-4 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 text-black hover:brightness-110 transition-all shadow-[0_0_30px_rgba(34,211,238,0.2)] flex items-center justify-center gap-2 font-jakarta">
                            {t("eliteCta")} <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </section>
            {/* ============================================================ */}
            {/* FOUNDING MEMBER FOMO BANNER */}
            {/* ============================================================ */}
            <section className="px-6 pb-24">
                <div className="max-w-2xl mx-auto">
                    <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] p-8 md:p-10 shadow-2xl shadow-black/50"
                        style={{ background: 'linear-gradient(165deg, rgba(25,40,70,0.92) 0%, rgba(18,30,55,0.95) 50%, rgba(22,35,65,0.92) 100%)' }}>

                        {/* ── Infographic SVG background ── */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
                            {/* Grid */}
                            <defs>
                                <pattern id="fomo-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.4)" strokeWidth="0.5" />
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#fomo-grid)" />
                            {/* Uptrend line */}
                            <polyline points="0,280 80,260 160,240 240,200 320,210 400,160 480,140 560,100 640,80 720,40" fill="none" stroke="rgba(34,211,238,0.6)" strokeWidth="1.5" />
                            {/* Candlestick silhouettes */}
                            <g stroke="rgba(34,211,238,0.4)" strokeWidth="1" fill="none">
                                <line x1="120" y1="230" x2="120" y2="190" /><rect x="115" y="200" width="10" height="20" rx="1" fill="rgba(34,211,238,0.15)" />
                                <line x1="200" y1="220" x2="200" y2="170" /><rect x="195" y="180" width="10" height="25" rx="1" fill="rgba(16,185,129,0.15)" />
                                <line x1="280" y1="200" x2="280" y2="150" /><rect x="275" y="155" width="10" height="30" rx="1" fill="rgba(16,185,129,0.15)" />
                                <line x1="360" y1="190" x2="360" y2="140" /><rect x="355" y="150" width="10" height="25" rx="1" fill="rgba(34,211,238,0.15)" />
                                <line x1="440" y1="160" x2="440" y2="110" /><rect x="435" y="115" width="10" height="30" rx="1" fill="rgba(16,185,129,0.15)" />
                                <line x1="520" y1="130" x2="520" y2="80" /><rect x="515" y="85" width="10" height="30" rx="1" fill="rgba(16,185,129,0.15)" />
                            </g>
                            {/* Volume bars */}
                            <g fill="rgba(34,211,238,0.08)">
                                <rect x="110" y="290" width="20" height="15" rx="1" />
                                <rect x="190" y="285" width="20" height="20" rx="1" />
                                <rect x="270" y="278" width="20" height="27" rx="1" />
                                <rect x="350" y="282" width="20" height="23" rx="1" />
                                <rect x="430" y="275" width="20" height="30" rx="1" />
                                <rect x="510" y="270" width="20" height="35" rx="1" />
                            </g>
                        </svg>

                        {/* Ambient glow — static */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-cyan-500/[0.05] rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-[350px] h-[250px] bg-indigo-500/[0.04] rounded-full blur-[100px] pointer-events-none" />

                        <div className="relative z-10">
                            {/* Badge */}
                            <div className="flex justify-center mb-5">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-sm">
                                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-[0.15em] font-jakarta">
                                        FOUNDING MEMBER
                                    </span>
                                </div>
                            </div>

                            {/* Title */}
                            <h3 className="text-xl md:text-2xl font-black text-white mb-2 text-center font-jakarta">
                                {t("foundingTitle")}
                            </h3>
                            <p className="text-slate-300 text-sm mb-6 max-w-md mx-auto leading-relaxed text-center">
                                {t("foundingDesc")}
                            </p>

                            {/* Price Grid — Monthly Founding (Hero) */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {/* PRO */}
                                <div className="rounded-xl p-5 text-center backdrop-blur-sm"
                                    style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                    <p className="text-xs text-amber-400 font-bold uppercase tracking-widest mb-2.5 font-jakarta">PRO</p>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className="text-slate-400 line-through text-sm font-medium font-jakarta">$69</span>
                                        <span className="text-3xl font-black text-white font-jakarta">$49</span>
                                        <span className="text-slate-300 text-xs">/mo</span>
                                    </div>
                                    <p className="text-emerald-400 text-xs font-semibold mt-2 font-jakarta">{t("foundingAnnualPro")}</p>
                                </div>
                                {/* ELITE */}
                                <div className="rounded-xl p-5 text-center backdrop-blur-sm"
                                    style={{ background: 'linear-gradient(145deg, rgba(34,211,238,0.1) 0%, rgba(34,211,238,0.03) 100%)', border: '1px solid rgba(34,211,238,0.25)' }}>
                                    <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest mb-2.5 font-jakarta">ELITE</p>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className="text-slate-400 line-through text-sm font-medium font-jakarta">$149</span>
                                        <span className="text-3xl font-black text-white font-jakarta">$79</span>
                                        <span className="text-slate-300 text-xs">/mo</span>
                                    </div>
                                    <p className="text-emerald-400 text-xs font-semibold mt-2 font-jakarta">{t("foundingAnnualElite")}</p>
                                </div>
                            </div>

                            {/* Annual Savings Callout */}
                            <div className="rounded-lg px-5 py-3.5 mb-5 backdrop-blur-sm" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <span className="text-sm text-slate-200 font-medium">{t("foundingAnnualCta")}</span>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <span className="text-sm font-jakarta">
                                            <span className="text-slate-300 font-bold">PRO </span>
                                            <span className="text-emerald-400 font-bold">$39<span className="text-slate-300 font-normal">/mo</span></span>
                                        </span>
                                        <span className="text-sm font-jakarta">
                                            <span className="text-slate-300 font-bold">ELITE </span>
                                            <span className="text-emerald-400 font-bold">$59<span className="text-slate-300 font-normal">/mo</span></span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Restoration + Urgency */}
                            <p className="text-sm text-slate-300 text-center mb-2.5 leading-relaxed">
                                {t("foundingRestore")}
                            </p>
                            <p className="text-sm text-amber-400 font-semibold text-center">
                                {t("foundingUrgency")}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* COMPETITOR COMPARISON */}
            {/* ============================================================ */}
            <section className="px-6 pb-24">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-4 font-jakarta">
                        {t("compTitle")}
                    </h2>
                    <p className="text-slate-300 text-center text-[15px] mb-12 leading-relaxed">
                        {t("compDesc")}
                    </p>

                    <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
                        <div className="grid grid-cols-3 text-xs uppercase tracking-wider font-bold text-slate-500 px-6 py-4 border-b border-white/[0.06] font-jakarta">
                            <span>{t("compService")}</span>
                            <span className="text-center">{t("compPrice")}</span>
                            <span className="text-right">{t("compScope")}</span>
                        </div>
                        {competitors.map((c, i) => (
                            <div
                                key={i}
                                className={`grid grid-cols-3 px-6 py-4.5 border-b border-white/[0.04] last:border-b-0 items-center ${c.highlight
                                    ? "bg-cyan-500/[0.04] border-l-2 border-l-cyan-400"
                                    : ""
                                    }`}
                            >
                                <span className={`text-[15px] font-bold font-jakarta ${c.highlight ? "text-cyan-400" : "text-white"}`}>
                                    {c.name}
                                </span>
                                <span className={`text-center text-[15px] font-mono font-bold ${c.highlight ? "text-cyan-400" : "text-slate-200"}`}>
                                    {c.price}
                                </span>
                                <span className={`text-right text-sm ${c.highlight ? "text-cyan-400/90 font-bold" : "text-slate-400"}`}>
                                    {c.scope}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* FEATURE MATRIX */}
            {/* ============================================================ */}
            <section className="px-6 pb-24">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-4 font-jakarta">
                        {t("matrixTitle")}
                    </h2>
                    <p className="text-slate-300 text-center text-[15px] mb-12 leading-relaxed">
                        {t("matrixDesc")}
                    </p>

                    <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-4 text-xs uppercase tracking-wider font-bold border-b border-white/10 font-jakarta">
                            <div className="px-6 py-4 text-slate-500">{t("matrixFeature")}</div>
                            <div className="px-4 py-4 text-center text-slate-500">FREE</div>
                            <div className="px-4 py-4 text-center text-amber-400/80">PRO</div>
                            <div className="px-4 py-4 text-center text-cyan-400 font-black bg-cyan-500/[0.04] border-l border-r border-cyan-500/15 shadow-[inset_0_-1px_0_rgba(34,211,238,0.1)]">
                                ELITE
                            </div>
                        </div>

                        {/* Categories */}
                        {featureCategories.map((cat, ci) => (
                            <div key={ci}>
                                {/* Category header */}
                                <div className="grid grid-cols-4 border-b border-white/[0.06] bg-white/[0.015]">
                                    <div className="col-span-3 px-6 py-3.5 flex items-center gap-2.5">
                                        {cat.icon}
                                        <span className="text-xs font-black text-white uppercase tracking-wider font-jakarta">{cat.title}</span>
                                    </div>
                                    <div className="bg-cyan-500/[0.04] border-l border-r border-cyan-500/15" />
                                </div>
                                {/* Rows */}
                                {cat.rows.map((row, ri) => (
                                    <div key={ri} className="grid grid-cols-4 border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                                        <div className="px-6 py-4 text-sm text-slate-300 font-medium leading-relaxed">{row.label}</div>
                                        <div className="px-4 py-4">
                                            {row.free === "60s" || row.free === "15s" || row.free === "5s" ? (
                                                <div className="text-center">
                                                    <span className={row.freeNote}>{row.free}</span>
                                                </div>
                                            ) : (
                                                <StatusCell status={row.free as FeatureStatus} note={row.freeNote} />
                                            )}
                                        </div>
                                        <div className="px-4 py-4">
                                            {row.pro === "15s" || row.pro === "60s" || row.pro === "5s" ? (
                                                <div className="text-center">
                                                    <span className={row.proNote}>{row.pro}</span>
                                                </div>
                                            ) : (
                                                <StatusCell status={row.pro as FeatureStatus} note={row.proNote} />
                                            )}
                                        </div>
                                        <div className="px-4 py-4 bg-cyan-500/[0.04] border-l border-r border-cyan-500/15">
                                            {row.elite === "5s" || row.elite === "15s" || row.elite === "60s" ? (
                                                <div className="text-center">
                                                    <span className={row.eliteNote}>{row.elite}</span>
                                                </div>
                                            ) : (
                                                <StatusCell status={row.elite as FeatureStatus} note={row.eliteNote} isEliteCol />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* FAQ */}
            {/* ============================================================ */}
            <section className="px-6 pb-28">
                <div className="max-w-2xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-12 font-jakarta">
                        {t("faqTitle")}
                    </h2>
                    {faqs.map((faq, i) => (
                        <FaqItem key={i} q={faq.q} a={faq.a} />
                    ))}
                </div>
            </section>

            {/* ============================================================ */}
            {/* BOTTOM CTA */}
            {/* ============================================================ */}
            <section className="px-6 pb-24">
                <div className="max-w-3xl mx-auto text-center">
                    <div className="relative overflow-hidden rounded-2xl border border-white/15 px-12 py-8 shadow-[0_0_50px_rgba(34,211,238,0.06)]"
                        style={{ background: 'linear-gradient(165deg, rgba(25,40,70,0.95) 0%, rgba(15,28,50,0.98) 50%, rgba(20,35,60,0.95) 100%)' }}>

                        {/* Infographic SVG background */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <pattern id="cta-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="0.5" />
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#cta-grid)" />
                            {/* Uptrend line */}
                            <polyline points="0,160 120,140 240,120 360,90 480,70 600,50 720,25" fill="none" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" />
                            {/* Candlestick silhouettes */}
                            <g stroke="rgba(34,211,238,0.3)" strokeWidth="1" fill="none">
                                <line x1="180" y1="135" x2="180" y2="105" /><rect x="175" y="110" width="10" height="18" rx="1" fill="rgba(16,185,129,0.12)" />
                                <line x1="300" y1="115" x2="300" y2="80" /><rect x="295" y="85" width="10" height="22" rx="1" fill="rgba(16,185,129,0.12)" />
                                <line x1="420" y1="90" x2="420" y2="55" /><rect x="415" y="60" width="10" height="22" rx="1" fill="rgba(16,185,129,0.12)" />
                                <line x1="540" y1="70" x2="540" y2="35" /><rect x="535" y="40" width="10" height="22" rx="1" fill="rgba(34,211,238,0.12)" />
                            </g>
                        </svg>

                        {/* Ambient glows */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-cyan-500/[0.06] rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-[400px] h-[200px] bg-indigo-500/[0.04] rounded-full blur-[100px] pointer-events-none" />

                        <div className="relative z-10">
                            <h3 className="text-2xl md:text-3xl font-black text-white mb-4 font-jakarta">{t("ctaTitle")}</h3>
                            <p className="text-slate-300 text-base mb-6 leading-relaxed">{t("ctaDesc")}</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button className="px-8 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 text-black hover:brightness-110 transition-all shadow-[0_0_25px_rgba(34,211,238,0.2)] flex items-center gap-2 font-jakarta">
                                    {t("ctaButton")} <ArrowRight className="w-4 h-4" />
                                </button>
                                <Link
                                    href="/how-it-works"
                                    className="px-8 py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider border border-white/20 text-slate-300 hover:text-white hover:border-white/40 transition-all font-jakarta"
                                >
                                    {t("ctaSecondary")}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
