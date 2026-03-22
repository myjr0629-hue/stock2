"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Clock, AlertTriangle, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

interface DeepAnalysisResult {
    currentState: string;
    narrative: string;
    keyMetrics: { label: string; value: string; note: string }[];
    riskFlag: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    generatedAt: string;
    elapsedMs: number;
    newsCount: number;
    fromCache: boolean;
    triggerReason: string;
    session: string;
}

interface Props {
    ticker: string;
    displayPrice: number;
    session: string;
    // Snapshot data collected from all Command page indicators
    snapshot: {
        price: number;
        priceChange: number;
        session: string;
        signalCore: {
            direction: string;
            conviction: string;
            condition: string;
            conclusion: string;
            bullCount: number;
            bearCount: number;
            bullSignals: string;
            bearSignals: string;
        };
        sma: { cross: string; sma50: number; sma200: number; trendPhase: string };
        vwap: number;
        vwapDistance: string;
        conviction: { score: number; grade: string };
        structure: {
            netGex: number;
            gammaFlipLevel: number;
            squeezeRisk: string;
            squeezeScore: number;
            pcRatio: number;
            callWall: number;
            putFloor: number;
            maxPain: number;
            gammaConcentration: number;
            gammaConcentrationLabel: string;
        };
        flow: { netPremium: number };
        fundamental: { score: number; grade: string; pe: number; fcfMargin: number };
        analyst: { score: number; buyPct: number };
        institutional: { dpRatio: number; activity: string };
        volatility: { regime: string; regimeScore: number; gexLong: number };
        squeeze: { status: string; siPercent: number };
        earnings: { daysUntil: number; date: string; estimatedEps: number };
        relatedTickers: string[];
    };
}

// Session-based refresh intervals (ms)
const REFRESH_INTERVALS: Record<string, number> = {
    PRE: 60 * 60 * 1000,     // 60 min
    REG: 20 * 60 * 1000,     // 20 min
    POST: 60 * 60 * 1000,    // 60 min
    CLOSED: 0,                // No auto-refresh
};

// Earnings proximity override
function getEffectiveInterval(session: string, earningsDaysUntil: number): number {
    const base = REFRESH_INTERVALS[session] || 0;
    if (earningsDaysUntil <= 3 && session === 'REG') return 15 * 60 * 1000; // 15 min near earnings
    return base;
}

