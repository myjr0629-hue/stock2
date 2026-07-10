import React, { useState, useEffect } from "react";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, MessageSquare, Lightbulb, Clock, Radio, Sun, FileText } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';
import { GuardianTooltip } from './GuardianTooltip';
import { renderColoredText } from './TypewriterText';
import { useServerMobile } from '@/contexts/DeviceContext';

// === BreadthLiquid — Premium Energy Bar ===
function BreadthLiquid({ breadthPct, signal, loading, signalColor, advancingLabel, decliningLabel }: { breadthPct: number; signal: string; loading?: boolean; signalColor: string; advancingLabel: string; decliningLabel: string }) {
    const pct = loading ? 0 : Math.min(100, Math.max(0, Math.round(breadthPct)));
    const fillColor = pct >= 60 ? '#34d399' : pct >= 45 ? '#94a3b8' : pct >= 30 ? '#fbbf24' : '#f87171';
    const fillGradient = pct >= 60
        ? 'linear-gradient(90deg, #065f46, #059669, #34d399)'
        : pct >= 45
            ? 'linear-gradient(90deg, #334155, #64748b, #94a3b8)'
            : pct >= 30
                ? 'linear-gradient(90deg, #78350f, #d97706, #fbbf24)'
                : 'linear-gradient(90deg, #7f1d1d, #dc2626, #f87171)';

    return (
        <div className="w-full">
            {/* Score + Inline Metrics */}
            <div className="flex items-end justify-between mb-2.5">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-mono font-black text-white tabular-nums leading-none">
                        {loading ? '--' : pct}
                    </span>
                    <span className="text-sm text-slate-400 font-bold">%</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400/60" />
                        <span className="text-[12px] font-bold text-emerald-400/80 tabular-nums">{pct}%</span>
                    </div>
                    <div className="w-px h-3 bg-slate-700" />
                    <div className="flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-rose-400/60" />
                        <span className="text-[12px] font-bold text-rose-400/80 tabular-nums">{100 - pct}%</span>
                    </div>
                </div>
            </div>

            {/* Premium Energy Bar */}
            <div className="relative w-full rounded-md overflow-hidden" style={{ height: 20 }}>
                {/* Background track */}
                <div className="absolute inset-0 bg-slate-800/80 rounded-md" />

                {/* Declining zone (right side) — subtle red */}
                <div
                    className="absolute right-0 top-0 h-full transition-all duration-700 ease-out"
                    style={{
                        width: `${100 - pct}%`,
                        background: 'linear-gradient(90deg, transparent, rgba(244,63,94,0.12))',
                    }}
                />

                {/* Advancing fill (left side) — gradient */}
                <div
                    className="absolute left-0 top-0 h-full rounded-md transition-all duration-700 ease-out"
                    style={{
                        width: `${Math.max(2, pct)}%`,
                        background: fillGradient,
                        boxShadow: `0 0 16px ${fillColor}30, 0 0 4px ${fillColor}50`,
                    }}
                >
                    {/* Shimmer scan line */}
                    <div
                        className="absolute inset-0 overflow-hidden rounded-md"
                        style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer-scan 2.5s ease-in-out infinite',
                        }}
                    />
                    {/* Glass reflection */}
                    <div
                        className="absolute inset-x-0 top-0 h-[40%] rounded-t-md"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
                        }}
                    />
                </div>

                {/* 50% center tick */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10" />

                {/* Glow edge at fill boundary */}
                <div
                    className="absolute top-0 bottom-0 w-1 z-10 transition-all duration-700 ease-out"
                    style={{
                        left: `calc(${Math.max(2, pct)}% - 2px)`,
                        background: `linear-gradient(180deg, ${fillColor}00, ${fillColor}, ${fillColor}00)`,
                        boxShadow: `0 0 8px ${fillColor}60`,
                    }}
                />
            </div>

            {/* Minimal scale */}
            <div className="flex justify-between mt-1 px-0.5">
                <span className="text-[12px] text-slate-300 font-medium">{advancingLabel}</span>
                <span className="text-[12px] text-slate-300 font-mono">50%</span>
                <span className="text-[12px] text-slate-300 font-medium">{decliningLabel}</span>
            </div>

            {/* CSS Keyframes */}
            <style jsx>{`
                @keyframes shimmer-scan {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            `}</style>
        </div>
    );
}




