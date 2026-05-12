"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, AlertTriangle, RefreshCw, Loader2, ChevronDown, TrendingUp, TrendingDown, BarChart3, Zap, Shield } from 'lucide-react';
import { CardTooltip, COMMAND_TOOLTIPS } from '@/components/ui/CardTooltip';
import { useLocale } from 'next-intl';

// Helper: extract locale-specific text from trilingual object or fallback string
type Trilingual = string | { ko?: string; en?: string; ja?: string };
function extractLocale(val: Trilingual | undefined, locale: string): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return (val as any)[locale] || val.en || val.ko || '';
}

// ── SIGNUM AI Icon (brand logo with amber glow pulse) ──
function SignumAIIcon({ size = 16, className = '', glow = true }: { size?: number; className?: string; glow?: boolean }) {
    return (
        <img
            src="/signum-sg-vectorized.svg"
            alt="AI"
            width={size}
            height={size}
            className={className}
            style={{
                objectFit: 'contain' as const,
                ...(glow ? {
                    filter: 'drop-shadow(0 0 3px rgba(245,158,11,0.35)) drop-shadow(0 0 1px rgba(245,158,11,0.25))',
                    animation: 'aiLogoPulse 2.5s ease-in-out infinite',
                } : {}),
            }}
        />
    );
}

interface FactorHighlight {
    factor: string;
    insight: Trilingual;
    impact: 'bull' | 'bear' | 'mixed';
}

interface FlowAnalysisResult {
    structuralThesis: Trilingual;
    factorHighlights: FactorHighlight[];
    repricingCondition: Trilingual;
    riskAssessment: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    generatedAt: string;
    elapsedMs: number;
    fromCache: boolean;
    triggerReason: string;
    session: string;
}

interface FlowAIAnalysisProps {
    ticker: string;
    isSystemReady: boolean;
    isMarketClosed: boolean;
    flowData: {
        currentPrice: number;
        compositeScore: number;
        session: string;
        position: {
            putFloor: number;
            callWall: number;
            distToPut: string;
            distToCall: string;
            zone: string;
        };
        factors: {
            opi?: { value: number; score: number; label: string };
            whale?: { premium: string; score: number; bias: string };
            squeeze?: { probability: number; score: number; label: string };
            ivSkew?: { value: number; score: number; label: string };
            smartMoney?: { score: number; label: string };
            dex?: { value: number; score: number; label: string };
            uoa?: { score: number; label: string };
            pcRatio?: { value: number; score: number };
            gex?: { pinStrength: number; score: number; regime: string };
        };
        regime: {
            ivPercentile: number;
            impliedMove: string;
            maxPain: number;
            maxPainDist: string;
            gammaFlipLevel: number;
            flipPercentage: number;
            gexRegime: string;
        };
        alphaTrade?: {
            type: string;
            strike: number;
            premium: string;
            expiry: string;
            impact: string;
        };
        ruleVerdict?: {
            status: string;
        };
    };
}

const REFRESH_INTERVALS: Record<string, number> = {
    PRE: 60 * 60 * 1000,
    REG: 15 * 60 * 1000,
    POST: 60 * 60 * 1000,
    CLOSED: 0,
};

