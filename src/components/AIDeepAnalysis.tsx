"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Clock, AlertTriangle, RefreshCw, Loader2, ChevronDown, ChevronUp, TrendingUp, BarChart3, Globe, Zap } from 'lucide-react';
import { useLocale } from 'next-intl';

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

// ── Section icon mapping ──
const sectionIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('기술') || t.includes('technical') || t.includes('技術')) return <TrendingUp size={12} className="text-cyan-400" />;
    if (t.includes('옵션') || t.includes('option') || t.includes('オプション') || t.includes('포지셔닝')) return <BarChart3 size={12} className="text-indigo-400" />;
    if (t.includes('뉴스') || t.includes('news') || t.includes('시장') || t.includes('ニュース')) return <Globe size={12} className="text-amber-400" />;
    return <Zap size={12} className="text-slate-400" />;
};

export function AIDeepAnalysis({ ticker, displayPrice, session, snapshot }: Props) {
    const locale = useLocale();
    const [analysis, setAnalysis] = useState<DeepAnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);
    const [openSections, setOpenSections] = useState<Set<number>>(new Set());
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

    // --- Helpers ---
    const riskConfig: Record<string, { bg: string; text: string; border: string; glow: string }> = {
        HIGH: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30', glow: 'rgba(244,63,94,0.15)' },
        MEDIUM: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', glow: 'rgba(245,158,11,0.12)' },
        LOW: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: 'rgba(16,185,129,0.12)' },
        NONE: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', glow: 'rgba(148,163,184,0.08)' },
    };

    const verdictColor = (state: string) => {
        if (!state) return { bar: '#f59e0b', label: 'NEUTRAL' };
        const s = state.toUpperCase();
        if (s.includes('BULLISH') || s.includes('상승') || s.includes('강세')) return { bar: '#10b981', label: 'BULLISH' };
        if (s.includes('BEARISH') || s.includes('하락') || s.includes('약세')) return { bar: '#f43f5e', label: 'BEARISH' };
        return { bar: '#f59e0b', label: 'NEUTRAL' };
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

    const toggleSection = (idx: number) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    // Extract description from currentState (text after —)
    const parts = analysis?.currentState?.split('—') || [];
    const shortVerdict = parts.length > 1 ? parts.slice(1).join('—').trim() : (analysis?.currentState || '');
    const verdict = analysis ? verdictColor(analysis.currentState) : { bar: '#f59e0b', label: 'NEUTRAL' };
    const risk = analysis ? riskConfig[analysis.riskFlag] || riskConfig.NONE : riskConfig.NONE;

    return (
        <div className="shrink-0 relative rounded-lg border border-white/10 overflow-hidden shadow-lg group hover:border-cyan-500/15 transition-all duration-300"
            style={{ background: 'linear-gradient(180deg, rgba(8,12,21,0.95) 0%, rgba(13,17,25,0.98) 100%)' }}>

            {/* ═══ AI Neural Background ═══ */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                {/* Neural mesh grid */}
                <div className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(30deg, rgba(6,182,212,0.04) 1px, transparent 1px),
                            linear-gradient(150deg, rgba(6,182,212,0.04) 1px, transparent 1px)
                        `,
                        backgroundSize: '32px 32px, 32px 32px',
                    }}
                />
                {/* AI neural glow — top-right */}
                <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, rgba(99,102,241,0.05) 40%, transparent 70%)' }}
                />
                {/* Data pulse — bottom-left */}
                <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }}
                />
                {/* Horizontal scan line */}
                <div className="absolute left-0 right-0 h-px opacity-30"
                    style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.4) 30%, rgba(6,182,212,0.6) 50%, rgba(6,182,212,0.4) 70%, transparent 100%)',
                        animation: 'aiScanline 10s ease-in-out infinite',
                    }}
                />
                {/* Corner brackets */}
                <div className="absolute top-0 right-0 w-16 h-16 border-r border-t border-cyan-500/15 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-16 h-16 border-l border-b border-indigo-500/15 rounded-bl-lg" />
                {/* Left accent bar */}
                <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500/30 via-indigo-500/15 to-transparent" />
            </div>

            {/* ═══ Scan line keyframe ═══ */}
            <style jsx>{`
                @keyframes aiScanline {
                    0%, 100% { top: 8%; opacity: 0; }
                    10% { opacity: 0.3; }
                    50% { top: 90%; opacity: 0.2; }
                    90% { opacity: 0; }
                }
                @keyframes aiPulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 1; }
                }
            `}</style>

            {/* ═══ Header ═══ */}
            <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between relative z-10"
                style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.06) 0%, rgba(99,102,241,0.04) 50%, transparent 100%)' }}>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Sparkles size={13} className="text-cyan-400" style={{ animation: 'aiPulse 3s ease-in-out infinite' }} />
                    </div>
                    <span className="text-[12px] font-black text-white uppercase tracking-[0.15em] font-jakarta">
                        AI Deep Analysis
                    </span>
                    <span className="text-[10px] bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
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
                            <p className="text-[13px] text-cyan-300 font-jakarta font-bold tracking-wider">
                                {locale === 'ko' ? 'AI 심층 분석 중...' : locale === 'ja' ? 'AI深層分析中...' : 'AI Deep Analysis in progress...'}
                            </p>
                            <p className="text-[12px] text-slate-300 font-jakarta mt-1">
                                {locale === 'ko' ? '모든 지표와 뉴스를 종합 분석하고 있습니다' : locale === 'ja' ? 'すべての指標とニュースを総合分析中' : 'Synthesizing all indicators and news'}
                            </p>
                        </div>
                        <div className="w-48 space-y-2 mt-1">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20" style={{ animation: 'shimmer 2s ease-in-out infinite', backgroundSize: '200% 100%' }} />
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
                    <button onClick={() => fetchAnalysis('FIRST_VIEW')}
                        className="mt-2 text-[12px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-jakarta">
                        <RefreshCw size={10} /> {locale === 'ko' ? '재시도' : locale === 'ja' ? '再試行' : 'Retry'}
                    </button>
                </div>
            )}

            {/* ═══ VERDICT BANNER + ACCORDION ═══ */}
            {analysis && expanded && (
                <div className="relative z-10">

                    {/* ─── ① Verdict Banner ─── */}
                    <div className="relative">
                        {/* Colored left accent bar */}
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r"
                            style={{ background: `linear-gradient(180deg, ${verdict.bar}, ${verdict.bar}88)` }} />

                        <div className="pl-4 pr-4 py-3.5"
                            style={{
                                background: `linear-gradient(90deg, ${verdict.bar}10 0%, transparent 60%)`,
                            }}>
                            {/* Verdict label */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[13px] font-black uppercase tracking-wider font-jakarta"
                                    style={{ color: verdict.bar }}>
                                    {verdict.label}
                                </span>
                                <span className="text-[12px] text-slate-400 font-jakarta">—</span>
                                <span className="text-[12px] text-slate-300 font-semibold font-jakarta truncate">
                                    {shortVerdict}
                                </span>
                            </div>

                            {/* Key Insight — promoted to main position */}
                            {analysis.keyInsight && (
                                <div className="mt-1 px-3 py-2.5 rounded-lg border border-cyan-500/15"
                                    style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(99,102,241,0.06) 100%)' }}>
                                    <div className="flex items-start gap-2">
                                        <Sparkles size={12} className="text-cyan-400 mt-0.5 shrink-0" style={{ animation: 'aiPulse 3s ease-in-out infinite' }} />
                                        <p className="text-[13px] text-slate-300 font-medium leading-relaxed" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                            {analysis.keyInsight}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Risk + Confidence + Time — integrated inline */}
                            <div className="flex items-center justify-between mt-2.5 flex-wrap gap-1.5">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[12px] px-2 py-0.5 rounded border font-bold font-jakarta ${risk.bg} ${risk.text} ${risk.border}`}>
                                        RISK: {analysis.riskFlag}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3].map(dot => (
                                            <div key={dot} className={`w-1.5 h-1.5 rounded-full ${dot <= (confidenceDots[analysis.confidence] || 0) ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                                        ))}
                                        <span className="text-[12px] text-slate-300 ml-0.5 font-jakarta">{analysis.confidence}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {loading && analysis && <Loader2 size={10} className="text-cyan-400 animate-spin" />}
                                    <span className="text-[12px] text-slate-300 font-mono font-jakarta flex items-center gap-1">
                                        <Clock size={10} />
                                        {timeAgo(analysis.generatedAt)}
                                    </span>
                                    {countdown && session !== 'CLOSED' && (
                                        <span className="text-[12px] text-slate-400 font-mono">
                                            {locale === 'ko' ? `다음 ${countdown}` : locale === 'ja' ? `次回 ${countdown}` : `Next: ${countdown}`}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => fetchAnalysis('SCHEDULED')}
                                        className="text-slate-400 hover:text-cyan-400 transition-colors"
                                        disabled={loading}
                                    >
                                        <RefreshCw size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── ② Accordion Sections ─── */}
                    {analysis.sections && analysis.sections.length > 0 && (
                        <div className="border-t border-white/[0.04]">
                            {analysis.sections.map((section, i) => {
                                const isOpen = openSections.has(i);
                                return (
                                    <div key={i} className={`${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                                        {/* Toggle header */}
                                        <button
                                            onClick={() => toggleSection(i)}
                                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                {sectionIcon(section.title)}
                                                <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider font-jakarta">
                                                    {section.title}
                                                </span>
                                            </div>
                                            <ChevronDown
                                                size={14}
                                                className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                            />
                                        </button>
                                        {/* Collapsible body */}
                                        <div
                                            className="overflow-hidden transition-all duration-300 ease-in-out"
                                            style={{
                                                maxHeight: isOpen ? '600px' : '0px',
                                                opacity: isOpen ? 1 : 0,
                                            }}
                                        >
                                            <div className="px-4 pb-3">
                                                <p className="text-[13px] text-slate-300 leading-[1.8]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                                    {section.content}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Fallback: narrative without sections */}
                    {!analysis.sections?.length && analysis.narrative && (
                        <div className="px-4 py-3 border-t border-white/[0.04]">
                            <p className="text-[13px] text-slate-300 leading-[1.8] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                {analysis.narrative}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Collapsed State ═══ */}
            {analysis && !expanded && (
                <div className="px-4 py-2.5 relative z-10 cursor-pointer flex items-center gap-2" onClick={() => setExpanded(true)}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: verdict.bar }} />
                    <span className="text-[13px] font-bold font-jakarta" style={{ color: verdict.bar }}>{verdict.label}</span>
                    <span className="text-[12px] text-slate-300 truncate flex-1">{shortVerdict}</span>
                    <ChevronDown size={14} className="text-slate-400 shrink-0" />
                </div>
            )}
        </div>
    );
}
