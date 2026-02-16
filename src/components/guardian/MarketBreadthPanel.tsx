import React from "react";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, MessageSquare, Lightbulb, Clock, Radio } from "lucide-react";
import { useTranslations } from 'next-intl';

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
}

/**
 * RLSIInsightPanel V7.7 — Breadth-Enhanced
 * TACTICAL INSIGHT 축소 + MARKET BREADTH 시각화 강화
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
    isMarketActive = true
}: RLSIInsightPanelProps) {
    const t = useTranslations('guardian');

    const signalConfig: Record<string, { color: string; bg: string; label: string }> = {
        STRONG: { color: "#34d399", bg: "rgba(52,211,153,0.08)", label: t('signalStrong') },
        HEALTHY: { color: "#6ee7b7", bg: "rgba(110,231,183,0.08)", label: t('signalHealthy') },
        NEUTRAL: { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", label: t('signalNeutral') },
        WEAK: { color: "#fb923c", bg: "rgba(251,146,60,0.08)", label: t('signalWeak') },
        CRITICAL: { color: "#f43f5e", bg: "rgba(244,63,94,0.08)", label: t('signalCritical') }
    };

    const cfg = signalConfig[breadthSignal] || signalConfig.NEUTRAL;

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

    return (
        <div className="flex flex-col h-full p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2 flex-none">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs uppercase tracking-[0.2em] text-white font-black font-jakarta">
                        RLSI INSIGHT
                    </span>
                    <span className="text-[12px] text-amber-500 font-mono font-jakarta">· Regular Session Only</span>
                </div>
                <div className={`text-[12px] font-black uppercase px-2 py-0.5 rounded border ${alignmentStatus === 'DIVERGENCE'
                    ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                    : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    }`}>
                    {alignmentStatus}
                </div>
            </div>

            {/* TACTICAL INSIGHT — Glassmorphism, news-enhanced */}
            <div className={`rounded-lg backdrop-blur-sm border ${sentimentBorder} p-3 mb-3 flex-none`}
                style={{
                    background: sentiment === 'BULLISH'
                        ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(15,23,42,0.4) 100%)'
                        : sentiment === 'BEARISH'
                            ? 'linear-gradient(135deg, rgba(244,63,94,0.06) 0%, rgba(15,23,42,0.4) 100%)'
                            : 'linear-gradient(135deg, rgba(148,163,184,0.04) 0%, rgba(15,23,42,0.4) 100%)',
                    boxShadow: sentiment === 'BULLISH'
                        ? '0 0 20px rgba(16,185,129,0.04), inset 0 1px 0 rgba(255,255,255,0.03)'
                        : sentiment === 'BEARISH'
                            ? '0 0 20px rgba(244,63,94,0.04), inset 0 1px 0 rgba(255,255,255,0.03)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.03)'
                }}>
                {isMarketActive ? (
                    <>
                        <div className={`text-[12px] font-bold mb-1.5 uppercase tracking-wide ${sentiment === 'BULLISH' ? 'text-emerald-300' :
                            sentiment === 'BEARISH' ? 'text-rose-300' : 'text-white'
                            }`}>
                            {insightTitle}
                        </div>
                        <div className="text-[13px] text-white/80 leading-[1.6] line-clamp-4" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {insightDesc}
                        </div>
                    </>
                ) : (insightTitle || insightDesc) ? (
                    <>
                        <div className={`text-[12px] font-bold mb-1.5 uppercase tracking-wide ${sentiment === 'BULLISH' ? 'text-emerald-300' :
                            sentiment === 'BEARISH' ? 'text-rose-300' : 'text-white'
                            }`}>
                            {insightTitle}
                        </div>
                        <div className="text-[13px] text-white/80 leading-[1.6] line-clamp-4" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {insightDesc}
                        </div>
                        <div className="text-[12px] text-amber-500/50 font-mono mt-1.5 font-jakarta">Last session analysis</div>
                    </>
                ) : (
                    <div className="flex items-center gap-3 py-1.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                            <Clock size={14} className="text-amber-400" />
                        </div>
                        <div>
                            <div className="text-[12px] font-bold text-white/80">{t('insightPending')}</div>
                            <div className="text-[12px] text-slate-400 font-mono mt-0.5 font-jakarta">Regular Session 09:30-16:00 ET</div>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── MARKET BREADTH — Enhanced Visual Section ─── */}
            <div className="flex-1 flex flex-col space-y-3">
                {/* Breadth Header */}
                <div className="flex items-center justify-between flex-none">
                    <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        <span className="text-[12px] font-black text-white uppercase tracking-[0.15em] font-jakarta">MARKET BREADTH</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isDivergent && (
                            <div className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span className="text-[12px] font-black text-rose-400 tracking-wider font-jakarta">DIV</span>
                            </div>
                        )}
                        <span
                            className="text-[12px] font-black uppercase tracking-wider px-2 py-0.5 rounded font-jakarta"
                            style={{
                                color: cfg.color,
                                backgroundColor: cfg.bg,
                                border: `1px solid ${cfg.color}25`
                            }}
                        >
                            {breadthSignal}
                        </span>
                    </div>
                </div>

                {/* Big Score + Enhanced Progress Bar */}
                <div className="flex-none">
                    <div className="flex items-baseline gap-2 mb-1.5">
                        <span className="text-2xl font-mono font-black text-white tabular-nums">
                            {loading ? '--' : Math.round(breadthPct)}
                            <span className="text-sm text-slate-300 font-bold">%</span>
                        </span>
                        <span className="text-[12px] text-white/70">{t('advancingRatio')}</span>
                    </div>
                    {/* Dual-tone progress bar */}
                    <div className="relative h-3 bg-slate-800/80 rounded-full overflow-hidden">
                        {/* Advancing (left, green) */}
                        <div
                            className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                                width: `${Math.min(100, Math.max(2, breadthPct))}%`,
                                background: `linear-gradient(90deg, ${cfg.color}66, ${cfg.color})`,
                                boxShadow: `0 0 12px ${cfg.color}40`
                            }}
                        />
                        {/* Center marker at 50% */}
                        <div className="absolute left-1/2 top-0 w-[1px] h-full bg-white/20" />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[12px] text-emerald-400/80 font-bold">{t('advancing')}</span>
                        <span className="text-[12px] text-white/60">50%</span>
                        <span className="text-[12px] text-rose-400/80 font-bold">{t('declining')}</span>
                    </div>
                </div>

                {/* A/D Ratio + Volume Breadth — Card Style */}
                <div className="grid grid-cols-2 gap-2 flex-none">
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

                {/* Interpretation — Easy to understand */}
                <div className="rounded-lg bg-slate-800/20 border border-slate-700/20 p-2.5 flex-none">
                    {isMarketActive ? (
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