interface RLSIInsightPanelProps {
    alignmentStatus: string;
    insightTitle: string;
    insightDesc: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    breadthPct: number;
    adRatio: number;
    volumeBreadth: number;
    breadthSignal: string;
    isDivergent: boolean;
    loading?: boolean;
    isMarketActive?: boolean;
    session?: string; // "PRE" | "REG" | "CLOSED" | "POST"
    appCompact?: boolean;
}

/**
 * RLSIInsightPanel V8.0 — Morning Briefing + Tactical Toggle
 * PRE session → Briefing tab default
 * REG session → Tactical tab default
 */
export default function RLSIInsightPanel({
    alignmentStatus,
    insightTitle,
    insightDesc,
    sentiment,
    breadthPct,
    adRatio,
    volumeBreadth,
    breadthSignal,
    isDivergent,
    loading,
    isMarketActive = true,
    session = "CLOSED",
    appCompact = false,
}: RLSIInsightPanelProps) {
    const t = useTranslations('guardian');
    const locale = useLocale();
    const isMobile = useServerMobile();
    const useAppCompact = appCompact || isMobile;

    // Toggle state: "briefing" or "tactical"
    // [FIX V2] Default is ALWAYS tactical. Briefing only shown when:
    // 1. Morning briefing actually EXISTS in Redis (not stale/empty)
    // 2. Briefing date matches TODAY's ET date
    // 3. Session is PRE (04:00~09:30 ET)
    // Once REG starts → always revert to tactical
    const [activeTab, setActiveTab] = useState<"briefing" | "tactical">("tactical");
    const [briefingData, setBriefingData] = useState<any>(null);
    const [briefingLoading, setBriefingLoading] = useState(false);

    // Auto-switch to briefing ONLY when briefing data is fetched + valid + PRE session
    useEffect(() => {
        // Avoid overriding activeTab if query param tab=briefing is explicitly requested
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('tab') === 'briefing') {
                return;
            }
        }
        if (session === "REG" || session === "POST") {
            setActiveTab("tactical");
        } else if (session === "PRE" && briefingData?.briefing) {
            // Verify briefing is from TODAY (not stale 24h TTL residue)
            const todayET = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
            const briefingDate = briefingData.date || '';
            if (briefingDate === todayET) {
                setActiveTab("briefing");
            }
            // If date doesn't match → stay on tactical (stale briefing)
        }
    }, [session, briefingData]);

    // Handle incoming routing query params (e.g. ?tab=briefing from App Dashboard)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('tab') === 'briefing') {
                setActiveTab("briefing");
            }
        }
    }, []);

    // Fetch briefing data
    useEffect(() => {
        const fetchBriefing = async () => {
            setBriefingLoading(true);
            try {
                const res = await fetch(`/api/guardian/briefing?locale=${locale}`);
                const data = await res.json();
                if (data.success && data.briefing) {
                    setBriefingData(data);
                }
            } catch {
                // Silent fail — briefing is optional
            } finally {
                setBriefingLoading(false);
            }
        };
        fetchBriefing();
    }, [locale]);

    const signalConfig: Record<string, { color: string; bg: string; label: string }> = {
        STRONG: { color: "#34d399", bg: "rgba(52,211,153,0.08)", label: t('signalStrong') },
        HEALTHY: { color: "#6ee7b7", bg: "rgba(110,231,183,0.08)", label: t('signalHealthy') },
        NEUTRAL: { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", label: t('signalNeutral') },
        WEAK: { color: "#fb923c", bg: "rgba(251,146,60,0.08)", label: t('signalWeak') },
        CRITICAL: { color: "#f43f5e", bg: "rgba(244,63,94,0.08)", label: t('signalCritical') }
    };

    const cfg = signalConfig[breadthSignal] || signalConfig.NEUTRAL;

    // Breadth is a REGULAR-session metric: advancers/decliners only accumulate after
    // the open. During PRE (and closed/holiday) the upstream serves neutral defaults
    // (50/50, A/D 1.00, vol 50) — rendering those with a real interpretation sentence
    // misleads (user-reported). POST keeps the completed session's real reading.
    const breadthIsDefault = breadthPct === 50 && adRatio === 1 && volumeBreadth === 50;
    const breadthLive = isMarketActive && (session === 'REG' || session === 'POST') && !breadthIsDefault;

    const sentimentBorder = sentiment === 'BULLISH' ? 'border-emerald-500/20' :
        sentiment === 'BEARISH' ? 'border-rose-500/20' : 'border-slate-700/50';

    // A/D Ratio 해석
    const getAdLabel = (ratio: number) => {
        if (ratio >= 3) return t('adOverwhelm');
        if (ratio >= 1.5) return t('adBuyDom');
        if (ratio >= 1) return t('adBalanced');
        if (ratio >= 0.7) return t('adSellDom');
        return t('adOverwhelmSell');
    };

    // Volume Breadth 해석
    const getVolLabel = (vol: number) => {
        if (vol >= 70) return t('volStrongBuy');
        if (vol >= 55) return t('volBuyDom');
        if (vol >= 45) return t('volBalanced');
        if (vol >= 30) return t('volSellDom');
        return t('volStrongSell');
    };

    // 자동 해석 문구
    const getInterpretation = () => {
        const advancing = Math.round(breadthPct);
        const declining = 100 - advancing;

        if (breadthPct >= 70 && adRatio >= 2) {
            return t('interpBullStrong', { adv: String(advancing), dec: String(declining) });
        }
        if (breadthPct >= 55) {
            return t('interpHealthy', { adv: String(advancing), dec: String(declining) });
        }
        if (breadthPct >= 45) {
            return t('interpMixed', { adv: String(advancing), dec: String(declining) });
        }
        if (breadthPct >= 30) {
            return t('interpWeak', { adv: String(advancing), dec: String(declining) });
        }
        return t('interpBearStrong', { adv: String(advancing), dec: String(declining) });
    };

    // Divergence 해석
    const getDivergenceText = () => {
        if (!isDivergent) return null;
        return t('divergenceWarning');
    };

    const insightTabIconSize = useAppCompact ? 10 : 10.5;
    const insightTabBase = useAppCompact
        ? "flex h-[24px] min-h-[24px] items-center justify-center gap-1 rounded-[10px] px-3 py-0 text-[10px] font-black tracking-[0.035em] transition-all duration-200"
        : "flex h-6 min-h-6 items-center gap-1 rounded px-2 py-0 text-[10px] font-black tracking-[0.04em] transition-all duration-300";

    return (
        <div className="flex flex-col h-full p-3">
            {/* Header */}
                <div className={`flex items-center justify-between mb-2 border-b border-slate-800 pb-2 flex-none ${isMobile ? 'flex-wrap gap-y-1' : ''}`}>
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <GuardianTooltip sectionId="rlsiInsight">
                        <span className="text-xs uppercase tracking-[0.2em] text-white font-black font-jakarta">
                            RLSI INSIGHT
                        </span>
                    </GuardianTooltip>
                    {isMobile ? (
                        <span className="text-xs text-amber-500 font-mono font-jakarta leading-tight">
                            · {session === 'REG' ? 'Regular Session' : session === 'PRE' ? 'Pre-Market' : session === 'POST' ? 'Post-Market' : 'Regular Only'}
                        </span>
                    ) : (
                        <span className="text-xs text-amber-500 font-mono font-jakarta">· {session === 'REG' ? 'Regular Session' : session === 'PRE' ? 'Pre-Market' : session === 'POST' ? 'Post-Market' : 'Regular Session Only'}</span>
                    )}
                </div>
                {isMobile ? (
                    <div className={`text-[10.5px] font-black uppercase px-2 py-0.5 rounded border text-center leading-tight ${alignmentStatus === 'DIVERGENCE'
                        ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                        : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                        }`}>
                        {alignmentStatus === 'ALIGNMENT OK' ? 'ALIGNMENT OK' : alignmentStatus}
                    </div>
                ) : (
                    <div className={`text-xs font-black uppercase px-2 py-0.5 rounded border ${alignmentStatus === 'DIVERGENCE'
                        ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                        : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                        }`}>
                        {alignmentStatus}
                    </div>
                )}
            </div>

            {/* ── Toggle Tabs: Briefing / Tactical ── */}
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-none">
                <div className={`${useAppCompact ? 'inline-flex items-center gap-1 rounded-[12px] border border-white/[0.05] bg-slate-950/28 p-0.5' : 'inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-slate-950/35 p-0.5'} shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]`}>
                    <button
                        onClick={() => setActiveTab("briefing")}
                        className={`${insightTabBase} ${activeTab === "briefing"
                            ? "bg-amber-500/[0.08] text-amber-300 border border-amber-500/15 shadow-[inset_0_-1px_0_rgba(245,158,11,0.35)]"
                            : "text-slate-500 hover:text-slate-300 border border-transparent"
                            }`}
                    >
                        <Sun size={insightTabIconSize} />
                        BRIEFING
                    </button>
                    <button
                        onClick={() => setActiveTab("tactical")}
                        className={`${insightTabBase} ${activeTab === "tactical"
                            ? "bg-emerald-500/[0.08] text-emerald-300 border border-emerald-500/15 shadow-[inset_0_-1px_0_rgba(16,185,129,0.35)]"
                            : "text-slate-500 hover:text-slate-300 border border-transparent"
                            }`}
                    >
                        <FileText size={insightTabIconSize} />
                        TACTICAL
                    </button>
                </div>
                {activeTab === "briefing" && briefingData?.source && (
                    <span className="text-[10px] text-slate-500 font-mono">
                        {briefingData.source === "gemini" ? "AI" : "AUTO"}
                    </span>
                )}
            </div>

            {/* ── Tab Content ── */}
            <div className={`rounded-lg backdrop-blur-sm border ${activeTab === "tactical" ? sentimentBorder : 'border-amber-500/15'} p-2.5 mb-2.5 flex-none`}
                style={{
                    background: activeTab === "tactical"
                        ? (sentiment === 'BULLISH'
                            ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(15,23,42,0.4) 100%)'
                            : sentiment === 'BEARISH'
                                ? 'linear-gradient(135deg, rgba(244,63,94,0.06) 0%, rgba(15,23,42,0.4) 100%)'
                                : 'linear-gradient(135deg, rgba(148,163,184,0.04) 0%, rgba(15,23,42,0.4) 100%)')
                        : 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(15,23,42,0.4) 100%)',
                    boxShadow: activeTab === "tactical"
                        ? (sentiment === 'BULLISH'
                            ? '0 0 20px rgba(16,185,129,0.04), inset 0 1px 0 rgba(255,255,255,0.03)'
                            : sentiment === 'BEARISH'
                                ? '0 0 20px rgba(244,63,94,0.04), inset 0 1px 0 rgba(255,255,255,0.03)'
                                : 'inset 0 1px 0 rgba(255,255,255,0.03)')
                        : '0 0 20px rgba(245,158,11,0.04), inset 0 1px 0 rgba(255,255,255,0.03)'
                }}>

                {/* TACTICAL TAB */}
                {activeTab === "tactical" && (
                    <>
                        {isMarketActive ? (
                            <>
                                <div className={`text-xs font-bold mb-1.5 uppercase tracking-wide flex items-center gap-1.5 ${sentiment === 'BULLISH' ? 'text-emerald-300' :
                                    sentiment === 'BEARISH' ? 'text-rose-300' : 'text-white'
                                    }`}>
                                    <img src="/signum-sg-vectorized.svg" alt="AI" width={13} height={13} style={{ objectFit: 'contain' as const, filter: 'drop-shadow(0 0 2px rgba(245,158,11,0.3))', animation: 'aiLogoPulse 2.5s ease-in-out infinite' }} />
                                    {insightTitle}
                                </div>
                                {/* [V13.0] Visual divergence label — makes divergence status immediately felt */}
                                {isDivergent && (insightTitle?.includes('DIVERGENCE') || alignmentStatus === 'DIVERGENCE') && (
                                    <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-md"
                                        style={{ 
                                            background: 'linear-gradient(90deg, rgba(244,63,94,0.12) 0%, rgba(244,63,94,0.03) 100%)',
                                            border: '1px solid rgba(244,63,94,0.25)'
                                        }}>
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
                                        <span className="text-[11px] font-bold text-rose-300 tracking-wider uppercase">
                                            {sentiment === 'BEARISH' 
                                                ? 'FALSE RALLY \u2014 INDEX \u2191 LIQUIDITY \u2193'
                                                : sentiment === 'BULLISH'
                                                    ? 'STEALTH INFLOW \u2014 INDEX \u2193 LIQUIDITY \u2191'
                                                    : 'SURFACE \u2260 INTERNAL FLOW'}
                                        </span>
                                    </div>
                                )}
                                <div className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-line overflow-y-auto custom-briefing-scroll pr-1.5" style={{ fontFamily: 'Pretendard, sans-serif', maxHeight: '145px' }}>
                                    {renderColoredText(insightDesc)}
                                </div>
                            </>
                        ) : (insightTitle || insightDesc) ? (
                            <>
                                <div className={`text-xs font-bold mb-1.5 uppercase tracking-wide flex items-center gap-1.5 ${sentiment === 'BULLISH' ? 'text-emerald-300' :
                                    sentiment === 'BEARISH' ? 'text-rose-300' : 'text-white'
                                    }`}>
                                    <img src="/signum-sg-vectorized.svg" alt="AI" width={13} height={13} style={{ objectFit: 'contain' as const, filter: 'drop-shadow(0 0 2px rgba(245,158,11,0.3))', animation: 'aiLogoPulse 2.5s ease-in-out infinite' }} />
                                    {insightTitle}
                                </div>
                                <div className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-line overflow-y-auto custom-briefing-scroll pr-1.5" style={{ fontFamily: 'Pretendard, sans-serif', maxHeight: '145px' }}>
                                    {renderColoredText(insightDesc)}
                                </div>
                                <div className="text-xs text-amber-500/50 font-mono mt-1.5 font-jakarta">Last session analysis</div>
                            </>
                        ) : (
                            <div className="flex items-center gap-3 py-1.5">
                                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                                    <Clock size={14} className="text-amber-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white/80">{t('insightPending')}</div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5 font-jakarta">Pre-Market 04:00 — Regular 09:30 ET</div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* BRIEFING TAB */}
                {activeTab === "briefing" && (
                    <>
                        {briefingLoading ? (
                            <div className="flex items-center gap-3 py-1.5">
                                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                                    <Sun size={14} className="text-amber-400" />
                                </div>
                                <div className="text-xs text-slate-300">Loading briefing...</div>
                            </div>
                        ) : briefingData?.briefing ? (
                            <>
                                <div className="text-xs font-bold mb-1.5 uppercase tracking-wide text-amber-300">
                                    🌅 MORNING BRIEFING
                                    <span className="ml-2 text-xs font-normal text-slate-400 font-mono">
                                        {briefingData.date}
                                    </span>
                                </div>
                                <div 
                                    className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-line overflow-y-auto custom-briefing-scroll pr-1.5" 
                                    style={{ fontFamily: 'Pretendard, sans-serif', maxHeight: '155px' }}
                                >
                                    {renderColoredText(briefingData.briefing)}
                                </div>
                                {briefingData.generatedAt && (
                                    <div className="text-xs text-amber-500/50 font-mono mt-1.5 font-jakarta">
                                        Generated {new Date(briefingData.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })} ET
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-3 py-1.5">
                                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                                    <Sun size={14} className="text-amber-400" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white/80">Morning Briefing</div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5 font-jakarta">Generated daily at 08:00 ET</div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ─── PREMIUM INVISIBLE SCROLLBAR CSS ─── */}
            <style dangerouslySetInnerHTML={{__html: `
                .custom-briefing-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: transparent transparent;
                    transition: scrollbar-color 0.3s ease;
                }
                .custom-briefing-scroll:hover {
                    scrollbar-color: rgba(245, 158, 11, 0.4) transparent;
                }
                .custom-briefing-scroll::-webkit-scrollbar {
                    width: 3.5px;
                }
                .custom-briefing-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-briefing-scroll::-webkit-scrollbar-thumb {
                    background-color: transparent;
                    border-radius: 4px;
                    transition: background-color 0.3s ease;
                }
                .custom-briefing-scroll:hover::-webkit-scrollbar-thumb {
                    background-color: rgba(245, 158, 11, 0.4);
                }
            `}} />

            {/* ─── MARKET BREADTH — Enhanced Visual Section ─── */}
            <div className="flex-1 flex flex-col space-y-3">
                {/* Breadth Header */}
                <div className="flex items-center justify-between flex-none">
                    <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        <GuardianTooltip sectionId="marketBreadth">
                            <span className="text-[12px] font-black text-white uppercase tracking-[0.15em] font-jakarta">MARKET BREADTH</span>
                        </GuardianTooltip>
                    </div>
                    <div className="flex items-center gap-2">
                        {isDivergent && breadthLive && (
                            <div className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span className="text-[12px] font-black text-rose-400 tracking-wider font-jakarta">DIV</span>
                            </div>
                        )}
                        {!breadthLive && (
                            <span className="text-[10.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded font-jakarta text-amber-400 bg-amber-500/10 border border-amber-500/25">
                                {t('breadthRegOnly')}
                            </span>
                        )}
                        <span
                            className="text-[12px] font-black uppercase tracking-wider px-2 py-0.5 rounded font-jakarta"
                            style={{
                                color: cfg.color,
                                backgroundColor: cfg.bg,
                                border: `1px solid ${cfg.color}25`
                            }}
                        >
                            {breadthLive ? breadthSignal : '—'}
                        </span>
                    </div>
                </div>

                {/* Big Score — Wave Tank (dimmed when the reading isn't a live REG-session one) */}
                <div className="flex-none" style={!breadthLive ? { opacity: 0.4, filter: 'saturate(0.5)' } : undefined}>
                    <BreadthLiquid breadthPct={breadthPct} signal={breadthSignal} loading={loading} signalColor={cfg.color} advancingLabel={t('advancing')} decliningLabel={t('declining')} />
                </div>

                {/* A/D Ratio + Volume Breadth — Card Style */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-none" style={!breadthLive ? { opacity: 0.4, filter: 'saturate(0.5)' } : undefined}>
                    {/* A/D Ratio Card — Glassmorphism */}
                    <div className="rounded-lg backdrop-blur-md bg-white/[0.04] border border-white/10 p-2.5 shadow-lg">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[12px] text-white font-bold uppercase tracking-wide">{t('adRatioLabel')}</span>
                                <span className="text-[12px] text-white/70">{t('adRatioDesc')}</span>
                            </div>
                            {adRatio >= 1 ? (
                                <TrendingUp className="w-3 h-3 text-emerald-400/70" />
                            ) : (
                                <TrendingDown className="w-3 h-3 text-rose-400/70" />
                            )}
                        </div>
                        <div className="flex items-baseline justify-between">
                            <div className={`text-lg font-mono font-black tabular-nums ${adRatio >= 1.5 ? 'text-emerald-400' : adRatio >= 1 ? 'text-emerald-300' : adRatio >= 0.7 ? 'text-amber-400' : 'text-rose-400'}`}>
                                {adRatio.toFixed(2)}
                                <span className="text-[12px] text-white/70 font-medium ml-1">: 1</span>
                            </div>
                            <span className="text-[12px] text-white/80 font-medium">{getAdLabel(adRatio)}</span>
                        </div>
                    </div>

                    {/* Volume Breadth Card — Glassmorphism */}
                    <div className="rounded-lg backdrop-blur-md bg-white/[0.04] border border-white/10 p-2.5 shadow-lg">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[12px] text-white font-bold uppercase tracking-wide">{t('volAnalysis')}</span>
                                <span className="text-[12px] text-white/70">{t('volBuyRatio')}</span>
                            </div>
                            <BarChart3 className="w-3 h-3 text-sky-400/70" />
                        </div>
                        <div className="flex items-baseline justify-between">
                            <div className={`text-lg font-mono font-black tabular-nums ${volumeBreadth >= 55 ? 'text-emerald-400' : volumeBreadth >= 45 ? 'text-white' : 'text-rose-400'}`}>
                                {volumeBreadth.toFixed(1)}
                                <span className="text-[12px] text-white/70 font-medium">%</span>
                            </div>
                            <span className="text-[12px] text-white/80 font-medium">{getVolLabel(volumeBreadth)}</span>
                        </div>
                    </div>
                </div>

                {/* Interpretation — only for a LIVE regular-session reading; otherwise the
                    pending notice (defaults like 50/50 must never read as real analysis) */}
                <div className="rounded-lg bg-slate-800/20 border border-slate-700/20 p-2.5 flex-none">
                    {breadthLive ? (
                        <>
                            <div className="flex items-start gap-1.5">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400/70 mt-0.5 flex-shrink-0" />
                                <div className="text-[12px] text-white leading-[1.6]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {getInterpretation()}
                                </div>
                            </div>
                            {isDivergent && getDivergenceText() && (
                                <div className="flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-rose-500/10">
                                    <AlertTriangle className="w-3 h-3 text-rose-400/70 mt-0.5 flex-shrink-0" />
                                    <div className="text-[12px] text-rose-300/70 leading-[1.6]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                        {getDivergenceText()}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex items-center gap-3 py-1.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                                <Radio size={14} className="text-amber-400" />
                            </div>
                            <div>
                                <div className="text-[12px] font-bold text-white/80">{t('breadthAnalysisPending')}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
