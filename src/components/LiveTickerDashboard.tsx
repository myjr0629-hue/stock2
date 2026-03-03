"use client";

import React, { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useFlowData } from '@/hooks/useFlowData';
import { useLivePrice } from '@/hooks/useLivePrice';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import { usePriceFlash, getFlashStyle } from '@/components/ui/PriceDisplay';
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity, Loader2, Info, TrendingUp, TrendingDown, Crosshair, Radar, Shield, ChevronDown, ChevronUp, Sparkles, BookOpen } from "lucide-react";
import { StockData, OptionData, NewsItem } from "@/services/stockTypes";
import { OIChart } from "@/components/OIChart";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { GammaLevelsViz } from "@/components/GammaLevelsViz";
import { FlowSniper } from "@/components/FlowSniper";
import { CommandInsight } from "@/components/CommandInsight";
import { ProGate, EliteGate } from '@/components/gate/FeatureGate';
import { useTranslations, useLocale } from 'next-intl';

// [FIX] Dynamic import with SSR disabled - Recharts requires DOM measurements
const StockChart = dynamic(() => import("@/components/StockChart").then(mod => mod.StockChart), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center bg-[#0b1219] rounded-md border border-slate-800">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
    )
});

// [S-56.4.7] Imported or defined locally to avoid server-module leakage
interface ChartDiagnostics {
    ok: boolean;
    reasonKR?: string;
    code?: string;
    points?: number;
}

interface Props {
    ticker: string;
    initialStockData: StockData | null;
    initialNews: NewsItem[];
    range: string;
    buildId?: string;
    chartDiagnostics?: ChartDiagnostics; // [S-56.4.7] No-Silence UX
    initialUnifiedData?: any; // [PERF] SSR Hydration payload
}

const DecisionGate = ({ ticker, displayPrice, session, structure, krNews, smaData, newsScore, liveQuote, analystData, fundamentalData, institutionalData }: any) => {
    // ... preserving other code
    // (To make this replace safe, I will only replace the top interface and the SWR call area)
    const t = useTranslations('command');
    const td = useTranslations('dashboard');

    // === Data Completeness Check (only structure is required) ===
    const hasStructure = structure && structure.options_status === 'OK';
    // [DATA VALIDATION] Also check validation confidence
    const validation = structure?.validation;
    const hasValidData = hasStructure && validation?.confidence !== 'LOW';
    const isLoading = !hasStructure;

    // === Data Extraction ===
    const options_status = structure?.options_status;
    const callWall = structure?.levels?.callWall || 0;
    const putFloor = structure?.levels?.putFloor || 0;
    const netGex = structure?.netGex || 0;
    const maxPain = structure?.maxPain || 0;
    const netPremium = liveQuote?.flow?.netPremium || 0;
    const zeroDteRatio = structure?.gexZeroDteRatio || 0;
    const hasRumor = krNews?.some((n: any) => n.isRumor && n.ageHours <= 24) || false;
    const pcRatio = structure?.pcRatio || 0;

    // [DATA VALIDATION] Consider LOW confidence as fail state
    const isFail = options_status !== 'OK' || validation?.confidence === 'LOW';

    // === Loading State ===
    if (isLoading) {
        return (
            <div className="flex flex-col h-full bg-transparent">
                {/* Header - matching FLOW UNIT style */}
                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                    <span className="text-[11px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                        <Zap size={10} />
                        SIGNAL CORE
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                        LOADING
                    </span>
                </div>
                <div className="p-6 flex-1 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400">Collecting data...</p>
                </div>
            </div>
        );
    }


    // === Integrated Scoring ===
    let bullScore = 0, bearScore = 0;
    const insights: { text: string; type: 'bull' | 'bear' | 'neutral' }[] = [];
    const isREG = session === 'REG';

    // 1. SMA Trend — 항상 활성 (일봉 기반)
    if (smaData?.cross === 'GOLDEN') {
        bullScore += 25;
        insights.push({ text: 'GOLDEN Cross ✨', type: 'bull' });
    } else if (smaData?.cross === 'DEAD') {
        bearScore += 25;
        insights.push({ text: 'DEAD Cross ☠️', type: 'bear' });
    }

    // 2. Price vs Max Pain — 본장만
    if (isREG && maxPain > 0) {
        const mpDist = ((displayPrice - maxPain) / maxPain) * 100;
        if (mpDist > 3) {
            bullScore += 15;
            insights.push({ text: td('insight.maxPainAbove'), type: 'bull' });
        } else if (mpDist < -3) {
            bearScore += 15;
            insights.push({ text: td('insight.maxPainBelow'), type: 'bear' });
        } else {
            insights.push({ text: td('insight.maxPainNear'), type: 'neutral' });
        }
    }

    // 3. GEX — 본장만
    if (isREG) {
        if (netGex > 0) {
            bullScore += 10;
            insights.push({ text: td('insight.longGammaStable'), type: 'bull' });
        } else if (netGex < 0) {
            bearScore += 5;
            insights.push({ text: td('insight.shortGammaVolatile'), type: 'bear' });
        }
    }

    // 4. Flow — 본장만
    if (isREG) {
        if (netPremium > 500000) {
            bullScore += 15;
            insights.push({ text: td('insight.callFlowDominant'), type: 'bull' });
        } else if (netPremium < -500000) {
            bearScore += 15;
            insights.push({ text: td('insight.putFlowDominant'), type: 'bear' });
        }
    }

    // 5. News — 항상 활성
    if (newsScore && newsScore.score >= 70) {
        bullScore += 10;
        insights.push({ text: td('insight.newsPositive'), type: 'bull' });
    } else if (newsScore && newsScore.score < 40) {
        bearScore += 10;
        insights.push({ text: td('insight.newsNegative'), type: 'bear' });
    }

    // 6. Rumor penalty — 항상 활성
    if (hasRumor) {
        bearScore += 10;
        insights.push({ text: td('insight.rumorDetected'), type: 'bear' });
    }

    // 7. VWAP — 본장만 (장중 거래량 가중 평균)
    if (isREG) {
        const vwap = liveQuote?.vwap || 0;
        const price = displayPrice || 0;
        if (vwap > 0 && price > 0) {
            const vwapDiff = ((price - vwap) / vwap) * 100;
            if (vwapDiff > 1) {
                bullScore += 8;
                insights.push({ text: td('insight.vwapAbove', { pct: vwapDiff.toFixed(1) }), type: 'bull' });
            } else if (vwapDiff < -1) {
                bearScore += 8;
                insights.push({ text: td('insight.vwapBelow', { pct: vwapDiff.toFixed(1) }), type: 'bear' });
            }
        }
    }

    // 8. Analyst Consensus — 항상 활성 (정적 데이터)
    if (analystData?.totalAnalysts > 0) {
        const bd = analystData.breakdown;
        const buyCount = bd ? bd.strongBuy + bd.buy : 0;
        const buyPct = Math.round((buyCount / analystData.totalAnalysts) * 100);
        if (buyPct >= 80) {
            bullScore += 10;
            insights.push({ text: td('insight.analystBuy', { pct: String(buyPct) }), type: 'bull' });
        } else if (buyPct <= 30) {
            bearScore += 10;
            insights.push({ text: td('insight.analystBuy', { pct: String(buyPct) }), type: 'bear' });
        }
    }

    // 9. Fundamental Grade — 항상 활성 (분기별 데이터)
    if (fundamentalData?.score > 0) {
        if (fundamentalData.grade?.startsWith('A')) {
            bullScore += 5;
            insights.push({ text: td('insight.fundamentalGrade', { grade: fundamentalData.grade }), type: 'bull' });
        } else if (fundamentalData.grade?.startsWith('D') || fundamentalData.grade === 'F') {
            bearScore += 5;
            insights.push({ text: td('insight.fundamentalGrade', { grade: fundamentalData.grade }), type: 'bear' });
        }
    }

    // 10. Dark Pool 방향 — 본장만 (실시간 체결 기반, 옵션 아님)
    if (isREG && institutionalData?.darkPool) {
        const dpBuyPct = institutionalData.darkPool.buyPct || 0;
        const dpSellPct = institutionalData.darkPool.sellPct || 0;
        if (dpBuyPct > 55) {
            bullScore += 10;
            insights.push({ text: td('insight.darkPoolBuy', { pct: String(dpBuyPct) }), type: 'bull' });
        } else if (dpSellPct > 55) {
            bearScore += 10;
            insights.push({ text: td('insight.darkPoolSell', { pct: String(dpSellPct) }), type: 'bear' });
        }
    }

    // 11. 0DTE — 본장만
    if (isREG && zeroDteRatio > 0.3) {
        insights.push({ text: td('insight.zeroDteHigh'), type: 'neutral' });
    }

    // === Verdict ===
    const diff = bullScore - bearScore;
    let verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' = 'NEUTRAL';
    let verdictKR = td('verdict.neutral');
    let briefing = '';
    let subBriefing = '';

    if (isFail) {
        verdict = 'CAUTION';
        verdictKR = td('verdict.caution');
        briefing = td('briefing.dataValidating');
        subBriefing = td('briefing.dataStabilizing');
    } else if (!isREG) {
        // PRE, POST, CLOSED — SMA + 뉴스 기반 부분 분석
        const sessionLabel = session === 'PRE' ? td('session.preMarket') : session === 'POST' ? td('session.afterMarket') : td('session.closed');
        if (diff >= 15) {
            verdict = 'BULLISH';
            verdictKR = td('verdict.bullishBias');
        } else if (diff <= -15) {
            verdict = 'BEARISH';
            verdictKR = td('verdict.bearishBias');
        } else {
            verdict = 'NEUTRAL';
            verdictKR = td('verdict.neutral');
        }
        briefing = td('briefing.sessionAnalysis', { session: sessionLabel });
        subBriefing = insights.length > 0
            ? td('briefing.detectedSignals', { signals: insights.map(i => i.text).join(', ') })
            : td('briefing.waitForRegular', { ticker });
    } else if (diff >= 25) {
        verdict = 'BULLISH';
        verdictKR = td('verdict.bullish');
        if (netGex > 0 && smaData?.cross === 'GOLDEN') {
            briefing = td('briefing.bullishGoldenCross', { ticker });
            subBriefing = td('briefing.bullishGoldenCrossSub', { cw: `$${callWall}`, pf: `$${putFloor}` });
        } else if (netPremium > 500000) {
            briefing = td('briefing.bullishCallFlow', { ticker });
            subBriefing = td('briefing.bullishCallFlowSub', { mp: `$${maxPain}`, cw: `$${callWall}` });
        } else {
            briefing = td('briefing.bullishComposite', { ticker });
            subBriefing = td('briefing.bullishCompositeSub', { pf: `$${putFloor}` });
        }
    } else if (diff <= -25) {
        verdict = 'BEARISH';
        verdictKR = td('verdict.bearish');
        if (smaData?.cross === 'DEAD' && netGex < 0) {
            briefing = td('briefing.bearishDeadCross', { ticker });
            subBriefing = td('briefing.bearishDeadCrossSub', { mp: `$${maxPain}`, pf: `$${putFloor}` });
        } else if (netPremium < -500000) {
            briefing = td('briefing.bearishPutFlow', { ticker });
            subBriefing = td('briefing.bearishPutFlowSub', { pf: `$${putFloor}`, mp: `$${maxPain}` });
        } else {
            briefing = td('briefing.bearishComposite', { ticker });
            subBriefing = td('briefing.bearishCompositeSub', { pf: `$${putFloor}` });
        }
    } else {
        verdict = 'NEUTRAL';
        verdictKR = td('verdict.watch');
        briefing = td('briefing.neutralDirection', { ticker });
        if (Math.abs(displayPrice - maxPain) / maxPain < 0.02) {
            subBriefing = td('briefing.neutralNearMaxPain', { mp: `$${maxPain}`, cw: `$${callWall}`, pf: `$${putFloor}` });
        } else {
            subBriefing = td('briefing.neutralMixed', { cw: `$${callWall}`, pf: `$${putFloor}` });
        }
    }

    // === Styling ===
    const verdictColors = {
        BULLISH: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20' },
        BEARISH: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40', glow: 'shadow-rose-500/20' },
        NEUTRAL: { bg: 'bg-indigo-500/15', text: 'text-slate-300', border: 'border-indigo-500/30', glow: '' },
        CAUTION: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', glow: 'shadow-amber-500/20' },
    };
    const colors = verdictColors[verdict];

    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header - matching FLOW UNIT style */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                <span className="text-[11px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Zap size={10} />
                    SIGNAL CORE
                </span>
                <span className={`text-[11px] font-medium uppercase tracking-wider ${colors.text}`}>
                    {verdict}
                </span>
            </div>

            {/* Main Content */}
            <div className="p-4 space-y-3 flex-1">
                {/* Briefing */}
                <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border}`}>
                    <p className="text-sm text-white font-semibold leading-relaxed">
                        {briefing}
                    </p>
                    <p className="text-[13px] text-white/80 leading-relaxed mt-2">
                        {subBriefing}
                    </p>
                </div>

                {/* Key Insights Grid */}
                <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{td('keyMetrics')}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {insights.slice(0, 6).map((item, i) => (
                            <span
                                key={i}
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg ${item.type === 'bull' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    item.type === 'bear' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                        'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                                    }`}
                            >
                                {item.text}
                            </span>
                        ))}
                    </div>
                </div>


            </div>
        </div>
    );


};

