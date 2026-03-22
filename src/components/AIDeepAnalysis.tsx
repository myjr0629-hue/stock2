"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Clock, AlertTriangle, RefreshCw, Loader2, ChevronDown, ChevronUp, Newspaper, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useLocale } from 'next-intl';

interface NewsHeadline {
    title: string;
    age: string;
    sentiment: string;
    source: string;
}

interface NewsSummary {
    total: number;
    bullish: number;
    bearish: number;
    neutral: number;
    headlines: NewsHeadline[];
}

interface DeepAnalysisResult {
    currentState: string;
    narrative?: string;
    sections?: { title: string; content: string }[];
    keyInsight?: string;
    keyMetrics?: { label: string; value: string; note: string }[];
    riskFlag: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    generatedAt: string;
    elapsedMs: number;
    newsCount: number;
    newsSummary?: NewsSummary;
    fromCache: boolean;
    triggerReason: string;
    session: string;
}

interface Props {
    ticker: string;
    displayPrice: number;
    session: string;
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

const REFRESH_INTERVALS: Record<string, number> = {
    PRE: 60 * 60 * 1000,
    REG: 20 * 60 * 1000,
    POST: 60 * 60 * 1000,
    CLOSED: 0,
};

function getEffectiveInterval(session: string, earningsDaysUntil: number): number {
    const base = REFRESH_INTERVALS[session] || 0;
    if (earningsDaysUntil <= 3 && session === 'REG') return 15 * 60 * 1000;
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

    useEffect(() => {
        fetchAnalysis('FIRST_VIEW');
        return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    // Price move trigger (>1%)
    useEffect(() => {
        if (!lastAnalysisPriceRef.current || loading) return;
        const changePct = Math.abs((displayPrice - lastAnalysisPriceRef.current) / lastAnalysisPriceRef.current * 100);
        if (changePct >= 1.0 && session === 'REG') {
            console.log(`[AIDeepAnalysis] Price move ${changePct.toFixed(1)}% — re-analyzing`);
            fetchAnalysis('PRICE_MOVE');
        }
    }, [displayPrice, session, loading, fetchAnalysis]);

    // Gamma flip trigger
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

    // Countdown timer
    useEffect(() => {
        if (!nextRefreshRef.current) return;
        const timer = setInterval(() => {
            const remaining = nextRefreshRef.current - Date.now();
            if (remaining <= 0) { setCountdown(''); return; }
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            setCountdown(`${mins}:${String(secs).padStart(2, '0')}`);
        }, 1000);
        return () => clearInterval(timer);
    }, [analysis]);

    // --- Helper functions ---
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

    const sentimentIcon = (s: string) => {
        if (s === 'positive') return <TrendingUp size={10} className="text-emerald-400" />;
        if (s === 'negative') return <TrendingDown size={10} className="text-rose-400" />;
        return <Minus size={10} className="text-slate-400" />;
    };

    const sentimentColor = (s: string) => {
        if (s === 'positive') return 'text-emerald-400';
        if (s === 'negative') return 'text-rose-400';
        return 'text-slate-400';
    };

    // Format price for display
    const fmtPrice = (v: number) => v ? `$${v.toLocaleString()}` : 'N/A';

    return (
        <div className="shrink-0 relative rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-lg group hover:border-cyan-500/20 transition-colors">
            {/* ═══ Premium AI Infographic Background ═══ */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                {/* Neural network grid — subtle diagonal crosshatch */}
                <div className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(30deg, rgba(6,182,212,0.03) 1px, transparent 1px),
                            linear-gradient(150deg, rgba(6,182,212,0.03) 1px, transparent 1px),
                            linear-gradient(270deg, rgba(99,102,241,0.02) 1px, transparent 1px)
                        `,
                        backgroundSize: '40px 40px, 40px 40px, 30px 30px',
                    }}
                />
                {/* AI neural glow — top-right */}
                <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, rgba(99,102,241,0.04) 40%, transparent 70%)' }}
                />
                {/* Data pulse — bottom-left */}
                <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, rgba(6,182,212,0.03) 50%, transparent 70%)' }}
                />
                {/* Horizontal scan line animation */}
                <div className="absolute left-0 right-0 h-px opacity-40"
                    style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.3) 30%, rgba(6,182,212,0.5) 50%, rgba(6,182,212,0.3) 70%, transparent 100%)',
                        animation: 'scanline 8s ease-in-out infinite',
                    }}
                />
                {/* Corner brackets — institutional style */}
                <div className="absolute top-0 right-0 w-20 h-20 border-r-2 border-t-2 border-cyan-500/10 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-20 h-20 border-l-2 border-b-2 border-indigo-500/10 rounded-bl-xl" />
                {/* Vertical accent line — left edge */}
                <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500/20 via-indigo-500/10 to-transparent" />
                {/* Bottom accent gradient */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
            </div>

            {/* ═══ Scan line keyframe (injected once) ═══ */}
            <style jsx>{`
                @keyframes scanline {
                    0%, 100% { top: 10%; opacity: 0; }
                    10% { opacity: 0.4; }
                    50% { top: 85%; opacity: 0.3; }
                    90% { opacity: 0; }
                }
            `}</style>

            {/* ═══ Header ═══ */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-white/[0.04] via-white/[0.06] to-white/[0.04] relative z-10">
                <div className="flex items-center gap-2">
                    <Sparkles size={12} className="text-cyan-400" />
                    <span className="text-[12px] font-black text-white uppercase tracking-widest font-jakarta">
                        AI Deep Analysis
                    </span>
                    <span className="text-[10px] bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
                        CLAUDE S4
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {loading && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
                    {analysis?.triggerReason && analysis.triggerReason !== 'FIRST_VIEW' && (
                        <span className="text-[11px] text-amber-400/80 font-jakarta">
                            {triggerLabel[analysis.triggerReason] || ''}
                        </span>
                    )}
                    <button onClick={() => setExpanded(v => !v)} className="text-slate-400 hover:text-white transition-colors p-0.5">
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* ═══ Loading Skeleton ═══ */}
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

            {/* ═══ Error State ═══ */}
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

            {/* ═══ Analysis Result ═══ */}
            {analysis && expanded && (
                <div className="relative z-10">

                    {/* ─── Current State Banner ─── */}
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

                    {/* ─── Sections Body ─── */}
                    {analysis.sections && analysis.sections.length > 0 ? (
                        <div className="px-4 py-2 space-y-0">
                            {analysis.sections.map((section, i) => (
                                <div key={i} className={`py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                                    <div className="text-[12px] font-bold text-cyan-400/80 uppercase tracking-wider mb-1.5 font-jakarta">
                                        {section.title}
                                    </div>
                                    <p className="text-[13px] text-slate-300 leading-[1.8]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                        {section.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : analysis.narrative ? (
                        <div className="px-4 py-3">
                            <p className="text-[13px] text-slate-300 leading-[1.8] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                {analysis.narrative}
                            </p>
                        </div>
                    ) : null}

                    {/* ─── Key Insight (one-liner) ─── */}
                    {analysis.keyInsight && (
                        <div className="mx-4 mb-2 px-3 py-2 bg-cyan-950/40 rounded-lg border border-cyan-500/15">
                            <div className="flex items-start gap-2">
                                <Sparkles size={12} className="text-cyan-400 mt-0.5 shrink-0" />
                                <p className="text-[13px] text-cyan-100 font-medium leading-snug" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {analysis.keyInsight}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ─── News Summary Cards ─── */}
                    {analysis.newsSummary && analysis.newsSummary.total > 0 && (
                        <div className="mx-4 mb-3">
                            {/* News Header + Sentiment Bar */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <Newspaper size={11} className="text-indigo-400" />
                                    <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider font-jakarta">
                                        {locale === 'ko' ? '관련 뉴스' : locale === 'ja' ? '関連ニュース' : 'Related News'}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-jakarta">
                                        ({analysis.newsSummary.total})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-jakarta tabular-nums">
                                    {analysis.newsSummary.bullish > 0 && (
                                        <span className="flex items-center gap-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span className="text-emerald-400">{analysis.newsSummary.bullish}</span>
                                        </span>
                                    )}
                                    {analysis.newsSummary.neutral > 0 && (
                                        <span className="flex items-center gap-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                            <span className="text-slate-400">{analysis.newsSummary.neutral}</span>
                                        </span>
                                    )}
                                    {analysis.newsSummary.bearish > 0 && (
                                        <span className="flex items-center gap-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                            <span className="text-rose-400">{analysis.newsSummary.bearish}</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Sentiment Progress Bar */}
                            <div className="flex h-1 rounded-full overflow-hidden bg-slate-800/60 mb-2.5">
                                {analysis.newsSummary.bullish > 0 && (
                                    <div className="bg-emerald-500 transition-all" style={{ width: `${(analysis.newsSummary.bullish / analysis.newsSummary.total) * 100}%` }} />
                                )}
                                {analysis.newsSummary.neutral > 0 && (
                                    <div className="bg-slate-500/60 transition-all" style={{ width: `${(analysis.newsSummary.neutral / analysis.newsSummary.total) * 100}%` }} />
                                )}
                                {analysis.newsSummary.bearish > 0 && (
                                    <div className="bg-rose-500 transition-all" style={{ width: `${(analysis.newsSummary.bearish / analysis.newsSummary.total) * 100}%` }} />
                                )}
                            </div>

                            {/* Top Headlines */}
                            <div className="space-y-0">
                                {analysis.newsSummary.headlines.map((h, i) => (
                                    <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/[0.03] last:border-0">
                                        <div className="mt-1 shrink-0">{sentimentIcon(h.sentiment)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] text-slate-300 leading-snug line-clamp-2" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                                {h.title}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[10px] text-slate-500 font-jakarta">{h.source}</span>
                                                <span className="text-[10px] text-slate-600">·</span>
                                                <span className={`text-[10px] font-jakarta ${sentimentColor(h.sentiment)}`}>
                                                    {h.age}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── Footer — Risk + Confidence + Countdown ─── */}
                    <div className="px-4 py-2.5 border-t border-white/5 bg-slate-950/30 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded border font-bold font-jakarta ${riskColors[analysis.riskFlag] || riskColors.NONE}`}>
                                RISK: {analysis.riskFlag}
                            </span>
                            <div className="flex items-center gap-1">
                                {[1, 2, 3].map(dot => (
                                    <div key={dot} className={`w-1.5 h-1.5 rounded-full ${dot <= (confidenceDots[analysis.confidence] || 0) ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                                ))}
                                <span className="text-[11px] text-slate-400 ml-1 font-jakarta">{analysis.confidence}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {loading && analysis && <Loader2 size={10} className="text-cyan-400 animate-spin" />}
                            <span className="text-[11px] text-slate-400 font-mono font-jakarta flex items-center gap-1">
                                <Clock size={10} />
                                {timeAgo(analysis.generatedAt)}
                            </span>
                            {countdown && session !== 'CLOSED' && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                    {locale === 'ko' ? `다음 ${countdown}` : locale === 'ja' ? `次回 ${countdown}` : `Next: ${countdown}`}
                                </span>
                            )}
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

            {/* ═══ Collapsed State ═══ */}
            {analysis && !expanded && (
                <div className="px-4 py-2 relative z-10 cursor-pointer" onClick={() => setExpanded(true)}>
                    <p className="text-[12px] text-slate-300 truncate">{analysis.currentState}</p>
                </div>
            )}
        </div>
    );
}
