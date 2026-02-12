import React from "react";
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, MessageSquare, Lightbulb } from "lucide-react";

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

    const signalConfig: Record<string, { color: string; bg: string; label: string }> = {
        STRONG: { color: "#34d399", bg: "rgba(52,211,153,0.08)", label: "강세" },
        HEALTHY: { color: "#6ee7b7", bg: "rgba(110,231,183,0.08)", label: "건강" },
        NEUTRAL: { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", label: "중립" },
        WEAK: { color: "#fb923c", bg: "rgba(251,146,60,0.08)", label: "약세" },
        CRITICAL: { color: "#f43f5e", bg: "rgba(244,63,94,0.08)", label: "위험" }
    };

    const cfg = signalConfig[breadthSignal] || signalConfig.NEUTRAL;

    const sentimentBorder = sentiment === 'BULLISH' ? 'border-emerald-500/20' :
        sentiment === 'BEARISH' ? 'border-rose-500/20' : 'border-slate-700/50';

    // A/D Ratio 해석
    const getAdLabel = (ratio: number) => {
        if (ratio >= 3) return '압도적 매수';
        if (ratio >= 1.5) return '매수 우위';
        if (ratio >= 1) return '균형';
        if (ratio >= 0.7) return '매도 우위';
        return '압도적 매도';
    };

    // Volume Breadth 해석
    const getVolLabel = (vol: number) => {
        if (vol >= 70) return '강한 매수세';
        if (vol >= 55) return '매수세 우위';
        if (vol >= 45) return '균형';
        if (vol >= 30) return '매도세 우위';
        return '강한 매도세';
    };

    // 자동 해석 문구
    const getInterpretation = () => {
        const advancing = Math.round(breadthPct);
        const declining = 100 - advancing;

        if (breadthPct >= 70 && adRatio >= 2) {
            return `상승 ${advancing}% vs 하락 ${declining}% — 시장 전반이 동반 상승 중. 광범위한 매수세가 확인되어 상승 신뢰도가 높습니다.`;
        }
        if (breadthPct >= 55) {
            return `상승 ${advancing}% vs 하락 ${declining}% — 과반 이상 종목이 상승하고 있어 전반적으로 건강한 시장입니다.`;
        }
        if (breadthPct >= 45) {
            return `상승 ${advancing}% vs 하락 ${declining}% — 상승·하락이 혼재. 특정 섹터 쏠림 가능성이 있어 주의가 필요합니다.`;
        }
        if (breadthPct >= 30) {
            return `상승 ${advancing}% vs 하락 ${declining}% — 하락 종목이 우세. 지수 상승이 소수 대형주에 의존할 수 있습니다.`;
        }
        return `상승 ${advancing}% vs 하락 ${declining}% — 광범위한 매도세. 시장 전반의 약세 신호로 리스크 관리가 필요합니다.`;
    };

    // Divergence 해석
    const getDivergenceText = () => {
        if (!isDivergent) return null;
        return '⚠ 지수는 상승하나 대부분 종목이 하락 — 소수 종목이 지수를 끌어올리고 있어 상승 지속력에 의문이 있습니다.';
    };

    return (
        <div className="flex flex-col h-full p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2 flex-none">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs uppercase tracking-[0.2em] text-white font-black">
                        RLSI INSIGHT
                    </span>
                </div>
                <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${alignmentStatus === 'DIVERGENCE'
                    ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                    : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    }`}>
                    {alignmentStatus}
                </div>
            </div>

            {/* TACTICAL INSIGHT — Compact, 2-line max */}
            <div className={`rounded-lg bg-slate-900/30 border ${sentimentBorder} p-2.5 mb-3 flex-none`}>
                {isMarketActive ? (
                    <>
                        <div className={`text-[10px] font-bold mb-1 uppercase tracking-wide ${sentiment === 'BULLISH' ? 'text-emerald-300' :
                            sentiment === 'BEARISH' ? 'text-rose-300' : 'text-white'
                            }`}>
                            {insightTitle}
                        </div>
                        <div className="text-xs text-white/70 leading-[1.5] line-clamp-2" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {insightDesc}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2 py-1">
                        <span className="text-amber-400 text-sm">⏸</span>
                        <span className="text-[12px] font-bold text-amber-400">본장에서 실시간 분석이 진행됩니다</span>
                    </div>
                )}
            </div>

            {/* ─── MARKET BREADTH — Enhanced Visual Section ─── */}
            <div className="flex-1 flex flex-col space-y-3">
                {/* Breadth Header */}
                <div className="flex items-center justify-between flex-none">
                    <div className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">MARKET BREADTH</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isDivergent && (
                            <div className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span className="text-[8px] font-black text-rose-400 tracking-wider">DIV</span>
                            </div>
                        )}
                        <span
                            className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
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
                            <span className="text-sm text-slate-500 font-bold">%</span>
                        </span>
                        <span className="text-[10px] text-white/50">상승 종목 비율</span>
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
                        <span className="text-[8px] text-emerald-400/60 font-bold">▲ 상승</span>
                        <span className="text-[8px] text-white/30">50%</span>
                        <span className="text-[8px] text-rose-400/60 font-bold">▼ 하락</span>
                    </div>
                </div>

                {/* A/D Ratio + Volume Breadth — Card Style */}
                <div className="grid grid-cols-2 gap-2 flex-none">
                    {/* A/D Ratio Card — Glassmorphism */}
                    <div className="rounded-lg backdrop-blur-md bg-white/[0.04] border border-white/10 p-2.5 shadow-lg">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[9px] text-white font-bold uppercase tracking-wide">A/D 비율</span>
                                <span className="text-[8px] text-white/50">상승 ÷ 하락</span>
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
                                <span className="text-[9px] text-white/40 font-medium ml-1">: 1</span>
                            </div>
                            <span className="text-[9px] text-white/60 font-medium">{getAdLabel(adRatio)}</span>
                        </div>
                    </div>

                    {/* Volume Breadth Card — Glassmorphism */}
                    <div className="rounded-lg backdrop-blur-md bg-white/[0.04] border border-white/10 p-2.5 shadow-lg">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[9px] text-white font-bold uppercase tracking-wide">거래량 분석</span>
                                <span className="text-[8px] text-white/50">매수량 비율</span>
                            </div>
                            <BarChart3 className="w-3 h-3 text-sky-400/70" />
                        </div>
                        <div className="flex items-baseline justify-between">
                            <div className={`text-lg font-mono font-black tabular-nums ${volumeBreadth >= 55 ? 'text-emerald-400' : volumeBreadth >= 45 ? 'text-white' : 'text-rose-400'}`}>
                                {volumeBreadth.toFixed(1)}
                                <span className="text-[9px] text-white/40 font-medium">%</span>
                            </div>
                            <span className="text-[9px] text-white/60 font-medium">{getVolLabel(volumeBreadth)}</span>
                        </div>
                    </div>
                </div>

                {/* Interpretation — Easy to understand */}
                <div className="rounded-lg bg-slate-800/20 border border-slate-700/20 p-2.5 flex-none">
                    {isMarketActive ? (
                        <>
                            <div className="flex items-start gap-1.5">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-400/70 mt-0.5 flex-shrink-0" />
                                <div className="text-[11px] text-white leading-[1.6]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {getInterpretation()}
                                </div>
                            </div>
                            {isDivergent && getDivergenceText() && (
                                <div className="flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-rose-500/10">
                                    <AlertTriangle className="w-3 h-3 text-rose-400/70 mt-0.5 flex-shrink-0" />
                                    <div className="text-[10px] text-rose-300/70 leading-[1.6]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                        {getDivergenceText()}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex items-center gap-2 py-1">
                            <span className="text-amber-400 text-sm">⏸</span>
                            <span className="text-[12px] font-bold text-amber-400">본장에서 브레드스 분석이 진행됩니다</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
