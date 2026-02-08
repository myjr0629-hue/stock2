"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity, Loader2, Info, TrendingUp, TrendingDown, Crosshair, Radar, Shield } from "lucide-react";
import { StockData, OptionData, NewsItem } from "@/services/stockTypes";
import { OIChart } from "@/components/OIChart";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { MarketStatusBadge } from "@/components/common/MarketStatusBadge";
import { GammaLevelsViz } from "@/components/GammaLevelsViz";
import { FlowSniper } from "@/components/FlowSniper";
import { CommandInsight } from "@/components/CommandInsight";
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
}

const DecisionGate = ({ ticker, displayPrice, session, structure, krNews, smaData, newsScore, liveQuote }: any) => {
    const t = useTranslations('command');

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
                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                        <Zap size={10} />
                        SIGNAL CORE
                    </span>
                    <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider">
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

    // 1. SMA Trend (replaces MACD)
    if (smaData?.cross === 'GOLDEN') {
        bullScore += 25;
        insights.push({ text: 'GOLDEN Cross ✨', type: 'bull' });
    } else if (smaData?.cross === 'DEAD') {
        bearScore += 25;
        insights.push({ text: 'DEAD Cross ☠️', type: 'bear' });
    }

    // 2. Price vs Max Pain
    if (maxPain > 0) {
        const mpDist = ((displayPrice - maxPain) / maxPain) * 100;
        if (mpDist > 3) {
            bullScore += 15;
            insights.push({ text: `Max Pain 상단`, type: 'bull' });
        } else if (mpDist < -3) {
            bearScore += 15;
            insights.push({ text: `Max Pain 하단`, type: 'bear' });
        } else {
            insights.push({ text: `Max Pain 근접`, type: 'neutral' });
        }
    }

    // 3. GEX
    if (netGex > 0) {
        bullScore += 10;
        insights.push({ text: '롱감마 (안정)', type: 'bull' });
    } else if (netGex < 0) {
        bearScore += 5;
        insights.push({ text: '숏감마 (변동성↑)', type: 'bear' });
    }

    // 4. Flow
    if (netPremium > 500000) {
        bullScore += 15;
        insights.push({ text: '콜 플로우 우세', type: 'bull' });
    } else if (netPremium < -500000) {
        bearScore += 15;
        insights.push({ text: '풋 플로우 우세', type: 'bear' });
    }

    // 5. News
    if (newsScore && newsScore.score >= 70) {
        bullScore += 10;
        insights.push({ text: '뉴스 긍정적', type: 'bull' });
    } else if (newsScore && newsScore.score < 40) {
        bearScore += 10;
        insights.push({ text: '뉴스 부정적', type: 'bear' });
    }

    // 6. Rumor penalty
    if (hasRumor) {
        bearScore += 10;
        insights.push({ text: '⚠️ 루머 감지', type: 'bear' });
    }

    // 7. 0DTE
    if (zeroDteRatio > 0.3) {
        insights.push({ text: '0DTE 고비중', type: 'neutral' });
    }

    // === Verdict ===
    const diff = bullScore - bearScore;
    let verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' = 'NEUTRAL';
    let verdictKR = '중립';
    let briefing = '';
    let subBriefing = '';

    if (isFail) {
        verdict = 'CAUTION';
        verdictKR = '대기';
        briefing = '옵션 데이터 검증 중입니다.';
        subBriefing = '데이터 안정화 후 분석이 진행됩니다.';
    } else if (session === 'CLOSED') {
        verdict = 'NEUTRAL';
        verdictKR = '마감';
        briefing = '시장이 마감되었습니다.';
        subBriefing = `${ticker}의 당일 분석이 종료되었습니다. 익일 개장 후 새로운 분석을 확인하세요.`;
    } else if (diff >= 25) {
        verdict = 'BULLISH';
        verdictKR = '상승';
        if (netGex > 0 && smaData?.cross === 'GOLDEN') {
            briefing = `${ticker}은 롱감마 환경에서 Golden Cross가 확인되었습니다.`;
            subBriefing = `딜러들의 감마 헷징으로 변동성이 억제되어 안정적인 상승 흐름이 예상됩니다. 저항선($${callWall})까지 상승 여력이 있으며, 지지선($${putFloor})이 하방을 방어합니다.`;
        } else if (netPremium > 500000) {
            briefing = `${ticker}에 콜 옵션 매수세가 우위를 보이고 있습니다.`;
            subBriefing = `기관 플로우가 상승 방향으로 정렬되어 있으며, Max Pain($${maxPain}) 위에서 거래 중입니다. 저항선($${callWall}) 테스트 가능성이 높습니다.`;
        } else {
            briefing = `${ticker}은 복합 지표상 상승 우위입니다.`;
            subBriefing = `SMA, 옵션 구조, 플로우 데이터가 전반적으로 상승 편향을 보이고 있습니다. 지지선($${putFloor})이 견고하며 추가 상승 여력이 있습니다.`;
        }
    } else if (diff <= -25) {
        verdict = 'BEARISH';
        verdictKR = '하락';
        if (smaData?.cross === 'DEAD' && netGex < 0) {
            briefing = `${ticker}은 숙감마 환경에서 Dead Cross가 확인되었습니다.`;
            subBriefing = `딜러들의 역방향 헷징으로 가격 변동이 증폭될 수 있습니다. Max Pain($${maxPain})으로의 수렴 압력이 있으며, 지지선($${putFloor}) 이탈 시 하락 가속 가능성이 있습니다.`;
        } else if (netPremium < -500000) {
            briefing = `${ticker}에 풋 옵션 매수세가 우위를 보이고 있습니다.`;
            subBriefing = `기관 플로우가 하락 방향으로 정렬되어 있습니다. 지지선($${putFloor}) 하단 이탈 시 추가 하락이 예상되며, Max Pain($${maxPain}) 수렴을 주시하세요.`;
        } else {
            briefing = `${ticker}은 복합 지표상 하락 우위입니다.`;
            subBriefing = `MACD, 옵션 구조, 플로우 데이터가 전반적으로 하락 편향을 보이고 있습니다. 지지선($${putFloor}) 테스트 가능성이 있으며 신중한 접근이 필요합니다.`;
        }
    } else {
        verdict = 'NEUTRAL';
        verdictKR = '관망';
        briefing = `${ticker}은 현재 방향성이 불명확합니다.`;
        if (Math.abs(displayPrice - maxPain) / maxPain < 0.02) {
            subBriefing = `현재가가 Max Pain($${maxPain}) 근처에서 거래 중이며 균형 상태입니다. 저항선($${callWall}) 또는 지지선($${putFloor}) 돌파 확인 후 방향 결정을 권장합니다.`;
        } else {
            subBriefing = `상승과 하락 요인이 혼재되어 있습니다. 주요 레벨(저항: $${callWall}, 지지: $${putFloor}) 돌파 시 추세 방향이 결정될 것으로 예상됩니다.`;
        }
    }

    // === Styling ===
    const verdictColors = {
        BULLISH: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20' },
        BEARISH: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40', glow: 'shadow-rose-500/20' },
        NEUTRAL: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/40', glow: '' },
        CAUTION: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', glow: 'shadow-amber-500/20' },
    };
    const colors = verdictColors[verdict];

    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header - matching FLOW UNIT style */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Zap size={10} />
                    SIGNAL CORE
                </span>
                <span className={`text-[9px] font-medium uppercase tracking-wider ${colors.text}`}>
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
                    <p className="text-xs text-white/70 leading-relaxed mt-2">
                        {subBriefing}
                    </p>
                </div>

                {/* Key Insights Grid */}
                <div className="space-y-2">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">핵심 지표</div>
                    <div className="flex flex-wrap gap-1.5">
                        {insights.slice(0, 6).map((item, i) => (
                            <span
                                key={i}
                                className={`text-[10px] font-bold px-2 py-1 rounded-lg ${item.type === 'bull' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
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

export function LiveTickerDashboard({ ticker, initialStockData, initialNews, range, buildId, chartDiagnostics }: Props) {
    // --- Live Data State ---
    // [PERF] SSR 데이터를 초기값으로 사용하여 첫 화면 즉시 표시
    const [liveQuote, setLiveQuote] = useState<any>(initialStockData ? {
        prices: {
            regularCloseToday: initialStockData.price,
            prevClose: initialStockData.prevClose || null
        },
        session: initialStockData.session === 'reg' ? 'REG' : initialStockData.session === 'pre' ? 'PRE' : initialStockData.session === 'post' ? 'POST' : 'CLOSED',
        changePercent: initialStockData.changePercent
    } : null);
    const [options, setOptions] = useState<any>(null);
    const [structure, setStructure] = useState<any>(null);
    const [krNews, setKrNews] = useState<any[]>(initialNews || []);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [structLoading, setStructLoading] = useState(false);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [newsLoading, setNewsLoading] = useState(false);
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

    // i18n translations
    const t = useTranslations('command');
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
    // [PERF] News + NewsScore 통합: 같은 API를 1번만 호출 (~10초 절약)
    const fetchNewsAndScore = async () => {
        setNewsLoading(true);
        try {
            const res = await fetch(`/api/live/news?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                // 1. 뉴스 아이템 설정
                setKrNews(data.items || []);
                // 2. 감성분석 스코어 설정 (기존 fetchNewsScore 로직)
                if (data.sentiment) {
                    setNewsScore({
                        score: data.sentiment.score || 50,
                        label: data.sentiment.label || '중립',
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
                    const label = score >= 70 ? '양호' : score >= 40 ? '중립' : '주의';
                    setNewsScore({ score, label, breakdown: { positive, negative, neutral } });
                }
            }
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[News] Network retry...");
            else console.error(e);
        } finally { setNewsLoading(false); }
    };
    const fetchQuote = async () => {
        setQuoteLoading(true);
        try {
            const res = await fetch(`/api/live/ticker?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setLiveQuote(data);
            }
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[Quote] Network retry...");
            else console.error(e);
        } finally { setQuoteLoading(false); }
    };

    const fetchStructure = async (exp?: string, maxRetries: number = 3) => {
        // [FIX] 기존 데이터가 있으면 로딩 오버레이 표시 안함 (깜빡임 방지)
        if (!structure) setStructLoading(true);
        let retryCount = 0;

        const attemptFetch = async (): Promise<any> => {
            try {
                const url = `/api/live/options/structure?t=${ticker}${exp ? `&exp=${exp}` : ""}`;
                const res = await fetch(url);
                if (!res.ok) return null;

                const data = await res.json();

                // [DATA VALIDATION] Auto-retry if confidence is LOW
                if (data.validation?.confidence === 'LOW' && retryCount < maxRetries) {
                    retryCount++;
                    console.log(`[Structure] Validation LOW, retry ${retryCount}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
                    return attemptFetch();
                }

                return data;
            } catch (e: any) {
                if (e?.message?.includes("Failed to fetch") && retryCount < maxRetries) {
                    retryCount++;
                    console.warn(`[Structure] Network error, retry ${retryCount}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return attemptFetch();
                }
                console.error(e);
                return null;
            }
        };

        const data = await attemptFetch();
        if (data) {
            setStructure(data);
            if (!exp && data.expiration) setSelectedExp(data.expiration);
        }
        setStructLoading(false);
    };

    // [PERF] ATM + Structure 병렬 호출 (기존: 순차 → 대기시간 낭비)
    const fetchOptions = async () => {
        setOptionsLoading(true);
        try {
            const [atmRes] = await Promise.all([
                fetch(`/api/live/options/atm?t=${ticker}`),
                fetchStructure() // 병렬 실행
            ]);
            if (atmRes.ok) {
                const data = await atmRes.json();
                setOptions(data);
            }
        } catch (e: any) {
            if (e?.message?.includes("Failed to fetch")) console.warn("[Options] Network retry...");
            else console.error(e);
            setOptions({ options_status: "PENDING" });
        } finally { setOptionsLoading(false); }
    };

    // [S-124.6] Fetch News Score
    const fetchNewsScore = async () => {
        try {
            const res = await fetch(`/api/live/news?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                // Use API-calculated sentiment if available
                if (data.sentiment) {
                    setNewsScore({
                        score: data.sentiment.score || 50,
                        label: data.sentiment.label || '중립',
                        breakdown: data.sentiment.breakdown
                    });
                } else {
                    // Fallback calculation
                    const items = data.items || [];
                    let score = 50;
                    let positive = 0, negative = 0, neutral = 0;
                    items.forEach((item: any) => {
                        if (item.sentiment === 'positive') { score += 5; positive++; }
                        else if (item.sentiment === 'negative') { score -= 5; negative++; }
                        else neutral++;
                    });
                    score = Math.max(0, Math.min(100, score));
                    const label = score >= 70 ? '양호' : score >= 40 ? '중립' : '주의';
                    setNewsScore({ score, label, breakdown: { positive, negative, neutral } });
                }
            }
        } catch (e) { console.warn('[NewsScore] Error:', e); }
    };

    // [V45.15] Fetch Earnings Schedule
    const fetchEarnings = async () => {
        try {
            const res = await fetch(`/api/live/earnings?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setEarningsData({
                    nextDate: data.nextEarningsDate || null,
                    daysLabel: data.daysLabel || 'TBD',
                    epsEstimate: data.epsEstimate || null,
                    quarter: data.quarter || null,
                    year: data.year || null,
                    hourLabel: data.hourLabel || '',
                    color: data.color || 'text-slate-400'
                });
            }
        } catch (e) { console.warn('[Earnings] Error:', e); }
    };

    // [PREMIUM] Fetch SMA 50/200 for TREND PHASE™
    const fetchSma = async () => {
        try {
            const res = await fetch(`/api/live/sma?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setSmaData({
                    cross: data.cross || 'UNKNOWN',
                    crossType: data.crossType || '',
                    label: data.label || '데이터없음',
                    sma50: data.sma50 || 0,
                    sma200: data.sma200 || 0,
                    distance: data.distance || 0,
                    isImminent: data.isImminent || false,
                    phase: data.phase || 'UNKNOWN'
                });
            }
        } catch (e) { console.warn('[SMA] Error:', e); }
    };

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
        const vwap = liveQuote?.prices?.vwap || initialStockData?.vwap || 0;
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
        let label = '관망'; let grade = 'C';
        if (score >= 80) { label = '강한 확신'; grade = 'A'; }
        else if (score >= 65) { label = '상승 우위'; grade = 'B+'; }
        else if (score >= 55) { label = '약간 상승'; grade = 'B'; }
        else if (score >= 45) { label = '관망'; grade = 'C'; }
        else if (score >= 35) { label = '약간 하락'; grade = 'D'; }
        else if (score >= 20) { label = '하락 우위'; grade = 'D-'; }
        else { label = '강한 하락'; grade = 'F'; }
        setConviction({ score, label, grade });
    };

    // [S-124.6] Fetch Related Tickers
    const fetchRelated = async () => {
        try {
            const res = await fetch(`/api/live/related?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setRelatedData({
                    count: data.count || 0,
                    topRelated: data.topRelated || []
                });
            }
        } catch (e) { console.warn('[Related] Error:', e); }
    };

    // [PREMIUM] Fetch Analyst Target (Finnhub: Recommendations + Price Target)
    const fetchAnalyst = async () => {
        try {
            const res = await fetch(`/api/live/analyst?t=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                setAnalystData(data);
            }
        } catch (e) { console.warn('[Analyst] Error:', e); }
    };

    // [PREMIUM-5x2] Fetch Volatility Regime
    const fetchVolatilityRegime = async () => {
        try {
            const res = await fetch(`/api/live/volatility-regime?t=${ticker}`);
            if (res.ok) setVolatilityData(await res.json());
        } catch (e) { console.warn('[VolRegime] Error:', e); }
    };

    // [PREMIUM-5x2] Fetch Short Squeeze Risk
    const fetchShortSqueeze = async () => {
        try {
            const res = await fetch(`/api/live/short-squeeze?t=${ticker}`);
            if (res.ok) setSqueezeData(await res.json());
        } catch (e) { console.warn('[ShortSqueeze] Error:', e); }
    };

    // [PREMIUM-5x2] Fetch Institutional Flow (reuses existing realtime-metrics)
    const fetchInstitutional = async () => {
        try {
            const res = await fetch(`/api/flow/realtime-metrics?ticker=${ticker}`);
            if (res.ok) setInstitutionalData(await res.json());
        } catch (e) { console.warn('[Institutional] Error:', e); }
    };

    // [PREMIUM-5x2] Fetch Fundamental Value
    const fetchFundamentals = async () => {
        try {
            const res = await fetch(`/api/live/fundamentals?t=${ticker}`);
            if (res.ok) setFundamentalData(await res.json());
        } catch (e) { console.warn('[Fundamentals] Error:', e); }
    };

    // Initial Load & Polling
    useEffect(() => {
        fetchQuote();
        fetchNewsAndScore(); // [PERF] 통합: fetchKrNews + fetchNewsScore → 1회 호출
        fetchEarnings();
        fetchSma();
        fetchRelated();
        fetchAnalyst();
        fetchVolatilityRegime();
        fetchShortSqueeze();
        fetchInstitutional();
        fetchFundamentals();
        const interval = setInterval(fetchQuote, 10000); // Poll quote every 10s
        return () => {
            clearInterval(interval);
        };
    }, [ticker]);

    // [PREMIUM] Recalculate conviction when dependencies change
    useEffect(() => {
        calculateConviction();
    }, [smaData, newsScore, liveQuote, structure]);

    useEffect(() => {
        // [FIX] Reset structure state when ticker changes to prevent stale data
        setStructure(null);
        fetchOptions();
        // [V45.16] Poll options data every 30s for real-time Flow updates
        const optionsInterval = setInterval(fetchOptions, 30000);
        return () => {
            clearInterval(optionsInterval);
        };
    }, [ticker]);

    if (!initialStockData) return <div>Data Unavailable</div>;

    // Derived Display Values (Truth Table from API)
    // [User Requirement] Main Price = Official Intraday Close ONLY.
    // Pre/Post prices must ONLY be shown in the badge.

    // Derived Display Values (Truth Table from API)
    // [User Requirement] Main Price = Official Intraday Close ONLY.
    // Pre/Post prices must ONLY be shown in the badge.

    // [Fix] Trust API's display values normally, BUT enforce Regular Price for POST/CLOSED per user request.
    let displayPrice = liveQuote?.display?.price || liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose || 0;

    // [Fix] Use API's pre-calculated percentage (pct) directly
    let displayChangePct = liveQuote?.display?.changePctPct; // e.g. -2.59

    // [User Override] If POST/CLOSED, Main Display MUST be Regular Close (Intraday Final)
    if (effectiveSession === 'POST' || effectiveSession === 'CLOSED') {
        const regularClose = liveQuote?.prices?.regularCloseToday;
        const prevClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose;

        // Only override if we have a valid regular close
        if (regularClose && regularClose > 0) {
            displayPrice = regularClose;

            // [FIX] Detect "No New Trading Day" scenario:
            // If regularCloseToday === prevRegularClose, it means today's regular session hasn't happened yet.
            // In this case, we should show the LAST session's change (prevChangePct), NOT 0.00%.
            const isNewTradingDay = Math.abs(regularClose - prevClose) > 0.001; // Tolerance for floating point

            if (isNewTradingDay && prevClose > 0) {
                // Normal case: calculate today's change
                displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
            } else {
                // [FIX] No new trading day yet (weekend/holiday/pre-open)
                // Show the PREVIOUS session's change percentage
                const prevDayChange = liveQuote?.prices?.prevChangePct;
                if (prevDayChange !== undefined && prevDayChange !== null) {
                    displayChangePct = prevDayChange;
                } else {
                    // Ultimate fallback: use initialStockData
                    displayChangePct = initialStockData.changePercent || 0;
                }
            }
        }
    }

    if (displayChangePct === undefined || displayChangePct === null) {
        // Fallback for initial load
        displayChangePct = initialStockData.changePercent || 0;
    }

    // [User Requirement] IF SESSION IS 'PRE', Main Price (= Intraday) should be STATIC (Prev Close).
    // The "Pre-market Price" is shown in the badge only.
    if (effectiveSession === 'PRE') {
        const staticClose = liveQuote?.prices?.prevRegularClose || liveQuote?.prevClose || initialStockData.prevClose;
        if (staticClose) {
            displayPrice = staticClose;
            // [Fix-Requested] Show Yesterday's change (Intraday Standard) until market opens.
            // Do NOT reset to 0.00%. Show "Last Regular Session Change".
            const prevDayChange = liveQuote?.prices?.prevChangePct ?? initialStockData.prevChangePercent;
            displayChangePct = prevDayChange ?? 0;
        }
    }

    // A. Main Display Price (White Big Number) - Fallback Logic
    if (!displayPrice || displayPrice === 0) {
        // ... existing fallbacks if needed ...
        if (effectiveSession === 'REG' || effectiveSession === 'RTH' || effectiveSession === 'MARKET') {
            displayPrice = liveQuote?.prices?.lastTrade || liveQuote?.price || displayPrice;
        }
    }

    // B. Sub-Badge (Extended Session Info)
    let activeExtPrice = 0;
    let activeExtType = ""; // 'PRE', 'PRE_CLOSE', 'POST'
    let activeExtLabel = "";

    if (effectiveSession === 'PRE') {
        activeExtPrice = liveQuote?.extended?.prePrice || liveQuote?.prices?.prePrice || 0;
        activeExtType = 'PRE';
        activeExtLabel = 'PRE';
    } else if (effectiveSession === 'REG' || effectiveSession === 'RTH' || effectiveSession === 'MARKET') {
        // Show Pre-Market Close if we are in Regular Session
        activeExtPrice = liveQuote?.extended?.preClose || liveQuote?.prices?.prePrice || 0;
        if (activeExtPrice > 0) {
            activeExtType = 'PRE_CLOSE';
            activeExtLabel = 'PRE CLOSE';
        }
    } else if (effectiveSession === 'POST') {
        activeExtPrice = liveQuote?.extended?.postPrice || liveQuote?.prices?.postPrice || 0;
        activeExtType = 'POST';
        activeExtLabel = 'POST';
    } else if (effectiveSession === 'CLOSED') {
        // [Fix] Allow Post-Market display even when CLOSED (e.g. Weekend)
        activeExtPrice = liveQuote?.extended?.postPrice || liveQuote?.prices?.postPrice || 0;
        if (activeExtPrice > 0) {
            activeExtType = 'POST';
            activeExtLabel = 'POST (CLOSED)';
        }
    }

    // C. Change Percentages (Strict Baselines)
    // [Fix] Trust API for Extended Change Percentages too
    let activeExtPct = 0;
    if (activeExtPrice > 0) {
        if (activeExtType === 'PRE' || activeExtType === 'PRE_CLOSE') {
            activeExtPct = liveQuote?.extended?.preChangePct !== undefined
                ? (liveQuote.extended.preChangePct * 100) // API returns fraction
                : 0;
        } else if (activeExtType === 'POST') {
            activeExtPct = liveQuote?.extended?.postChangePct !== undefined
                ? (liveQuote.extended.postChangePct * 100)
                : 0;
            // If CLOSED and using POST Badge, we might need manual calc if API didn't flag it as POST session
            if (effectiveSession === 'CLOSED' && activeExtType === 'POST') {
                // displayPrice is Regular Close. activeExtPrice is Post Close.
                if (displayPrice > 0) {
                    activeExtPct = ((activeExtPrice - displayPrice) / displayPrice) * 100;
                }
            }
        }
    }

    const pSource = liveQuote?.priceSource || initialStockData?.priceSource;
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

    return (
        <div className="w-full max-w-[1600px] mx-auto space-y-6">

            {/* 1. TOP HEADER (Consolidated Left Layout) - Sticky below main header */}
            <div className="sticky top-[78px] z-30 bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                {/* Row 1: Identity & Price & Extended (Inline) */}
                <div className="flex items-end gap-x-6 flex-wrap">
                    {/* Identity Group */}
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                            <img
                                src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                alt={`${ticker} logo`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).parentElement!.classList.add('hidden');
                                }}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter">{ticker}</h1>
                                <FavoriteToggle ticker={ticker} />
                                {quoteLoading && <RefreshCw className="animate-spin text-slate-500" size={14} />}
                            </div>
                            <p className="text-sm text-slate-500 font-bold tracking-tight uppercase">{initialStockData.name}</p>
                        </div>
                    </div>

                    {/* Main Price Group (Inline, Reduced Size) */}
                    {/* [Fix] ALWAYS use displayPrice = Intraday Close. No fallback to lastTrade. */}
                    <div className="hidden sm:block pb-1">
                        <div className="flex items-baseline gap-3">
                            <div className="text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums">
                                ${displayPrice?.toFixed(2) || '—'}
                            </div>
                            <div className={`text-lg font-bold font-mono tracking-tighter ${displayChangePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                {displayChangePct > 0 ? "+" : ""}{displayChangePct?.toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    {/* Extended Session Badge (Inline with Price) */}
                    {activeExtPrice > 0 && (
                        <div className="hidden sm:block pb-1.5">
                            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/50 border border-slate-700/50 backdrop-blur-md">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeExtType.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'} animate-pulse`} />

                                <div className="flex flex-col leading-none">
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {activeExtLabel}
                                        </span>
                                        <span className="text-xs font-bold text-slate-200 tabular-nums">
                                            ${activeExtPrice.toFixed(2)}
                                        </span>
                                        <span className={`text-[10px] font-mono font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            {(activeExtPct || 0) > 0 ? "+" : ""}{(activeExtPct || 0).toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Mobile Only: Price & Extended Row */}
                {/* [Fix] ALWAYS use displayPrice = Intraday Close. No fallback to lastTrade. */}
                <div className="flex flex-col gap-2 sm:hidden">
                    <div className="flex items-baseline gap-3">
                        <div className="text-4xl font-black text-white tracking-tighter tabular-nums">
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
                                <span className={`text-[10px] font-black uppercase tracking-widest ${activeExtType === 'PRE' ? 'text-amber-400' : 'text-indigo-400'}`}>
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
                <div className="relative grid grid-cols-5 gap-1.5">

                    {/* ═══ ROW 1: 실시간 / 당일 판단용 ═══ */}

                    {/* [1-1] VOLATILITY REGIME™ */}
                    {(() => {
                        const r = volatilityData;
                        const isHot = r?.regime === 'ERUPTING' || r?.regime === 'LOADED';
                        const regimeColor = r?.regime === 'ERUPTING' ? 'text-rose-400' : r?.regime === 'LOADED' ? 'text-amber-400' : r?.regime === 'COILING' ? 'text-cyan-400' : 'text-emerald-400';
                        const regimeBg = r?.regime === 'ERUPTING' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : r?.regime === 'LOADED' ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.12)]' : 'bg-slate-800/40 border-slate-700/50';
                        const regimeDesc = r?.regime === 'ERUPTING' ? '극단적 변동성 주의' : r?.regime === 'LOADED' ? '변동성 축적, 폭발 대기' : r?.regime === 'COILING' ? '에너지 응축 중' : '시장 안정';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${regimeBg}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 85% 50%, rgba(255,255,255,0.8) 0%, transparent 8%, transparent 12%, rgba(255,255,255,0.4) 13%, transparent 14%, transparent 22%, rgba(255,255,255,0.2) 23%, transparent 24%)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Zap className={`w-3.5 h-3.5 ${isHot ? 'text-amber-400' : 'text-cyan-400'}`} />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">VOL REGIME</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded ${isHot ? 'bg-rose-500/20' : 'bg-slate-600/50'} ${regimeColor}`}>
                                        {r?.regime || '...'}
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black tabular-nums leading-none ${regimeColor}`}>{r?.regimeScore ?? '--'}</span>
                                    <span className="text-[11px] text-white font-bold">/100</span>
                                    <span className="text-[11px] text-white ml-0.5">{regimeDesc}</span>
                                </div>
                                <div className="relative z-10 flex gap-3 mt-1 text-[10px] tabular-nums">
                                    <span className="text-white/60">GEX <span className={`font-bold ${r?.gexLabel === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>{r?.gexLabel || '--'}</span></span>
                                    <span className="text-white/60">IV <span className="font-bold text-white/90">{r?.iv || '--'}%</span></span>
                                    <span className="text-white/60">Flip <span className="font-bold text-white/90">{r?.flipDistance ? `${r.flipDistance > 0 ? '+' : ''}${r.flipDistance}%` : '--'}</span></span>
                                </div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">GEX + IV + Gamma Flip + Squeeze</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [1-2] CONVICTION MATRIX™ */}
                    {(() => {
                        const isBull = conviction && conviction.score >= 60;
                        const isBear = conviction && conviction.score <= 40;
                        const convDesc = conviction ? (conviction.score >= 70 ? '강한 매수 시그널' : conviction.score >= 55 ? '매수 우위' : conviction.score <= 30 ? '매도 시그널' : conviction.score <= 45 ? '약세 우위' : '방향성 탐색 중') : '계산중...';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${isBull ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isBear ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "conic-gradient(from 220deg at 80% 60%, rgba(255,255,255,0.4) 0deg, transparent 60deg, transparent 360deg)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Target className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">CONVICTION</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded ${isBull ? 'bg-emerald-500/20 text-emerald-400' : isBear ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-white'}`}>{conviction?.grade || '...'}</span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black tabular-nums leading-none ${isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-white'}`}>{conviction?.score ?? '--'}</span>
                                    <span className="text-[11px] text-white font-bold">/100</span>
                                    <span className="text-[11px] text-white ml-0.5">{convDesc}</span>
                                </div>
                                <div className="relative z-10 text-[11px] text-white/70 mt-0.5">{conviction?.label || ''}</div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">SMA + VWAP + PCR + GEX + Flow 종합</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [1-3] VWAP */}
                    {(() => {
                        const vwap = liveQuote?.prices?.vwap || initialStockData?.vwap || 0;
                        const price = displayPrice || 0;
                        const vwapDiff = vwap > 0 && price > 0 ? ((price - vwap) / vwap) * 100 : 0;
                        const vwapDesc = vwapDiff > 2 ? 'VWAP 상회 → 매수세 우위' : vwapDiff < -2 ? 'VWAP 하회 → 매도세 우위' : 'VWAP 근접 → 중립 구간';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${vwapDiff > 2 ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : vwapDiff < -2 ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(255,255,255,0.3) 8px, rgba(255,255,255,0.3) 9px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">VWAP</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded ${vwapDiff > 0 ? 'bg-emerald-500/20 text-emerald-400' : vwapDiff < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-white'}`}>
                                        {vwapDiff > 0 ? '+' : ''}{vwapDiff.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black font-mono tabular-nums leading-none ${vwapDiff > 0 ? 'text-emerald-400' : vwapDiff < 0 ? 'text-rose-400' : 'text-white'}`}>${vwap.toFixed(2)}</span>
                                </div>
                                <div className="relative z-10 text-[11px] text-white mt-0.5">{vwapDesc}</div>
                                <div className="relative z-10 text-[11px] text-white/70 mt-px">현재가 대비 {vwapDiff > 0 ? '+' : ''}{vwapDiff.toFixed(2)}% 괴리</div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">장중 거래량 가중 평균</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [1-4] SHORT SQUEEZE™ */}
                    {(() => {
                        const s = squeezeData;
                        const isCritical = s?.status === 'CRITICAL' || s?.status === 'HIGH';
                        const statusColor = s?.status === 'CRITICAL' ? 'text-rose-400' : s?.status === 'HIGH' ? 'text-amber-400' : s?.status === 'MEDIUM' ? 'text-cyan-400' : 'text-emerald-400';
                        const statusBg = s?.status === 'CRITICAL' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : s?.status === 'HIGH' ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.12)]' : 'bg-slate-800/40 border-slate-700/50';
                        const sqDesc = s?.status === 'CRITICAL' ? '숏커버 폭발 위험' : s?.status === 'HIGH' ? '숏커버 가능성 높음' : s?.status === 'MEDIUM' ? '공매도 보통' : '공매도 위험 낮음';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${statusBg}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.3) 6px, rgba(255,255,255,0.3) 7px, transparent 7px, transparent 13px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <ShieldAlert className={`w-3.5 h-3.5 ${isCritical ? 'text-rose-400' : 'text-orange-400'}`} />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">SHORT SQUEEZE</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded ${isCritical ? 'bg-rose-500/20' : 'bg-slate-600/50'} ${statusColor}`}>
                                        {s?.status || '...'}
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black tabular-nums leading-none ${statusColor}`}>{s?.siPercent !== undefined ? s.siPercent.toFixed(1) : '--'}%</span>
                                    <span className="text-[11px] text-white font-bold">SI%</span>
                                    <span className="text-[11px] text-white ml-0.5">{sqDesc}</span>
                                </div>
                                <div className="relative z-10 flex gap-3 mt-0.5 text-[10px] tabular-nums">
                                    <span className="text-white/60">상환 <span className="font-bold text-white/90">{s?.daysToCover?.toFixed(1) ?? '--'}일</span></span>
                                    <span className="text-white/60">공매도비 <span className="font-bold text-white/90">{s?.shortVolPercent?.toFixed(0) ?? '--'}%</span></span>
                                </div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">SI% + Days to Cover + Short Vol</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [1-5] ANALYST TARGET */}
                    {(() => {
                        const isBullish = analystData?.consensus === 'STRONG BUY' || analystData?.consensus === 'BUY';
                        const isBearish = analystData?.consensus === 'SELL' || analystData?.consensus === 'STRONG SELL';
                        const bd = analystData?.breakdown;
                        const total = analystData?.totalAnalysts || 0;

                        const buyCount = bd ? bd.strongBuy + bd.buy : 0;
                        const buyPct = total > 0 ? Math.round((buyCount / total) * 100) : 0;
                        const consensusKr = analystData?.consensus === 'STRONG BUY' ? '적극 매수' : analystData?.consensus === 'BUY' ? '매수' : analystData?.consensus === 'HOLD' ? '보유' : analystData?.consensus === 'SELL' ? '매도' : analystData?.consensus === 'STRONG SELL' ? '적극 매도' : '...';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${isBullish ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isBearish ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.6) 0%, transparent 10%, transparent 18%, rgba(255,255,255,0.3) 19%, transparent 20%, transparent 30%, rgba(255,255,255,0.15) 31%, transparent 32%)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Crosshair className={`w-3.5 h-3.5 ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-cyan-400'}`} />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">ANALYST TARGET</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded ${isBullish ? 'bg-emerald-500/20 text-emerald-400' : isBearish ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-600/50 text-white/70'}`}>{consensusKr}</span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black tabular-nums leading-none ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-white'}`}>{buyPct}%</span>
                                    <span className="text-[11px] text-white font-bold">매수 추천</span>
                                    <span className="text-[11px] text-white">{total}명 중</span>
                                </div>
                                {bd && total > 0 && (
                                    <div className="relative z-10 mt-1">
                                        <div className="text-[9px] text-white/70 tabular-nums">
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
                                        <div className="text-[11px] text-white mt-0.5">→ {total}명 중 <span className={`font-bold ${buyPct >= 70 ? 'text-emerald-400' : buyPct <= 30 ? 'text-rose-400' : 'text-white'}`}>{buyPct}%</span> 매수 추천</div>
                                    </div>
                                )}
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">Analyst Consensus</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ═══ ROW 2: 스윙 / 장기 판단용 ═══ */}

                    {/* [2-1] INSTITUTIONAL RADAR™ */}
                    {(() => {
                        const dp = institutionalData?.darkPool?.percent || 0;
                        const blockCount = institutionalData?.blockTrade?.count || 0;
                        const isAccumulation = dp > 40 && blockCount >= 3;
                        const isDistribution = dp < 20 && blockCount <= 1;
                        const signal = isAccumulation ? 'ACCUMULATION' : isDistribution ? 'DISTRIBUTION' : 'NEUTRAL';
                        const sigColor = isAccumulation ? 'text-emerald-400' : isDistribution ? 'text-rose-400' : 'text-slate-400';
                        const sigBg = isAccumulation ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isDistribution ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50';
                        const instDesc = isAccumulation ? '기관 매집 시그널' : isDistribution ? '기관 이탈 시그널' : '기관 거래 정상 범위';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${sigBg}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "conic-gradient(from 0deg at 80% 50%, rgba(255,255,255,0.5) 0deg, transparent 30deg, transparent 360deg), radial-gradient(circle at 80% 50%, transparent 20%, rgba(255,255,255,0.1) 21%, transparent 22%)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Radar className={`w-3.5 h-3.5 ${isAccumulation ? 'text-emerald-400' : 'text-indigo-400'}`} />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">INST RADAR</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded ${isAccumulation ? 'bg-emerald-500/20' : isDistribution ? 'bg-rose-500/20' : 'bg-slate-600/50'} ${sigColor}`}>
                                        {signal}
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-lg font-black tabular-nums leading-none ${dp > 35 ? 'text-indigo-400' : 'text-white/80'}`}>{dp.toFixed(1)}%</span>
                                    <span className="text-[11px] text-white font-bold">다크풀</span>
                                    <span className="text-[11px] text-white ml-0.5">{instDesc}</span>
                                </div>
                                <div className="relative z-10 flex gap-3 mt-0.5 text-[10px] tabular-nums">
                                    <span className="text-white/60">블록 <span className="font-bold text-white/90">{blockCount}건</span></span>
                                    <span className="text-white/60">공매도비 <span className="font-bold text-white/90">{institutionalData?.shortVolume?.percent?.toFixed(0) ?? '--'}%</span></span>
                                </div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">Dark Pool + Block Trade + Short Vol</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [2-2] TREND PHASE™ */}
                    {(() => {
                        const phase = smaData?.cross === 'GOLDEN' ? '강세 전환' : smaData?.cross === 'DEAD' ? '약세 전환' : smaData?.label === 'ABOVE' ? '상승 추세' : smaData?.label === 'BELOW' ? '하락 추세' : '...';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${smaData?.cross === 'GOLDEN' ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : smaData?.cross === 'DEAD' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 11px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">TREND PHASE</span>
                                    </div>
                                    {smaData?.crossType === 'NEW' && (
                                        <span className="text-[7px] font-black px-1.5 py-px rounded bg-amber-500/30 text-amber-300 animate-pulse">NEW!</span>
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
                                        SMA 괴리 {smaData.distance > 0 ? '+' : ''}{smaData.distance}%
                                        {smaData.isImminent && <span className="ml-1 text-amber-400">⚡ 교차 임박</span>}
                                    </div>
                                )}
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">SMA 50/200 Cross Analysis</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [2-3] FUNDAMENTAL VALUE™ */}
                    {(() => {
                        const f = fundamentalData;
                        const hasData = f && f.score > 0;
                        const gradeColor = f?.grade?.startsWith('A') ? 'text-emerald-400' : f?.grade?.startsWith('B') ? 'text-cyan-400' : f?.grade?.startsWith('C') ? 'text-amber-400' : 'text-slate-400';
                        const gradeBg = f?.grade?.startsWith('A') ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : f?.grade?.startsWith('B') ? 'bg-cyan-950/40 border-cyan-500/30' : 'bg-slate-800/40 border-slate-700/50';
                        const bd = f?.breakdown;
                        const fundDesc = !hasData ? '데이터 수집 중' : f?.grade?.startsWith('A') ? '재무 우수' : f?.grade?.startsWith('B') ? '재무 양호' : f?.grade?.startsWith('C') ? '재무 보통' : '주의 필요';
                        // Display raw values even when score is 0
                        const pe = f?.pe; const de = f?.de; const roe = f?.roe; const rev = f?.revenueGrowth; const margin = f?.netMargin;
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${gradeBg}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 12px, rgba(255,255,255,0.15) 12px, rgba(255,255,255,0.15) 14px, transparent 14px, transparent 16px), linear-gradient(0deg, rgba(255,255,255,0.2) 0%, transparent 40%)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Shield className={`w-3.5 h-3.5 ${hasData ? 'text-emerald-400' : 'text-amber-400'}`} />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">FUNDAMENTAL</span>
                                    </div>
                                    <span className={`text-[11px] font-black px-1.5 py-px rounded bg-slate-600/50 ${hasData ? gradeColor : 'text-slate-400'}`}>
                                        {hasData ? f?.grade : '수집중'}
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
                                <div className="relative z-10 flex flex-wrap gap-x-2 mt-1 text-[10px] tabular-nums">
                                    {pe !== null && pe !== undefined && <span className="text-white/60">PE <span className="font-bold text-white/90">{pe}</span></span>}
                                    {roe !== null && roe !== undefined && <span className="text-white/60">ROE <span className="font-bold text-white/90">{roe}%</span></span>}
                                    {rev !== null && rev !== undefined && <span className="text-white/60">매출 <span className="font-bold text-white/90">{rev > 0 ? '+' : ''}{rev}%</span></span>}
                                    {margin !== null && margin !== undefined && <span className="text-white/60">마진 <span className="font-bold text-white/90">{margin}%</span></span>}
                                    {de !== null && de !== undefined && <span className="text-white/60">D/E <span className="font-bold text-white/90">{de}</span></span>}
                                    {!pe && !roe && !rev && !margin && !de && <span className="text-white/40">Financial API 연결 대기</span>}
                                </div>
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">PE + FCF + Rev + Margin + DE</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [2-4] EARNINGS */}
                    {(() => {
                        const rawDays = earningsData?.daysLabel || '';
                        const daysNum = parseInt(rawDays.replace(/\D/g, ''));
                        const isValidDays = !isNaN(daysNum);
                        const isImminent = isValidDays && daysNum >= 0 && daysNum <= 7;
                        const earnDesc = isValidDays ? (daysNum === 0 ? '오늘 실적 발표!' : daysNum <= 3 ? `실적 발표 임박` : daysNum <= 14 ? `${daysNum}일 후 실적` : `${daysNum}일 후`) : '';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 transition-all duration-500 backdrop-blur-xl border ${isImminent ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(255,255,255,0.2) 14px, rgba(255,255,255,0.2) 15px), repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(255,255,255,0.2) 14px, rgba(255,255,255,0.2) 15px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[12px] font-bold text-white uppercase tracking-wider">EARNINGS</span>
                                    </div>
                                    <span className={`text-[11px] font-bold px-1.5 py-px rounded ${isImminent ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-300'}`}>
                                        {isValidDays ? `D-${daysNum}` : rawDays || 'TBD'}
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className="text-lg font-black text-white leading-none">{earningsData?.nextDate ? new Date(earningsData.nextDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}</span>
                                    {earningsData?.hourLabel && <span className="text-[11px] text-amber-400 font-bold">{earningsData.hourLabel}</span>}
                                    {earnDesc && <span className="text-[11px] text-white ml-0.5">{earnDesc}</span>}
                                </div>
                                {earningsData?.epsEstimate !== null && earningsData?.epsEstimate !== undefined && (
                                    <div className="relative z-10 text-[11px] text-white mt-0.5">
                                        예상 EPS <span className="font-bold text-white/90">${earningsData.epsEstimate.toFixed(2)}</span>
                                        {earningsData?.quarter && earningsData?.year && <span className="text-white/40 ml-1">Q{earningsData.quarter} FY{earningsData.year}</span>}
                                    </div>
                                )}
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[11px] text-white">Earnings Calendar</span>
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
                                <span className="text-[12px] font-bold text-white uppercase tracking-wider">RELATED</span>
                            </div>
                            <span className="text-[11px] text-white">동종업종</span>
                        </div>
                        <div className="relative z-10 flex flex-col gap-1">
                            {relatedData?.topRelated && relatedData.topRelated.length > 0 ? (
                                relatedData.topRelated.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-white">{item.ticker}</span>
                                        <span className={`text-[11px] font-bold tabular-nums ${item.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {item.change >= 0 ? '+' : ''}{item.change}%
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-[11px] text-white/70 text-center py-1">로딩중...</div>
                            )}
                        </div>
                        <div className="relative z-10 mt-0.5">
                            <span className="text-[11px] text-white">Related Tickers</span>
                        </div>
                    </div>

                </div>
            </div>

            {/* COMMAND GRID (2 Columns: Main vs Sidebar) */}
            {
                (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[800px]">

                        {/* MAIN COLUMN (8 Cols) - Flex Structure */}
                        <div className="lg:col-span-8 flex flex-col items-stretch gap-4 h-full">
                            {/* A. Main Chart Section */}
                            {/* A. Main Chart Section (Height: 520px) */}
                            <div className="h-[520px] min-h-0 relative flex flex-col group shrink-0">
                                {/* Decorative Label (Absolute) */}
                                <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[9px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> Price History
                                </div>

                                {/* Glass Card */}
                                <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-2xl relative backdrop-blur-md flex flex-col">
                                    {/* Texture Overlay */}
                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none opacity-20" />
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-indigo-900/10 pointer-events-none" />

                                    <div className="flex-1 min-h-0 relative z-10 p-1 pb-12">
                                        <StockChart
                                            key={`${ticker}:${range}`}
                                            data={initialStockData.history}
                                            color={(displayChangePct || 0) >= 0 ? "#10b981" : "#f43f5e"}
                                            ticker={ticker}
                                            initialRange={range}
                                            currentPrice={liveQuote?.prices?.lastTrade || liveQuote?.price || displayPrice}
                                            prevClose={liveQuote?.prices?.prevRegularClose || (initialStockData as any)?.prices?.prevClose || initialStockData?.prevClose}
                                            rsi={initialStockData.rsi}
                                            return3d={initialStockData.return3d}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* B. Advanced Options Analysis (Fixed Height: 380px) */}
                            <div className="h-[380px] min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">

                                {/* 1. TACTICAL RANGE (Depth Gauge + Max Pain) */}
                                <div className="h-full rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col relative group hover:border-white/20 transition-colors">
                                    {/* Loading Overlay - 첫 로드시에만 표시 (폴링 깜빡임 방지) */}
                                    {structLoading && !structure && (
                                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                                <span className="text-[10px] text-cyan-400/80 font-bold uppercase tracking-wider">Loading...</span>
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
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${diffDays <= 1 ? 'bg-rose-950/50 text-rose-400 border border-rose-500/30' : 'bg-cyan-950/50 text-cyan-400 border border-cyan-500/30'}`}>
                                                        D-{diffDays}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-amber-500 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30 flex items-center gap-2 shadow-lg">
                                                <span className="text-[10px] font-black tracking-tighter">MAX PAIN</span>
                                                <span className="text-[9px] text-amber-300/60 font-medium uppercase tracking-tighter">({t('maxPainLabel')})</span>
                                                <span className="text-sm font-black pl-1 border-l border-amber-500/20">${structure?.maxPain || initialStockData.flow?.maxPain || "---"}</span>
                                                {(structure?.maxPain || initialStockData.flow?.maxPain) && (
                                                    <span className={`text-[9px] font-bold ml-1 ${((displayPrice - (structure?.maxPain || initialStockData.flow?.maxPain)) / (structure?.maxPain || initialStockData.flow?.maxPain)) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
                                                <span className="text-[10px] font-bold text-rose-400 w-12 text-right">RESIST</span>
                                                <span className="text-sm font-black text-rose-200 tracking-wider">${structure?.levels?.callWall || "---"}</span>
                                            </div>

                                            {/* Max Pain Marker (Center Concept) */}
                                            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex items-center justify-end pr-8 gap-2 opacity-90">
                                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Max Pain</span>
                                                <div className="w-12 h-[1px] bg-amber-500/50" />
                                            </div>


                                            {/* Current Price Indicator (Floating) */}
                                            <div className="w-full flex items-center gap-2 my-auto z-10 relative">
                                                <div className="h-[1px] flex-1 bg-indigo-500/50" />
                                                <div className="flex flex-col items-center">
                                                    <div className="px-3 py-1 bg-indigo-600 rounded shadow-[0_0_15px_rgba(79,70,229,0.5)] border border-white/20 text-white font-black text-lg tracking-tight z-10 min-w-[100px] text-center">
                                                        ${displayPrice}
                                                    </div>
                                                </div>
                                                <div className="h-[1px] flex-1 bg-indigo-500/50" />
                                            </div>

                                            {/* Support (Put Floor) */}
                                            <div className="flex items-center gap-2 border-t border-emerald-500/30 pt-1">
                                                <span className="text-[10px] font-bold text-emerald-400 w-12 text-right">SUPPORT</span>
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
                                                    <div className="text-[8px] text-slate-500 font-bold uppercase">{t('maxPainDistance')}</div>
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
                                                    <div className="text-[8px] text-slate-500 font-bold uppercase">{t('rangeWidth')}</div>
                                                    <div className={`text-sm font-black ${color}`}>
                                                        {rangeWidth.toFixed(1)}%
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Insight Footer */}
                                    <div className="px-4 py-2 border-t border-white/5 bg-slate-950/30">
                                        <p className="text-[10px] text-white/70 leading-relaxed">
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
                                    {/* Loading Overlay - 첫 로드시에만 표시 (폴링 깜빡임 방지) */}
                                    {structLoading && !structure && (
                                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                                <span className="text-[10px] text-cyan-400/80 font-bold uppercase tracking-wider">Loading...</span>
                                            </div>
                                        </div>
                                    )}
                                    {/* Header */}
                                    <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                        <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                            <Activity size={10} className={structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"} />
                                            NET GAMMA ENGINE
                                        </h4>
                                        {structure?.expiration && (
                                            <span className="text-xs text-white font-mono">EXP: {structure.expiration}</span>
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
                                                    <div className="text-[8px] text-slate-500 uppercase font-bold">NET GEX</div>
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
                                                <div className="text-[11px] text-white/80 leading-snug mt-0.5">
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
                                                                <div className="text-[9px] text-white/80 uppercase font-bold">P/C Ratio</div>
                                                                <div className={`text-sm font-black ${pcrColor}`}>{pcr.toFixed(2)}</div>
                                                                <div className="text-[9px] text-white/80 uppercase font-bold mt-1">Total OI</div>
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
                                                                <span className="text-[8px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold">READY</span>
                                                            </div>
                                                            <div className="text-[11px] text-white/70">{t('gammaFlipLevel')}</div>
                                                        </div>
                                                    </div>

                                                    <div className="text-right">
                                                        <div className="text-2xl font-black text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)] flex items-center justify-end gap-1.5">
                                                            ${structure.gammaFlipLevel}
                                                            {structure.gammaFlipType === 'MULTI_EXP' && (
                                                                <span className="text-[8px] bg-purple-500/80 text-white px-1 py-0.5 rounded font-bold">60D</span>
                                                            )}
                                                        </div>
                                                        {displayPrice && (
                                                            <div className={`text-[10px] font-bold ${displayPrice > structure.gammaFlipLevel ? "text-emerald-400" : "text-rose-400"}`}>
                                                                {displayPrice > structure.gammaFlipLevel
                                                                    ? t('longGammaZone')
                                                                    : t('shortGammaZone')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Position Bar with Labels */}
                                                <div className="relative z-10">
                                                    <div className="flex justify-between text-[9px] mb-0.5">
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
                                                    <div className="flex justify-between text-[9px] text-white/60 mt-0.5">
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
                                                        <div className="text-xs text-slate-400 font-black uppercase tracking-wider flex items-center gap-2">
                                                            Gamma Flip Level
                                                            <span className="text-[8px] bg-slate-600/80 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">LOADING</span>
                                                        </div>
                                                        <div className="text-[11px] text-white/50">{t('optionsDataLoading')}</div>
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
                                                    ? "→ 변동성 축소, 레인지 예상"
                                                    : gammaFlipType === 'ALL_SHORT'
                                                        ? "→ 변동성 확대, 추세 가속 주의"
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
                                                                <div className="text-xs text-slate-400 font-black uppercase tracking-wider flex items-center gap-2">
                                                                    Gamma Flip Level
                                                                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${badgeColor}`}>{badgeText}</span>
                                                                </div>
                                                                <div className="text-[11px] text-white/50">{message}</div>
                                                                {interpretation && (
                                                                    <div className={`text-[10px] font-bold mt-0.5 ${gammaFlipType === 'ALL_LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
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
                                                    <span className="text-[9px] text-white font-bold uppercase">GAMMA CONC. 감마 집중도</span>
                                                </div>
                                                {(() => {
                                                    const concentration = structure?.gammaConcentration ?? 0;
                                                    const label = structure?.gammaConcentrationLabel ?? 'NORMAL';
                                                    const color = label === 'STICKY' ? 'text-amber-400'
                                                        : label === 'LOOSE' ? 'text-emerald-400' : 'text-slate-300';
                                                    const desc = label === 'STICKY' ? '가격 움직임 억제'
                                                        : label === 'LOOSE' ? '자유로운 움직임' : '균형 상태';
                                                    return (
                                                        <div>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className={`text-lg font-black ${color}`}>{concentration}%</span>
                                                                <span className={`text-xs font-semibold ${color}`}>{label}</span>
                                                            </div>
                                                            <div className="text-[9px] text-white mt-0.5">{desc}</div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* Squeeze Risk */}
                                            <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[9px] text-white/80 font-bold uppercase">Squeeze Risk</span>
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
                                        <p className="text-[10px] text-white/70 leading-relaxed">
                                            {structure?.netGex > 0 ? t('shortGammaWarning') : t('longGammaStable')}
                                        </p>
                                    </div>
                                </div>
                            </div>


                            <div className="hidden">
                                {/* Gamma Structure */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-3 bg-slate-500 rounded-full" /> Key Market Levels
                                        </h4>
                                        {(structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone) && (
                                            <span className="text-[10px] text-amber-500 font-black">
                                                Max Pain (최대고통): ${structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone}
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
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 flex items-center justify-center gap-1">
                                                    순 감마 에너지 (Net GEX)
                                                    <span title={`시장 조성자(MM)들의 포지션에 따른 변동성 성향입니다.\n(+) 양수: 주가 변동 억제 (안정/지루함)\n(-) 음수: 주가 변동 증폭 (급등락/스퀴즈 위험)`}>
                                                        <Info size={10} className="text-slate-600 hover:text-slate-400 cursor-help" />
                                                    </span>
                                                </div>

                                                {/* 0DTE Pulse Indicator (New) */}
                                                {structure?.gexZeroDteRatio !== undefined && (
                                                    <div className="mt-3 px-4">
                                                        <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1 tracking-wider uppercase">
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
                                                <div className={`mt-4 text-[10px] font-bold px-2 py-1 rounded inline-block ${structure?.netGex > 0 ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20" : structure?.netGex < 0 ? "bg-rose-950/30 text-rose-400 border border-rose-500/20" : "bg-slate-800 text-slate-400"}`}>
                                                    {structure?.netGex > 0 ? "지지력 강화 (변동성 축소)" : structure?.netGex < 0 ? "변동성 확대 (가속 구간)" : "중립 (방향성 부재)"}
                                                </div>
                                                <div className="mt-4 flex justify-center gap-4 text-[9px] font-medium text-slate-500 border-t border-white/5 pt-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                                        <span>(+) 안전지대</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                                                        <span>(-) 가속구간</span>
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
                        <div className="lg:col-span-4 flex flex-col gap-4 h-full">

                            {/* 1. Decision Gate - Fixed Height */}
                            <div className="shrink-0 relative rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden group hover:border-white/20 transition-colors shadow-2xl">
                                {/* Decorative Outline REMOVED because it conflicts with standard glass look */}
                                <DecisionGate
                                    ticker={ticker}
                                    displayPrice={displayPrice}
                                    session={effectiveSession}
                                    structure={structure}
                                    krNews={krNews}
                                    smaData={smaData}
                                    newsScore={newsScore}
                                    liveQuote={liveQuote}
                                />
                            </div>

                            {/* 2. Flow Unit - Glass Card */}
                            <div className="shrink-0 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden relative group hover:border-white/20 transition-colors shadow-2xl">
                                <div className="p-2 border-b border-white/5 flex items-center justify-between bg-white/5">
                                    <div className="flex items-center gap-2">
                                        <Activity size={10} className="text-sky-400" />
                                        <span className="text-[10px] font-black text-sky-200 uppercase tracking-widest">Flow Unit</span>
                                    </div>
                                    <span className="text-[8px] bg-slate-800/80 text-slate-500 px-1.5 py-0.5 rounded border border-white/5">INTRADAY</span>
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

                            {/* 3. Intel Feed Needs to fill remaining height */}
                            <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden shadow-2xl relative group">
                                {/* Background Pattern */}
                                {/* Background Pattern REMOVED for consistency */}

                                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 relative z-10 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Newspaper size={12} className="text-slate-400" />
                                        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Intel Feed (AI)</h3>
                                    </div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
                                    {krNews.slice(0, 5).map((n: any, i) => (
                                        <a key={i} href={n.url || n.link || "#"} target="_blank" rel="noreferrer" className="block group/item border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors relative min-h-[80px]">
                                            {/* Hover Indicator */}
                                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500/0 group-hover/item:bg-indigo-500 transition-all duration-300" />

                                            <div className="p-3 flex flex-col justify-center h-full">
                                                <div className="text-[9px] text-indigo-300/80 font-bold mb-1 flex justify-between items-center">
                                                    <span className="flex items-center gap-2">
                                                        {n.source || n.publisher || "Unknown"}
                                                        {n.isRumor && (
                                                            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">RUMOR</span>
                                                        )}
                                                    </span>
                                                    <span className={n.sentiment === 'positive' ? 'text-emerald-500' : 'text-slate-600'}>
                                                        {n.sentiment === 'positive' ? 'BULLISH' : ''}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-300 font-medium leading-snug group-hover/item:text-white transition-colors line-clamp-2">
                                                    {/* [S-75] Locale-based display: ko=summaryKR, ja=summaryJP, en=original title */}
                                                    {locale === 'ko'
                                                        ? (n.summaryKR || n.title)
                                                        : locale === 'ja'
                                                            ? (n.summaryJP || n.summaryKR || n.title)
                                                            : n.title
                                                    }
                                                </div>
                                            </div>
                                        </a>
                                    ))}
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