export function FlowAIAnalysis({ ticker, isSystemReady, isMarketClosed, flowData }: FlowAIAnalysisProps) {
    const locale = useLocale();
    const [analysis, setAnalysis] = useState<FlowAnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());
    const lastPriceRef = useRef<number>(0);
    const lastSqueezeRef = useRef<number>(0);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [countdown, setCountdown] = useState<string>('');
    const nextRefreshRef = useRef<number>(0);
    const hasFetched = useRef(false);

    const fetchAnalysis = useCallback(async (triggerReason: string = 'FIRST_LOAD') => {
        if (loading) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/flow/ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, locale, flowData, triggerReason }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            setAnalysis(data);
            lastPriceRef.current = flowData.currentPrice;
            lastSqueezeRef.current = flowData.factors.squeeze?.probability || 0;

            const session = flowData.session || 'CLOSED';
            const interval = REFRESH_INTERVALS[session] || 0;
            if (interval > 0) {
                nextRefreshRef.current = Date.now() + interval;
                if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = setTimeout(() => fetchAnalysis('SCHEDULED'), interval);
            }
        } catch (e: any) {
            setError(e.message);
            console.error('[FlowAI] Error:', e.message);
        } finally {
            setLoading(false);
        }
    }, [ticker, locale, flowData, loading]);

    // Initial fetch when system is ready
    useEffect(() => {
        if (isSystemReady && !hasFetched.current) {
            hasFetched.current = true;
            fetchAnalysis('FIRST_LOAD');
        }
        return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }, [isSystemReady]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset on ticker change
    useEffect(() => {
        hasFetched.current = false;
        setAnalysis(null);
        setError(null);
    }, [ticker]);

    // Price move trigger (>1.5%)
    useEffect(() => {
        if (!lastPriceRef.current || loading || !analysis) return;
        const changePct = Math.abs((flowData.currentPrice - lastPriceRef.current) / lastPriceRef.current * 100);
        if (changePct >= 1.5 && !isMarketClosed) {
            fetchAnalysis('PRICE_MOVE');
        }
    }, [flowData.currentPrice, isMarketClosed]); // eslint-disable-line react-hooks/exhaustive-deps

    // Squeeze threshold trigger
    useEffect(() => {
        if (!analysis || loading) return;
        const currentSqueeze = flowData.factors.squeeze?.probability || 0;
        const lastSqueeze = lastSqueezeRef.current;
        const crossedUp = lastSqueeze < 70 && currentSqueeze >= 70;
        const crossedDown = lastSqueeze >= 70 && currentSqueeze < 70;
        if ((crossedUp || crossedDown) && !isMarketClosed) {
            fetchAnalysis('SQUEEZE_CHANGE');
        }
    }, [flowData.factors.squeeze?.probability, isMarketClosed]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const riskConfig: Record<string, { bg: string; text: string; border: string }> = {
        HIGH: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
        MEDIUM: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
        LOW: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    };

    const impactIcon = (impact: string) => {
        if (impact === 'bull') return <TrendingUp size={12} className="text-emerald-400" />;
        if (impact === 'bear') return <TrendingDown size={12} className="text-rose-400" />;
        return <BarChart3 size={12} className="text-amber-400" />;
    };

    const impactColor = (impact: string) => {
        if (impact === 'bull') return 'border-emerald-500/20 bg-emerald-500/[0.04]';
        if (impact === 'bear') return 'border-rose-500/20 bg-rose-500/[0.04]';
        return 'border-amber-500/20 bg-amber-500/[0.04]';
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
        FIRST_LOAD: '',
        SCHEDULED: locale === 'ko' ? '정기 갱신' : locale === 'ja' ? '定期更新' : 'Scheduled',
        PRICE_MOVE: locale === 'ko' ? '가격 변동 감지' : locale === 'ja' ? '価格変動検知' : 'Price Move',
        SQUEEZE_CHANGE: locale === 'ko' ? '스퀴즈 레벨 변경' : locale === 'ja' ? 'スクイーズレベル変更' : 'Squeeze Level',
    };

    const toggleSection = (key: string) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const risk = analysis ? riskConfig[analysis.riskAssessment] || riskConfig.MEDIUM : riskConfig.MEDIUM;

    // Don't render until system is ready
    if (!isSystemReady && !analysis) return null;

    return (
        <div className="relative rounded-lg border border-amber-500/40 overflow-hidden shadow-lg transition-all duration-300"
            style={{ background: 'linear-gradient(180deg, rgba(8,12,21,0.95) 0%, rgba(13,17,25,0.98) 100%)', boxShadow: '0 0 24px rgba(245,158,11,0.18), 0 0 8px rgba(245,158,11,0.10), inset 0 0 12px rgba(245,158,11,0.04)' }}>

            {/* ═══ AI Neural Background ═══ */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute inset-0"
                    style={{
                        backgroundImage: `
                            linear-gradient(30deg, rgba(6,182,212,0.04) 1px, transparent 1px),
                            linear-gradient(150deg, rgba(6,182,212,0.04) 1px, transparent 1px)
                        `,
                        backgroundSize: '32px 32px, 32px 32px',
                    }}
                />
                <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, rgba(99,102,241,0.05) 40%, transparent 70%)' }}
                />
                <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }}
                />
                <div className="absolute left-0 right-0 h-px opacity-30"
                    style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.4) 30%, rgba(6,182,212,0.6) 50%, rgba(6,182,212,0.4) 70%, transparent 100%)',
                        animation: 'flowScanline 10s ease-in-out infinite',
                    }}
                />
                <div className="absolute top-0 right-0 w-12 h-12 border-r border-t border-cyan-500/15 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-l border-b border-indigo-500/15 rounded-bl-lg" />
                <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500/30 via-indigo-500/15 to-transparent" />
            </div>

            <style jsx>{`
                @keyframes flowScanline {
                    0%, 100% { top: 8%; opacity: 0; }
                    10% { opacity: 0.3; }
                    50% { top: 90%; opacity: 0.2; }
                    90% { opacity: 0; }
                }
                @keyframes flowPulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 1; }
                }
            `}</style>
            <style>{`
                @keyframes aiLogoPulse {
                    0%, 100% { filter: drop-shadow(0 0 2px rgba(245,158,11,0.2)) drop-shadow(0 0 1px rgba(245,158,11,0.15)); transform: scale(1); }
                    50% { filter: drop-shadow(0 0 5px rgba(245,158,11,0.5)) drop-shadow(0 0 2px rgba(245,158,11,0.3)); transform: scale(1.08); }
                }
            `}</style>

            {/* ═══ Header ═══ */}
            <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between relative z-10"
                style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.06) 0%, rgba(99,102,241,0.04) 50%, transparent 100%)' }}>
                <div className="flex items-center gap-2">
                    <SignumAIIcon size={15} />
                    <span className="text-[12px] font-black text-white uppercase tracking-[0.15em] font-jakarta">
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.AI_FLOW_INTELLIGENCE.tooltip} badge={COMMAND_TOOLTIPS.AI_FLOW_INTELLIGENCE.badge}>AI Flow Intelligence</CardTooltip>
                    </span>
                    <span className="text-[10px] bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
                        CLAUDE S4
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    {loading && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
                    {analysis?.triggerReason && analysis.triggerReason !== 'FIRST_LOAD' && (
                        <span className="text-[12px] text-amber-400/80 font-jakarta">
                            {triggerLabel[analysis.triggerReason] || ''}
                        </span>
                    )}
                </div>
            </div>

            {/* ═══ Loading ═══ */}
            {loading && !analysis && (
                <div className="p-4 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 flex items-center justify-center">
                                <SignumAIIcon size={18} />
                            </div>
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDuration: '2s' }} />
                        </div>
                        <div>
                            <p className="text-[13px] text-cyan-300 font-jakarta font-bold">
                                {locale === 'ko' ? 'AI 플로우 분석 중...' : locale === 'ja' ? 'AIフロー分析中...' : 'AI Flow Analysis...'}
                            </p>
                            <p className="text-[12px] text-slate-300 font-jakarta">
                                {locale === 'ko' ? '11개 팩터 교차 분석 진행 중' : locale === 'ja' ? '11ファクターのクロス分析中' : 'Cross-analyzing 11 factors'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Error ═══ */}
            {error && !loading && (
                <div className="p-3 relative z-10">
                    <div className="flex items-center gap-2 text-rose-400 mb-1">
                        <AlertTriangle size={14} />
                        <span className="text-[12px] font-bold font-jakarta">Analysis Error</span>
                    </div>
                    <p className="text-[12px] text-slate-300">{error}</p>
                    <button onClick={() => fetchAnalysis('MANUAL_REFRESH')} className="mt-1.5 text-[12px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-jakarta">
                        <RefreshCw size={10} /> {locale === 'ko' ? '재시도' : locale === 'ja' ? '再試行' : 'Retry'}
                    </button>
                </div>
            )}

            {/* ═══ Analysis Result ═══ */}
            {analysis && (
                <div className="relative z-10">

                    {/* ─── Structural Thesis ─── */}
                    <div className="px-3.5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield size={12} className="text-cyan-400" />
                            <span className="text-[12px] font-bold text-cyan-400/80 uppercase tracking-wider font-jakarta">
                                {locale === 'ko' ? '구조적 분석' : locale === 'ja' ? '構造分析' : 'Structural Thesis'}
                            </span>
                        </div>
                        <p className="text-[13px] text-slate-300 leading-[1.8]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {extractLocale(analysis.structuralThesis, locale)}
                        </p>
                    </div>

                    {/* ─── Factor Highlights (Accordion) ─── */}
                    {analysis.factorHighlights && analysis.factorHighlights.length > 0 && (
                        <div className="border-t border-white/[0.04]">
                            <button
                                onClick={() => toggleSection('factors')}
                                className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/[0.03] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <BarChart3 size={12} className="text-indigo-400" />
                                    <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider font-jakarta">
                                        {locale === 'ko' ? '핵심 팩터 인사이트' : locale === 'ja' ? 'キーファクター' : 'Key Factor Insights'}
                                    </span>
                                    <span className="text-[12px] text-slate-400 font-jakarta">{analysis.factorHighlights.length}</span>
                                </div>
                                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${openSections.has('factors') ? 'rotate-180' : ''}`} />
                            </button>
                            <div className="overflow-hidden transition-all duration-300 ease-in-out"
                                style={{ maxHeight: openSections.has('factors') ? '2000px' : '0px', opacity: openSections.has('factors') ? 1 : 0 }}>
                                <div className="px-3.5 pb-3 space-y-2">
                                    {analysis.factorHighlights.map((fh, i) => (
                                        <div key={i} className={`rounded-lg border p-2.5 ${impactColor(fh.impact)}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                {impactIcon(fh.impact)}
                                                <span className="text-[12px] font-bold text-white font-jakarta">{fh.factor}</span>
                                            </div>
                                            <p className="text-[13px] text-slate-300 leading-[1.7]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                                {extractLocale(fh.insight, locale)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── Repricing Condition (Accordion) ─── */}
                    {analysis.repricingCondition && (
                        <div className="border-t border-white/[0.04]">
                            <button
                                onClick={() => toggleSection('repricing')}
                                className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-white/[0.03] transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Zap size={12} className="text-amber-400" />
                                    <span className="text-[12px] font-bold text-slate-300 uppercase tracking-wider font-jakarta">
                                        {locale === 'ko' ? '재가격 조건' : locale === 'ja' ? 'リプライシング条件' : 'Repricing Condition'}
                                    </span>
                                </div>
                                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${openSections.has('repricing') ? 'rotate-180' : ''}`} />
                            </button>
                            <div className="overflow-hidden transition-all duration-300 ease-in-out"
                                style={{ maxHeight: openSections.has('repricing') ? '1000px' : '0px', opacity: openSections.has('repricing') ? 1 : 0 }}>
                                <div className="px-3.5 pb-3">
                                    <p className="text-[13px] text-slate-300 leading-[1.8]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                        {extractLocale(analysis.repricingCondition, locale)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── Footer: Risk + Confidence + Time ─── */}
                    <div className="px-3.5 py-2 border-t border-white/[0.04] flex items-center justify-between flex-wrap gap-1.5">
                        <div className="flex items-center gap-2">
                            <span className={`text-[12px] px-2 py-0.5 rounded border font-bold font-jakarta ${risk.bg} ${risk.text} ${risk.border}`}>
                                RISK: {analysis.riskAssessment}
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
                            {countdown && !isMarketClosed && (
                                <span className="text-[12px] text-slate-400 font-mono">
                                    {locale === 'ko' ? `다음 ${countdown}` : locale === 'ja' ? `次回 ${countdown}` : `Next: ${countdown}`}
                                </span>
                            )}
                            <button
                                onClick={() => fetchAnalysis('MANUAL_REFRESH')}
                                className="text-slate-400 hover:text-cyan-400 transition-colors"
                                disabled={loading}
                            >
                                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