export function LiveTickerDashboard({ ticker, initialStockData, initialNews, range, buildId, chartDiagnostics, initialUnifiedData }: Props) {
    const tCommon = useTranslations('common');
    // --- Live Data State ---
    // [PERF] SWR replaces manual fetchQuote + setInterval(10s)
    // SSR data → SWR fallbackData → instant first render → background refresh
    const ssrFallback = React.useMemo(() => {
        if (!initialStockData || initialStockData.price === 0) return undefined;
        const s = (initialStockData.session || '').toLowerCase() as string;
        return {
            price: initialStockData.price,
            prices: {
                regularCloseToday: s === 'reg' ? initialStockData.price : undefined,
                prevClose: initialStockData.prevClose || null,
                prePrice: s === 'pre' ? initialStockData.price : undefined,
                postPrice: s === 'post' || s === 'closed' ? initialStockData.price : undefined,
            },
            extended: {
                prePrice: s === 'pre' ? initialStockData.price : undefined,
                postPrice: s === 'post' || s === 'closed' ? initialStockData.price : undefined,
            },
            session: s === 'reg' ? 'REG' : s === 'pre' ? 'PRE' : s === 'post' ? 'POST' : 'CLOSED',
            changePercent: initialStockData.changePercent
        };
    }, [initialStockData]);
    const { data: _swrQuote, isValidating: quoteLoading } = useFlowData(ticker, {
        refreshInterval: 2000, // [UX] Near-real-time price feel
    });
    // [PERF] 5s real-time price polling (separate from heavy 60s ticker API)
    const livePrice = useLivePrice(ticker);
    // Use SWR data when available, SSR fallback otherwise — keeps 'liveQuote' name for compatibility
    const liveQuote = _swrQuote || ssrFallback || null;
    const [options, setOptions] = useState<any>(null);
    // [FIX] Client-side chart data to override stale SSR data on navigation back
    const [liveChartData, setLiveChartData] = useState<any[] | null>(null);
    const [structure, setStructure] = useState<any>(null);
    const [krNews, setKrNews] = useState<any[]>(initialNews || []);
    const [expandedNewsId, setExpandedNewsId] = useState<number | null>(null);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [structLoading, setStructLoading] = useState(false);
    const [newsLoading, setNewsLoading] = useState(false);
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [selectedExp, setSelectedExp] = useState<string>("");
    // [S-124.6] Quick Intel Gauges State
    const [newsScore, setNewsScore] = useState<{ score: number; label: string; breakdown?: { positive: number; negative: number; neutral: number } } | null>(null);
    const [earningsData, setEarningsData] = useState<{ nextDate: string | null; daysLabel: string; epsEstimate: number | null; quarter: number | null; year: number | null; hourLabel: string; color: string } | null>(null);
    const [smaData, setSmaData] = useState<{ cross: string; crossType: string; label: string; sma50: number; sma200: number; distance: number; isImminent: boolean; phase: string } | null>(null);
    const [conviction, setConviction] = useState<{ score: number; label: string; grade: string } | null>(null);
    const [relatedData, setRelatedData] = useState<{ count: number; topRelated: { ticker: string; price: number; change: number; logo: string | null }[] } | null>(null);
    const [analystData, setAnalystData] = useState<{
        consensus: string; totalAnalysts: number; bullishPct: number;
        breakdown: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
        priceTarget: { mean: number; median: number; high: number; low: number } | null;
    } | null>(null);
    // [PREMIUM-5x2] New indicator states
    const [volatilityData, setVolatilityData] = useState<{ regime: string; regimeScore: number; gex: number; gexLabel: string; iv: number; flipDistance: number; flipLevel: number; isAboveFlip: boolean; squeezeScore: number; squeezeRisk: string; gammaConcentration: number; gammaConcentrationLabel: string } | null>(null);
    const [squeezeData, setSqueezeData] = useState<{ siPercent: number; daysToCover: number; siChange: number; shortVolPercent: number; riskScore: number; status: string } | null>(null);
    const [institutionalData, setInstitutionalData] = useState<{ darkPool: { percent: number } | null; blockTrade: { count: number; volume: number } | null; shortVolume: { percent: number } | null } | null>(null);
    const [fundamentalData, setFundamentalData] = useState<{ score: number; grade: string; breakdown: Record<string, { value: string; score: number; label: string }>; pe?: number | null; de?: number | null; roe?: number | null; revenueGrowth?: number | null; netMargin?: number | null; fcfYield?: number | null } | null>(null);
    // [Company Profile] Overview data for header display
    const [companyOverview, setCompanyOverview] = useState<{ sector: string | null; sectorEN: string | null; description: string | null; descriptionEN: string | null } | null>(null);

    // i18n translations
    const t = useTranslations('command');
    const td = useTranslations('dashboard');
    const tIntel = useTranslations('intel');
    const locale = useLocale();

    // [S-45] SSOT Integration
    const { status: marketStatus } = useMarketStatus();
    // [S-46] Macro SSOT Integration
    const { snapshot: macroData } = useMacroSnapshot();

    // SSOT Override for session status (S-45)SOT says Closed/Holiday, we force "CLOSED" even if liveQuote says "PRE"
    const effectiveSession = (marketStatus.isHoliday || marketStatus.market === 'closed')
        ? 'CLOSED'
        : liveQuote?.session || 'CLOSED'; // Fallback if liveQuote null

    const displayLabel = marketStatus.isHoliday
        ? `CLOSED (${marketStatus.holidayName})`
        : marketStatus.market === 'closed'
            ? 'CLOSED'
            : liveQuote?.session || 'CLOSED';

    // --- Fetchers ---
    // [PERF] 2-Stage News Rendering: Quick (Polygon only) → Full (AI analysis)
    const applyNewsScore = (data: any) => {
        if (data.sentiment) {
            setNewsScore({
                score: data.sentiment.score || 50,
                label: data.sentiment.label || td('sentimentNeutral'),
                breakdown: data.sentiment.breakdown
            });
        } else {
            const items = data.items || [];
            let score = 50;
            let positive = 0, negative = 0, neutral = 0;
            items.forEach((item: any) => {
                if (item.sentiment === 'positive') { score += 5; positive++; }
                else if (item.sentiment === 'negative') { score -= 5; negative++; }
                else neutral++;
            });
            score = Math.max(0, Math.min(100, score));
            const label = score >= 70 ? td('sentimentPositive') : score >= 40 ? td('sentimentNeutral') : td('sentimentCaution');
            setNewsScore({ score, label, breakdown: { positive, negative, neutral } });
        }
    };

    const fetchNewsAndScore = async () => {
        setNewsLoading(true);
        try {
            // Stage 1: Quick fetch — Polygon raw news only (~1s)
            const quickRes = await fetch(`/api/live/news?t=${ticker}&quick=1`);
            if (quickRes.ok) {
                const quickData = await quickRes.json();
                setKrNews(quickData.items || []);
                applyNewsScore(quickData);
                setNewsLoading(false);

                // Stage 2: Full fetch — AI translation + analysis (5-15s, or instant if cached)
                setAiAnalyzing(true);
                try {
                    const fullRes = await fetch(`/api/live/news?t=${ticker}`);
                    if (fullRes.ok) {
                        const fullData = await fullRes.json();
                        setKrNews(fullData.items || []);
                        applyNewsScore(fullData);
                    }
                } catch (aiErr) {
                    console.warn('[News] AI analysis fetch failed:', aiErr);
                } finally {
                    setAiAnalyzing(false);
                }
            }
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[News] Network retry...");
            else console.error(e);
            setNewsLoading(false);
        }
    };
    // [PERF] fetchQuote removed — replaced by SWR useFlowData hook above
    // SWR handles: caching, deduplication, background refresh (15s), error retry

    // [PREMIUM] Conviction Matrix: 클라이언트 사이드 융합 점수 (API 호출 없음)
    const calculateConviction = () => {
        let score = 50; // 기본 중립
        // SMA Trend
        if (smaData?.cross === 'GOLDEN') score += 15;
        else if (smaData?.cross === 'DEAD') score -= 15;
        // News
        if (newsScore && newsScore.score >= 70) score += 10;
        else if (newsScore && newsScore.score < 40) score -= 10;
        // VWAP
        const vwap = liveQuote?.vwap || initialStockData?.vwap || 0;
        const price = displayPrice || 0;
        if (vwap > 0 && price > 0) {
            const vwapDiff = ((price - vwap) / vwap) * 100;
            if (vwapDiff > 1) score += 8;
            else if (vwapDiff < -1) score -= 8;
        }
        // PCR
        const pcr = structure?.pcRatio || 0;
        if (pcr > 0 && pcr < 0.7) score += 7; // 낮은 PCR = 콜 우세
        else if (pcr > 1.2) score -= 7; // 높은 PCR = 풋 우세
        // GEX
        const netGex = structure?.netGex || 0;
        if (netGex > 0) score += 5;
        else if (netGex < 0) score -= 5;
        // Flow
        const netPrem = liveQuote?.flow?.netPremium || 0;
        if (netPrem > 500000) score += 5;
        else if (netPrem < -500000) score -= 5;
        // Clamp
        score = Math.max(0, Math.min(100, score));
        let label = td('convNeutral'); let grade = 'C';
        if (score >= 80) { label = td('convStrong'); grade = 'A'; }
        else if (score >= 65) { label = td('convBullish'); grade = 'B+'; }
        else if (score >= 55) { label = td('convSlightUp'); grade = 'B'; }
        else if (score >= 45) { label = td('convNeutral'); grade = 'C'; }
        else if (score >= 35) { label = td('convSlightDown'); grade = 'D'; }
        else if (score >= 20) { label = td('convBearish'); grade = 'D-'; }
        else { label = td('convStrongDown'); grade = 'F'; }
        setConviction({ score, label, grade });
    };

    // =========================================================================
    // [V68] COMMAND HYBRID ARCHITECTURE (Unified SWR Cache)
    // =========================================================================

    // 1. Fetch Unified Backend Data (11-in-1 aggregation + Redis SWR Cache)
    const { data: unifiedData, error: unifiedError } = useSWR(
        ticker ? `/api/command/unified?t=${ticker}&lang=${locale}` : null,
        (url: string) => fetch(url).then(res => res.json()),
        {
            fallbackData: initialUnifiedData, // [SSR HYDRATION] Bypass skeleton
            revalidateOnFocus: false, // Redis handles background freshness
            revalidateIfStale: false,
            refreshInterval: 0 // We don't interval-poll heavy data. Live quote takes care of prices.
        }
    );

    // 2. Map Unified Data to Components
    useEffect(() => {
        if (!unifiedData) return;

        // Structure & Options
        if (unifiedData.structure) setStructure(unifiedData.structure);
        if (unifiedData.options) setOptions(unifiedData.options);

        // Earnings
        if (unifiedData.earnings) {
            setEarningsData({
                nextDate: unifiedData.earnings.nextEarningsDate || null,
                daysLabel: unifiedData.earnings.daysLabel || 'TBD',
                epsEstimate: unifiedData.earnings.epsEstimate || null,
                quarter: unifiedData.earnings.quarter || null,
                year: unifiedData.earnings.year || null,
                hourLabel: unifiedData.earnings.hourLabel || '',
                color: unifiedData.earnings.color || 'text-slate-400'
            });
        }

        // SMA (TREND PHASE)
        if (unifiedData.sma) {
            setSmaData({
                cross: unifiedData.sma.cross || 'UNKNOWN',
                crossType: unifiedData.sma.crossType || '',
                label: unifiedData.sma.label || td('noData'),
                sma50: unifiedData.sma.sma50 || 0,
                sma200: unifiedData.sma.sma200 || 0,
                distance: unifiedData.sma.distance || 0,
                isImminent: unifiedData.sma.isImminent || false,
                phase: unifiedData.sma.phase || 'UNKNOWN'
            });
        }

        // Related
        if (unifiedData.related) {
            setRelatedData({
                count: unifiedData.related.count || 0,
                topRelated: unifiedData.related.topRelated || []
            });
        }

        // Analyst Targets
        if (unifiedData.analyst) setAnalystData(unifiedData.analyst);

        // Volatility Regime
        if (unifiedData.volatility) setVolatilityData(unifiedData.volatility);

        // Short Squeeze
        if (unifiedData.squeeze) setSqueezeData(unifiedData.squeeze);

        // Institutional Flow
        if (unifiedData.institutional) setInstitutionalData(unifiedData.institutional);

        // Fundamentals
        if (unifiedData.fundamentals) setFundamentalData(unifiedData.fundamentals);

        // Overview
        if (unifiedData.overview?.overview) {
            setCompanyOverview({
                sector: unifiedData.overview.overview.sector,
                sectorEN: unifiedData.overview.overview.sectorEN,
                description: unifiedData.overview.overview.description,
                descriptionEN: unifiedData.overview.overview.descriptionEN
            });
        }

        // Stop loading overlays
        setStructLoading(false);
        setOptionsLoading(false);
    }, [unifiedData]);

    // [FIX] Client-side chart refresh on visibility/focus change
    const fetchChartData = useCallback(async () => {
        try {
            const res = await fetch(`/api/chart?symbol=${ticker}&range=${range}`);
            if (res.ok) {
                const json = await res.json();
                const newData = json.data || [];
                if (newData.length > 0) setLiveChartData(newData);
            }
        } catch (e) {
            console.error('[Command] Chart refresh error:', e);
        }
    }, [ticker, range]);

    // [FIX] Clear stale chart data instantly when ticker changes
    useEffect(() => {
        setLiveChartData(null);
    }, [ticker]);

    // News & AI Setup (Progressive Hydration - Non blocking)
    useEffect(() => {
        fetchNewsAndScore(); // AI fetch resolves silently in background
        fetchChartData();    // Initial chart load

        const chartInterval = setInterval(fetchChartData, 30000);
        const newsInterval = setInterval(fetchNewsAndScore, 30 * 60 * 1000);

        const handleVisibility = () => { if (document.visibilityState === 'visible') fetchChartData(); };
        const handleFocus = () => fetchChartData();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(chartInterval);
            clearInterval(newsInterval);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
        };
    }, [ticker, fetchChartData]); // Re-run when ticker changes

    // [PREMIUM] Recalculate conviction when dependencies change
    // [FIX] Use stable scalar values instead of full liveQuote object to prevent infinite loop
    const liveQuotePrice = liveQuote?.prices?.regularCloseToday || liveQuote?.price || 0;
    const liveQuoteNetPremium = liveQuote?.flow?.netPremium || 0;
    useEffect(() => {
        calculateConviction();
    }, [smaData, newsScore, liveQuotePrice, liveQuoteNetPremium, structure]);

    if (!initialStockData) return <div>Data Unavailable</div>;

    // [UNIFIED] All price display logic via shared calcPriceDisplay()
    const { displayPrice, displayChangePct, activeExtPrice, activeExtType, activeExtLabel, activeExtPct } = calcPriceDisplay({
        livePrice: livePrice?.price,
        liveChangePct: livePrice?.changePercent,
        liveExtPrice: livePrice?.extendedPrice,
        liveExtChangePct: livePrice?.extendedChangePercent,
        liveExtLabel: livePrice?.extendedLabel,
        apiDisplayPrice: liveQuote?.display?.price || initialStockData?.price,
        apiDisplayChangePct: liveQuote?.display?.changePctPct || initialStockData?.changePercent,
        session: effectiveSession,
        prevRegularClose: liveQuote?.prices?.prevRegularClose,
        prevClose: liveQuote?.prevClose || (initialStockData && initialStockData.prevClose) || 0,
        regularCloseToday: liveQuote?.prices?.regularCloseToday,
        prevChangePct: liveQuote?.prices?.prevChangePct,
        fallbackChangePct: (initialStockData && initialStockData.changePercent) || 0,
        lastTrade: liveQuote?.prices?.lastTrade || liveQuote?.price,
        extended: liveQuote?.extended,
        prices: liveQuote?.prices,
    });

    const pSource = liveQuote?.priceSource || initialStockData?.priceSource;
    const priceFlash = usePriceFlash(displayPrice || 0);
    const pf = getFlashStyle(priceFlash);
    let pTag = "";
    let pTagStyle = "";

    if (pSource === "OFFICIAL_CLOSE") { pTag = "CLOSE"; pTagStyle = "text-slate-400 bg-slate-800 border-slate-700"; }
    else if (pSource === "POST_CLOSE") { pTag = "POST"; pTagStyle = "text-indigo-400 bg-indigo-950/50 border-indigo-500/30"; }
    else if (pSource === "PRE_OPEN") { pTag = "PRE"; pTagStyle = "text-amber-400 bg-amber-950/50 border-amber-500/30"; }
    else if (pSource === "LIVE_SNAPSHOT") { pTag = "LIVE"; pTagStyle = "text-emerald-400 bg-emerald-950/50 border-emerald-500/30"; }

    // ATM Integrity
    const showOptionsTable = options && options.options_status !== 'PENDING' && options.atmSlice && options.atmSlice.length > 0;
    const optionsPending = !options || options.options_status === 'PENDING' || !options.atmSlice || options.atmSlice.length === 0;
    const showStructure = structure && structure.structure && structure.structure.strikes?.length > 0;

    // === GLOBAL LOADING GATE ===
    // Prevent rendering with zero/stale data (causes $0.00, Infinity%, distorted chart)
    // Wait for: (1) liveQuote with real price ONLY — chart loads independently with its own skeleton
    const hasSsrPrice = initialStockData && (initialStockData.price > 0 || (initialStockData.prevClose && initialStockData.prevClose > 0));
    const isInitialLoading = (!liveQuote && !hasSsrPrice) || displayPrice === 0;

    if (isInitialLoading) {
        return (
            <div className="w-full max-w-[1600px] mx-auto space-y-4">
                {/* REAL Header — ticker name + logo visible immediately */}
                <div className="sticky top-[78px] z-30 bg-white/5 backdrop-blur-xl rounded-xl py-2 px-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-3">
                        <div className="relative w-11 h-11 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                            <img
                                loading="lazy"
                                decoding="async"
                                src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                alt={ticker}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-white tracking-tight">{ticker}</span>
                            <div className="flex items-center gap-2 animate-pulse">
                                <div className="h-6 w-24 bg-slate-800/60 rounded" />
                                <div className="h-4 w-16 bg-slate-800/40 rounded" />
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="text-[11px] font-mono text-indigo-300 font-jakarta">CONNECTING</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Indicator Cards Skeleton — labeled placeholders */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 animate-pulse">
                    {['NET GEX', 'GAMMA FLIP', 'SQUEEZE', 'VWAP', 'SHORT VOL %'].map((label, i) => (
                        <div key={i} className="h-24 bg-slate-800/30 rounded-xl border border-slate-700/20 p-3 flex flex-col justify-between">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-jakarta">{label}</span>
                            <div className="h-5 w-16 bg-slate-700/30 rounded" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 animate-pulse">
                    {['MAX PAIN', 'ATM IV', 'P/C RATIO', 'GEX REGIME', 'IMPLIED MOVE'].map((label, i) => (
                        <div key={i} className="h-24 bg-slate-800/30 rounded-xl border border-slate-700/20 p-3 flex flex-col justify-between">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-jakarta">{label}</span>
                            <div className="h-5 w-16 bg-slate-700/30 rounded" />
                        </div>
                    ))}
                </div>

                {/* Chart + Sidebar Skeleton — Premium */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Chart area with premium skeleton */}
                    <div className="lg:col-span-8 h-[320px] lg:h-[520px] rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden relative">
                        {/* Decorative Label */}
                        <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[11px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2 font-jakarta">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Price History
                        </div>
                        {/* Fake chart grid lines */}
                        <div className="absolute inset-0 flex flex-col justify-between px-6 py-8 pointer-events-none">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="w-full h-px bg-white/[0.03]" />
                            ))}
                        </div>
                        {/* Animated fake chart line */}
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
                            <defs>
                                <linearGradient id="skGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                                    <stop offset="50%" stopColor="rgb(99,102,241)" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                                </linearGradient>
                                <linearGradient id="skFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.06" />
                                    <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d="M0,120 Q50,100 100,110 T200,90 T300,100 T400,80" fill="none" stroke="url(#skGrad)" strokeWidth="2" className="animate-pulse" />
                            <path d="M0,120 Q50,100 100,110 T200,90 T300,100 T400,80 L400,200 L0,200 Z" fill="url(#skFill)" className="animate-pulse" />
                        </svg>
                        {/* Shimmer */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_2s_infinite] pointer-events-none" />
                        {/* Center Label */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="text-[11px] font-mono text-slate-400 tracking-wider font-jakarta">LOADING CHART</span>
                            </div>
                        </div>
                    </div>
                    {/* Sidebar skeleton */}
                    <div className="lg:col-span-4 space-y-4 animate-pulse">
                        <div className="h-[250px] bg-slate-800/20 rounded-2xl border border-slate-700/15 p-4">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 font-jakarta">SIGNAL FEED</div>
                            <div className="space-y-2">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="h-4 bg-slate-700/20 rounded w-full" style={{ width: `${85 - i * 10}%` }} />
                                ))}
                            </div>
                        </div>
                        <div className="h-[250px] bg-slate-800/20 rounded-2xl border border-slate-700/15 p-4">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 font-jakarta">5-DAY HISTORY</div>
                            <div className="space-y-2">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="flex justify-between">
                                        <div className="h-3 w-12 bg-slate-700/20 rounded" />
                                        <div className="h-3 w-16 bg-slate-700/20 rounded" />
                                        <div className="h-3 w-10 bg-slate-700/20 rounded" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-[1600px] mx-auto space-y-6">

            {/* 1. TOP HEADER (2-Row Layout matching Flow page) - Sticky below main header */}
            <div className="sticky top-[78px] z-30 bg-white/5 backdrop-blur-xl rounded-xl py-1 px-3 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                {/* Header: 2-column layout — Left: ticker+price, Right: description */}
                <div className="flex items-stretch gap-4">
                    {/* Left Column: Identity + Price */}
                    <div className="flex flex-col justify-center min-w-0 shrink-0">
                        {/* Row 1: Identity */}
                        <div className="flex items-center gap-2.5">
                            <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                                <img
                                    loading="lazy"
                                    decoding="async"
                                    src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                    alt={`${ticker} logo`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement!.classList.add('hidden');
                                    }}
                                />
                            </div>
                            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter font-jakarta">{ticker}</h1>
                            <span className="text-xs text-slate-500 font-bold tracking-tight uppercase font-jakarta shrink-0">{initialStockData.name}</span>
                            <FavoriteToggle ticker={ticker} name={initialStockData.name} />
                        </div>

                        {/* Row 2: Price + Extended Badge + Sector Badge */}
                        <div className="hidden sm:flex items-baseline gap-3 -mt-0.5 pl-[50px] lg:pl-[58px]">
                            <div className={`text-2xl font-black tracking-tighter tabular-nums leading-none ${pf.color}`}
                                style={pf.style}>
                                ${displayPrice?.toFixed(2) || '—'}
                            </div>
                            <div className={`text-sm font-bold tabular-nums tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                            </div>

                            {/* Extended Session Badge */}
                            {activeExtPrice > 0 && (
                                <div className="flex items-center gap-2 px-2.5 py-0.5 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                    <div className={`w-1.5 h-1.5 rounded-full ${activeExtType.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[11px] font-black uppercase tracking-widest font-jakarta ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {activeExtLabel}
                                        </span>
                                        <span className="text-xs font-bold text-slate-200 tabular-nums">
                                            ${activeExtPrice.toFixed(2)}
                                        </span>
                                        <span className={`text-[11px] tabular-nums font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Sector Badge */}
                            {companyOverview?.sector && (() => {
                                const s = companyOverview.sector.toLowerCase();
                                const sectorColor =
                                    s.includes('tech') ? { bg: 'rgba(6,182,212,0.15)', text: 'rgb(103,232,249)', border: 'rgba(6,182,212,0.25)' } :
                                        s.includes('health') || s.includes('pharma') || s.includes('bio') ? { bg: 'rgba(16,185,129,0.15)', text: 'rgb(110,231,183)', border: 'rgba(16,185,129,0.25)' } :
                                            s.includes('financ') || s.includes('bank') ? { bg: 'rgba(234,179,8,0.15)', text: 'rgb(253,224,71)', border: 'rgba(234,179,8,0.25)' } :
                                                s.includes('energy') || s.includes('oil') ? { bg: 'rgba(249,115,22,0.15)', text: 'rgb(253,186,116)', border: 'rgba(249,115,22,0.25)' } :
                                                    s.includes('consumer') && s.includes('defen') ? { bg: 'rgba(168,85,247,0.15)', text: 'rgb(216,180,254)', border: 'rgba(168,85,247,0.25)' } :
                                                        s.includes('consumer') ? { bg: 'rgba(236,72,153,0.15)', text: 'rgb(249,168,212)', border: 'rgba(236,72,153,0.25)' } :
                                                            s.includes('commun') || s.includes('media') || s.includes('telecom') ? { bg: 'rgba(239,68,68,0.15)', text: 'rgb(252,165,165)', border: 'rgba(239,68,68,0.25)' } :
                                                                s.includes('industr') || s.includes('aero') || s.includes('defense') ? { bg: 'rgba(100,116,139,0.20)', text: 'rgb(203,213,225)', border: 'rgba(100,116,139,0.30)' } :
                                                                    s.includes('real') || s.includes('estate') ? { bg: 'rgba(20,184,166,0.15)', text: 'rgb(153,246,228)', border: 'rgba(20,184,166,0.25)' } :
                                                                        s.includes('utilit') ? { bg: 'rgba(132,204,22,0.15)', text: 'rgb(190,242,100)', border: 'rgba(132,204,22,0.25)' } :
                                                                            s.includes('material') || s.includes('basic') ? { bg: 'rgba(217,119,6,0.15)', text: 'rgb(252,211,77)', border: 'rgba(217,119,6,0.25)' } :
                                                                                s.includes('semi') || s.includes('chip') ? { bg: 'rgba(59,130,246,0.15)', text: 'rgb(147,197,253)', border: 'rgba(59,130,246,0.25)' } :
                                                                                    { bg: 'rgba(99,102,241,0.15)', text: 'rgb(165,180,252)', border: 'rgba(99,102,241,0.25)' };
                                return (
                                    <span className="text-[12px] px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
                                        style={{
                                            backgroundColor: sectorColor.bg,
                                            color: sectorColor.text,
                                            borderWidth: '1px',
                                            borderColor: sectorColor.border,
                                            fontFamily: locale === 'ko' ? 'Pretendard, sans-serif' : locale === 'ja' ? "'Noto Sans JP', sans-serif" : "'Plus Jakarta Sans', sans-serif"
                                        }}>
                                        {companyOverview.sector.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Guide Link - pushed right via ml-auto, tight height */}
                    <div className="ml-auto hidden sm:flex items-center self-end mb-1">
                        <a href={`/how-it-works/command`} className="relative flex items-center gap-1.5 px-3.5 py-0.5 rounded-lg bg-cyan-500/[0.08] border border-cyan-400/25 hover:border-cyan-400/50 hover:bg-cyan-500/[0.15] backdrop-blur-md shadow-[0_0_15px_rgba(34,211,238,0.08)] hover:shadow-[0_0_25px_rgba(34,211,238,0.18)] transition-all duration-300 group whitespace-nowrap">
                            <BookOpen className="w-3.5 h-3.5 text-cyan-400/80 group-hover:text-cyan-300 transition-colors" />
                            <span className="text-[12px] text-cyan-300/90 group-hover:text-cyan-200 font-bold tracking-wide transition-colors leading-tight">{tCommon('guideLink')}</span>
                        </a>
                    </div>

                    {/* Right Column: Company Description with infographic background */}
                    {companyOverview?.description && (
                        <div className="hidden lg:flex items-center max-w-[45%] relative overflow-hidden rounded-xl px-5 py-2.5 border border-white/[0.06]"
                            style={{
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(59,130,246,0.05) 50%, rgba(15,23,42,0.3) 100%)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 0 20px rgba(99,102,241,0.06)'
                            }}>
                            {/* Infographic SVG background */}
                            <svg className="absolute inset-0 w-full h-full opacity-[0.12]" preserveAspectRatio="none" viewBox="0 0 400 80">
                                {/* Subtle grid dots */}
                                <pattern id="headerDots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                                    <circle cx="2" cy="2" r="0.5" fill="rgb(148,163,184)" />
                                </pattern>
                                <rect width="400" height="80" fill="url(#headerDots)" />
                                {/* Smooth chart line */}
                                <polyline points="0,60 40,55 80,42 120,48 160,32 200,36 240,22 280,26 320,16 360,19 400,12"
                                    fill="none" stroke="rgb(129,140,248)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                                {/* Area fill under chart */}
                                <polygon points="0,60 40,55 80,42 120,48 160,32 200,36 240,22 280,26 320,16 360,19 400,12 400,80 0,80"
                                    fill="url(#headerAreaGrad)" />
                                <linearGradient id="headerAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgb(129,140,248)" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="rgb(129,140,248)" stopOpacity="0" />
                                </linearGradient>
                            </svg>
                            <p className="relative text-[13px] text-slate-300/90 leading-relaxed z-10"
                                style={{ fontFamily: locale === 'ko' ? 'Pretendard, sans-serif' : locale === 'ja' ? "'Noto Sans JP', sans-serif" : "'Plus Jakarta Sans', sans-serif" }}>
                                {companyOverview.description}
                            </p>
                        </div>
                    )}
                </div>

                {/* Mobile Only: Price & Extended Row */}
                {/* [Fix] ALWAYS use displayPrice = Intraday Close. No fallback to lastTrade. */}
                <div className="flex flex-col gap-2 sm:hidden">
                    <div className="flex items-baseline gap-3">
                        <div className={`text-4xl font-black tracking-tighter tabular-nums ${pf.color}`}
                            style={pf.style}>
                            ${displayPrice?.toFixed(2) || '—'}
                        </div>
                        <div className={`text-xl font-bold font-mono tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                        </div>
                    </div>

                    {/* Extended Mobile */}
                    {activeExtPrice && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md w-fit">
                            <div className={`w-1.5 h-1.5 rounded-full ${activeExtType === 'PRE' ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />
                            <div className="flex items-baseline gap-2">
                                <span className={`text-[11px] font-black uppercase tracking-widest font-jakarta ${activeExtType === 'PRE' ? 'text-amber-400' : 'text-indigo-400'}`}>
                                    {activeExtType === 'PRE' ? 'Pre' : 'Post'}
                                </span>
                                <span className="text-sm font-bold text-slate-200 tabular-nums">
                                    ${activeExtPrice.toFixed(2)}
                                </span>
                                <span className={`text-xs font-mono font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* [PREMIUM-5x2] Quick Intel Gauges — 5 Columns × 2 Rows */}
            <div className="relative -mt-4 mb-3">
                <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 30%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(16,185,129,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.04) 0%, transparent 60%)' }} />
                <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-1.5">

                    {/* ═══ ROW 1: 실시간 / 당일 판단용 ═══ */}

                    {/* [1-1] VOLATILITY REGIME™ — PRO peek */}
                    <ProGate title="Vol Regime" mode="peek" compact>
                        {(() => {
                            const r = volatilityData;
                            const isHot = r?.regime === 'ERUPTING' || r?.regime === 'LOADED';
                            const regimeColor = r?.regime === 'ERUPTING' ? 'text-rose-400' : r?.regime === 'LOADED' ? 'text-amber-400' : r?.regime === 'COILING' ? 'text-cyan-400' : 'text-emerald-400';
                            const regimeBg = r?.regime === 'ERUPTING' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : r?.regime === 'LOADED' ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.12)]' : 'bg-slate-800/40 border-slate-700/50';
                            const regimeDesc = r?.regime === 'ERUPTING' ? td('volErupting') : r?.regime === 'LOADED' ? td('volLoaded') : r?.regime === 'COILING' ? td('volCoiling') : td('volStable');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${regimeBg}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 85% 50%, rgba(255,255,255,0.8) 0%, transparent 8%, transparent 12%, rgba(255,255,255,0.4) 13%, transparent 14%, transparent 22%, rgba(255,255,255,0.2) 23%, transparent 24%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Zap className={`w-3.5 h-3.5 ${isHot ? 'text-amber-400' : 'text-cyan-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">VOL REGIME</span>
                                        </div>
                                        <span className={`text-[11px] font-black px-1.5 py-px rounded font-jakarta ${isHot ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${regimeColor}`}>
                                            {r?.regime || '...'}
                                        </span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-lg font-black tabular-nums leading-none ${regimeColor}`}>{r?.regimeScore ?? '--'}</span>
                                        <span className="text-[11px] text-white font-bold">/100</span>
                                        <span className="text-[11px] text-white ml-0.5">{regimeDesc}</span>
                                    </div>
                                    <div className="relative z-10 flex gap-3 mt-1 text-[11px] tabular-nums">
                                        <span className="text-white/80 font-jakarta">GEX <span className={`font-bold ${r?.gexLabel === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>{r?.gexLabel || '--'}</span></span>
                                        <span className="text-white/80 font-jakarta">IV <span className="font-bold text-white">{r?.iv || '--'}%</span></span>
                                        <span className="text-white/80 font-jakarta">Flip <span className="font-bold text-white">{r?.flipDistance ? `${r.flipDistance > 0 ? '+' : ''}${r.flipDistance}%` : '--'}</span></span>
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">GEX + IV + Gamma Flip + Squeeze</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [1-2] CONVICTION MATRIX™ — PRO peek */}
                    <ProGate title="Conviction Matrix" mode="peek" compact>
                        {(() => {
                            const isBull = conviction && conviction.score >= 60;
                            const isBear = conviction && conviction.score <= 40;
                            const convDesc = conviction ? (conviction.score >= 70 ? td('convDescStrongBuy') : conviction.score >= 55 ? td('convDescBuy') : conviction.score <= 30 ? td('convDescSell') : conviction.score <= 45 ? td('convDescBearish') : td('convDescSearching')) : td('convDescCalc');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${isBull ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isBear ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "conic-gradient(from 220deg at 80% 60%, rgba(255,255,255,0.4) 0deg, transparent 60deg, transparent 360deg)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Target className="w-3.5 h-3.5 text-amber-400" />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">CONVICTION</span>
                                        </div>
                                        <span className={`text-[11px] font-black px-1.5 py-px rounded font-jakarta ${isBull ? 'bg-emerald-500/20 text-emerald-400' : isBear ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-white'}`}>{conviction?.grade || '...'}</span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-lg font-black tabular-nums leading-none ${isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-white'}`}>{conviction?.score ?? '--'}</span>
                                        <span className="text-[11px] text-white font-bold">/100</span>
                                        <span className="text-[11px] text-white ml-0.5">{convDesc}</span>
                                    </div>
                                    <div className="relative z-10 text-[11px] text-slate-300 mt-0.5">{conviction?.label || ''}</div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">{td('convComposite')}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [1-3] VWAP — FREE */}
                    {(() => {
                        const vwap = liveQuote?.vwap || initialStockData?.vwap || 0;
                        const price = displayPrice || 0;
                        const vwapDiff = vwap > 0 && price > 0 ? ((price - vwap) / vwap) * 100 : 0;
                        const vwapDesc = vwapDiff > 2 ? td('vwapAbove') : vwapDiff < -2 ? td('vwapBelow') : td('vwapNear');
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${vwapDiff > 2 ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : vwapDiff < -2 ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(255,255,255,0.3) 8px, rgba(255,255,255,0.3) 9px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                                        <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">VWAP</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded font-jakarta ${vwapDiff > 0 ? 'bg-emerald-500/20 text-emerald-400' : vwapDiff < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-white'}`}>
                                        {vwapDiff > 0 ? '+' : ''}{vwapDiff.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black font-mono tabular-nums leading-none ${vwapDiff > 0 ? 'text-emerald-400' : vwapDiff < 0 ? 'text-rose-400' : 'text-white'}`}>${vwap.toFixed(2)}</span>
                                </div>
                                <div className="relative z-10 text-[11px] text-white mt-0.5">{vwapDesc}</div>
                                <div className="relative z-10 text-[11px] text-slate-300 mt-px">{td('vwapDeviation')} {vwapDiff > 0 ? '+' : ''}{vwapDiff.toFixed(2)}{td('vwapDeviationSuffix')}</div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-slate-300 font-jakarta">{td('vwapFullDesc')}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [1-4] SHORT SQUEEZE™ — FREE peek */}
                    <ProGate title="Short Squeeze" mode="peek" compact>
                        {(() => {
                            const s = squeezeData;
                            const isCritical = s?.status === 'CRITICAL' || s?.status === 'HIGH';
                            const statusColor = s?.status === 'CRITICAL' ? 'text-rose-400' : s?.status === 'HIGH' ? 'text-amber-400' : s?.status === 'MEDIUM' ? 'text-cyan-400' : 'text-emerald-400';
                            const statusBg = s?.status === 'CRITICAL' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : s?.status === 'HIGH' ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.12)]' : 'bg-slate-800/40 border-slate-700/50';
                            const sqDesc = s?.status === 'CRITICAL' ? td('sqCritical') : s?.status === 'HIGH' ? td('sqHigh') : s?.status === 'MEDIUM' ? td('sqMedium') : td('sqLow');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${statusBg}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.3) 6px, rgba(255,255,255,0.3) 7px, transparent 7px, transparent 13px)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <ShieldAlert className={`w-3.5 h-3.5 ${isCritical ? 'text-rose-400' : 'text-orange-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">SHORT SQUEEZE</span>
                                        </div>
                                        <span className={`text-[11px] font-black px-1.5 py-px rounded font-jakarta ${isCritical ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${statusColor}`}>
                                            {s?.status || '...'}
                                        </span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-lg font-black tabular-nums leading-none ${statusColor}`}>{s?.siPercent !== undefined ? s.siPercent.toFixed(1) : '--'}%</span>
                                        <span className="text-[11px] text-white font-bold font-jakarta">SI%</span>
                                        <span className="text-[11px] text-white ml-0.5">{sqDesc}</span>
                                    </div>
                                    <div className="relative z-10 flex gap-3 mt-0.5 text-[11px] tabular-nums">
                                        <span className="text-white/80">{td('sqDaysToCover')} <span className="font-bold text-white">{s?.daysToCover?.toFixed(1) ?? '--'}{td('sqDays')}</span></span>
                                        <span className="text-white/80">{td('sqShortRatio')} <span className="font-bold text-white">{s?.shortVolPercent?.toFixed(0) ?? '--'}%</span></span>
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">SI% + Days to Cover + Short Vol</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [1-5] ANALYST TARGET — PRO peek */}
                    <ProGate title="Analyst Target" mode="peek" compact>
                        {(() => {
                            const isBullish = analystData?.consensus === 'STRONG BUY' || analystData?.consensus === 'BUY';
                            const isBearish = analystData?.consensus === 'SELL' || analystData?.consensus === 'STRONG SELL';
                            const bd = analystData?.breakdown;
                            const total = analystData?.totalAnalysts || 0;

                            const buyCount = bd ? bd.strongBuy + bd.buy : 0;
                            const buyPct = total > 0 ? Math.round((buyCount / total) * 100) : 0;
                            const consensusKr = analystData?.consensus === 'STRONG BUY' ? td('analystStrongBuy') : analystData?.consensus === 'BUY' ? td('analystBuy') : analystData?.consensus === 'HOLD' ? td('analystHold') : analystData?.consensus === 'SELL' ? td('analystSell') : analystData?.consensus === 'STRONG SELL' ? td('analystStrongSell') : '...';
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${isBullish ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isBearish ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.6) 0%, transparent 10%, transparent 18%, rgba(255,255,255,0.3) 19%, transparent 20%, transparent 30%, rgba(255,255,255,0.15) 31%, transparent 32%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Crosshair className={`w-3.5 h-3.5 ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-cyan-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">ANALYST TARGET</span>
                                        </div>
                                        <span className={`text-[11px] font-black px-1.5 py-px rounded ${isBullish ? 'bg-emerald-500/20 text-emerald-400' : isBearish ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-slate-300'}`}>{consensusKr}</span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-lg font-black tabular-nums leading-none ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-white'}`}>{buyPct}%</span>
                                        <span className="text-[11px] text-white font-bold">{td('analystBuyReco')}</span>
                                        <span className="text-[11px] text-white">{total} {td('analystOfTotal')}</span>
                                    </div>
                                    {bd && total > 0 && (
                                        <div className="relative z-10 mt-1">
                                            <div className="text-[11px] text-slate-300 tabular-nums font-jakarta">
                                                <span className="text-emerald-400 font-bold">Strong Buy {bd.strongBuy}</span>
                                                <span className="text-white/30 mx-0.5">|</span>
                                                <span className="text-emerald-400/70">Buy {bd.buy}</span>
                                                <span className="text-white/30 mx-0.5">|</span>
                                                <span className="text-white/60">Hold {bd.hold}</span>
                                                {(bd.sell > 0 || bd.strongSell > 0) && (
                                                    <>
                                                        <span className="text-white/30 mx-0.5">|</span>
                                                        <span className="text-rose-400/70">Sell {bd.sell + bd.strongSell}</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex h-1 rounded-full overflow-hidden bg-slate-800/40 mt-0.5">
                                                <div className="bg-emerald-500" style={{ width: `${(bd.strongBuy / total) * 100}%` }} />
                                                <div className="bg-emerald-400/60" style={{ width: `${(bd.buy / total) * 100}%` }} />
                                                <div className="bg-slate-500/80" style={{ width: `${(bd.hold / total) * 100}%` }} />
                                                <div className="bg-rose-400/60" style={{ width: `${(bd.sell / total) * 100}%` }} />
                                                <div className="bg-rose-500" style={{ width: `${(bd.strongSell / total) * 100}%` }} />
                                            </div>
                                            <div className="text-[11px] text-white mt-0.5">→ {total} {td('analystOfTotal')} <span className={`font-bold ${buyPct >= 70 ? 'text-emerald-400' : buyPct <= 30 ? 'text-rose-400' : 'text-white'}`}>{buyPct}%</span> {td('analystBuyReco')}</div>
                                        </div>
                                    )}
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">Analyst Consensus</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* ═══ ROW 2: 스윙 / 장기 판단용 ═══ */}

                    {/* [2-1] INSTITUTIONAL RADAR™ — PRO */}
                    <ProGate title="Inst Radar" mode="blur" compact>
                        {(() => {
                            const dp = institutionalData?.darkPool?.percent || 0;
                            const blockCount = institutionalData?.blockTrade?.count || 0;
                            const isAccumulation = dp > 40 && blockCount >= 3;
                            const isDistribution = dp < 20 && blockCount <= 1;
                            const signal = isAccumulation ? 'ACCUMULATION' : isDistribution ? 'DISTRIBUTION' : 'NEUTRAL';
                            const sigColor = isAccumulation ? 'text-emerald-400' : isDistribution ? 'text-rose-400' : 'text-slate-400';
                            const sigBg = isAccumulation ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isDistribution ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50';
                            const instDesc = isAccumulation ? td('instAccum') : isDistribution ? td('instDist') : td('instNormal');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${sigBg}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "conic-gradient(from 0deg at 80% 50%, rgba(255,255,255,0.5) 0deg, transparent 30deg, transparent 360deg), radial-gradient(circle at 80% 50%, transparent 20%, rgba(255,255,255,0.1) 21%, transparent 22%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Radar className={`w-3.5 h-3.5 ${isAccumulation ? 'text-emerald-400' : 'text-indigo-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">INST RADAR</span>
                                        </div>
                                        <span className={`text-[11px] font-black px-1.5 py-px rounded font-jakarta ${isAccumulation ? 'bg-emerald-500/20' : isDistribution ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${sigColor}`}>
                                            {signal}
                                        </span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-lg font-black tabular-nums leading-none ${dp > 35 ? 'text-indigo-400' : 'text-white/80'}`}>{dp.toFixed(1)}%</span>
                                        <span className="text-[11px] text-white font-bold">{td('instDarkPool')}</span>
                                        <span className="text-[11px] text-white ml-0.5">{instDesc}</span>
                                    </div>
                                    <div className="relative z-10 flex gap-3 mt-0.5 text-[11px] tabular-nums">
                                        <span className="text-white/80">{td('instBlock')} <span className="font-bold text-white">{blockCount}{td('instTrades')}</span></span>
                                        <span className="text-white/80">{td('sqShortRatio')} <span className="font-bold text-white">{institutionalData?.shortVolume?.percent?.toFixed(0) ?? '--'}%</span></span>
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">Dark Pool + Block Trade + Short Vol</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [2-2] TREND PHASE™ — PRO peek */}
                    <ProGate title="Trend Phase" mode="peek" compact>
                        {(() => {
                            const phase = smaData?.cross === 'GOLDEN' ? td('smaGolden') : smaData?.cross === 'DEAD' ? td('smaDead') : smaData?.label === 'ABOVE' ? td('smaAbove') : smaData?.label === 'BELOW' ? td('smaBelow') : '...';
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${smaData?.cross === 'GOLDEN' ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : smaData?.cross === 'DEAD' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 11px)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">TREND PHASE</span>
                                        </div>
                                        {smaData?.crossType === 'NEW' && (
                                            <span className="text-[11px] font-black px-1.5 py-px rounded bg-amber-500/30 text-amber-300 animate-pulse font-jakarta">NEW!</span>
                                        )}
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-2">
                                        <span className={`text-lg font-black leading-none ${smaData?.cross === 'GOLDEN' ? 'text-emerald-400' : smaData?.cross === 'DEAD' ? 'text-rose-400' : 'text-white'}`}>
                                            {smaData?.cross === 'GOLDEN' ? 'GOLDEN' : smaData?.cross === 'DEAD' ? 'DEAD' : smaData?.label || '--'}
                                        </span>
                                        <span className="text-[11px] text-white">{phase}</span>
                                    </div>
                                    {smaData && smaData.distance !== null && (
                                        <div className={`relative z-10 text-[11px] font-bold mt-0.5 ${smaData.distance > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {td('smaDeviation')} {smaData.distance > 0 ? '+' : ''}{smaData.distance}%
                                            {smaData.isImminent && <span className="ml-1 text-amber-400">⚡ {td('smaCrossImminent')}</span>}
                                        </div>
                                    )}
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">SMA 50/200 Cross Analysis</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [2-3] FUNDAMENTAL VALUE™ — PRO peek */}
                    <ProGate title="Fundamental" mode="peek" compact>
                        {(() => {
                            const f = fundamentalData;
                            const hasData = f && f.score > 0;
                            const gradeColor = f?.grade?.startsWith('A') ? 'text-emerald-400' : f?.grade?.startsWith('B') ? 'text-cyan-400' : f?.grade?.startsWith('C') ? 'text-amber-400' : 'text-slate-400';
                            const gradeBg = f?.grade?.startsWith('A') ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : f?.grade?.startsWith('B') ? 'bg-cyan-950/40 border-cyan-500/30' : 'bg-slate-800/40 border-slate-700/50';
                            const bd = f?.breakdown;
                            const fundDesc = !hasData ? td('fundCollecting') : f?.grade?.startsWith('A') ? td('fundExcellent') : f?.grade?.startsWith('B') ? td('fundGood') : f?.grade?.startsWith('C') ? td('fundAvg') : td('fundCaution');
                            // Display raw values even when score is 0
                            const pe = f?.pe; const de = f?.de; const roe = f?.roe; const rev = f?.revenueGrowth; const margin = f?.netMargin;
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${gradeBg}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 12px, rgba(255,255,255,0.15) 12px, rgba(255,255,255,0.15) 14px, transparent 14px, transparent 16px), linear-gradient(0deg, rgba(255,255,255,0.2) 0%, transparent 40%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Shield className={`w-3.5 h-3.5 ${hasData ? 'text-emerald-400' : 'text-amber-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">FUNDAMENTAL</span>
                                        </div>
                                        <span className={`text-[11px] font-black px-1.5 py-px rounded font-jakarta bg-slate-700/30 ${hasData ? gradeColor : 'text-slate-400'}`}>
                                            {hasData ? f?.grade : td('fundGradeCollecting')}
                                        </span>
                                    </div>
                                    {hasData ? (
                                        <div className="relative z-10 flex items-baseline gap-1.5">
                                            <span className={`text-lg font-black tabular-nums leading-none ${gradeColor}`}>{f?.score}</span>
                                            <span className="text-[11px] text-white font-bold">/100</span>
                                            <span className="text-[11px] text-white ml-0.5">{fundDesc}</span>
                                        </div>
                                    ) : (
                                        <div className="relative z-10">
                                            <span className="text-sm font-bold text-white/40 leading-none">{fundDesc}</span>
                                        </div>
                                    )}
                                    <div className="relative z-10 flex flex-wrap gap-x-2 mt-1 text-[11px] tabular-nums">
                                        {pe !== null && pe !== undefined && <span className="text-white/80 font-jakarta">PE <span className="font-bold text-white">{pe}</span></span>}
                                        {roe !== null && roe !== undefined && <span className="text-white/80 font-jakarta">ROE <span className="font-bold text-white">{roe}%</span></span>}
                                        {rev !== null && rev !== undefined && <span className="text-white/80">{td('fundRevenue')} <span className="font-bold text-white">{rev > 0 ? '+' : ''}{rev}%</span></span>}
                                        {margin !== null && margin !== undefined && <span className="text-white/80">{td('fundMargin')} <span className="font-bold text-white">{margin}%</span></span>}
                                        {de !== null && de !== undefined && <span className="text-white/80 font-jakarta">D/E <span className="font-bold text-white">{de}</span></span>}
                                        {!pe && !roe && !rev && !margin && !de && <span className="text-white/40">{td('fundApiWaiting')}</span>}
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[11px] text-slate-300 font-jakarta">PE + FCF + Rev + Margin + DE</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [2-4] EARNINGS — FREE */}
                    {(() => {
                        const rawDays = earningsData?.daysLabel || '';
                        const daysNum = parseInt(rawDays.replace(/\D/g, ''));
                        const isValidDays = !isNaN(daysNum);
                        const isImminent = isValidDays && daysNum >= 0 && daysNum <= 7;
                        const earnDesc = isValidDays ? (daysNum === 0 ? td('earnToday') : daysNum <= 3 ? td('earnImminent') : daysNum <= 14 ? `${daysNum}${td('earnDaysLater')}` : `${daysNum}${td('earnDaysAfter')}`) : '';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${isImminent ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(255,255,255,0.2) 14px, rgba(255,255,255,0.2) 15px), repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(255,255,255,0.2) 14px, rgba(255,255,255,0.2) 15px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">EARNINGS</span>
                                    </div>
                                    <span className={`text-[11px] font-bold px-1.5 py-px rounded font-jakarta ${isImminent ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/30 text-slate-300'}`}>
                                        {isValidDays ? `D-${daysNum}` : rawDays || 'TBD'}
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className="text-lg font-black text-white leading-none">{earningsData?.nextDate ? new Date(earningsData.nextDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}</span>
                                    {earningsData?.hourLabel && <span className="text-[11px] text-amber-400 font-bold">{earningsData.hourLabel === 'bmo' ? td('earnBeforeMarket') : earningsData.hourLabel === 'amc' ? td('earnAfterMarket') : earningsData.hourLabel === 'dmh' ? td('earnDuringMarket') : earningsData.hourLabel}</span>}
                                    {earnDesc && <span className="text-[11px] text-white ml-0.5">{earnDesc}</span>}
                                </div>
                                {earningsData?.epsEstimate !== null && earningsData?.epsEstimate !== undefined && (
                                    <div className="relative z-10 text-[11px] text-white mt-0.5">
                                        {td('estEps')} <span className="font-bold text-white/90">${earningsData.epsEstimate.toFixed(2)}</span>
                                        {earningsData?.quarter && earningsData?.year && <span className="text-white/40 ml-1">Q{earningsData.quarter} FY{earningsData.year}</span>}
                                    </div>
                                )}
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">{td('earningsCalendar')}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [2-5] RELATED */}
                    <div className="relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl bg-slate-800/40 border border-slate-700/50">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "12px 12px" }} />
                        <div className="relative z-10 flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5 text-violet-400" />
                                <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta">RELATED</span>
                            </div>
                            <span className="text-[12px] text-white">{td('relatedSector')}</span>
                        </div>
                        <div className="relative z-10 flex flex-col gap-1">
                            {relatedData?.topRelated && relatedData.topRelated.length > 0 ? (
                                relatedData.topRelated.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between cursor-pointer hover:bg-white/5 rounded px-1 -mx-1 transition-colors"
                                        onClick={() => window.location.href = `/${locale}/ticker?ticker=${item.ticker}`}>
                                        <div className="flex items-center gap-1.5">
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                src={`https://assets.parqet.com/logos/symbol/${item.ticker}?format=png`}
                                                alt={item.ticker}
                                                className="w-4 h-4 rounded-full object-cover bg-white/10"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                            <span className="text-[12px] font-bold text-white font-jakarta hover:text-indigo-300 transition-colors">{item.ticker}</span>
                                        </div>
                                        <span className={`text-[12px] font-bold tabular-nums ${item.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {item.change >= 0 ? '+' : ''}{item.change}%
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-[12px] text-slate-300 text-center py-1">{td('loading')}</div>
                            )}
                        </div>
                        <div className="relative z-10 mt-0.5">
                            <span className="text-[12px] text-slate-300 font-jakarta">Related Tickers</span>
                        </div>
                    </div>

                </div>
            </div>

            {/* COMMAND GRID (2 Columns: Main vs Sidebar) */}
            {
                (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[800px]">

                        {/* MAIN COLUMN (8 Cols) - Flex Structure */}
                        <div className="lg:col-span-8 flex flex-col items-stretch gap-4 h-full">
                            {/* A. Main Chart Section */}
                            {/* A. Main Chart Section (Height: 580px) */}
                            <div className="h-[580px] min-h-0 relative flex flex-col group shrink-0">
                                {/* Decorative Label (Absolute) */}
                                <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[11px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2 font-jakarta">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Price History
                                </div>

                                {/* Glass Card */}
                                <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-2xl relative backdrop-blur-md flex flex-col">
                                    {/* Texture Overlay */}
                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-20" />
                                    <div className="flex-1 min-h-0 relative z-10 p-1 pb-2">
                                        {liveChartData && liveChartData.length > 0 ? (
                                            <StockChart
                                                key={`${ticker}:${range}`}
                                                data={liveChartData}
                                                color={(displayChangePct || 0) >= 0 ? "#10b981" : "#f43f5e"}
                                                ticker={ticker}
                                                initialRange={range}
                                                currentPrice={
                                                    // POST/PRE/CLOSED(with post data): use extended price so chart tracks after-hours movement
                                                    (effectiveSession === 'POST' || effectiveSession === 'PRE' || effectiveSession === 'CLOSED') && activeExtPrice > 0
                                                        ? activeExtPrice
                                                        : (livePrice?.price || liveQuote?.prices?.lastTrade || displayPrice)
                                                }
                                                prevClose={
                                                    // POST/CLOSED: reference line = today's regular close (industry standard: Yahoo, TradingView)
                                                    (effectiveSession === 'POST' || (effectiveSession === 'CLOSED' && activeExtPrice > 0)) && displayPrice > 0
                                                        ? displayPrice
                                                        : (liveQuote?.prices?.prevRegularClose || (initialStockData as any)?.prices?.prevClose || initialStockData?.prevClose)
                                                }
                                                rsi={initialStockData.rsi}
                                                return3d={initialStockData.return3d}
                                            />
                                        ) : (
                                            /* Premium Chart Skeleton — shown while chart data loads */
                                            <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden">
                                                {/* Fake chart grid lines */}
                                                <div className="absolute inset-0 flex flex-col justify-between px-6 py-8 pointer-events-none">
                                                    {[...Array(5)].map((_, i) => (
                                                        <div key={i} className="w-full h-px bg-white/[0.03]" />
                                                    ))}
                                                </div>
                                                {/* Animated fake chart line (SVG) */}
                                                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
                                                    <defs>
                                                        <linearGradient id="chartSkeletonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                                                            <stop offset="50%" stopColor="rgb(99,102,241)" stopOpacity="0.3" />
                                                            <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                                                        </linearGradient>
                                                        <linearGradient id="chartSkeletonFill" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.08" />
                                                            <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path
                                                        d="M0,120 Q50,100 100,110 T200,90 T300,100 T400,80"
                                                        fill="none"
                                                        stroke="url(#chartSkeletonGrad)"
                                                        strokeWidth="2"
                                                        className="animate-pulse"
                                                    />
                                                    <path
                                                        d="M0,120 Q50,100 100,110 T200,90 T300,100 T400,80 L400,200 L0,200 Z"
                                                        fill="url(#chartSkeletonFill)"
                                                        className="animate-pulse"
                                                    />
                                                </svg>
                                                {/* Shimmer sweep */}
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_2s_infinite] pointer-events-none"
                                                    style={{ animationTimingFunction: 'ease-in-out' }} />
                                                {/* Loading indicator */}
                                                <div className="relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                                    <span className="text-[11px] font-mono text-slate-400 tracking-wider font-jakarta">LOADING CHART DATA</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* B. Advanced Options Analysis (Fixed Height: 400px) — PRO */}
                            <ProGate title="Tactical Range & Gamma Engine" mode="blur" fomoMessage="Max Pain · Call Wall · Put Floor · Net GEX · Gamma Flip Level · Squeeze Risk">
                                <div className="h-[400px] min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">

                                    {/* 1. TACTICAL RANGE (Depth Gauge + Max Pain) */}
                                    <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                        {/* Infographic BG: Micro Grid + Level Lines */}
                                        <div className="absolute inset-0 pointer-events-none z-0">
                                            {/* Fine grid */}
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(251,191,36,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(251,191,36,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
                                            {/* Horizontal level indicators */}
                                            <div className="absolute top-[25%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-500/25 to-transparent" />
                                            <div className="absolute top-[50%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
                                            <div className="absolute top-[75%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />
                                            {/* Corner depth markers */}
                                            <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-amber-500/30" />
                                            <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-amber-500/30" />
                                            <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-amber-500/30" />
                                            <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-amber-500/30" />
                                        </div>
                                        {/* Loading Overlay - 첫 로드시에만 표시 (폴링 깜빡임 방지) */}
                                        {structLoading && !structure && (
                                            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                                    <span className="text-[11px] text-cyan-400/80 font-bold uppercase tracking-wider font-jakarta">Loading...</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Header */}
                                        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm animate-pulse" />
                                                    Tactical Range
                                                </h4>
                                                {structure?.expiration && (() => {
                                                    const expDate = new Date(structure.expiration + 'T16:00:00-05:00');
                                                    const now = new Date();
                                                    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                                    return diffDays >= 0 ? (
                                                        <span className={`text-[11px] font-black px-1.5 py-0.5 rounded font-jakarta ${diffDays <= 1 ? 'bg-rose-950/50 text-rose-400 border border-rose-500/30' : 'bg-cyan-950/50 text-cyan-400 border border-cyan-500/30'}`}>
                                                            D-{diffDays}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-amber-500 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30 flex items-center gap-2 shadow-lg">
                                                    <span className="text-[11px] font-black tracking-tighter font-jakarta">MAX PAIN</span>
                                                    <span className="text-[11px] text-amber-300/70 font-medium uppercase tracking-tighter">({t('maxPainLabel')})</span>
                                                    <span className="text-sm font-black pl-1 border-l border-amber-500/20">${structure?.maxPain || initialStockData.flow?.maxPain || "---"}</span>
                                                    {(structure?.maxPain || initialStockData.flow?.maxPain) && (
                                                        <span className={`text-[11px] font-bold ml-1 font-jakarta ${((displayPrice - (structure?.maxPain || initialStockData.flow?.maxPain)) / (structure?.maxPain || initialStockData.flow?.maxPain)) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                            ({((displayPrice - (structure?.maxPain || initialStockData.flow?.maxPain)) / (structure?.maxPain || initialStockData.flow?.maxPain) * 100).toFixed(1)}%)
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Visual Body */}
                                        <div className="flex-1 relative flex items-center justify-center p-4">
                                            {/* Range Bar Background */}
                                            <div className="w-2 h-full bg-slate-800 rounded-full relative overflow-hidden">
                                                <div className="absolute top-0 inset-x-0 h-1/3 bg-gradient-to-b from-rose-500/20 to-transparent" />
                                                <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-emerald-500/20 to-transparent" />

                                                {/* Max Pain "Gravity" Center Line */}
                                                <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-1 bg-amber-500/50 blur-[2px]" />
                                            </div>

                                            {/* Markers */}
                                            <div className="absolute inset-y-4 left-0 right-0 flex flex-col justify-between px-8">
                                                {/* Resistance (Call Wall) */}
                                                <div className="flex items-center gap-2 border-b border-rose-500/30 pb-1">
                                                    <span className="text-[11px] font-bold text-rose-400 w-12 text-right font-jakarta">RESIST</span>
                                                    <span className="text-sm font-black text-rose-200 tracking-wider">${structure?.levels?.callWall || "---"}</span>
                                                </div>

                                                {/* Max Pain Marker (Center Concept) */}
                                                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex items-center justify-end pr-8 gap-2 opacity-90">
                                                    <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider font-jakarta">Max Pain</span>
                                                    <div className="w-12 h-[1px] bg-amber-500/50" />
                                                </div>


                                                {/* Current Price Indicator (Floating) */}
                                                <div className="w-full flex items-center gap-2 my-auto z-10 relative">
                                                    <div className="h-[1px] flex-1 bg-indigo-500/50" />
                                                    <div className="flex flex-col items-center">
                                                        <div className="px-3 py-1 bg-indigo-600 rounded shadow-[0_0_15px_rgba(79,70,229,0.5)] border border-white/20 text-white font-black text-lg tracking-tight z-10 min-w-[100px] text-center">
                                                            ${displayPrice.toFixed(2)}
                                                        </div>
                                                    </div>
                                                    <div className="h-[1px] flex-1 bg-indigo-500/50" />
                                                </div>

                                                {/* Support (Put Floor) */}
                                                <div className="flex items-center gap-2 border-t border-emerald-500/30 pt-1">
                                                    <span className="text-[11px] font-bold text-emerald-400 w-12 text-right font-jakarta">SUPPORT</span>
                                                    <span className="text-sm font-black text-emerald-200 tracking-wider">${structure?.levels?.putFloor || "---"}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Tactical Metrics - Small Grid */}
                                        <div className="px-3 py-2 border-t border-white/5 bg-slate-950/20 grid grid-cols-2 gap-2">
                                            {/* Max Pain Distance % */}
                                            {(() => {
                                                const maxPain = structure?.maxPain || 0;
                                                const distance = maxPain ? ((displayPrice - maxPain) / maxPain * 100) : 0;
                                                const absDistance = Math.abs(distance);
                                                const color = absDistance < 1 ? "text-amber-400" : distance > 0 ? "text-rose-400" : "text-emerald-400";
                                                return (
                                                    <div className="bg-slate-800/40 rounded-md px-2 py-1.5 border border-white/5">
                                                        <div className="text-[11px] text-slate-400 font-bold uppercase font-jakarta">{t('maxPainDistance')}</div>
                                                        <div className={`text-sm font-black ${color}`}>
                                                            {distance > 0 ? "+" : ""}{distance.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Range Width % */}
                                            {(() => {
                                                const resist = structure?.levels?.callWall || displayPrice * 1.05;
                                                const support = structure?.levels?.putFloor || displayPrice * 0.95;
                                                const rangeWidth = resist && support ? ((resist - support) / displayPrice * 100) : 0;
                                                const color = rangeWidth > 10 ? "text-rose-400" : rangeWidth > 5 ? "text-amber-400" : "text-emerald-400";
                                                return (
                                                    <div className="bg-slate-800/40 rounded-md px-2 py-1.5 border border-white/5">
                                                        <div className="text-[11px] text-slate-400 font-bold uppercase font-jakarta">{t('rangeWidth')}</div>
                                                        <div className={`text-sm font-black ${color}`}>
                                                            {rangeWidth.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Insight Footer */}
                                        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/30">
                                            <p className="text-[11px] text-slate-300 leading-relaxed">
                                                {displayPrice > (structure?.maxPain || 0)
                                                    ? t('aboveMaxPain')
                                                    : displayPrice < (structure?.maxPain || 0)
                                                        ? t('belowMaxPain')
                                                        : t('nearMaxPain')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 2. NET GAMMA ENGINE (Infographic Style) */}
                                    <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                        {/* Infographic BG: Scanlines + Energy Pulse */}
                                        <div className="absolute inset-0 pointer-events-none z-0">
                                            {/* Horizontal scanlines */}
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(168,85,247,0.04)_1px,transparent_1px)] bg-[size:100%_8px]" />
                                            {/* Diagonal tech lines */}
                                            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(168,85,247,0.05)_25%,transparent_25%,transparent_50%,rgba(168,85,247,0.05)_50%,rgba(168,85,247,0.05)_75%,transparent_75%)] bg-[size:40px_40px]" />
                                            {/* Energy pulse glow - top right */}
                                            <div className="absolute -top-10 -right-10 w-48 h-48 bg-[radial-gradient(circle,rgba(168,85,247,0.12)_0%,transparent_60%)] animate-pulse" style={{ animationDuration: '5s' }} />
                                            {/* Corner frames */}
                                            <div className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-purple-500/15 rounded-tr-2xl" />
                                            <div className="absolute bottom-0 left-0 w-16 h-16 border-l-2 border-b-2 border-purple-500/15 rounded-bl-2xl" />
                                            {/* Bottom accent */}
                                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
                                        </div>
                                        {/* Loading Overlay - 첫 로드시에만 표시 (폴링 깜빡임 방지) */}
                                        {structLoading && !structure && (
                                            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                                    <span className="text-[11px] text-cyan-400/80 font-bold uppercase tracking-wider font-jakarta">Loading...</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Header */}
                                        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 font-jakarta">
                                                <Activity size={10} className={structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"} />
                                                NET GAMMA ENGINE
                                            </h4>
                                            {structure?.expiration && (
                                                <span className="text-xs text-white font-mono font-jakarta">EXP: {structure.expiration}</span>
                                            )}
                                        </div>

                                        {/* Main Content - Infographic Layout */}
                                        <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
                                            {/* Top Row: Core GEX + Status + P/C OI Circle */}
                                            <div className="flex items-center justify-between gap-4">
                                                {/* Left: Reactor Core (GEX Only) */}
                                                <div className="relative shrink-0">
                                                    <div className={`w-20 h-20 rounded-full border-4 border-dashed ${structure?.netGex > 0 ? "border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.5)]"} flex items-center justify-center animate-[spin_10s_linear_infinite]`} />
                                                    <div className={`absolute inset-2 rounded-full bg-slate-900/95 flex flex-col items-center justify-center border ${structure?.netGex > 0 ? "border-emerald-500/50" : "border-rose-500/50"}`}>
                                                        <div className="text-[11px] text-slate-400 uppercase font-bold font-jakarta">NET GEX</div>
                                                        <div className={`text-lg font-black ${structure?.netGex > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                                            {structure?.netGex ? (structure.netGex / 1000000).toFixed(1) + "M" : "0.0M"}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Center: Status */}
                                                <div className="flex-1">
                                                    <div className={`text-sm font-black ${structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                        {structure?.netGex > 0 ? "⚡ STABLE" : "⚡ VOLATILE"}
                                                    </div>
                                                    <div className="text-[11px] text-white/90 leading-snug mt-0.5">
                                                        {structure?.netGex > 0
                                                            ? t('netGexStable')
                                                            : t('netGexVolatile')}
                                                    </div>
                                                </div>

                                                {/* Right: P/C & OI Circle (White Dashed) */}
                                                <div className="relative shrink-0">
                                                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center" />
                                                    <div className="absolute inset-1 rounded-full bg-slate-900/80 flex flex-col items-center justify-center">
                                                        {(() => {
                                                            const callsTotal = structure?.structure?.callsOI?.reduce((a: number, b: number) => a + (b || 0), 0) || 0;
                                                            const putsTotal = structure?.structure?.putsOI?.reduce((a: number, b: number) => a + (b || 0), 0) || 0;
                                                            const pcr = callsTotal > 0 ? (putsTotal / callsTotal) : 0;
                                                            const totalOI = callsTotal + putsTotal;
                                                            const oiFormatted = totalOI >= 1000000 ? (totalOI / 1000000).toFixed(1) + "M"
                                                                : totalOI >= 1000 ? (totalOI / 1000).toFixed(0) + "K" : totalOI.toString();
                                                            const pcrColor = pcr > 1.2 ? "text-rose-400" : pcr < 0.8 ? "text-emerald-400" : "text-white";
                                                            return (
                                                                <>
                                                                    <div className="text-[11px] text-white/90 uppercase font-bold font-jakarta">P/C Ratio</div>
                                                                    <div className={`text-sm font-black ${pcrColor}`}>{pcr.toFixed(2)}</div>
                                                                    <div className="text-[11px] text-white/90 uppercase font-bold font-jakarta mt-1">Total OI</div>
                                                                    <div className="text-sm font-black text-indigo-300">{oiFormatted}</div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Gamma Flip Level - Infographic Style (No Emoji) */}
                                            {/* [V7.2] Show loading state until options_status === "OK" for accurate data */}
                                            {structure?.gammaFlipLevel && structure?.options_status === "OK" ? (
                                                <div className="relative p-3 rounded-xl bg-gradient-to-r from-amber-950/50 via-amber-900/30 to-amber-950/50 border border-amber-500/40 overflow-hidden">
                                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.15),transparent_70%)]" />

                                                    <div className="relative z-10 flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-3">
                                                            {/* Infographic Icon (No Emoji) */}
                                                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-600/20 flex items-center justify-center border border-amber-500/40">
                                                                <div className="w-4 h-4 border-2 border-amber-400 rounded-full relative">
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <div className="w-1 h-3 bg-amber-400 rounded-full" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-xs text-amber-400 font-black uppercase tracking-wider flex items-center gap-2">
                                                                    Gamma Flip Level
                                                                    <span className="text-[11px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold font-jakarta">READY</span>
                                                                </div>
                                                                <div className="text-[11px] text-white/70">{t('gammaFlipLevel')}</div>
                                                            </div>
                                                        </div>

                                                        <div className="text-right">
                                                            <div className="text-2xl font-black text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)] flex items-center justify-end gap-1.5">
                                                                ${structure.gammaFlipLevel}
                                                                {structure.gammaFlipType === 'MULTI_EXP' && (
                                                                    <span className="text-[11px] bg-purple-500/80 text-white px-1 py-0.5 rounded font-bold font-jakarta">60D</span>
                                                                )}
                                                            </div>
                                                            {displayPrice && (
                                                                <div className={`text-[11px] font-bold font-jakarta ${displayPrice > structure.gammaFlipLevel ? "text-emerald-400" : "text-rose-400"}`}>
                                                                    {displayPrice > structure.gammaFlipLevel
                                                                        ? t('longGammaZone')
                                                                        : t('shortGammaZone')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Position Bar with Labels */}
                                                    <div className="relative z-10">
                                                        <div className="flex justify-between text-[11px] mb-0.5">
                                                            <span className="text-rose-400 font-bold">{t('shortGammaLabel')}</span>
                                                            <span className="text-white/50">← Flip →</span>
                                                            <span className="text-emerald-400 font-bold">{t('longGammaLabel')}</span>
                                                        </div>
                                                        <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                                                            {(() => {
                                                                const flip = structure.gammaFlipLevel;
                                                                const low = flip * 0.93;
                                                                const high = flip * 1.07;
                                                                const range = high - low;
                                                                const pos = Math.min(100, Math.max(0, ((displayPrice - low) / range) * 100));
                                                                return (
                                                                    <>
                                                                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-600/60 to-rose-500/40" style={{ width: '50%' }} />
                                                                        <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-600/60 to-emerald-500/40" style={{ width: '50%' }} />
                                                                        <div
                                                                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] border-2 border-slate-700"
                                                                            style={{ left: `${pos}%`, transform: 'translate(-50%, -50%)' }}
                                                                        />
                                                                        <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" style={{ left: '50%' }} />
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div className="flex justify-between text-[11px] text-white/70 mt-0.5">
                                                            <span>${(structure.gammaFlipLevel * 0.93).toFixed(0)}</span>
                                                            <span className="text-amber-300 font-bold">${structure.gammaFlipLevel}</span>
                                                            <span>${(structure.gammaFlipLevel * 1.07).toFixed(0)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : structure && structure.options_status !== "OK" ? (
                                                /* Loading State - Show while options data is being fetched */
                                                <div className="relative p-3 rounded-xl bg-gradient-to-r from-slate-900/50 via-slate-800/30 to-slate-900/50 border border-slate-600/40 overflow-hidden">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-600/40 animate-pulse">
                                                            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-slate-300 font-black uppercase tracking-wider flex items-center gap-2 font-jakarta">
                                                                Gamma Flip Level
                                                                <span className="text-[11px] bg-slate-600/80 text-white px-1.5 py-0.5 rounded font-bold animate-pulse font-jakarta">LOADING</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-300">{t('optionsDataLoading')}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : structure && structure.options_status === "OK" && !structure.gammaFlipLevel ? (
                                                /* [V7.5] Context-Aware Empty State - Show meaningful message based on netGex */
                                                (() => {
                                                    const netGex = structure?.netGex;
                                                    // [FIX] Low liquidity = netGex is null AND gammaCoverage is low
                                                    // If netGex exists (even if 0), data is sufficient
                                                    const gammaCoverage = structure?.debug?.gammaCoverage || structure?.gammaCoverage || 0;
                                                    const isLowLiquidity = netGex === null && gammaCoverage < 0.5;

                                                    // Determine message based on gamma state
                                                    let message = "";
                                                    let badgeText = "N/A";
                                                    let badgeColor = "bg-slate-700/80 text-slate-300";

                                                    // [FIX] Use gammaFlipType from API instead of inferring from netGex
                                                    const gammaFlipType = structure?.gammaFlipType;

                                                    if (isLowLiquidity) {
                                                        message = t('lowOptionsLiquidity');
                                                    } else if (gammaFlipType === 'ALL_SHORT') {
                                                        message = t('allShortGammaNoFlip');
                                                        badgeText = "SHORT";
                                                        badgeColor = "bg-rose-600/80 text-white";
                                                    } else if (gammaFlipType === 'ALL_LONG') {
                                                        message = t('allLongGammaNoFlip');
                                                        badgeText = "LONG";
                                                        badgeColor = "bg-emerald-600/80 text-white";
                                                    } else if (netGex !== null && netGex === 0) {
                                                        message = t('gexBalanceNoFlip');
                                                    } else {
                                                        message = t('gammaDataUnavailable');
                                                    }

                                                    // Trading interpretation for ALL_LONG / ALL_SHORT
                                                    const interpretation = gammaFlipType === 'ALL_LONG'
                                                        ? td('volShrink')
                                                        : gammaFlipType === 'ALL_SHORT'
                                                            ? td('volExpand')
                                                            : "";

                                                    return (
                                                        <div className="relative p-3 rounded-xl bg-gradient-to-r from-slate-900/50 via-slate-800/30 to-slate-900/50 border border-slate-600/40 overflow-hidden">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${netGex < 0 ? 'bg-rose-900/30 border-rose-500/40' : netGex > 0 ? 'bg-emerald-900/30 border-emerald-500/40' : 'bg-slate-800/50 border-slate-600/40'}`}>
                                                                    {netGex < 0 ? <TrendingDown className="w-4 h-4 text-rose-400" /> :
                                                                        netGex > 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> :
                                                                            <AlertCircle className="w-4 h-4 text-slate-500" />}
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs text-slate-300 font-black uppercase tracking-wider flex items-center gap-2 font-jakarta">
                                                                        Gamma Flip Level
                                                                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold font-jakarta ${badgeColor}`}>{badgeText}</span>
                                                                    </div>
                                                                    <div className="text-[11px] text-slate-300">{message}</div>
                                                                    {interpretation && (
                                                                        <div className={`text-[11px] font-bold mt-0.5 ${gammaFlipType === 'ALL_LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                            {interpretation}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            ) : null}

                                            {/* Infographic Grid - 0DTE & Squeeze Risk */}
                                            <div className="grid grid-cols-2 gap-2">
                                                {/* Gamma Concentration */}
                                                <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[11px] text-white font-bold uppercase font-jakarta">GAMMA CONC. {td('gammaConc')}</span>
                                                    </div>
                                                    {(() => {
                                                        const concentration = structure?.gammaConcentration ?? 0;
                                                        const label = structure?.gammaConcentrationLabel ?? 'NORMAL';
                                                        const color = label === 'STICKY' ? 'text-amber-400'
                                                            : label === 'LOOSE' ? 'text-emerald-400' : 'text-slate-300';
                                                        const desc = label === 'STICKY' ? td('gammaSticky')
                                                            : label === 'LOOSE' ? td('gammaLoose') : td('gammaBalanced');
                                                        return (
                                                            <div>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className={`text-lg font-black ${color}`}>{concentration}%</span>
                                                                    <span className={`text-xs font-semibold ${color}`}>{label}</span>
                                                                </div>
                                                                <div className="text-[11px] text-white mt-0.5">{desc}</div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Squeeze Risk */}
                                                <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[11px] text-white font-bold uppercase font-jakarta">Squeeze Risk</span>
                                                    </div>
                                                    {(() => {
                                                        // [V45.17] Use server-calculated squeezeRisk (SSOT)
                                                        const risk = structure?.squeezeRisk || 'LOW';
                                                        const score = structure?.squeezeScore ?? 0;
                                                        const color = risk === "EXTREME" ? "text-rose-400"
                                                            : risk === "HIGH" ? "text-amber-400"
                                                                : risk === "MEDIUM" ? "text-yellow-400" : "text-emerald-400";
                                                        return (
                                                            <div className="flex items-baseline gap-1">
                                                                <span className={`text-lg font-black ${color}`}>{risk}</span>
                                                                <span className="text-xs text-white/60 font-semibold">({score})</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* MM Insight Footer (Simplified) */}
                                        <div className="px-3 py-2 border-t border-white/5 bg-slate-950/30">
                                            <p className="text-[11px] text-slate-300 leading-relaxed">
                                                {structure?.netGex > 0 ? t('longGammaStable') : t('shortGammaWarning')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </ProGate>


                            <div className="hidden">
                                {/* Gamma Structure */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-3 bg-slate-500 rounded-full" /> Key Market Levels
                                        </h4>
                                        {(structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone) && (
                                            <span className="text-[11px] text-amber-500 font-black font-jakarta">
                                                Max Pain ({td('maxPainLabel')}): ${structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone}
                                            </span>
                                        )}
                                    </div>
                                    <Card className="border-white/10 bg-slate-900/40 shadow-sm p-0 overflow-hidden">
                                        <CardContent className="p-0 h-[300px]">
                                            <GammaLevelsViz
                                                currentPrice={displayPrice}
                                                callWall={structure?.levels?.callWall || initialStockData.flow?.callWall}
                                                putFloor={structure?.levels?.putFloor || initialStockData.flow?.putFloor}
                                                pinZone={structure?.levels?.pinZone || initialStockData.flow?.pinZone}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Net GEX & Strikes */}
                                <div className="space-y-2">
                                    <div className="flex items-center px-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-3 bg-slate-500 rounded-full" /> Net Gamma Exposure
                                        </h4>
                                    </div>
                                    <Card className="border-white/10 bg-slate-900/40 shadow-sm p-0 overflow-hidden">
                                        <CardContent className="pt-6 px-4 space-y-6">
                                            <div className="text-center">
                                                <div className={`text-4xl font-black ${structure?.netGex > 0 ? "text-emerald-400" : structure?.netGex < 0 ? "text-rose-400" : "text-white"}`}>
                                                    {structure?.netGex ? (structure.netGex > 0 ? "+" : "") + (structure.netGex / 1000000).toFixed(2) + "M" : "—"}
                                                </div>
                                                <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-1 flex items-center justify-center gap-1 font-jakarta">
                                                    {td('netGexLabel')}
                                                    <span title={td('gexTooltip')}>
                                                        <Info size={10} className="text-slate-500 hover:text-slate-300 cursor-help" />
                                                    </span>
                                                </div>

                                                {/* 0DTE Pulse Indicator (New) */}
                                                {structure?.gexZeroDteRatio !== undefined && (
                                                    <div className="mt-3 px-4">
                                                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1 tracking-wider uppercase font-jakarta">
                                                            <span className="flex items-center gap-1"><Zap size={10} className="text-amber-400" /> 0DTE Velocity</span>
                                                            <span className={structure.gexZeroDteRatio > 0.3 ? "text-amber-400" : "text-slate-600"}>{(structure.gexZeroDteRatio * 100).toFixed(0)}% Impact</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${structure.gexZeroDteRatio > 0.3 ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-slate-600"} transition-all duration-1000`}
                                                                style={{ width: `${Math.min(100, Math.max(5, (structure.gexZeroDteRatio || 0) * 100))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Expert Interpretation */}
                                                <div className={`mt-4 text-[11px] font-bold px-2 py-1 rounded inline-block ${structure?.netGex > 0 ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20" : structure?.netGex < 0 ? "bg-rose-950/30 text-rose-400 border border-rose-500/20" : "bg-slate-800 text-slate-400"}`}>
                                                    {structure?.netGex > 0 ? td('gexBullish') : structure?.netGex < 0 ? td('gexBearish') : td('gexNeutral')}
                                                </div>
                                                <div className="mt-4 flex justify-center gap-4 text-[11px] font-medium text-slate-400 border-t border-white/5 pt-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                                        <span>{td('gexSafeZone')}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                                                        <span>{td('gexAccelZone')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="h-auto min-h-[250px]">
                                                {showStructure && (
                                                    <OIChart
                                                        strikes={structure.structure.strikes}
                                                        callsOI={structure.structure.callsOI}
                                                        putsOI={structure.structure.putsOI}
                                                        currentPrice={displayPrice}
                                                        maxPain={structure.maxPain}
                                                        callWall={structure.levels?.callWall}
                                                        putFloor={structure.levels?.putFloor}
                                                    />
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>


                            {/* C. ATM Chain (Raw) - REMOVED per user request (redundant with Flow Radar) */}
                            <section className="hidden">
                            </section>
                        </div>

                        {/* SIDEBAR (4 Cols) - Glass Stack */}
                        <div className="lg:col-span-4 flex flex-col gap-4 h-full overflow-hidden">

                            {/* 1. Decision Gate (Signal Core) — ELITE */}
                            <EliteGate title="Signal Core" mode="blur">
                                <div className="shrink-0 relative rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden group hover:border-white/20 transition-colors shadow-2xl">
                                    {/* Infographic BG: Radar Grid + Sentinel Glow */}
                                    <div className="absolute inset-0 pointer-events-none z-0">
                                        {/* Crosshair grid */}
                                        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.07)_1px,transparent_1px)] bg-[size:24px_24px]" />
                                        {/* Radar sweep glow */}
                                        <div className="absolute -top-20 -right-20 w-60 h-60 bg-[radial-gradient(circle,rgba(99,102,241,0.18)_0%,transparent_70%)] animate-pulse" style={{ animationDuration: '4s' }} />
                                        {/* Bottom accent line */}
                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
                                        {/* Corner accent */}
                                        <div className="absolute top-0 right-0 w-20 h-20 border-r-2 border-t-2 border-indigo-500/20 rounded-tr-2xl" />
                                        <div className="absolute bottom-0 left-0 w-20 h-20 border-l-2 border-b-2 border-indigo-500/20 rounded-bl-2xl" />
                                    </div>
                                    <DecisionGate
                                        ticker={ticker}
                                        displayPrice={displayPrice}
                                        session={effectiveSession}
                                        structure={structure}
                                        krNews={krNews}
                                        smaData={smaData}
                                        newsScore={newsScore}
                                        liveQuote={liveQuote}
                                        analystData={analystData}
                                        fundamentalData={fundamentalData}
                                        institutionalData={institutionalData}
                                    />
                                </div>
                            </EliteGate>

                            {/* 2. Flow Unit — ELITE */}
                            <EliteGate title="Flow Unit" mode="blur">
                                <div className="shrink-0 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden relative group hover:border-white/20 transition-colors shadow-2xl">
                                    {/* Infographic BG: Flow Pulse + Wave Pattern */}
                                    <div className="absolute inset-0 pointer-events-none z-0">
                                        {/* Horizontal flow lines */}
                                        <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_0%,transparent_48%,rgba(56,189,248,0.07)_49%,rgba(56,189,248,0.07)_51%,transparent_52%,transparent_100%)] bg-[size:100%_20px]" />
                                        {/* Pulse glow top-left */}
                                        <div className="absolute -top-10 -left-10 w-48 h-48 bg-[radial-gradient(circle,rgba(56,189,248,0.15)_0%,transparent_70%)]" />
                                        {/* Bottom-right emerald glow for bullish feel */}
                                        <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-[radial-gradient(circle,rgba(52,211,153,0.12)_0%,transparent_70%)]" />
                                        {/* Accent lines */}
                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />
                                        <div className="absolute top-0 left-0 bottom-0 w-px bg-gradient-to-b from-sky-500/25 via-transparent to-transparent" />
                                    </div>
                                    <div className="p-2 border-b border-white/5 flex items-center justify-between bg-white/5">
                                        <div className="flex items-center gap-2">
                                            <Activity size={10} className="text-sky-400" />
                                            <span className="text-[11px] font-black text-sky-200 uppercase tracking-widest font-jakarta">Flow Unit</span>
                                        </div>
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded border font-jakarta ${effectiveSession === 'REG' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/20' :
                                            effectiveSession === 'PRE' ? 'bg-amber-900/50 text-amber-400 border-amber-500/20' :
                                                effectiveSession === 'POST' ? 'bg-blue-900/50 text-blue-400 border-blue-500/20' :
                                                    'bg-slate-800/80 text-slate-400 border-white/5'
                                            }`}>{
                                                effectiveSession === 'REG' ? 'INTRADAY' :
                                                    effectiveSession === 'PRE' ? 'PRE-MKT' :
                                                        effectiveSession === 'POST' ? 'POST-MKT' :
                                                            'CLOSED'
                                            }</span>
                                    </div>
                                    <div className="p-1">
                                        <FlowSniper
                                            netPremium={liveQuote?.flow?.netPremium || 0}
                                            callPremium={liveQuote?.flow?.callPremium || 0}
                                            putPremium={liveQuote?.flow?.putPremium || 0}
                                            optionsCount={liveQuote?.flow?.optionsCount || 0}
                                        />
                                    </div>
                                </div>
                            </EliteGate>

                            {/* 3. Intel Feed — Real-time AI Insight */}
                            <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-2xl relative group">

                                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 relative z-10 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={12} className="text-cyan-400" />
                                        <h3 className="text-[11px] font-black text-white uppercase tracking-widest font-jakarta">Intel Feed (AI)</h3>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {newsLoading && <Loader2 size={10} className="text-cyan-400 animate-spin" />}
                                        {aiAnalyzing && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 font-jakarta flex items-center gap-1 animate-pulse">
                                                <Sparkles size={8} />
                                                {locale === 'ko' ? 'AI 분석 중' : locale === 'ja' ? 'AI分析中' : 'AI Analyzing'}
                                            </span>
                                        )}
                                        {!aiAnalyzing && !newsLoading && krNews.length > 0 && krNews[0]?.summaryKR && krNews[0]?.summaryKR !== krNews[0]?.title && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-jakarta">
                                                AI ✓
                                            </span>
                                        )}
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative z-10">
                                    {/* Full-Card AI Analysis Skeleton Overlay */}
                                    {aiAnalyzing && (
                                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none"
                                            style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.75) 0%, rgba(15,23,42,0.88) 50%, rgba(15,23,42,0.75) 100%)' }}>
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 flex items-center justify-center">
                                                        <Sparkles size={18} className="text-cyan-400 animate-pulse" />
                                                    </div>
                                                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDuration: '2s' }} />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[13px] text-cyan-200 font-jakarta font-bold tracking-wider">
                                                        {locale === 'ko' ? 'AI 번역 · 분석 중' : locale === 'ja' ? 'AI翻訳・分析中' : 'AI Translating & Analyzing'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-300 font-jakarta mt-0.5">
                                                        {locale === 'ko' ? 'Gemini가 뉴스를 분석하고 있습니다...' : locale === 'ja' ? 'Geminiがニュースを分析中...' : 'Gemini is analyzing news...'}
                                                    </p>
                                                </div>
                                                {/* Skeleton lines */}
                                                <div className="w-48 space-y-2 mt-1">
                                                    <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20" style={{ animation: 'shimmer 2s ease-in-out infinite', backgroundSize: '200% 100%' }} />
                                                    <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20 w-3/4" style={{ animation: 'shimmer 2s ease-in-out infinite 0.3s', backgroundSize: '200% 100%' }} />
                                                    <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/40 to-cyan-500/20 w-1/2" style={{ animation: 'shimmer 2s ease-in-out infinite 0.6s', backgroundSize: '200% 100%' }} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {krNews.slice(0, 5).map((n: any, i) => {
                                        const isExpanded = expandedNewsId === i;
                                        const analysis = locale === 'ko'
                                            ? (n.analysisKR || null)
                                            : locale === 'ja'
                                                ? (n.analysisJP || n.analysisKR || null)
                                                : (n.analysisEN || n.analysisKR || null);
                                        const hasAnalysis = !!analysis;
                                        const hasTranslation = locale === 'ko' ? !!n.summaryKR && n.summaryKR !== n.title
                                            : locale === 'ja' ? !!n.summaryJP && n.summaryJP !== n.title
                                                : true;

                                        return (
                                            <div key={`${n.title}-${i}`} className={`border-b border-white/5 last:border-0 relative ${isExpanded ? 'bg-cyan-950/20' : ''}`}>
                                                {/* Sentiment Indicator Bar */}
                                                <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${n.sentiment === 'positive' ? 'bg-emerald-500' :
                                                    n.sentiment === 'negative' ? 'bg-rose-500' : 'bg-slate-600'
                                                    }`} />


                                                {/* News Header — clickable for expand */}
                                                <div
                                                    className={`p-3 pl-3.5 cursor-pointer hover:bg-white/5 transition-colors ${isExpanded ? 'bg-cyan-500/[0.06]' : ''
                                                        }`}
                                                    onClick={() => setExpandedNewsId(isExpanded ? null : i)}
                                                >
                                                    <div className="text-[11px] text-indigo-300/90 font-bold mb-1 flex justify-between items-center font-jakarta">
                                                        <span className="flex items-center gap-1.5">
                                                            {n.source || "Unknown"}
                                                            {n.ageHours !== undefined && (
                                                                <span className="text-slate-400">· {n.ageHours < 1 ? 'Now' : `${n.ageHours}h`}</span>
                                                            )}
                                                            {n.isRumor && (
                                                                <span className="text-[11px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse font-jakarta">RUMOR</span>
                                                            )}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            {hasAnalysis && (
                                                                <span className={`text-[11px] px-1 py-0.5 rounded font-jakarta ${isExpanded ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'}`}>
                                                                    AI
                                                                </span>
                                                            )}
                                                            {n.sentiment === 'positive' && <span className="text-emerald-500 text-[11px] font-jakarta">BULLISH</span>}
                                                            {n.sentiment === 'negative' && <span className="text-rose-500 text-[11px] font-jakarta">BEARISH</span>}
                                                            {hasAnalysis && (
                                                                isExpanded
                                                                    ? <ChevronUp size={12} className="text-cyan-400" />
                                                                    : <ChevronDown size={12} className="text-slate-400" />
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="text-[13px] text-slate-300 font-medium leading-snug line-clamp-2">
                                                        {locale === 'ko'
                                                            ? (n.summaryKR || n.title)
                                                            : locale === 'ja'
                                                                ? (n.summaryJP || n.summaryKR || n.title)
                                                                : n.title
                                                        }
                                                    </div>
                                                </div>

                                                {/* AI Insight — PRO gated */}
                                                {isExpanded && analysis && (() => {
                                                    const showAbove = i >= 3;
                                                    return (
                                                        <div className={`absolute left-0 right-0 z-30 px-2 animate-in duration-200 ${showAbove ? 'slide-in-from-bottom-1 pb-0.5' : 'slide-in-from-top-1 pt-0.5'}`}
                                                            style={showAbove ? { bottom: '100%' } : { top: '100%' }}>
                                                            <div className="bg-cyan-950/95 backdrop-blur-lg border border-cyan-500/30 rounded-lg p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_15px_rgba(6,182,212,0.15)]">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Sparkles size={10} className="text-cyan-400" />
                                                                        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider font-jakarta">AI Insight</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setExpandedNewsId(null); }}
                                                                        className="text-slate-400 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
                                                                    >
                                                                        <ChevronUp size={14} />
                                                                    </button>
                                                                </div>
                                                                <ProGate title="AI Insight" mode="blur" compact>
                                                                    <p className="text-[13px] text-slate-200 leading-relaxed">
                                                                        {analysis}
                                                                    </p>
                                                                    {n.url && n.url !== '#' && (
                                                                        <a href={n.url} target="_blank" rel="noreferrer"
                                                                            className="text-[11px] text-indigo-400 hover:text-indigo-300 mt-1.5 inline-block font-jakarta"
                                                                            onClick={(e) => e.stopPropagation()}>
                                                                            {locale === 'ko' ? '원문 보기 →' : locale === 'ja' ? '原文を見る →' : 'Read original →'}
                                                                        </a>
                                                                    )}
                                                                </ProGate>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })}
                                    {krNews.length === 0 && (
                                        <div className="h-full flex items-center justify-center text-amber-400/70 text-xs text-center p-4 italic">
                                            {tIntel('translating')}
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>

                    </div >
                )
            }
        </div >
    );
}