export function AIDeepAnalysis({ ticker, displayPrice, session, snapshot }: Props) {
    const locale = useLocale();
    const [analysis, setAnalysis] = useState<DeepAnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);
    const lastAnalysisPriceRef = useRef<number>(0);
    const lastGammaFlipRef = useRef<number>(0);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [countdown, setCountdown] = useState<string>('');
    const nextRefreshRef = useRef<number>(0);

    // --- Fetch Analysis ---
    const fetchAnalysis = useCallback(async (triggerReason: string = 'FIRST_VIEW') => {
        if (loading) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/command/deep-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, locale, snapshot, triggerReason }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            setAnalysis(data);
            lastAnalysisPriceRef.current = displayPrice;
            lastGammaFlipRef.current = snapshot.structure?.gammaFlipLevel || 0;

            // Schedule next refresh
            const interval = getEffectiveInterval(session, snapshot.earnings?.daysUntil || 999);
            if (interval > 0) {
                nextRefreshRef.current = Date.now() + interval;
                if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = setTimeout(() => fetchAnalysis('SCHEDULED'), interval);
            }
        } catch (e: any) {
            setError(e.message);
            console.error('[AIDeepAnalysis] Error:', e.message);
        } finally {
            setLoading(false);
        }
    }, [ticker, locale, snapshot, session, displayPrice, loading]);

    // --- Initial Fetch ---
    useEffect(() => {
        fetchAnalysis('FIRST_VIEW');
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]); // Only re-run when ticker changes

    // --- Price Move Trigger (>1% change) ---
    useEffect(() => {
        if (!lastAnalysisPriceRef.current || loading) return;
        const changePct = Math.abs((displayPrice - lastAnalysisPriceRef.current) / lastAnalysisPriceRef.current * 100);

        if (changePct >= 1.0 && session === 'REG') {
            console.log(`[AIDeepAnalysis] Price move ${changePct.toFixed(1)}% — re-analyzing`);
            fetchAnalysis('PRICE_MOVE');
        }
    }, [displayPrice, session, loading, fetchAnalysis]);

    // --- Gamma Flip Trigger ---
    useEffect(() => {
        const currentFlip = snapshot.structure?.gammaFlipLevel || 0;
        const lastFlip = lastGammaFlipRef.current;
        if (!lastFlip || !currentFlip || loading) return;

        const priceWasAbove = displayPrice > lastFlip;
        const priceIsAbove = displayPrice > currentFlip;
        if (priceWasAbove !== priceIsAbove && session === 'REG') {
            console.log('[AIDeepAnalysis] Gamma Flip zone change — re-analyzing');
            fetchAnalysis('GAMMA_FLIP');
        }
    }, [snapshot.structure?.gammaFlipLevel, displayPrice, session, loading, fetchAnalysis]);

    // --- Countdown Timer ---
    useEffect(() => {
        if (!nextRefreshRef.current) return;
        const timer = setInterval(() => {
            const remaining = nextRefreshRef.current - Date.now();
            if (remaining <= 0) {
                setCountdown('');
                return;
            }
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            setCountdown(`${mins}:${String(secs).padStart(2, '0')}`);
        }, 1000);
        return () => clearInterval(timer);
    }, [analysis]);

    // --- UI ---
    const riskColors: Record<string, string> = {
        HIGH: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        LOW: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        NONE: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
    };
    const confidenceDots: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    const timeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return locale === 'ko' ? '방금 전' : locale === 'ja' ? 'たった今' : 'Just now';
        if (mins < 60) return locale === 'ko' ? `${mins}분 전` : locale === 'ja' ? `${mins}分前` : `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        return locale === 'ko' ? `${hrs}시간 전` : locale === 'ja' ? `${hrs}時間前` : `${hrs}h ago`;
    };

    const triggerLabel: Record<string, string> = {
        FIRST_VIEW: '',
        SCHEDULED: locale === 'ko' ? '정기 갱신' : locale === 'ja' ? '定期更新' : 'Scheduled',
        PRICE_MOVE: locale === 'ko' ? '가격 변동 감지' : locale === 'ja' ? '価格変動検知' : 'Price Move',
        GAMMA_FLIP: locale === 'ko' ? '감마 플립 감지' : locale === 'ja' ? 'ガンマフリップ検知' : 'Gamma Flip',
    };

    return (
        <div className="shrink-0 relative rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-lg group hover:border-cyan-500/20 transition-colors">
            {/* Infographic BG */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(6,182,212,0.04)_25%,transparent_25%,transparent_50%,rgba(6,182,212,0.04)_50%,rgba(6,182,212,0.04)_75%,transparent_75%)] bg-[size:60px_60px]" />
                <div className="absolute -bottom-10 -right-10 w-56 h-56 bg-[radial-gradient(circle,rgba(6,182,212,0.08)_0%,transparent_70%)]" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                <div className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-cyan-500/10 rounded-tr-2xl" />
            </div>

            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 relative z-10">
                <div className="flex items-center gap-2">
                    <Sparkles size={12} className="text-cyan-400" />
                    <span className="text-[12px] font-black text-white uppercase tracking-widest font-jakarta">
                        AI Deep Analysis
                    </span>
                    <span className="text-[12px] bg-cyan-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
                        CLAUDE S4
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {loading && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
                    {analysis?.triggerReason && analysis.triggerReason !== 'FIRST_VIEW' && (
                        <span className="text-[12px] text-amber-400/80 font-jakarta">
                            {triggerLabel[analysis.triggerReason] || ''}
                        </span>
                    )}
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="text-slate-400 hover:text-white transition-colors p-0.5"
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* Loading Skeleton */}
            {loading && !analysis && (
                <div className="p-6 relative z-10">
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 flex items-center justify-center">
                                <Sparkles size={18} className="text-cyan-400 animate-pulse" />
                            </div>
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDuration: '2s' }} />
                        </div>
                        <div className="text-center">
                            <p className="text-[13px] text-cyan-200 font-jakarta font-bold tracking-wider">
                                {locale === 'ko' ? 'AI 심층 분석 중...' : locale === 'ja' ? 'AI深層分析中...' : 'AI Deep Analysis in progress...'}
                            </p>
                            <p className="text-[12px] text-slate-300 font-jakarta mt-1">
                                {locale === 'ko' ? '모든 지표와 뉴스를 종합 분석하고 있습니다' : locale === 'ja' ? 'すべての指標とニュースを総合分析中' : 'Synthesizing all indicators and news'}
                            </p>
                        </div>
                        <div className="w-48 space-y-2 mt-1">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20" style={{ animation: 'shimmer 2s ease-in-out infinite', backgroundSize: '200% 100%' }} />
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20 w-3/4" style={{ animation: 'shimmer 2s ease-in-out infinite 0.3s', backgroundSize: '200% 100%' }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && !loading && (
                <div className="p-4 relative z-10">
                    <div className="flex items-center gap-2 text-rose-400 mb-2">
                        <AlertTriangle size={14} />
                        <span className="text-[12px] font-bold font-jakarta">Analysis Error</span>
                    </div>
                    <p className="text-[12px] text-slate-300">{error}</p>
                    <button
                        onClick={() => fetchAnalysis('FIRST_VIEW')}
                        className="mt-2 text-[12px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-jakarta"
                    >
                        <RefreshCw size={10} /> {locale === 'ko' ? '재시도' : locale === 'ja' ? '再試行' : 'Retry'}
                    </button>
                </div>
            )}

            {/* Analysis Result */}
            {analysis && expanded && (
                <div className="relative z-10">
                    {/* Current State Banner */}
                    <div className="px-4 py-3 border-b border-white/5"
                        style={{
                            background: analysis.riskFlag === 'HIGH'
                                ? 'linear-gradient(90deg, rgba(244,63,94,0.08) 0%, transparent 60%)'
                                : analysis.currentState?.includes('BULLISH') || analysis.currentState?.includes('상승') || analysis.currentState?.includes('강세')
                                    ? 'linear-gradient(90deg, rgba(16,185,129,0.08) 0%, transparent 60%)'
                                    : analysis.currentState?.includes('BEARISH') || analysis.currentState?.includes('하락') || analysis.currentState?.includes('약세')
                                        ? 'linear-gradient(90deg, rgba(244,63,94,0.08) 0%, transparent 60%)'
                                        : 'linear-gradient(90deg, rgba(148,163,184,0.05) 0%, transparent 60%)'
                        }}
                    >
                        <p className="text-[13px] font-bold text-white leading-snug" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {analysis.currentState}
                        </p>
                    </div>

                    {/* Narrative Body */}
                    <div className="px-4 py-3">
                        <p className="text-[13px] text-slate-300 leading-[1.8] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {analysis.narrative}
                        </p>
                    </div>

                    {/* Key Metrics Grid */}
                    {analysis.keyMetrics && analysis.keyMetrics.length > 0 && (
                        <div className="px-4 pb-3">
                            <div className="grid grid-cols-2 gap-2">
                                {analysis.keyMetrics.map((metric, i) => (
                                    <div key={i} className="bg-slate-800/40 rounded-lg px-3 py-2 border border-white/5">
                                        <div className="text-[12px] text-slate-400 font-bold tracking-wide font-jakarta">{metric.label}</div>
                                        <div className="text-[13px] font-black text-white mt-0.5">{metric.value}</div>
                                        {metric.note && (
                                            <div className="text-[12px] text-slate-300 mt-0.5">{metric.note}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer — Risk + Confidence + Countdown */}
                    <div className="px-4 py-2.5 border-t border-white/5 bg-slate-950/30 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            {/* Risk Flag */}
                            <span className={`text-[12px] px-2 py-0.5 rounded border font-bold font-jakarta ${riskColors[analysis.riskFlag] || riskColors.NONE}`}>
                                RISK: {analysis.riskFlag}
                            </span>
                            {/* Confidence Dots */}
                            <div className="flex items-center gap-1">
                                {[1, 2, 3].map(dot => (
                                    <div
                                        key={dot}
                                        className={`w-1.5 h-1.5 rounded-full ${dot <= (confidenceDots[analysis.confidence] || 0) ? 'bg-cyan-400' : 'bg-slate-600'}`}
                                    />
                                ))}
                                <span className="text-[12px] text-slate-400 ml-1 font-jakarta">{analysis.confidence}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* loading indicator for background refresh */}
                            {loading && analysis && (
                                <Loader2 size={10} className="text-cyan-400 animate-spin" />
                            )}
                            {/* Time ago */}
                            <span className="text-[12px] text-slate-400 font-mono font-jakarta flex items-center gap-1">
                                <Clock size={10} />
                                {timeAgo(analysis.generatedAt)}
                            </span>
                            {/* Countdown to next refresh */}
                            {countdown && session !== 'CLOSED' && (
                                <span className="text-[12px] text-slate-500 font-mono">
                                    {locale === 'ko' ? `다음 갱신 ${countdown}` : locale === 'ja' ? `次回更新 ${countdown}` : `Next: ${countdown}`}
                                </span>
                            )}
                            {/* Manual refresh */}
                            <button
                                onClick={() => fetchAnalysis('SCHEDULED')}
                                className="text-slate-500 hover:text-cyan-400 transition-colors"
                                disabled={loading}
                                title={locale === 'ko' ? '수동 갱신' : 'Refresh'}
                            >
                                <RefreshCw size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Collapsed State */}
            {analysis && !expanded && (
                <div className="px-4 py-2 relative z-10 cursor-pointer" onClick={() => setExpanded(true)}>
                    <p className="text-[12px] text-slate-300 truncate">{analysis.currentState}</p>
                </div>
            )}
        </div>
    );
}
