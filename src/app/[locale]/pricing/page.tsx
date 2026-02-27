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
    Gauge,
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
function StatusCell({ status, note, isEliteCol }: { status: FeatureStatus | string; note?: string; isEliteCol?: boolean }) {
    const baseClass = "flex items-center justify-center gap-1.5 text-[13px] font-medium";

    switch (status) {
        case "full":
            return (
                <div className={baseClass}>
                    <Check className="w-4 h-4 text-emerald-400" />
                    {note && <span className="text-emerald-400/80 text-[11px]">{note}</span>}
                </div>
            );
        case "lock":
            return (
                <div className={baseClass}>
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    {note && <span className="text-slate-500 text-[11px]">{note}</span>}
                </div>
            );
        case "peek":
            return (
                <div className={baseClass}>
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    {note && <span className="text-amber-400/80 text-[11px]">{note}</span>}
                </div>
            );
        case "limited":
            return (
                <div className={baseClass}>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    {note && <span className="text-amber-400/80 text-[11px]">{note}</span>}
                </div>
            );
        case "elite":
            return (
                <div className={baseClass}>
                    <Crown className={`w-4 h-4 ${isEliteCol ? "text-cyan-400" : "text-cyan-400"}`} />
                    {note && <span className="text-cyan-400 text-[11px] font-bold">{note}</span>}
                </div>
            );
        default:
            // Speed or custom text
            return (
                <div className={baseClass}>
                    <span className={note || "text-slate-400 text-[11px]"}>{status}</span>
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
        <div className="border-b border-white/5">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between py-5 text-left group"
            >
                <span className="text-[15px] font-bold text-white group-hover:text-cyan-400 transition-colors pr-4">{q}</span>
                <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-40 pb-5" : "max-h-0"}`}>
                <p className="text-[13px] text-slate-400 leading-relaxed">{a}</p>
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
    const eliteFoundingMonthly = 99;
    const proAnnualMonthly = 57;
    const eliteAnnualMonthly = 124;

    const proPrice = isAnnual ? proAnnualMonthly : proFoundingMonthly;
    const proOriginal = isAnnual ? proPriceMonthly : proPriceMonthly;
    const elitePrice = isAnnual ? eliteAnnualMonthly : eliteFoundingMonthly;
    const eliteOriginal = isAnnual ? elitePriceMonthly : elitePriceMonthly;

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
                    freeNote: "text-slate-500 text-[11px]",
                    proNote: "text-blue-400 text-[11px] font-bold",
                    eliteNote: "text-cyan-400 text-[11px] font-bold",
                },
            ],
        },
        {
            icon: <Target className="w-4 h-4 text-amber-400" />,
            title: "COMMAND",
            rows: [
                { label: t("matrix.priceChart"), free: "full", pro: "full", elite: "full" },
                { label: t("matrix.aiVerdict"), free: "lock", pro: "full", elite: "full", freeNote: t("matrix.blurred") },
                { label: t("matrix.signalCore"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.partial") },
            ],
        },
        {
            icon: <Activity className="w-4 h-4 text-emerald-400" />,
            title: "FLOW",
            rows: [
                { label: t("matrix.opiPcRatio"), free: "full", pro: "full", elite: "full" },
                { label: t("matrix.flowIndicators"), free: "lock", pro: "full", elite: "full" },
                { label: t("matrix.classifiedFlow"), free: "lock", pro: "lock", elite: "elite", eliteNote: t("matrix.realtime") },
                { label: t("matrix.dex"), free: "lock", pro: "lock", elite: "elite" },
                { label: t("matrix.smartMoney"), free: "lock", pro: "lock", elite: "elite" },
            ],
        },
        {
            icon: <Brain className="w-4 h-4 text-purple-400" />,
            title: "INTEL",
            rows: [
                { label: t("matrix.aiReport"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.m7Only"), proNote: t("matrix.all7") },
                { label: t("matrix.alphaScore"), free: "limited", pro: "full", elite: "full", freeNote: t("matrix.gradeOnly") },
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
                { label: t("matrix.dashboardHud"), free: "limited", pro: "full", elite: "full", freeNote: "4/8", proNote: "8/8" },
                { label: t("matrix.watchlist"), free: "limited", pro: "full", elite: "elite", freeNote: t("matrix.threeStocks"), proNote: t("matrix.fifteenStocks"), eliteNote: t("matrix.unlimited") },
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
        <div className="min-h-screen bg-[#060a12] text-slate-200 font-sans">
            {/* ============================================================ */}
            {/* HERO SECTION */}
            {/* ============================================================ */}
            <section className="relative pt-24 pb-16 px-6 overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-radial from-cyan-500/10 via-transparent to-transparent blur-[120px]" />
                    <div className="absolute top-[30%] left-1/4 w-[400px] h-[400px] bg-gradient-radial from-amber-500/5 via-transparent to-transparent blur-[100px]" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto text-center">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-8">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span className="text-[12px] font-bold text-cyan-400 uppercase tracking-[0.15em]">
                            {t("heroBadge")}
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-4 tracking-tight leading-tight">
                        {t("heroTitle1")}
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-amber-400 to-cyan-400">
                            {t("heroTitle2")}
                        </span>
                    </h1>

                    <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
                        {t("heroDesc")}
                    </p>

                    {/* Monthly / Annual Toggle */}
                    <div className="inline-flex items-center gap-4 p-1.5 rounded-xl bg-white/[0.04] border border-white/10">
                        <button
                            onClick={() => setIsAnnual(false)}
                            className={`px-6 py-2.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition-all ${!isAnnual
                                    ? "bg-white/10 text-white shadow-lg"
                                    : "text-slate-400 hover:text-white"
                                }`}
                        >
                            {t("monthly")}
                        </button>
                        <button
                            onClick={() => setIsAnnual(true)}
                            className={`px-6 py-2.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${isAnnual
                                    ? "bg-white/10 text-white shadow-lg"
                                    : "text-slate-400 hover:text-white"
                                }`}
                        >
                            {t("annual")}
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                                {t("twoMonthsFree")}
                            </span>
                        </button>
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* TIER CARDS */}
            {/* ============================================================ */}
            <section className="px-6 pb-20">
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {/* FREE Card */}
                    <div className="relative p-7 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all duration-500">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-white mb-1">FREE</h3>
                            <p className="text-[13px] text-slate-400">{t("freeDesc")}</p>
                        </div>
                        <div className="mb-6">
                            <span className="text-4xl font-black text-white">$0</span>
                            <span className="text-slate-400 text-sm ml-1">/mo</span>
                        </div>
                        <ul className="space-y-3 mb-8 text-[13px]">
                            {[t("freeF1"), t("freeF2"), t("freeF3"), t("freeF4")].map((f, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-slate-300">
                                    <Check className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                        <Link
                            href="/login"
                            className="block w-full text-center py-3 rounded-lg text-[13px] font-bold uppercase tracking-wider border border-white/20 text-white/70 hover:bg-white/5 hover:text-white transition-all"
                        >
                            {t("freeCta")}
                        </Link>
                    </div>

                    {/* PRO Card */}
                    <div className="relative p-7 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-amber-500/20 hover:border-amber-500/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(245,158,11,0.06)]">
                        <div className="mb-6">
                            <h3 className="text-lg font-bold text-white mb-1">PRO</h3>
                            <p className="text-[13px] text-slate-400">{t("proDesc")}</p>
                        </div>
                        <div className="mb-6">
                            <span className="text-sm text-rose-400 line-through mr-2">${proOriginal}</span>
                            <span className="text-4xl font-black text-white">${proPrice}</span>
                            <span className="text-slate-400 text-sm ml-1">/mo</span>
                            {!isAnnual && (
                                <span className="ml-2 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full font-bold">
                                    FOUNDING
                                </span>
                            )}
                        </div>
                        <ul className="space-y-3 mb-8 text-[13px]">
                            {[t("proF1"), t("proF2"), t("proF3"), t("proF4"), t("proF5")].map((f, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-slate-300">
                                    <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                        <button className="w-full py-3 rounded-lg text-[13px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:brightness-110 transition-all shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                            {t("proCta")}
                        </button>
                    </div>

                    {/* ELITE Card — Visual Dominance */}
                    <div className="relative p-7 pt-8 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-cyan-500/40 transition-all duration-500 shadow-[0_0_60px_rgba(34,211,238,0.08)] md:scale-105 md:-mt-3 md:mb-[-12px]">
                        {/* MOST POPULAR badge */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-[10px] font-black text-black uppercase tracking-[0.15em] shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                            MOST POPULAR
                        </div>

                        {/* Ambient glow */}
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

                        <div className="mb-6 mt-2">
                            <h3 className="text-lg font-bold text-white mb-1">ELITE</h3>
                            <p className="text-[13px] text-slate-400">{t("eliteDesc")}</p>
                        </div>
                        <div className="mb-6">
                            <span className="text-sm text-rose-400 line-through mr-2">${eliteOriginal}</span>
                            <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white">${elitePrice}</span>
                            <span className="text-slate-400 text-sm ml-1">/mo</span>
                            {!isAnnual && (
                                <span className="ml-2 text-[10px] text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-bold">
                                    FOUNDING
                                </span>
                            )}
                        </div>
                        <ul className="space-y-3 mb-8 text-[13px]">
                            {[t("eliteF1"), t("eliteF2"), t("eliteF3"), t("eliteF4"), t("eliteF5"), t("eliteF6")].map((f, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-slate-300">
                                    <Crown className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                                    {f}
                                </li>
                            ))}
                        </ul>
                        <button className="w-full py-3.5 rounded-lg text-[13px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 text-black hover:brightness-110 transition-all shadow-[0_0_30px_rgba(34,211,238,0.2)] flex items-center justify-center gap-2">
                            {t("eliteCta")} <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* FOUNDING MEMBER FOMO BANNER */}
            {/* ============================================================ */}
            <section className="px-6 pb-20">
                <div className="max-w-3xl mx-auto">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a1628] to-[#0d1b30] border border-cyan-500/20 p-8 md:p-10 text-center">
                        {/* Background glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-cyan-500/5 blur-[100px] pointer-events-none" />

                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6">
                                <Zap className="w-4 h-4 text-cyan-400" />
                                <span className="text-[12px] font-bold text-cyan-400 uppercase tracking-[0.15em]">
                                    FOUNDING MEMBER
                                </span>
                            </div>

                            <h3 className="text-2xl md:text-3xl font-black text-white mb-3">
                                {t("foundingTitle")}
                            </h3>
                            <p className="text-slate-400 text-[15px] mb-6 max-w-xl mx-auto">
                                {t("foundingDesc")}
                            </p>

                            <div className="flex items-center justify-center gap-8 mb-8">
                                <div className="text-center">
                                    <p className="text-[12px] text-slate-500 mb-1">PRO</p>
                                    <p>
                                        <span className="text-rose-400 line-through text-sm mr-2">$69</span>
                                        <span className="text-2xl font-black text-amber-400">$49</span>
                                        <span className="text-slate-400 text-xs">/mo</span>
                                    </p>
                                </div>
                                <div className="w-px h-12 bg-white/10" />
                                <div className="text-center">
                                    <p className="text-[12px] text-slate-500 mb-1">ELITE</p>
                                    <p>
                                        <span className="text-rose-400 line-through text-sm mr-2">$149</span>
                                        <span className="text-2xl font-black text-cyan-400">$99</span>
                                        <span className="text-slate-400 text-xs">/mo</span>
                                    </p>
                                </div>
                            </div>

                            <p className="text-[13px] text-amber-400/80 font-medium">
                                {t("foundingUrgency")}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ============================================================ */}
            {/* COMPETITOR COMPARISON */}
            {/* ============================================================ */}
            <section className="px-6 pb-20">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-3">
                        {t("compTitle")}
                    </h2>
                    <p className="text-slate-400 text-center text-[14px] mb-10">
                        {t("compDesc")}
                    </p>

                    <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
                        <div className="grid grid-cols-3 text-[12px] uppercase tracking-wider font-bold text-slate-500 px-6 py-3 border-b border-white/5">
                            <span>{t("compService")}</span>
                            <span className="text-center">{t("compPrice")}</span>
                            <span className="text-right">{t("compScope")}</span>
                        </div>
                        {competitors.map((c, i) => (
                            <div
                                key={i}
                                className={`grid grid-cols-3 px-6 py-4 border-b border-white/5 last:border-b-0 items-center ${c.highlight
                                        ? "bg-cyan-500/[0.04] border-l-2 border-l-cyan-400"
                                        : ""
                                    }`}
                            >
                                <span className={`text-[14px] font-bold ${c.highlight ? "text-cyan-400" : "text-white"}`}>
                                    {c.name}
                                </span>
                                <span className={`text-center text-[14px] font-mono font-bold ${c.highlight ? "text-cyan-400" : "text-slate-300"}`}>
                                    {c.price}
                                </span>
                                <span className={`text-right text-[12px] ${c.highlight ? "text-cyan-400/80 font-bold" : "text-slate-400"}`}>
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
            <section className="px-6 pb-20">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-3">
                        {t("matrixTitle")}
                    </h2>
                    <p className="text-slate-400 text-center text-[14px] mb-10">
                        {t("matrixDesc")}
                    </p>

                    <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-4 text-[12px] uppercase tracking-wider font-bold border-b border-white/10">
                            <div className="px-5 py-4 text-slate-500">{t("matrixFeature")}</div>
                            <div className="px-3 py-4 text-center text-slate-500">FREE</div>
                            <div className="px-3 py-4 text-center text-amber-400/80">PRO</div>
                            <div className="px-3 py-4 text-center text-cyan-400 bg-white/[0.03] border-l border-r border-cyan-500/10">
                                ELITE
                            </div>
                        </div>

                        {/* Categories */}
                        {featureCategories.map((cat, ci) => (
                            <div key={ci}>
                                {/* Category header */}
                                <div className="grid grid-cols-4 border-b border-white/5 bg-white/[0.01]">
                                    <div className="col-span-4 px-5 py-3 flex items-center gap-2">
                                        {cat.icon}
                                        <span className="text-[12px] font-black text-white uppercase tracking-wider">{cat.title}</span>
                                    </div>
                                </div>
                                {/* Rows */}
                                {cat.rows.map((row, ri) => (
                                    <div key={ri} className="grid grid-cols-4 border-b border-white/5 hover:bg-white/[0.01] transition-colors">
                                        <div className="px-5 py-3.5 text-[13px] text-slate-300 font-medium">{row.label}</div>
                                        <div className="px-3 py-3.5">
                                            {row.free === "60s" || row.free === "15s" || row.free === "5s" ? (
                                                <div className="text-center">
                                                    <span className={row.freeNote}>{row.free}</span>
                                                </div>
                                            ) : (
                                                <StatusCell status={row.free as FeatureStatus} note={row.freeNote} />
                                            )}
                                        </div>
                                        <div className="px-3 py-3.5">
                                            {row.pro === "15s" || row.pro === "60s" || row.pro === "5s" ? (
                                                <div className="text-center">
                                                    <span className={row.proNote}>{row.pro}</span>
                                                </div>
                                            ) : (
                                                <StatusCell status={row.pro as FeatureStatus} note={row.proNote} />
                                            )}
                                        </div>
                                        <div className="px-3 py-3.5 bg-white/[0.02] border-l border-r border-cyan-500/5">
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
            <section className="px-6 pb-24">
                <div className="max-w-2xl mx-auto">
                    <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-10">
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
            <section className="px-6 pb-20">
                <div className="max-w-3xl mx-auto text-center">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a1628] to-[#0d1b30] border border-white/10 p-10">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-cyan-500/5 blur-[100px] pointer-events-none" />
                        <div className="relative z-10">
                            <h3 className="text-2xl font-black text-white mb-3">{t("ctaTitle")}</h3>
                            <p className="text-slate-400 text-[14px] mb-8">{t("ctaDesc")}</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button className="px-8 py-3 rounded-lg text-[13px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-cyan-600 text-black hover:brightness-110 transition-all shadow-[0_0_20px_rgba(34,211,238,0.15)] flex items-center gap-2">
                                    {t("ctaButton")} <ArrowRight className="w-4 h-4" />
                                </button>
                                <Link
                                    href="/how-it-works"
                                    className="px-8 py-3 rounded-lg text-[13px] font-bold uppercase tracking-wider border border-white/20 text-slate-300 hover:text-white hover:border-white/40 transition-all"
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
