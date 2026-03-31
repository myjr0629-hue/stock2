"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { useFlowData } from '@/hooks/useFlowData';
import { useLivePrice } from '@/hooks/useLivePrice';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { calcPriceDisplay } from '@/utils/calcPriceDisplay';
import { usePriceFlash, getFlashStyle } from '@/components/ui/PriceDisplay';
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper, BarChart3, AlertCircle, RefreshCw, ShieldAlert, Zap, Layers, Target, Activity, Loader2, Info, TrendingUp, TrendingDown, Crosshair, Radar, Shield, ChevronDown, ChevronUp, Sparkles, BookOpen } from "lucide-react";
import { Link } from "@/i18n/routing";
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
import { GexTimeline } from '@/components/history/GexTimeline';
import { TechnicalLevelsMap } from '@/components/TechnicalLevelsMap';
import { GammaPressureGauge } from '@/components/GammaPressureGauge';
import { AIDeepAnalysis } from '@/components/AIDeepAnalysis';
import { CardTooltip, COMMAND_TOOLTIPS } from '@/components/ui/CardTooltip';
import IVSkewCurve from '@/components/IVSkewCurve';

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
    initialChartData?: any[];  // [PERF] SSR Chart pre-fetch
    onReady?: () => void;      // [PERF] Signal that dashboard has mounted (for SSR preview swap)
}

const DecisionGate = ({ ticker, displayPrice, session, structure, krNews, smaData, newsScore, liveQuote, analystData, fundamentalData, institutionalData, volatilityData, squeezeData, convictionData, earningsData }: any) => {
    const t = useTranslations('command');
    const td = useTranslations('dashboard');
    const ts = useTranslations('signalCoreV3');

    // === Data Completeness Check ===
    const hasStructure = structure && structure.options_status === 'OK';
    const validation = structure?.validation;
    const isLoading = !hasStructure;
    const options_status = structure?.options_status;
    const isFail = options_status !== 'OK' || validation?.confidence === 'LOW';

    // === Data Extraction ===
    const callWall = structure?.levels?.callWall || 0;
    const putFloor = structure?.levels?.putFloor || 0;
    const netGex = structure?.netGex || 0;
    const maxPain = structure?.maxPain || 0;
    const netPremium = liveQuote?.flow?.netPremium || 0;
    const zeroDteRatio = structure?.gexZeroDteRatio || 0;
    const hasRumor = krNews?.some((n: any) => n.isRumor && n.ageHours <= 24) || false;
    const pcRatio = structure?.pcRatio || 0;
    const gammaFlip = structure?.gammaFlipLevel || 0;
    const isREG = session === 'REG';

    // === Loading State ===
    if (isLoading) {
        return (
            <div className="flex flex-col h-full bg-transparent">
                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                    <span className="text-[12px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                        <Zap size={10} />
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.SIGNAL_CORE.tooltip} badge={COMMAND_TOOLTIPS.SIGNAL_CORE.badge}>SIGNAL CORE</CardTooltip>
                    </span>
                    <span className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">LOADING</span>
                </div>
                <div className="p-6 flex-1 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400">Collecting data...</p>
                </div>
            </div>
        );
    }

    // =====================================================================
    // [V3] SIGNAL CORE — 3-AXIS INTERPRETATION ENGINE
    // Axis 1: Direction Bias (bullish/bearish/mixed/neutral)
    // Axis 2: Conviction Quality (high/medium/fragile/mixed)
    // Axis 3: Market Condition (trend/compression/hedging/eventRisk/volatile)
    // =====================================================================

    // === [SCORING] Signal Family Classification ===
    type SignalFamily = 'trend' | 'flow' | 'derivatives' | 'sentiment' | 'event';
    interface ScoredSignal {
        name: string;
        family: SignalFamily;
        direction: 'bull' | 'bear' | 'neutral';
        weight: number;
        label: string;
    }
    const signals: ScoredSignal[] = [];
    let bullScore = 0, bearScore = 0;

    // 1. SMA Trend — always active
    if (smaData?.cross === 'GOLDEN') {
        bullScore += 25;
        signals.push({ name: 'sma', family: 'trend', direction: 'bull', weight: 25, label: 'GOLDEN Cross ✨' });
    } else if (smaData?.cross === 'DEAD') {
        bearScore += 25;
        signals.push({ name: 'sma', family: 'trend', direction: 'bear', weight: 25, label: 'DEAD Cross ☠️' });
    }

    // 2. Price vs Max Pain — REG only
    if (isREG && maxPain > 0) {
        const mpDist = ((displayPrice - maxPain) / maxPain) * 100;
        if (mpDist > 3) {
            bullScore += 15;
            signals.push({ name: 'maxpain', family: 'derivatives', direction: 'bull', weight: 15, label: td('insight.maxPainAbove') });
        } else if (mpDist < -3) {
            bearScore += 15;
            signals.push({ name: 'maxpain', family: 'derivatives', direction: 'bear', weight: 15, label: td('insight.maxPainBelow') });
        } else {
            signals.push({ name: 'maxpain', family: 'derivatives', direction: 'neutral', weight: 0, label: td('insight.maxPainNear') });
        }
    }

    // 3. GEX — REG only
    if (isREG) {
        if (netGex > 0) {
            bullScore += 10;
            signals.push({ name: 'gex', family: 'derivatives', direction: 'bull', weight: 10, label: td('insight.longGammaStable') });
        } else if (netGex < 0) {
            bearScore += 5;
            signals.push({ name: 'gex', family: 'derivatives', direction: 'bear', weight: 5, label: td('insight.shortGammaVolatile') });
        }
    }

    // 4. Flow — REG only
    if (isREG) {
        if (netPremium > 500000) {
            bullScore += 15;
            signals.push({ name: 'flow', family: 'flow', direction: 'bull', weight: 15, label: td('insight.callFlowDominant') });
        } else if (netPremium < -500000) {
            bearScore += 15;
            signals.push({ name: 'flow', family: 'flow', direction: 'bear', weight: 15, label: td('insight.putFlowDominant') });
        }
    }

    // 5. News — always
    if (newsScore && newsScore.score >= 70) {
        bullScore += 10;
        signals.push({ name: 'news', family: 'sentiment', direction: 'bull', weight: 10, label: td('insight.newsPositive') });
    } else if (newsScore && newsScore.score < 40) {
        bearScore += 10;
        signals.push({ name: 'news', family: 'sentiment', direction: 'bear', weight: 10, label: td('insight.newsNegative') });
    }

    // 6. Rumor — always
    if (hasRumor) {
        bearScore += 10;
        signals.push({ name: 'rumor', family: 'sentiment', direction: 'bear', weight: 10, label: td('insight.rumorDetected') });
    }

    // 7. VWAP — REG only
    if (isREG) {
        const vwap = liveQuote?.vwap || 0;
        const price = displayPrice || 0;
        if (vwap > 0 && price > 0) {
            const vwapDiff = ((price - vwap) / vwap) * 100;
            if (vwapDiff > 1) {
                bullScore += 8;
                signals.push({ name: 'vwap', family: 'trend', direction: 'bull', weight: 8, label: td('insight.vwapAbove', { pct: vwapDiff.toFixed(1) }) });
            } else if (vwapDiff < -1) {
                bearScore += 8;
                signals.push({ name: 'vwap', family: 'trend', direction: 'bear', weight: 8, label: td('insight.vwapBelow', { pct: vwapDiff.toFixed(1) }) });
            }
        }
    }

    // 8. Analyst — always
    if (analystData?.totalAnalysts > 0) {
        const bd = analystData.breakdown;
        const buyCount = bd ? bd.strongBuy + bd.buy : 0;
        const buyPct = Math.round((buyCount / analystData.totalAnalysts) * 100);
        if (buyPct >= 80) {
            bullScore += 10;
            signals.push({ name: 'analyst', family: 'sentiment', direction: 'bull', weight: 10, label: td('insight.analystBuy', { pct: String(buyPct) }) });
        } else if (buyPct <= 30) {
            bearScore += 10;
            signals.push({ name: 'analyst', family: 'sentiment', direction: 'bear', weight: 10, label: td('insight.analystBuy', { pct: String(buyPct) }) });
        }
    }

    // 9. Fundamental — always
    if (fundamentalData?.score > 0) {
        if (fundamentalData.grade?.startsWith('A')) {
            bullScore += 5;
            signals.push({ name: 'fundamental', family: 'sentiment', direction: 'bull', weight: 5, label: td('insight.fundamentalGrade', { grade: fundamentalData.grade }) });
        } else if (fundamentalData.grade?.startsWith('D') || fundamentalData.grade === 'F') {
            bearScore += 5;
            signals.push({ name: 'fundamental', family: 'sentiment', direction: 'bear', weight: 5, label: td('insight.fundamentalGrade', { grade: fundamentalData.grade }) });
        }
    }

    // 10. Dark Pool — REG only
    if (isREG && institutionalData?.darkPool) {
        const dpBuyPct = institutionalData.darkPool.buyPct || 0;
        const dpSellPct = institutionalData.darkPool.sellPct || 0;
        if (dpBuyPct > 55) {
            bullScore += 10;
            signals.push({ name: 'darkpool', family: 'flow', direction: 'bull', weight: 10, label: td('insight.darkPoolBuy', { pct: String(dpBuyPct) }) });
        } else if (dpSellPct > 55) {
            bearScore += 10;
            signals.push({ name: 'darkpool', family: 'flow', direction: 'bear', weight: 10, label: td('insight.darkPoolSell', { pct: String(dpSellPct) }) });
        }
    }

    // 11. 0DTE — REG only
    if (isREG && zeroDteRatio > 0.3) {
        signals.push({ name: '0dte', family: 'derivatives', direction: 'neutral', weight: 0, label: td('insight.zeroDteHigh') });
    }

    // === [V3] 12-16: NEW INDICATORS ===

    // 12. IV Skew — REG only
    if (isREG && structure?.rawContracts) {
        const contracts = structure.rawContracts;
        let callIVs: number[] = [], putIVs: number[] = [];
        contracts.forEach((c: any) => {
            if (c.impliedVolatility > 0 && Math.abs(c.strike - displayPrice) / displayPrice < 0.05) {
                if (c.type === 'call') callIVs.push(c.impliedVolatility);
                else putIVs.push(c.impliedVolatility);
            }
        });
        if (callIVs.length > 0 && putIVs.length > 0) {
            const avgCallIV = callIVs.reduce((a, b) => a + b, 0) / callIVs.length;
            const avgPutIV = putIVs.reduce((a, b) => a + b, 0) / putIVs.length;
            const skewRatio = avgPutIV / avgCallIV;
            if (skewRatio > 1.15) {
                bearScore += 8;
                signals.push({ name: 'ivskew', family: 'derivatives', direction: 'bear', weight: 8, label: ts('ivSkewPutRich') });
            } else if (skewRatio < 0.85) {
                bullScore += 8;
                signals.push({ name: 'ivskew', family: 'derivatives', direction: 'bull', weight: 8, label: ts('ivSkewCallRich') });
            }
        }
    }

    // 13. P/C Ratio — REG only
    if (isREG && pcRatio > 0) {
        if (pcRatio < 0.7) {
            bullScore += 7;
            signals.push({ name: 'pcr', family: 'derivatives', direction: 'bull', weight: 7, label: ts('pcrCallSide') });
        } else if (pcRatio > 1.2) {
            bearScore += 7;
            signals.push({ name: 'pcr', family: 'derivatives', direction: 'bear', weight: 7, label: ts('pcrPutSide') });
        }
    }

    // 14. Vol Regime — REG only
    if (isREG && volatilityData) {
        const rs = volatilityData.regimeScore || 50;
        if (rs >= 70) {
            signals.push({ name: 'volregime', family: 'derivatives', direction: 'neutral', weight: 0, label: ts('volErupting') });
        } else if (rs <= 30) {
            signals.push({ name: 'volregime', family: 'derivatives', direction: 'neutral', weight: 0, label: ts('volCoiling') });
        }
    }

    // 15. Short Squeeze — REG only
    if (isREG && squeezeData) {
        const sqStatus = squeezeData.status;
        if (sqStatus === 'CRITICAL' || sqStatus === 'HIGH') {
            bullScore += 7;
            signals.push({ name: 'squeeze', family: 'derivatives', direction: 'bull', weight: 7, label: ts('squeezePressure', { si: squeezeData.siPercent?.toFixed(1) || '?' }) });
        }
    }

    // 16. Earnings Proximity — always
    let earningsDays: number | null = null;
    if (earningsData?.daysLabel) {
        const parsed = parseInt(earningsData.daysLabel.replace(/\D/g, ''));
        if (!isNaN(parsed)) earningsDays = parsed;
    }
    if (earningsDays !== null && earningsDays <= 7) {
        signals.push({ name: 'earnings', family: 'event', direction: 'neutral', weight: 0, label: ts('earningsNear', { days: String(earningsDays) }) });
    }

    // =====================================================================
    // [AXIS 1] DIRECTION BIAS
    // =====================================================================
    const diff = bullScore - bearScore;
    let directionBias: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' = 'NEUTRAL';
    if (isFail) {
        directionBias = 'NEUTRAL';
    } else if (!isREG) {
        directionBias = diff >= 15 ? 'BULLISH' : diff <= -15 ? 'BEARISH' : 'NEUTRAL';
    } else {
        if (diff >= 25) directionBias = 'BULLISH';
        else if (diff <= -25) directionBias = 'BEARISH';
        else if (Math.abs(diff) < 10) directionBias = 'NEUTRAL';
        else directionBias = 'MIXED';
    }

    // =====================================================================
    // [AXIS 2] CONVICTION QUALITY
    // =====================================================================
    const bullSignals = signals.filter(s => s.direction === 'bull');
    const bearSignals = signals.filter(s => s.direction === 'bear');
    const totalDirectional = bullSignals.length + bearSignals.length;
    const dominantCount = Math.max(bullSignals.length, bearSignals.length);
    const minorityCount = Math.min(bullSignals.length, bearSignals.length);

    // Family alignment check
    const familyAlignment = (dir: 'bull' | 'bear') => {
        const sigs = signals.filter(s => s.direction === dir);
        const families = new Set(sigs.map(s => s.family));
        return families.size;
    };
    const dominantDir = bullSignals.length >= bearSignals.length ? 'bull' : 'bear';
    const dominantFamilies = familyAlignment(dominantDir as 'bull' | 'bear');

    let convictionQuality: 'HIGH' | 'MEDIUM' | 'FRAGILE' | 'MIXED' = 'MIXED';
    if (isFail || !isREG) {
        convictionQuality = 'MIXED';
    } else {
        const hasContradiction = minorityCount >= 2;
        const hasEventRisk = earningsDays !== null && earningsDays <= 7;
        const hasVolatileRegime = volatilityData?.regimeScore >= 70;
        const hasStrongDivergence = signals.some(s => s.name === 'ivskew' && s.direction !== dominantDir) ||
            signals.some(s => s.name === 'gex' && s.direction !== dominantDir);

        if (dominantCount >= 5 && dominantFamilies >= 3 && !hasContradiction && !hasEventRisk) {
            convictionQuality = 'HIGH';
        } else if (dominantCount >= 3 && !hasStrongDivergence && !hasVolatileRegime) {
            convictionQuality = 'MEDIUM';
        } else if (hasContradiction || hasStrongDivergence) {
            convictionQuality = 'FRAGILE';
        } else {
            convictionQuality = 'MIXED';
        }
    }

    // =====================================================================
    // [AXIS 3] MARKET CONDITION
    // =====================================================================
    let marketCondition: 'TREND' | 'COMPRESSION' | 'HEDGING' | 'EVENT_RISK' | 'VOLATILE' = 'TREND';
    if (isFail || !isREG) {
        marketCondition = 'TREND';
    } else {
        const hasEarnings = earningsDays !== null && earningsDays <= 7;
        const isVolatile = (netGex < 0 && (volatilityData?.regimeScore >= 70 || (squeezeData?.status === 'CRITICAL')));
        const isHedging = signals.some(s => s.name === 'ivskew' && s.direction === 'bear') &&
            (netPremium < -200000 || (institutionalData?.darkPool?.sellPct > 50));
        const isCompression = volatilityData?.regimeScore <= 35 &&
            callWall > 0 && putFloor > 0 &&
            ((callWall - displayPrice) / displayPrice < 0.08) &&
            ((displayPrice - putFloor) / displayPrice < 0.08);

        if (hasEarnings) marketCondition = 'EVENT_RISK';
        else if (isVolatile) marketCondition = 'VOLATILE';
        else if (isHedging) marketCondition = 'HEDGING';
        else if (isCompression) marketCondition = 'COMPRESSION';
        else marketCondition = 'TREND';
    }

    // =====================================================================
    // [5-TIER BRIEFING] Dynamic Generation
    // =====================================================================

    // --- Tier 1: Headline ---
    let headline = '';
    if (isFail) {
        headline = ts('headlineDataValidating');
    } else if (!isREG) {
        const sessionLabel = session === 'PRE' ? td('session.preMarket') : session === 'POST' ? td('session.afterMarket') : td('session.closed');
        headline = ts('headlineSession', { session: sessionLabel, ticker });
    } else {
        headline = ts(`headline.${directionBias.toLowerCase()}`, { ticker });
    }

    // --- Tier 2: Primary Driver (aligned-family logic) ---
    let primaryDriver = '';
    if (isREG && !isFail) {
        const familyGroups: Record<SignalFamily, ScoredSignal[]> = { trend: [], flow: [], derivatives: [], sentiment: [], event: [] };
        signals.filter(s => s.direction === dominantDir).forEach(s => familyGroups[s.family].push(s));

        // Find best aligned family (2+ signals same direction)
        const alignedFamilies = (Object.entries(familyGroups) as [SignalFamily, ScoredSignal[]][])
            .filter(([, sigs]) => sigs.length >= 2)
            .sort((a, b) => b[1].reduce((s, x) => s + x.weight, 0) - a[1].reduce((s, x) => s + x.weight, 0));

        if (alignedFamilies.length > 0) {
            const [family] = alignedFamilies[0];
            const familyKey = family as string;
            primaryDriver = ts(`driver.family.${familyKey}`);
            // Add second aligned family if exists
            if (alignedFamilies.length >= 2) {
                const [family2] = alignedFamilies[1];
                primaryDriver += ` + ${ts(`driver.family.${family2 as string}`)}`;
            }
        } else {
            // Fallback: top 2 scoring signals
            const top2 = signals.filter(s => s.direction !== 'neutral').sort((a, b) => b.weight - a.weight).slice(0, 2);
            primaryDriver = top2.map(s => s.label).join(' + ');
        }
    } else if (!isFail) {
        const activeSigs = signals.filter(s => s.direction !== 'neutral');
        primaryDriver = activeSigs.length > 0 ? activeSigs.map(s => s.label).join(', ') : ts('driverNoSignal');
    }

    // --- Tier 3: Risk Context (contradiction-aware) ---
    let riskContext = '';
    if (isREG && !isFail) {
        const oppositeSignals = signals.filter(s => s.direction !== 'neutral' && s.direction !== dominantDir);
        const oppFamilies = new Set(oppositeSignals.map(s => s.family));

        if (oppositeSignals.length === 0) {
            riskContext = ts('riskNone');
        } else if (oppFamilies.has('derivatives') && !oppFamilies.has('trend') && !oppFamilies.has('flow')) {
            // Derivatives disagree with headline
            riskContext = directionBias === 'BULLISH' || directionBias === 'MIXED'
                ? ts('riskDerivativesDefensive')
                : ts('riskDerivativesSupportive');
        } else if (oppFamilies.has('flow') && !oppFamilies.has('trend')) {
            riskContext = ts('riskFlowContra');
        } else if (oppFamilies.has('trend') && !oppFamilies.has('derivatives')) {
            riskContext = ts('riskTrendContra');
        } else {
            riskContext = ts('riskMultiContra');
        }

        // Append event/vol context if relevant
        if (earningsDays !== null && earningsDays <= 7) {
            riskContext += ` ${ts('riskEarningsAppend', { days: String(earningsDays) })}`;
        }
        if (volatilityData?.regimeScore >= 70) {
            riskContext += ` ${ts('riskVolAppend')}`;
        }
    }

    // --- Tier 4: Key Observation (structural-importance) ---
    let keyObservation = '';
    if (isREG && !isFail && callWall > 0 && putFloor > 0) {
        const cwDist = ((callWall - displayPrice) / displayPrice * 100);
        const pfDist = ((displayPrice - putFloor) / displayPrice * 100);
        const gfDist = gammaFlip > 0 ? Math.abs(displayPrice - gammaFlip) / displayPrice * 100 : 999;
        const mpDist = maxPain > 0 ? Math.abs(displayPrice - maxPain) / displayPrice * 100 : 999;

        // Structural-importance priority
        if (netGex < 0 && gfDist < 5 && gammaFlip > 0) {
            keyObservation = ts('obsGammaFlip', { gf: `$${gammaFlip}`, dir: displayPrice > gammaFlip ? ts('obsAbove') : ts('obsBelow') });
        } else if (earningsDays !== null && earningsDays <= 3) {
            keyObservation = ts('obsEarningsEvent');
        } else if (directionBias === 'BULLISH' || directionBias === 'MIXED') {
            keyObservation = ts('obsCallWall', { cw: `$${callWall}`, pct: cwDist.toFixed(1) });
        } else if (directionBias === 'BEARISH') {
            keyObservation = ts('obsPutFloor', { pf: `$${putFloor}`, pct: pfDist.toFixed(1) });
        } else if (mpDist < 3) {
            keyObservation = ts('obsMaxPain', { mp: `$${maxPain}` });
        } else {
            keyObservation = ts('obsRange', { cw: `$${callWall}`, pf: `$${putFloor}` });
        }
    }

    // --- Tier 5: Conclusion (mandatory "so what") ---
    let conclusion = '';
    if (isFail) {
        conclusion = ts('conclusionDataWait');
    } else if (!isREG) {
        conclusion = ts('conclusionSession', { ticker });
    } else {
        // Build conclusion from 3-axis state
        const dirKey = directionBias.toLowerCase();
        const convKey = convictionQuality.toLowerCase();
        const condKey = marketCondition.toLowerCase().replace('_', '');

        // Select most appropriate conclusion template
        if (convictionQuality === 'HIGH' && marketCondition === 'TREND') {
            conclusion = ts('conclusion.cleanTrend', { ticker });
        } else if (convictionQuality === 'FRAGILE' && (marketCondition === 'HEDGING' || signals.some(s => s.name === 'ivskew' && s.direction !== dominantDir))) {
            conclusion = ts(`conclusion.fragileHedge.${dirKey}`, { ticker });
        } else if (marketCondition === 'EVENT_RISK') {
            conclusion = ts(`conclusion.eventRisk.${dirKey}`, { ticker, days: String(earningsDays || '?') });
        } else if (marketCondition === 'VOLATILE') {
            conclusion = ts(`conclusion.volatile.${dirKey}`, { ticker });
        } else if (marketCondition === 'COMPRESSION') {
            conclusion = ts('conclusion.compression', { ticker });
        } else if (convictionQuality === 'MIXED' || directionBias === 'MIXED') {
            conclusion = ts('conclusion.mixed', { ticker });
        } else {
            conclusion = ts(`conclusion.standard.${dirKey}`, { ticker });
        }
    }

    // === Legacy compatibility: insights array for badge grid ===
    const insights = signals.map(s => ({
        text: s.label,
        type: s.direction
    }));
    const bullCount = signals.filter(s => s.direction === 'bull').length;
    const bearCount = signals.filter(s => s.direction === 'bear').length;
    const totalSignals = bullCount + bearCount;
    const convergenceLabel = totalSignals > 0
        ? (bullCount > bearCount ? `${bullCount}/${totalSignals}` : `${bearCount}/${totalSignals}`)
        : '—';
    const isConvergence = totalSignals >= 3 && (bullCount >= 3 || bearCount >= 3);

    // === IF→THEN Conditional Scenarios ===
    const scenarios: string[] = [];
    if (isREG && callWall > 0 && putFloor > 0 && maxPain > 0 && !isFail) {
        const cwDist = ((callWall - displayPrice) / displayPrice * 100).toFixed(1);
        const pfDist = ((displayPrice - putFloor) / displayPrice * 100).toFixed(1);
        if (displayPrice > maxPain && netGex > 0) {
            scenarios.push(`IF → Call Wall $${callWall} (+${cwDist}%) ${td('scenario.breakAbove')}`);
        }
        if (displayPrice < maxPain && netGex < 0) {
            scenarios.push(`IF → Put Floor $${putFloor} (-${pfDist}%) ${td('scenario.breakBelow')}`);
        }
        if (Math.abs(displayPrice - maxPain) / maxPain < 0.015) {
            scenarios.push(`IF → Max Pain $${maxPain} ${td('scenario.pinning')}`);
        }
        if (gammaFlip > 0 && Math.abs(displayPrice - gammaFlip) / displayPrice < 0.03) {
            scenarios.push(`IF → GF $${gammaFlip} ${displayPrice > gammaFlip ? td('scenario.gammaFlipAbove') : td('scenario.gammaFlipBelow')}`);
        }
    }

    // === Styling ===
    const verdictColors = {
        BULLISH: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
        BEARISH: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40' },
        MIXED: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
        NEUTRAL: { bg: 'bg-indigo-500/15', text: 'text-slate-300', border: 'border-indigo-500/30' },
    };
    const colors = verdictColors[directionBias];
    const conditionLabel = marketCondition.replace('_', ' ');

    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header — 3-Axis Display */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                <span className="text-[12px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Zap size={10} />
                    <CardTooltip tooltip={COMMAND_TOOLTIPS.SIGNAL_CORE.tooltip} badge={COMMAND_TOOLTIPS.SIGNAL_CORE.badge}>SIGNAL CORE</CardTooltip>
                </span>
                <div className="flex items-center gap-1.5">
                    <span className={`text-[12px] font-black uppercase tracking-wider ${colors.text}`}>{directionBias}</span>
                    <span className="text-[10px] text-white/20">·</span>
                    <span className={`text-[12px] font-semibold uppercase tracking-wider ${convictionQuality === 'HIGH' ? 'text-emerald-400' : convictionQuality === 'FRAGILE' ? 'text-amber-400' : 'text-slate-400'}`}>
                        {convictionQuality}
                    </span>
                    <span className="text-[10px] text-white/20">·</span>
                    <span className={`text-[12px] font-semibold uppercase tracking-wider ${marketCondition === 'VOLATILE' || marketCondition === 'EVENT_RISK' ? 'text-rose-400' : marketCondition === 'HEDGING' ? 'text-amber-400' : 'text-slate-400'}`}>
                        {conditionLabel}
                    </span>
                </div>
                {isConvergence && (
                    <span className={`text-[12px] font-black px-1.5 py-0.5 rounded ${directionBias === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : directionBias === 'BEARISH' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'}`}>
                        {convergenceLabel}
                    </span>
                )}
            </div>

            {/* Main Content — 5-Tier Briefing */}
            <div className="p-4 space-y-3 flex-1">
                {/* Tier 1: Headline */}
                <div className={`p-3 rounded-xl ${colors.bg} border ${colors.border}`}>
                    <p className="text-sm text-white font-semibold leading-relaxed">
                        {headline}
                    </p>
                    {/* Tier 2: Primary Driver */}
                    {primaryDriver && (
                        <p className="text-[13px] text-white/80 leading-relaxed mt-1.5">
                            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider mr-1.5">{ts('labelDriver')}</span>
                            {primaryDriver}
                        </p>
                    )}
                    {/* Tier 3: Risk Context */}
                    {riskContext && (
                        <p className="text-[13px] text-amber-300/80 leading-relaxed mt-1.5">
                            <span className="text-[11px] text-amber-400/50 font-bold uppercase tracking-wider mr-1.5">{ts('labelRisk')}</span>
                            {riskContext}
                        </p>
                    )}
                    {/* Tier 4: Key Observation */}
                    {keyObservation && (
                        <p className="text-[13px] text-cyan-300/80 leading-relaxed mt-1.5">
                            <span className="text-[11px] text-cyan-400/50 font-bold uppercase tracking-wider mr-1.5">{ts('labelObs')}</span>
                            {keyObservation}
                        </p>
                    )}
                </div>

                {/* Tier 5: Conclusion — always visible, visually distinct */}
                {conclusion && (
                    <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                        <p className="text-[13px] text-slate-200 leading-relaxed">
                            <span className="text-[11px] text-white/30 font-bold uppercase tracking-wider mr-1.5">{ts('labelConclusion')}</span>
                            {conclusion}
                        </p>
                    </div>
                )}

                {/* IF→THEN Scenarios */}
                {scenarios.length > 0 && (
                    <div className="space-y-1">
                        {scenarios.map((s, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-[12px] text-amber-300/90 leading-snug">
                                <span className="text-amber-500 mt-0.5 shrink-0">▸</span>
                                <span>{s}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Key Insights Grid */}
                <div className="space-y-2">
                    <div className="text-[12px] font-bold text-slate-300 uppercase tracking-wider">{td('keyMetrics')}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {insights.filter(i => i.type !== 'neutral').slice(0, 8).map((item, i) => (
                            <span
                                key={i}
                                className={`text-[12px] font-bold px-2 py-1 rounded-lg ${item.type === 'bull' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
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

export function LiveTickerDashboard({ ticker, initialStockData, initialNews, range, buildId, chartDiagnostics, initialUnifiedData, initialChartData, onReady }: Props) {
    const tCommon = useTranslations('common');
    // --- Live Data State ---
    // [극강] Track whether unified API has responded (to distinguish 'loading' vs 'no data')
    const [unifiedDataReceived, setUnifiedDataReceived] = useState(!!initialUnifiedData);
    // [PERF V73] 3-second loading gate auto-release — blank screen NEVER exceeds 3s
    const [forceReady, setForceReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setForceReady(true), 3000);
        return () => clearTimeout(timer);
    }, []);
    // [극강] 5-second safety: if unified API hasn't responded, stop showing 'Loading...' on cards
    useEffect(() => {
        if (unifiedDataReceived) return;
        const safetyTimer = setTimeout(() => setUnifiedDataReceived(true), 5000);
        return () => clearTimeout(safetyTimer);
    }, [unifiedDataReceived]);

    // [PERF] SWR replaces manual fetchQuote + setInterval(10s)
    // SSR data → SWR fallbackData → instant first render → background refresh
    const ssrFallback = React.useMemo(() => {
        // [V73] Accept DynamoDB price as fallback when Polygon price=0
        const stockPrice = initialStockData?.price || 0;
        const dynamoPrice = initialUnifiedData?._dynamoPrice?.price || 0;
        const effectivePrice = stockPrice > 0 ? stockPrice : dynamoPrice;
        if (!effectivePrice || effectivePrice === 0) return undefined;
        const s = (initialStockData?.session || '').toLowerCase() as string;
        // [V75 INSTANT PRE/POST] Use SSR-fetched extended prices from getStockDataLight
        // Previously: prePrice was only set when session === 'pre' → PRE CLOSE badge appeared ~5s late
        // Now: always pass through extended.prePrice/postPrice so calcPriceDisplay renders badge at 0ms
        const ssrPrePrice = initialStockData?.extended?.prePrice || null;
        const ssrPostPrice = initialStockData?.extended?.postPrice || null;
        return {
            price: effectivePrice,
            prices: {
                regularCloseToday: s === 'reg' ? effectivePrice : undefined,
                prevRegularClose: initialStockData?.prevClose || null,
                prevClose: initialStockData?.prevClose || null,
                prePrice: s === 'pre' ? effectivePrice : (ssrPrePrice || undefined),
                postPrice: (s === 'post' || s === 'closed') ? effectivePrice : (ssrPostPrice || undefined),
                lastTrade: effectivePrice,
            },
            extended: {
                prePrice: ssrPrePrice || (s === 'pre' ? effectivePrice : undefined),
                preClose: ssrPrePrice || undefined,
                postPrice: ssrPostPrice || (s === 'post' || s === 'closed' ? effectivePrice : undefined),
            },
            session: s === 'reg' ? 'REG' : s === 'pre' ? 'PRE' : s === 'post' ? 'POST' : 'CLOSED',
            changePercent: initialStockData?.changePercent || initialUnifiedData?._dynamoPrice?.changePct || 0
        };
    }, [initialStockData, initialUnifiedData]);
    const { data: _swrQuote, isValidating: quoteLoading } = useFlowData(ticker, {
        refreshInterval: 2000, // [UX] Near-real-time price feel
    });
    // [PERF] 5s real-time price polling (separate from heavy 60s ticker API)
    const livePrice = useLivePrice(ticker);
    // [AWS Phase 3] WebSocket real-time price/GEX from EC2 Hub
    const { connected: wsConnected, getPrice: wsGetPrice, getGex: wsGetGex, getQuote: wsGetQuote } = useRealtimeData([ticker]);
    const wsPrice = wsGetPrice(ticker);
    const wsGex = wsGetGex(ticker);
    // Use SWR data when available, SSR fallback otherwise — keeps 'liveQuote' name for compatibility
    const liveQuote = _swrQuote || ssrFallback || null;
    const [options, setOptions] = useState<any>(initialUnifiedData?.options || null);
    // [PERF V74] Chart data via SWR — dedup, stale-while-revalidate, focus-revalidation automatic
    const { data: _swrChartResult } = useSWR(
        ticker ? `/api/chart?symbol=${ticker}&range=${range}` : null,
        (url: string) => fetch(url).then(r => r.json()),
        {
            fallbackData: initialChartData ? { data: initialChartData } : undefined,
            refreshInterval: 30_000,     // 30s polling (same as old setInterval)
            revalidateOnFocus: true,     // Refresh when user returns to tab
            dedupingInterval: 10_000,    // Prevent duplicate fetches within 10s
        }
    );
    const liveChartData = _swrChartResult?.data || initialChartData || null;
    const [structure, setStructure] = useState<any>(initialUnifiedData?.structure || null);
    const [krNews, setKrNews] = useState<any[]>(initialNews || []);
    const [expandedNewsId, setExpandedNewsId] = useState<number | null>(null);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [structLoading, setStructLoading] = useState(false);
    const [newsLoading, setNewsLoading] = useState(false);
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [selectedExp, setSelectedExp] = useState<string>("");
    // [S-124.6] Quick Intel Gauges State
    const [newsScore, setNewsScore] = useState<{ score: number; label: string; breakdown?: { positive: number; negative: number; neutral: number } } | null>(null);
    const [earningsData, setEarningsData] = useState<{ nextDate: string | null; daysLabel: string; epsEstimate: number | null; quarter: number | null; year: number | null; hourLabel: string; color: string } | null>(() => {
        if (!initialUnifiedData?.earnings) return null;
        const e = initialUnifiedData.earnings;
        return { nextDate: e.nextEarningsDate || null, daysLabel: e.daysLabel || 'TBD', epsEstimate: e.epsEstimate || null, quarter: e.quarter || null, year: e.year || null, hourLabel: e.hourLabel || '', color: e.color || 'text-slate-400' };
    });
    const [smaData, setSmaData] = useState<{ cross: string; crossType: string; label: string; sma50: number; sma200: number; distance: number; isImminent: boolean; phase: string } | null>(() => {
        if (!initialUnifiedData?.sma) return null;
        const s = initialUnifiedData.sma;
        return { cross: s.cross || 'UNKNOWN', crossType: s.crossType || '', label: s.label || '', sma50: s.sma50 || 0, sma200: s.sma200 || 0, distance: s.distance || 0, isImminent: s.isImminent || false, phase: s.phase || 'UNKNOWN' };
    });
    const [conviction, setConviction] = useState<{ score: number; label: string; grade: string } | null>(null);
    // [UX] GEX Timeline ↔ Tech Levels ↔ IV SKEW toggle
    const [activeInsightTab, setActiveInsightTab] = useState<'gex' | 'levels' | 'ivskew'>('gex');
    const [relatedData, setRelatedData] = useState<{ count: number; topRelated: { ticker: string; price: number; change: number; logo: string | null }[] } | null>(() => {
        if (!initialUnifiedData?.related) return null;
        return { count: initialUnifiedData.related.count || 0, topRelated: initialUnifiedData.related.topRelated || [] };
    });
    // [WS] Subscribe to RELATED tickers for real-time price updates
    const relatedTickers = React.useMemo(() => relatedData?.topRelated?.map(r => r.ticker) ?? [], [relatedData?.topRelated?.map(r => r.ticker).join(',')]);
    const { connected: relWsConnected, getPrice: relWsGetPrice } = useRealtimeData(relatedTickers.length > 0 ? relatedTickers : undefined);
    const [analystData, setAnalystData] = useState<{
        consensus: string; totalAnalysts: number; bullishPct: number;
        breakdown: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
        priceTarget: { mean: number; median: number; high: number; low: number } | null;
    } | null>(initialUnifiedData?.analyst || null);
    // [PREMIUM-5x2] New indicator states
    const [volatilityData, setVolatilityData] = useState<{ regime: string; regimeScore: number; gex: number; gexLabel: string; iv: number; flipDistance: number; flipLevel: number; isAboveFlip: boolean; squeezeScore: number; squeezeRisk: string; gammaConcentration: number; gammaConcentrationLabel: string } | null>(initialUnifiedData?.volatility || null);
    const [squeezeData, setSqueezeData] = useState<{ siPercent: number; daysToCover: number; siChange: number; shortVolPercent: number; riskScore: number; status: string } | null>(initialUnifiedData?.squeeze || null);
    const [institutionalData, setInstitutionalData] = useState<{ darkPool: { percent: number } | null; blockTrade: { count: number; volume: number } | null; shortVolume: { percent: number } | null } | null>(initialUnifiedData?.institutional || null);
    const [fundamentalData, setFundamentalData] = useState<{ score: number; grade: string; breakdown: Record<string, { value: string; score: number; label: string }>; pe?: number | null; de?: number | null; roe?: number | null; revenueGrowth?: number | null; netMargin?: number | null; fcfYield?: number | null } | null>(initialUnifiedData?.fundamentals || null);
    // [Company Profile] Overview data for header display
    const [companyOverview, setCompanyOverview] = useState<{ sector: string | null; sectorEN: string | null; description: string | null; descriptionEN: string | null } | null>(() => {
        if (!initialUnifiedData?.overview?.overview) return null;
        const o = initialUnifiedData.overview.overview;
        return { sector: o.sector, sectorEN: o.sectorEN, description: o.description, descriptionEN: o.descriptionEN };
    });
    // [Bloomberg DES] Company description popover state
    const [descPopoverOpen, setDescPopoverOpen] = useState(false);
    useEffect(() => {
        if (!descPopoverOpen) return;
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDescPopoverOpen(false); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [descPopoverOpen]);

    // i18n translations
    const t = useTranslations('command');
    const td = useTranslations('dashboard');
    const tIntel = useTranslations('intel');
    const tg = useTranslations('gate');
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
    // [V73] COMMAND HYBRID ARCHITECTURE (Unified SWR Cache — Zero Blank Screen)
    // =========================================================================

    // 1. Fetch Unified Backend Data (11-in-1 aggregation + Redis SWR Cache)
    // [COLD-START FIX] Dynamic polling: 3s when data incomplete → 15s when complete
    // This ensures cold-start tickers auto-populate within seconds of Lambda completion
    const isColdStart = !structure && !initialUnifiedData?.structure;
    const dynamicRefreshInterval = isColdStart ? 3_000 : 15_000;

    const { data: unifiedData, error: unifiedError } = useSWR(
        ticker ? `/api/command/unified?t=${ticker}&lang=${locale}` : null,
        (url: string) => fetch(url).then(res => res.json()),
        {
            fallbackData: initialUnifiedData, // [SSR HYDRATION] Bypass skeleton
            revalidateOnFocus: true,  // Refresh when user returns to tab
            revalidateIfStale: true,
            revalidateOnMount: true,  // [V73] ALWAYS fetch on mount — SSR data may be stale
            refreshInterval: dynamicRefreshInterval,  // [COLD-START] 3s aggressive → 15s normal
            dedupingInterval: isColdStart ? 2_000 : 5_000,  // [COLD-START] Faster dedup when incomplete
        }
    );

    // 2. Map Unified Data to Components
    // [극강] Deep fingerprint ensures useEffect fires whenever actual data VALUES change
    // Previous: only used boolean presence (!!field) — missed value changes within same shape
    const unifiedFingerprint = unifiedData ? [
        unifiedData.structure?.netGex ?? 'x',
        unifiedData.structure?.atmIV ?? 'x',
        unifiedData.volatility?.regimeScore ?? 'x',
        unifiedData.volatility?.iv ?? 'x',
        unifiedData.sma?.cross ?? 'x',
        unifiedData.sma?.sma50 ?? 'x',
        unifiedData.fundamentals?.score ?? 'x',
        unifiedData.institutional?.darkPool?.percent ?? 'x',
        unifiedData.squeeze?.status ?? 'x',
        unifiedData.analyst?.consensus ?? 'x',
        unifiedData.related?.count ?? 'x',
        unifiedData.earnings?.nextEarningsDate ?? 'x',
        unifiedData.timestamp || '',
        unifiedData._source || '',
    ].join('|') : '';
    useEffect(() => {
        if (!unifiedData) return;
        console.log('[Command] useEffect triggered, source:', unifiedData._source, 'has volatility:', !!unifiedData.volatility, 'has sma:', !!unifiedData.sma);

        // Structure & Options
        if (unifiedData.structure) setStructure(unifiedData.structure);
        if (unifiedData.options) setOptions(unifiedData.options);

        // Earnings
        if (unifiedData.earnings) {
            setEarningsData({
                nextDate: unifiedData.earnings.nextEarningsDate || unifiedData.earnings.nextDate,
                daysLabel: unifiedData.earnings.daysLabel || '',
                hourLabel: unifiedData.earnings.hourLabel || '',
                epsEstimate: unifiedData.earnings.epsEstimate ?? null,
                quarter: unifiedData.earnings.quarter,
                year: unifiedData.earnings.year,
                color: unifiedData.earnings.color || 'text-slate-400'
            });
        }

        // SMA / Trend Phase
        if (unifiedData.sma) {
            setSmaData({
                cross: unifiedData.sma.cross || 'NONE',
                crossType: unifiedData.sma.crossType || '',
                label: unifiedData.sma.label || '',
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
        // [극강] Mark unified data as received — cards can now show 'N/A' instead of 'Loading...'
        setUnifiedDataReceived(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unifiedFingerprint]);

    // ══════════════════════════════════════════════════════════════
    // [EFFECTIVE VALUES] useMemo fallback — guarantees card data
    // even if useEffect hasn't fired yet (bypasses intermediate step)
    // ══════════════════════════════════════════════════════════════
    const effectiveVol = React.useMemo(() => {
        // [HELPER] Recalculate regimeScore to ensure IV contribution is included
        const ensureScoreIncludesIv = (vol: any): any => {
            if (!vol) return vol;
            const iv = vol.iv || 0;
            if (iv <= 0) return vol;
            // IV should contribute to regimeScore. Recalculate if it wasn't included.
            let score = 5; // Base: valid data present
            // GEX contribution (both SHORT and LONG)
            const gex = vol.gex || 0;
            const isShort = gex < 0;
            if (isShort) score += Math.min(30, Math.abs(gex) / 1000000 * 3);
            else score += Math.min(10, Math.abs(gex) / 2000000 * 3);
            // Flip distance contribution
            const fd = Math.abs(vol.flipDistance || 0);
            if (fd < 1) score += 15; else if (fd < 3) score += 10; else if (fd < 5) score += 5; else if (fd < 10) score += 2;
            // IV contribution (iv is in % form: 32 = 32%)
            if (iv > 60) score += 25; else if (iv > 40) score += 15; else if (iv > 25) score += 8; else if (iv > 15) score += 4;
            score = Math.min(100, Math.round(score));
            // Only upgrade score — never downgrade (avoids losing other contributions)
            if (score > (vol.regimeScore || 0)) {
                const regime = score >= 75 ? 'ERUPTING' : score >= 50 ? 'LOADED' : score >= 25 ? 'COILING' : 'CALM';
                return { ...vol, regimeScore: score, regime };
            }
            return vol;
        };

        // Derive from structure if available (instant, real-time GEX data)
        const structureDerived = (() => {
            if (!structure || structure.netGex == null) return null;
            const netGex = structure.netGex || 0;
            const isShortGamma = netGex < 0;
            const flipLevel = structure.gammaFlipLevel || 0;
            const price = livePrice?.price || initialStockData?.price || 0;
            const flipDist = flipLevel > 0 && price > 0 ? ((price - flipLevel) / flipLevel) * 100 : 0;
            // [FIX] Redesigned scoring — always produce meaningful non-zero when data exists
            let regimeScore = 5; // Base: valid GEX data present
            // GEX direction contribution (both SHORT and LONG contribute)
            if (isShortGamma) {
                regimeScore += Math.min(30, Math.abs(netGex) / 1000000 * 3);
            } else {
                // LONG gamma = stabilizing force = lower but non-zero score
                regimeScore += Math.min(10, Math.abs(netGex) / 2000000 * 3);
            }
            // Flip distance (closer = more volatile potential)
            if (Math.abs(flipDist) < 1) regimeScore += 15;
            else if (Math.abs(flipDist) < 3) regimeScore += 10;
            else if (Math.abs(flipDist) < 5) regimeScore += 5;
            else if (Math.abs(flipDist) < 10) regimeScore += 2;
            // IV contribution (lowered thresholds so even moderate IV scores)
            const iv = structure.atmIV || 0;
            if (iv > 0.6) regimeScore += 25;
            else if (iv > 0.4) regimeScore += 15;
            else if (iv > 0.25) regimeScore += 8;
            else if (iv > 0.15) regimeScore += 4;
            regimeScore = Math.min(100, Math.round(regimeScore));
            const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
            return { regime, regimeScore, gex: Math.round(netGex), gexLabel: isShortGamma ? 'SHORT' : 'LONG', iv: iv ? Math.round(iv * 100) : 0, flipDistance: Math.round(flipDist * 10) / 10, flipLevel, isAboveFlip: flipDist > 0, squeezeScore: 0, squeezeRisk: 'LOW', gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL' };
        })();

        // [FIX v4] Comprehensive IV + regimeScore correction
        const cachedIv = volatilityData?.iv || unifiedData?.volatility?.iv || 0;
        if (structureDerived) {
            if (structureDerived.iv === 0 && cachedIv > 0) {
                // Structure has real-time GEX but POST-market IV=0 → patch with cached IV + recalculate score
                return ensureScoreIncludesIv({ ...structureDerived, iv: cachedIv });
            }
            return ensureScoreIncludesIv(structureDerived);
        }
        if (volatilityData) return ensureScoreIncludesIv(volatilityData);
        if (unifiedData?.volatility) return ensureScoreIncludesIv(unifiedData.volatility);
        return null;
    }, [volatilityData, unifiedData?.volatility, structure, livePrice?.price, initialStockData?.price]);
    const effectiveSma = React.useMemo(() => smaData || unifiedData?.sma || null, [smaData, unifiedData?.sma]);
    const effectiveFund = React.useMemo(() => fundamentalData || unifiedData?.fundamentals || null, [fundamentalData, unifiedData?.fundamentals]);
    const effectiveRelated = React.useMemo(() => relatedData || (unifiedData?.related ? { count: unifiedData.related.count || 0, topRelated: unifiedData.related.topRelated || [] } : null), [relatedData, unifiedData?.related]);
    const effectiveAnalyst = React.useMemo(() => analystData || unifiedData?.analyst || null, [analystData, unifiedData?.analyst]);
    const effectiveSqueeze = React.useMemo(() => squeezeData || unifiedData?.squeeze || null, [squeezeData, unifiedData?.squeeze]);
    const effectiveInst = React.useMemo(() => institutionalData || unifiedData?.institutional || null, [institutionalData, unifiedData?.institutional]);
    const effectiveEarnings = React.useMemo(() => {
        if (earningsData) return earningsData;
        if (!unifiedData?.earnings) return null;
        const e = unifiedData.earnings;
        return { nextDate: e.nextEarningsDate || e.nextDate || null, daysLabel: e.daysLabel || 'TBD', epsEstimate: e.epsEstimate || null, quarter: e.quarter || null, year: e.year || null, hourLabel: e.hourLabel || '', color: e.color || 'text-slate-400' };
    }, [earningsData, unifiedData?.earnings]);
    const effectiveOverview = React.useMemo(() => {
        if (companyOverview) return companyOverview;
        if (!unifiedData?.overview?.overview) return null;
        const o = unifiedData.overview.overview;
        return { sector: o.sector, sectorEN: o.sectorEN, description: o.description, descriptionEN: o.descriptionEN };
    }, [companyOverview, unifiedData?.overview]);
    // [PERF V74] Chart data via SWR above (L712) — no manual fetchChartData needed
    // SWR handles: 30s refresh, focus-revalidation, dedup, stale-while-revalidate

    // [FIX] Clear company overview & sector only on actual ticker CHANGE (not initial mount)
    // These come from SSR initialUnifiedData — clearing on mount would wipe SSR instant load
    const prevTickerRef = useRef(ticker);
    useEffect(() => {
        if (prevTickerRef.current !== ticker) {
            prevTickerRef.current = ticker;
            setCompanyOverview(null);
            setRelatedData(null);
        }

    // [COLD-START FIX] Client-side overview fetch when SSR overview is null
    // /api/live/ticker does NOT include overview, so SWR never provides it.
    // On cold start, SSR times out → overview stays null forever unless we fetch here.
    const overviewTimer = setTimeout(async () => {
        if (companyOverview || !ticker) return;
        try {
            const res = await fetch(`/api/ticker/overview?ticker=${ticker}`);
            if (res.ok) {
                const data = await res.json();
                if (data?.overview) {
                    setCompanyOverview({
                        sector: data.overview.sector || null,
                        sectorEN: data.overview.sectorEN || null,
                        description: data.overview.description || null,
                        descriptionEN: data.overview.descriptionEN || null,
                    });
                }
            }
        } catch { /* silent fail */ }
    }, 2000); // 2s delay — wait for SSR hydration first
    return () => clearTimeout(overviewTimer);
    }, [ticker]);




    // [PREMIUM] Recalculate conviction when dependencies change
    // [PERF V74] Narrowed to scalar deps — prevents re-render on deep object changes
    const liveQuotePrice = liveQuote?.prices?.regularCloseToday || liveQuote?.price || 0;
    const liveQuoteNetPremium = liveQuote?.flow?.netPremium || 0;
    const smaCross = smaData?.cross;
    const newsScoreVal = newsScore?.score;
    const structPcr = structure?.pcRatio;
    const structGex = structure?.netGex;
    useEffect(() => {
        calculateConviction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [smaCross, newsScoreVal, liveQuotePrice, liveQuoteNetPremium, structPcr, structGex]);

    if (!initialStockData) return <div>Data Unavailable</div>;

    // [UNIFIED] All price display logic via shared calcPriceDisplay()
    const { displayPrice, displayChangePct, activeExtPrice, activeExtType, activeExtLabel, activeExtPct } = calcPriceDisplay({
        livePrice: wsPrice?.price || livePrice?.price, // [AWS Phase 3] WebSocket price has highest priority
        liveChangePct: wsPrice?.changePct || livePrice?.changePercent,
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

    // === Cross-Card Synergy Glow ===
    const _gexShort = (structure?.netGex || 0) < 0;
    const _gexLong = (structure?.netGex || 0) > 0;
    const _volHot = volatilityData?.regime === 'ERUPTING' || volatilityData?.regime === 'LOADED';
    const _sqzHigh = (volatilityData?.squeezeScore || 0) > 40;
    const _flowBull = (liveQuote?.flow?.netPremium || 0) > 500000;
    const bearSynergy = _gexShort && (_volHot || _sqzHigh);
    const bullSynergy = _gexLong && !_volHot && _flowBull;
    const synergyGlow = bearSynergy ? 'ring-1 ring-rose-500/40 shadow-[0_0_16px_rgba(244,63,94,0.15)]' : bullSynergy ? 'ring-1 ring-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.1)]' : '';

    // === GLOBAL LOADING GATE (V73 — Zero Blank Screen) ===
    // Prevent rendering with zero/stale data (causes $0.00, Infinity%, distorted chart)
    // But NEVER block for more than 3 seconds — forceReady auto-releases
    const hasSsrPrice = initialStockData && (
        initialStockData.price > 0 ||
        (initialStockData.prevClose && initialStockData.prevClose > 0) ||
        (initialUnifiedData?._dynamoPrice?.price > 0)  // [V73] DynamoDB price fallback
    );
    const isInitialLoading = !forceReady && !initialStockData;

    // [PERF] Signal SSR preview removal — must be BEFORE conditional return (React Hook rules)
    useEffect(() => {
        if (!isInitialLoading) onReady?.();
    }, [isInitialLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
                                <span className="text-[12px] font-mono text-indigo-300 font-jakarta">CONNECTING</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Indicator Cards Skeleton — labeled placeholders */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 animate-pulse">
                    {['NET GEX', 'GAMMA FLIP', 'SQUEEZE', 'VWAP', 'SHORT VOL %'].map((label, i) => (
                        <div key={i} className="h-24 bg-slate-800/30 rounded-xl border border-slate-700/20 p-3 flex flex-col justify-between">
                            <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider font-jakarta">{label}</span>
                            <div className="h-5 w-16 bg-slate-700/30 rounded" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 animate-pulse">
                    {['MAX PAIN', 'ATM IV', 'P/C RATIO', 'GEX REGIME', 'IMPLIED MOVE'].map((label, i) => (
                        <div key={i} className="h-24 bg-slate-800/30 rounded-xl border border-slate-700/20 p-3 flex flex-col justify-between">
                            <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider font-jakarta">{label}</span>
                            <div className="h-5 w-16 bg-slate-700/30 rounded" />
                        </div>
                    ))}
                </div>

                {/* Chart + Sidebar Skeleton — Premium */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    {/* Chart area with premium skeleton */}
                    <div className="lg:col-span-8 h-[320px] lg:h-[520px] rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden relative">
                        {/* Decorative Label */}
                        <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[12px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2 font-jakarta">
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
                                <span className="text-[12px] font-mono text-slate-400 tracking-wider font-jakarta">LOADING CHART</span>
                            </div>
                        </div>
                    </div>
                    {/* Sidebar skeleton */}
                    <div className="lg:col-span-4 space-y-4 animate-pulse">
                        <div className="h-[250px] bg-slate-800/20 rounded-lg border border-slate-700/15 p-4">
                            <div className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 font-jakarta">SIGNAL FEED</div>
                            <div className="space-y-2">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="h-4 bg-slate-700/20 rounded w-full" style={{ width: `${85 - i * 10}%` }} />
                                ))}
                            </div>
                        </div>
                        <div className="h-[250px] bg-slate-800/20 rounded-lg border border-slate-700/15 p-4">
                            <div className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 font-jakarta">5-DAY HISTORY</div>
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
                <div className="flex items-stretch gap-3">
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
                                        <span className={`text-[12px] font-black uppercase tracking-widest font-jakarta ${activeExtType.includes('PRE') ? 'text-amber-400' : 'text-indigo-400'}`}>
                                            {activeExtLabel}
                                        </span>
                                        <span className="text-xs font-bold text-slate-200 tabular-nums">
                                            ${activeExtPrice.toFixed(2)}
                                        </span>
                                        <span className={`text-[12px] tabular-nums font-bold ${(activeExtPct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
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

                    {/* Right Group: Guide + Company Description */}
                    <div className="hidden sm:flex items-center gap-2 ml-auto self-end mb-0.5">
                        <Link href="/how-it-works" className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-500/30 text-[11px] font-bold text-cyan-400 hover:text-white hover:border-cyan-400/50 hover:shadow-[0_0_16px_rgba(6,182,212,0.3)] transition-all duration-300 font-jakarta shrink-0 shadow-[0_0_8px_rgba(6,182,212,0.15)] bg-cyan-950/20">
                            <BookOpen className="w-3 h-3" />
                            GUIDE
                        </Link>
                    </div>

                    {/* Right Column: Company Description — Bloomberg DES Style */}
                    {/* 3-line clamp by default, click to reveal floating popover with full text */}
                    {companyOverview?.description && (() => {
                        const descText = companyOverview.description;
                        const isLong = descText.length > 180;
                        const descFontFamily = locale === 'ko' ? 'Pretendard, sans-serif' : locale === 'ja' ? "'Noto Sans JP', sans-serif" : "'Plus Jakarta Sans', sans-serif";

                        return (
                            <div className="hidden lg:flex items-center max-w-[45%] relative" style={{ zIndex: descPopoverOpen ? 50 : 'auto' }}>
                                {/* Clamped Preview Card */}
                                <div
                                    className={`relative overflow-hidden rounded-xl px-5 py-2.5 border w-full transition-all duration-200 ${isLong ? 'cursor-pointer group border-white/[0.06] hover:border-white/[0.12]' : 'border-white/[0.06]'}`}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(59,130,246,0.05) 50%, rgba(15,23,42,0.3) 100%)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 0 20px rgba(99,102,241,0.06)'
                                    }}
                                    onClick={() => isLong && setDescPopoverOpen(!descPopoverOpen)}
                                >
                                    {/* Infographic SVG background */}
                                    <svg className="absolute inset-0 w-full h-full opacity-[0.12]" preserveAspectRatio="none" viewBox="0 0 400 80">
                                        <pattern id="headerDots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                                            <circle cx="2" cy="2" r="0.5" fill="rgb(148,163,184)" />
                                        </pattern>
                                        <rect width="400" height="80" fill="url(#headerDots)" />
                                        <polyline points="0,60 40,55 80,42 120,48 160,32 200,36 240,22 280,26 320,16 360,19 400,12"
                                            fill="none" stroke="rgb(129,140,248)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                                        <polygon points="0,60 40,55 80,42 120,48 160,32 200,36 240,22 280,26 320,16 360,19 400,12 400,80 0,80"
                                            fill="url(#headerAreaGrad)" />
                                        <linearGradient id="headerAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="rgb(129,140,248)" stopOpacity="0.15" />
                                            <stop offset="100%" stopColor="rgb(129,140,248)" stopOpacity="0" />
                                        </linearGradient>
                                    </svg>
                                    <p className="relative text-[13px] text-slate-300 leading-relaxed z-10"
                                        style={{
                                            fontFamily: descFontFamily,
                                            display: '-webkit-box',
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical' as any,
                                            overflow: 'hidden',
                                        }}>
                                        {descText}
                                    </p>
                                    {/* "more →" — inside card, bottom-right, wide gradient fade */}
                                    {isLong && !descPopoverOpen && (
                                        <div className="absolute bottom-0 right-0 z-20 flex items-end justify-end pl-10 pr-3 py-1.5 rounded-br-xl"
                                            style={{ background: 'linear-gradient(to right, transparent 0%, rgba(15,20,35,0.7) 30%, rgba(15,20,35,0.92) 70%, rgba(15,20,35,0.97) 100%)' }}>
                                            <span className="text-[13px] font-semibold text-emerald-400 group-hover:text-emerald-300 group-hover:underline underline-offset-2 transition-all duration-150 font-jakarta">
                                                more →
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Bloomberg-style Floating Popover — full description */}
                                {descPopoverOpen && (
                                    <>
                                        {/* Backdrop click-away */}
                                        <div className="fixed inset-0 z-40" onClick={() => setDescPopoverOpen(false)} />
                                        {/* Floating Card */}
                                        <div
                                            className="absolute top-full mt-2 right-0 z-50 w-[480px] max-h-[360px] overflow-y-auto rounded-xl border border-white/10 shadow-2xl"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,41,59,0.95) 50%, rgba(15,23,42,0.98) 100%)',
                                                backdropFilter: 'blur(24px)',
                                                boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
                                            }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {/* Header bar */}
                                            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]"
                                                style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)' }}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    <span className="text-[12px] font-bold tracking-wider text-slate-300 uppercase font-jakarta">COMPANY OVERVIEW</span>
                                                </div>
                                                <button
                                                    onClick={() => setDescPopoverOpen(false)}
                                                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-all duration-150"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                                </button>
                                            </div>
                                            {/* Full description */}
                                            <div className="px-5 py-4">
                                                <p className="text-[13px] text-slate-300 leading-[1.8]"
                                                    style={{ fontFamily: descFontFamily }}>
                                                    {descText}
                                                </p>
                                            </div>
                                            {/* Bottom bar */}
                                            <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
                                                <span className="text-[12px] text-slate-300 font-mono">{ticker} • {companyOverview.sector || 'N/A'}</span>
                                                <span className="text-[12px] text-slate-400 font-mono">ESC to close</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })()}
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
                                <span className={`text-[12px] font-black uppercase tracking-widest font-jakarta ${activeExtType === 'PRE' ? 'text-amber-400' : 'text-indigo-400'}`}>
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
                    <ProGate title="Vol Regime" mode="peek" compact fomoTagline={tg('taglineVolRegime')} description={tg('descVolRegime')}>
                        {(() => {
                            const r = effectiveVol;
                            const isHot = r?.regime === 'ERUPTING' || r?.regime === 'LOADED';
                            const regimeColor = r?.regime === 'ERUPTING' ? 'text-rose-400' : r?.regime === 'LOADED' ? 'text-amber-400' : r?.regime === 'COILING' ? 'text-cyan-400' : 'text-emerald-400';
                            const regimeBg = r?.regime === 'ERUPTING' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : r?.regime === 'LOADED' ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.12)]' : 'bg-slate-800/40 border-slate-700/50';
                            const regimeDesc = r?.regime === 'ERUPTING' ? td('volErupting') : r?.regime === 'LOADED' ? td('volLoaded') : r?.regime === 'COILING' ? td('volCoiling') : td('volStable');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${regimeBg} ${synergyGlow}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 85% 50%, rgba(255,255,255,0.8) 0%, transparent 8%, transparent 12%, rgba(255,255,255,0.4) 13%, transparent 14%, transparent 22%, rgba(255,255,255,0.2) 23%, transparent 24%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Zap className={`w-3.5 h-3.5 ${isHot ? 'text-amber-400' : 'text-cyan-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.VOL_REGIME.tooltip}>VOL REGIME</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${isHot ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${regimeColor}`}>
                                            {r?.regime || '...'}
                                        </span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-[20px] font-black tabular-nums leading-none ${regimeColor}`}>{r?.regimeScore ?? '--'}</span>
                                        <span className="text-[14px] font-jakarta text-white font-bold">/100</span>
                                        <span className="text-[12px] font-jakarta text-white ml-0.5">{regimeDesc}</span>
                                    </div>
                                    <div className="relative z-10 flex gap-3 mt-1 text-[12px] font-jakarta tabular-nums">
                                        <span className="text-white/80 font-jakarta">GEX <span className={`font-bold ${r?.gexLabel === 'SHORT' ? 'text-rose-400' : 'text-emerald-400'}`}>{r?.gexLabel ?? '--'}</span></span>
                                        <span className="text-white/80 font-jakarta">IV <span className="font-bold text-white">{r?.iv != null ? `${r.iv}%` : '--%'}</span></span>
                                        <span className="text-white/80 font-jakarta">Flip <span className="font-bold text-white">{r?.flipDistance ? `${r.flipDistance > 0 ? '+' : ''}${r.flipDistance}%` : '--'}</span></span>
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[12px] text-slate-300 font-jakarta">GEX·IV·Gamma Flip·Squeeze</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [1-2] CONVICTION MATRIX™ — PRO peek */}
                    <ProGate title="Conviction Matrix" mode="peek" compact fomoTagline={tg('taglineConviction')} description={tg('descConviction')}>
                        {(() => {
                            const isBull = conviction && conviction.score >= 60;
                            const isBear = conviction && conviction.score <= 40;
                            const convDesc = conviction ? (conviction.score >= 70 ? td('convDescStrongBuy') : conviction.score >= 55 ? td('convDescBuy') : conviction.score <= 30 ? td('convDescSell') : conviction.score <= 45 ? td('convDescBearish') : td('convDescSearching')) : td('convDescCalc');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${isBull ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isBear ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "conic-gradient(from 220deg at 80% 60%, rgba(255,255,255,0.4) 0deg, transparent 60deg, transparent 360deg)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Target className="w-3.5 h-3.5 text-amber-400" />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.CONVICTION.tooltip}>CONVICTION</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${isBull ? 'bg-emerald-500/20 text-emerald-400' : isBear ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-white'}`}>{conviction?.grade || '...'}</span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-[20px] font-black tabular-nums leading-none ${isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-white'}`}>{conviction?.score ?? '--'}</span>
                                        <span className="text-[14px] font-jakarta text-white font-bold">/100</span>
                                        <span className="text-[12px] font-jakarta text-white ml-0.5">{convDesc}</span>
                                    </div>
                                    <div className="relative z-10 text-[12px] font-jakarta text-slate-300 mt-0.5">{conviction?.label || ''}</div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[12px] text-slate-300 font-jakarta">{td('convComposite')}</span>
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
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${vwapDiff > 2 ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : vwapDiff < -2 ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(255,255,255,0.3) 8px, rgba(255,255,255,0.3) 9px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                                        <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.VWAP.tooltip}>VWAP</CardTooltip></span>
                                    </div>
                                    <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${vwapDiff > 0 ? 'bg-emerald-500/20 text-emerald-400' : vwapDiff < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-white'}`}>
                                        {vwapDiff > 0 ? '+' : ''}{vwapDiff.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className={`text-[20px] font-black font-mono tabular-nums leading-none ${vwapDiff > 0 ? 'text-emerald-400' : vwapDiff < 0 ? 'text-rose-400' : 'text-white'}`}>${vwap.toFixed(2)}</span>
                                </div>
                                <div className="relative z-10 text-[12px] font-jakarta text-white mt-0.5">{vwapDesc}</div>
                                <div className="relative z-10 text-[12px] font-jakarta text-slate-300 mt-px">{td('vwapDeviation')} {vwapDiff > 0 ? '+' : ''}{vwapDiff.toFixed(2)}{td('vwapDeviationSuffix')}</div>
                                
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[12px] text-slate-300 font-jakarta">{td('vwapFullDesc')}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [1-4] IV SKEW / SHORT SQUEEZE — conditional */}
                    <ProGate title="IV Skew" mode="peek" compact fomoTagline={tg('taglineIVSkew')} description={tg('descIvSkew')}>
                        {(() => {
                            // Try to compute IV skew from ATM options slice
                            const atmSlice = options?.atmSlice || [];
                            const callIVs = atmSlice.filter((c: any) => c.type === 'call' && c.iv > 0).map((c: any) => c.iv);
                            const putIVs = atmSlice.filter((c: any) => c.type === 'put' && c.iv > 0).map((c: any) => c.iv);
                            const avgCallIV = callIVs.length > 0 ? callIVs.reduce((a: number, b: number) => a + b, 0) / callIVs.length : 0;
                            const avgPutIV = putIVs.length > 0 ? putIVs.reduce((a: number, b: number) => a + b, 0) / putIVs.length : 0;
                            const hasIVData = avgCallIV > 0 && avgPutIV > 0;

                            if (hasIVData) {
                                const atmIV = ((avgCallIV + avgPutIV) / 2 * 100);
                                const skewSpread = (avgPutIV - avgCallIV) * 100;
                                const skewDir = skewSpread > 2 ? 'PUT RICH' : skewSpread < -2 ? 'CALL RICH' : 'BALANCED';
                                const skewColor = skewDir === 'PUT RICH' ? 'text-rose-400' : skewDir === 'CALL RICH' ? 'text-emerald-400' : 'text-cyan-400';
                                const skewBg = skewDir === 'PUT RICH' ? 'bg-rose-950/40 border-rose-500/30' : skewDir === 'CALL RICH' ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-slate-800/40 border-slate-700/50';
                                const skewInsight = skewDir === 'PUT RICH' ? td('skewPutRich') : skewDir === 'CALL RICH' ? td('skewCallRich') : td('skewBalanced');

                                return (
                                    <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${skewBg}`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                        <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.2) 4px, rgba(255,255,255,0.2) 5px, transparent 5px, transparent 9px)" }} />
                                        <div className="relative z-10 flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1">
                                                <TrendingUp className={`w-3.5 h-3.5 ${skewColor}`} />
                                                <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.IV_SKEW?.tooltip || 'IV Skew measures the difference between put and call implied volatility. PUT RICH indicates hedging demand, CALL RICH indicates speculative demand.'}>IV SKEW</CardTooltip></span>
                                            </div>
                                            <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${skewDir === 'PUT RICH' ? 'bg-rose-500/20' : skewDir === 'CALL RICH' ? 'bg-emerald-500/20' : 'bg-slate-700/30'} ${skewColor}`}>
                                                {skewDir}
                                            </span>
                                        </div>
                                        <div className="relative z-10 flex items-baseline gap-1.5">
                                            <span className={`text-[20px] font-black tabular-nums leading-none ${skewColor}`}>{atmIV.toFixed(1)}%</span>
                                            <span className="text-[14px] font-jakarta text-white font-bold">ATM IV</span>
                                        </div>
                                        <div className="relative z-10 flex gap-3 mt-0.5 text-[12px] font-jakarta tabular-nums">
                                            <span className="text-white/80">Call <span className="font-bold text-emerald-400">{(avgCallIV * 100).toFixed(0)}%</span></span>
                                            <span className="text-white/80">Put <span className="font-bold text-rose-400">{(avgPutIV * 100).toFixed(0)}%</span></span>
                                            <span className="text-white/80">Δ <span className={`font-bold ${skewColor}`}>{skewSpread > 0 ? '+' : ''}{skewSpread.toFixed(1)}%</span></span>
                                        </div>
                                        <div className="relative z-10 text-[12px] font-jakarta text-white mt-0.5">{skewInsight}</div>
                                        <div className="relative z-10 mt-0.5">
                                            <span className="text-[12px] text-slate-300 font-jakarta">Call IV·Put IV·Skew Spread</span>
                                        </div>
                                    </div>
                                );
                            }

                            // Fallback: SHORT SQUEEZE
                            const s = effectiveSqueeze;
                            const isCritical = s?.status === 'CRITICAL' || s?.status === 'HIGH';
                            const statusColor = s?.status === 'CRITICAL' ? 'text-rose-400' : s?.status === 'HIGH' ? 'text-amber-400' : s?.status === 'MEDIUM' ? 'text-cyan-400' : 'text-emerald-400';
                            const statusBg = s?.status === 'CRITICAL' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : s?.status === 'HIGH' ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.12)]' : 'bg-slate-800/40 border-slate-700/50';
                            const sqDesc = s?.status === 'CRITICAL' ? td('sqCritical') : s?.status === 'HIGH' ? td('sqHigh') : s?.status === 'MEDIUM' ? td('sqMedium') : td('sqLow');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${statusBg} ${synergyGlow}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(255,255,255,0.3) 6px, rgba(255,255,255,0.3) 7px, transparent 7px, transparent 13px)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <ShieldAlert className={`w-3.5 h-3.5 ${isCritical ? 'text-rose-400' : 'text-orange-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.SHORT_SQUEEZE.tooltip}>SHORT SQUEEZE</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${isCritical ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${statusColor}`}>
                                            {s?.status || '...'}
                                        </span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-[20px] font-black tabular-nums leading-none ${statusColor}`}>{s?.siPercent !== undefined ? s.siPercent.toFixed(1) : '--'}%</span>
                                        <span className="text-[14px] text-white font-bold font-jakarta">SI%</span>
                                        <span className="text-[12px] font-jakarta text-white ml-0.5">{sqDesc}</span>
                                    </div>
                                    <div className="relative z-10 flex gap-3 mt-0.5 text-[12px] font-jakarta tabular-nums">
                                        <span className="text-white/80">{td('sqDaysToCover')} <span className="font-bold text-white">{s?.daysToCover?.toFixed(1) ?? '--'}{td('sqDays')}</span></span>
                                        <span className="text-white/80">{td('sqShortRatio')} <span className="font-bold text-white">{s?.shortVolPercent?.toFixed(0) ?? '--'}%</span></span>
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[12px] text-slate-300 font-jakarta">SI%·DTC·Short Vol</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [1-5] ANALYST TARGET — FREE */}
                        {(() => {
                            const isBullish = analystData?.consensus === 'STRONG BUY' || analystData?.consensus === 'BUY';
                            const isBearish = analystData?.consensus === 'SELL' || analystData?.consensus === 'STRONG SELL';
                            const bd = analystData?.breakdown;
                            const total = analystData?.totalAnalysts || 0;

                            const buyCount = bd ? bd.strongBuy + bd.buy : 0;
                            const buyPct = total > 0 ? Math.round((buyCount / total) * 100) : 0;
                            const consensusKr = analystData?.consensus === 'STRONG BUY' ? td('analystStrongBuy') : analystData?.consensus === 'BUY' ? td('analystBuy') : analystData?.consensus === 'HOLD' ? td('analystHold') : analystData?.consensus === 'SELL' ? td('analystSell') : analystData?.consensus === 'STRONG SELL' ? td('analystStrongSell') : '...';
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${isBullish ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isBearish ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.6) 0%, transparent 10%, transparent 18%, rgba(255,255,255,0.3) 19%, transparent 20%, transparent 30%, rgba(255,255,255,0.15) 31%, transparent 32%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Crosshair className={`w-3.5 h-3.5 ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-cyan-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.ANALYST_TARGET.tooltip}>ANALYST TARGET</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] font-jakarta font-black px-1.5 py-px rounded ${isBullish ? 'bg-emerald-500/20 text-emerald-400' : isBearish ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700/30 text-slate-300'}`}>{consensusKr}</span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-[20px] font-black tabular-nums leading-none ${isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-white'}`}>{buyPct}%</span>
                                        <span className="text-[14px] font-jakarta text-white font-bold">{td('analystBuyReco')}</span>
                                        <span className="text-[12px] font-jakarta text-white">{total} {td('analystOfTotal')}</span>
                                    </div>
                                    {bd && total > 0 && (
                                        <div className="relative z-10 mt-1">
                                            <div className="text-[12px] text-slate-300 tabular-nums font-jakarta">
                                                <span className="text-emerald-400 font-bold">{td('analystStrongBuy')} {bd.strongBuy}</span>
                                                <span className="text-white/30 mx-0.5">|</span>
                                                <span className="text-emerald-400">{td('analystBuy')} {bd.buy}</span>
                                                <span className="text-white/30 mx-0.5">|</span>
                                                <span className="text-white/80">{td('analystHold')} {bd.hold}</span>
                                                {(bd.sell > 0 || bd.strongSell > 0) && (
                                                    <>
                                                        <span className="text-white/30 mx-0.5">|</span>
                                                        <span className="text-rose-400">{td('analystSell')} {bd.sell + bd.strongSell}</span>
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
                                            <div className="text-[14px] font-jakarta text-white mt-0.5">→ {total} {td('analystOfTotal')} <span className={`font-bold ${buyPct >= 70 ? 'text-emerald-400' : buyPct <= 30 ? 'text-rose-400' : 'text-white'}`}>{buyPct}%</span> {td('analystBuyReco')}</div>
                                        </div>
                                    )}

                                </div>
                            );
                        })()}


                    {/* ═══ ROW 2: 스윙 / 장기 판단용 ═══ */}

                    {/* [2-1] INSTITUTIONAL RADAR™ — PRO */}
                    <ProGate title="Inst Radar" mode="blur" compact fomoTagline={tg('taglineInstRadar')} description={tg('descInstRadar')}>
                        {(() => {
                            const dp = effectiveInst?.darkPool?.percent || 0;
                            const blockCount = effectiveInst?.blockTrade?.count || 0;
                            // [FIX] Require actual data presence — dp=0 means "no data", not "low activity"
                            const hasInstData = effectiveInst && (dp > 0 || blockCount > 0);
                            const isAccumulation = hasInstData && dp > 40 && blockCount >= 3;
                            const isDistribution = hasInstData && dp > 0 && dp < 20 && blockCount <= 1;
                            const signal = isAccumulation ? 'ACCUMULATION' : isDistribution ? 'DISTRIBUTION' : 'NEUTRAL';
                            const sigColor = isAccumulation ? 'text-emerald-400' : isDistribution ? 'text-rose-400' : 'text-slate-400';
                            const sigBg = isAccumulation ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : isDistribution ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50';
                            const instDesc = isAccumulation ? td('instAccum') : isDistribution ? td('instDist') : td('instNormal');
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${sigBg}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "conic-gradient(from 0deg at 80% 50%, rgba(255,255,255,0.5) 0deg, transparent 30deg, transparent 360deg), radial-gradient(circle at 80% 50%, transparent 20%, rgba(255,255,255,0.1) 21%, transparent 22%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Radar className={`w-3.5 h-3.5 ${isAccumulation ? 'text-emerald-400' : 'text-indigo-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.INST_RADAR.tooltip}>INST RADAR</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta ${isAccumulation ? 'bg-emerald-500/20' : isDistribution ? 'bg-rose-500/20' : 'bg-slate-700/30'} ${sigColor}`}>
                                            {signal}
                                        </span>
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-1.5">
                                        <span className={`text-[20px] font-black tabular-nums leading-none ${dp > 35 ? 'text-indigo-400' : 'text-white/80'}`}>{dp.toFixed(1)}%</span>
                                        <span className="text-[14px] font-jakarta text-white font-bold">{td('instDarkPool')}</span>
                                        <span className="text-[12px] font-jakarta text-white ml-0.5">{instDesc}</span>
                                    </div>
                                    <div className="relative z-10 flex gap-3 mt-0.5 text-[12px] font-jakarta tabular-nums">
                                        <span className="text-white/80">{td('instBlock')} <span className="font-bold text-white">{blockCount}{td('instTrades')}</span></span>
                                        <span className="text-white/80">{td('sqShortRatio')} <span className="font-bold text-white">{effectiveInst?.shortVolume?.percent?.toFixed(0) ?? '--'}%</span></span>
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[12px] text-slate-300 font-jakarta">DP·Block·Short Vol</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </ProGate>

                    {/* [2-2] TREND PHASE™ — FREE */}
                        {(() => {
                            const s = effectiveSma;
                            const phase = s?.cross === 'GOLDEN' ? td('smaGolden') : s?.cross === 'DEAD' ? td('smaDead') : s?.label === 'ABOVE' ? td('smaAbove') : s?.label === 'BELOW' ? td('smaBelow') : '...';
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${s?.cross === 'GOLDEN' ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : s?.cross === 'DEAD' ? 'bg-rose-950/40 border-rose-500/30 animate-card-breathe-bear' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 11px)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.TREND_PHASE.tooltip}>TREND PHASE</CardTooltip></span>
                                        </div>
                                        {s?.crossType === 'NEW' && (
                                            <span className="text-[12px] font-black px-1.5 py-px rounded bg-amber-500/30 text-amber-300 animate-pulse font-jakarta">NEW!</span>
                                        )}
                                    </div>
                                    <div className="relative z-10 flex items-baseline gap-2">
                                        <span className={`text-lg font-black leading-none ${s?.cross === 'GOLDEN' ? 'text-emerald-400' : s?.cross === 'DEAD' ? 'text-rose-400' : 'text-white'}`}>
                                            {s?.cross === 'GOLDEN' ? 'GOLDEN' : s?.cross === 'DEAD' ? 'DEAD' : s?.label || '--'}
                                        </span>
                                        <span className="text-[12px] font-jakarta text-white">{phase}</span>
                                    </div>
                                    {s && s.distance !== null && (
                                        <div className={`relative z-10 text-[12px] font-jakarta font-bold mt-0.5 ${s.distance > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {td('smaDeviation')} {s.distance > 0 ? '+' : ''}{s.distance}%
                                            {s.isImminent && <span className="ml-1 text-amber-400">⚡ {td('smaCrossImminent')}</span>}
                                        </div>
                                    )}
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[12px] text-slate-300 font-jakarta">SMA 50/200 Cross</span>
                                    </div>
                                </div>
                            );
                        })()}


                    {/* [2-3] FUNDAMENTAL VALUE™ — FREE */}
                        {(() => {
                            const f = effectiveFund;
                            const isNoData = f?.grade === 'NO_DATA';
                            const hasData = f && f.score !== null && f.score > 0;
                            const gradeColor = isNoData ? 'text-slate-400' : f?.grade?.startsWith('A') ? 'text-emerald-400' : f?.grade?.startsWith('B') ? 'text-cyan-400' : f?.grade?.startsWith('C') ? 'text-amber-400' : 'text-slate-400';
                            const gradeBg = isNoData ? 'bg-slate-800/40 border-slate-700/50' : f?.grade?.startsWith('A') ? 'bg-emerald-950/40 border-emerald-500/30 animate-card-breathe-bull' : f?.grade?.startsWith('B') ? 'bg-cyan-950/40 border-cyan-500/30' : 'bg-slate-800/40 border-slate-700/50';
                            const bd = f?.breakdown;
                            const fundDesc = isNoData ? td('fundNoData') : !hasData ? td('fundCollecting') : f?.grade?.startsWith('A') ? td('fundExcellent') : f?.grade?.startsWith('B') ? td('fundGood') : f?.grade?.startsWith('C') ? td('fundAvg') : td('fundCaution');
                            // Display raw values even when score is 0
                            const pe = f?.pe; const de = f?.de; const roe = f?.roe; const rev = f?.revenueGrowth; const margin = f?.netMargin;
                            return (
                                <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${gradeBg}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 12px, rgba(255,255,255,0.15) 12px, rgba(255,255,255,0.15) 14px, transparent 14px, transparent 16px), linear-gradient(0deg, rgba(255,255,255,0.2) 0%, transparent 40%)" }} />
                                    <div className="relative z-10 flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1">
                                            <Shield className={`w-3.5 h-3.5 ${hasData ? 'text-emerald-400' : 'text-amber-400'}`} />
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.FUNDAMENTAL.tooltip}>FUNDAMENTAL</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] font-black px-1.5 py-px rounded font-jakarta bg-slate-700/30 ${hasData ? gradeColor : 'text-slate-400'}`}>
                                            {isNoData ? 'N/A' : hasData ? f?.grade : td('fundGradeCollecting')}
                                        </span>
                                    </div>
                                    {hasData ? (
                                        <div className="relative z-10 flex items-baseline gap-1.5">
                                            <span className={`text-[20px] font-black tabular-nums leading-none ${gradeColor}`}>{f?.score}</span>
                                            <span className="text-[14px] font-jakarta text-white font-bold">/100</span>
                                            <span className="text-[12px] font-jakarta text-white ml-0.5">{fundDesc}</span>
                                        </div>
                                    ) : (
                                        <div className="relative z-10">
                                            <span className="text-sm font-bold text-white/40 leading-none">{fundDesc}</span>
                                        </div>
                                    )}
                                    <div className="relative z-10 flex flex-wrap gap-x-2 mt-1 text-[12px] font-jakarta tabular-nums">
                                        {pe !== null && pe !== undefined && <span className="text-white/80 font-jakarta">PE <span className="font-bold text-white">{pe}</span></span>}
                                        {roe !== null && roe !== undefined && <span className="text-white/80 font-jakarta">ROE <span className="font-bold text-white">{roe}%</span></span>}
                                        {rev !== null && rev !== undefined && <span className="text-white/80">{td('fundRevenue')} <span className="font-bold text-white">{rev > 0 ? '+' : ''}{rev}%</span></span>}
                                        {margin !== null && margin !== undefined && <span className="text-white/80">{td('fundMargin')} <span className="font-bold text-white">{margin}%</span></span>}
                                        {de !== null && de !== undefined && <span className="text-white/80 font-jakarta">D/E <span className="font-bold text-white">{de}</span></span>}
                                        {!pe && !roe && !rev && !margin && !de && <span className="text-white/40">{td('fundApiWaiting')}</span>}
                                    </div>
                                    <div className="relative z-10 mt-0.5">
                                        <span className="text-[12px] text-slate-300 font-jakarta">PE·FCF·Rev·Margin·DE</span>
                                    </div>
                                </div>
                            );
                        })()}


                    {/* [2-4] EARNINGS — FREE */}
                    {(() => {
                        const rawDays = earningsData?.daysLabel || '';
                        const daysNum = parseInt(rawDays.replace(/\D/g, ''));
                        const isValidDays = !isNaN(daysNum);
                        const isImminent = isValidDays && daysNum >= 0 && daysNum <= 7;
                        const earnDesc = isValidDays ? (daysNum === 0 ? td('earnToday') : daysNum <= 3 ? td('earnImminent') : daysNum <= 14 ? `${daysNum}${td('earnDaysLater')}` : `${daysNum}${td('earnDaysAfter')}`) : '';
                        return (
                            <div className={`relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl border cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)] ${isImminent ? 'bg-amber-950/40 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(255,255,255,0.2) 14px, rgba(255,255,255,0.2) 15px), repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(255,255,255,0.2) 14px, rgba(255,255,255,0.2) 15px)" }} />
                                <div className="relative z-10 flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.EARNINGS.tooltip}>EARNINGS</CardTooltip></span>
                                    </div>
                                    <span className={`text-[12px] font-bold px-1.5 py-px rounded font-jakarta ${isImminent ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/30 text-slate-300'}`}>
                                        {isValidDays ? `D-${daysNum}` : rawDays || 'TBD'}
                                    </span>
                                </div>
                                <div className="relative z-10 flex items-baseline gap-1.5">
                                    <span className="text-lg font-black text-white leading-none">{earningsData?.nextDate ? new Date(earningsData.nextDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}</span>
                                    {earningsData?.hourLabel && <span className="text-[12px] font-jakarta text-amber-400 font-bold">{earningsData.hourLabel === 'bmo' ? td('earnBeforeMarket') : earningsData.hourLabel === 'amc' ? td('earnAfterMarket') : earningsData.hourLabel === 'dmh' ? td('earnDuringMarket') : earningsData.hourLabel}</span>}
                                    {earnDesc && <span className="text-[12px] font-jakarta text-white ml-0.5">{earnDesc}</span>}
                                </div>
                                {earningsData?.epsEstimate !== null && earningsData?.epsEstimate !== undefined && (
                                    <div className="relative z-10 text-[12px] font-jakarta text-white mt-0.5">
                                        {td('estEps')} <span className="font-bold text-white/90">${earningsData.epsEstimate.toFixed(2)}</span>
                                        {earningsData?.quarter && earningsData?.year && <span className="text-white/40 ml-1">Q{earningsData.quarter} FY{earningsData.year}</span>}
                                    </div>
                                )}
                                <div className="relative z-10 mt-0.5">
                                    <span className="text-[12px] font-jakarta text-white">{td('earningsCalendar')}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* [2-5] RELATED */}
                    <div className="relative overflow-hidden rounded-lg py-2 px-2.5 min-h-[120px] transition-all duration-500 backdrop-blur-xl bg-slate-800/40 border border-slate-700/50 cursor-default hover:-translate-y-0.5 hover:brightness-110 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(99,102,241,0.1)]">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                        <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "12px 12px" }} />
                        <div className="relative z-10 flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5 text-violet-400" />
                                <span className="text-[13px] font-bold text-white uppercase tracking-wider font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.RELATED.tooltip}>RELATED</CardTooltip></span>
                            </div>
                            <span className="text-[12px] font-jakarta text-white">{td('relatedSector')}</span>
                        </div>
                        <div className="relative z-10 flex flex-col gap-1">
                            {relatedData?.topRelated && relatedData.topRelated.length > 0 ? (
                                relatedData.topRelated.slice(0, 4).map((item, idx) => (
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
                                        {(() => {
                                            // [WS] Real-time changePct from WebSocket, fallback to SSR/SWR
                                            const wsPrice = relWsConnected ? relWsGetPrice(item.ticker) : undefined;
                                            // [FIX] Don't override valid SSR changePct with WS changePct=0 during data transitions
                                            const wsChangePct = wsPrice?.changePct;
                                            const displayChange = (wsChangePct !== undefined && wsChangePct !== 0) 
                                                ? Number(wsChangePct.toFixed(2)) 
                                                : (item.change ?? 0);
                                            return (
                                                <span className={`text-[12px] font-jakarta font-bold tabular-nums ${displayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {displayChange >= 0 ? '+' : ''}{displayChange}%
                                                </span>
                                            );
                                        })()}
                                    </div>
                                ))
                            ) : unifiedDataReceived ? (
                                <div className="text-[12px] font-jakarta text-slate-500 text-center py-1">Peers</div>
                            ) : (
                                <div className="text-[12px] font-jakarta text-slate-300 text-center py-1">{td('loading')}</div>
                            )}
                        </div>

                    </div>

                </div>
            </div>

            {/* COMMAND GRID (2 Columns: Main vs Sidebar) */}
            {
                (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[800px]">

                        {/* MAIN COLUMN (8 Cols) - Flex Structure */}
                        <div className="lg:col-span-8 flex flex-col items-stretch gap-3 h-full">
                            {/* A. Main Chart Section */}
                            {/* A. Main Chart Section (Height: 580px) */}
                            <div className="h-[580px] min-h-0 relative flex flex-col group shrink-0">
                                {/* Decorative Label (Absolute) */}
                                <div className="absolute -top-3 left-4 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/30 rounded text-[12px] font-black text-indigo-300 uppercase tracking-widest z-20 backdrop-blur-md shadow-lg flex items-center gap-2 font-jakarta">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> <CardTooltip tooltip={COMMAND_TOOLTIPS.PRICE_HISTORY.tooltip}>Price History</CardTooltip>
                                </div>

                                {/* Market Pulse Bar — 1-line realtime summary */}
                                {effectiveSession === 'REG' && (
                                    <div className="absolute -top-3 right-4 z-20 flex items-center gap-2">
                                        {/* Gamma */}
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded backdrop-blur-md border ${(structure?.netGex || 0) > 0 ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400' : (structure?.netGex || 0) < 0 ? 'bg-rose-950/80 border-rose-500/30 text-rose-400' : 'bg-slate-800/80 border-slate-600/30 text-slate-400'}`}>
                                            γ {(structure?.netGex || 0) > 0 ? 'LONG' : (structure?.netGex || 0) < 0 ? 'SHORT' : '—'}
                                        </span>
                                        {/* Squeeze */}
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded backdrop-blur-md border ${(volatilityData?.squeezeScore || 0) > 50 ? 'bg-rose-950/80 border-rose-500/30 text-rose-400' : (volatilityData?.squeezeScore || 0) > 25 ? 'bg-amber-950/80 border-amber-500/30 text-amber-400' : 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400'}`}>
                                            SQZ {(volatilityData?.squeezeScore || 0) > 50 ? 'HIGH' : (volatilityData?.squeezeScore || 0) > 25 ? 'MED' : 'LOW'}
                                        </span>
                                        {/* Flow */}
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded backdrop-blur-md border ${(liveQuote?.flow?.netPremium || 0) > 500000 ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400' : (liveQuote?.flow?.netPremium || 0) < -500000 ? 'bg-rose-950/80 border-rose-500/30 text-rose-400' : 'bg-slate-800/80 border-slate-600/30 text-slate-400'}`}>
                                            FLOW {(liveQuote?.flow?.netPremium || 0) > 500000 ? 'BULL' : (liveQuote?.flow?.netPremium || 0) < -500000 ? 'BEAR' : '—'}
                                        </span>
                                    </div>
                                )}

                                {/* Glass Card */}
                                <div className="h-full rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden shadow-lg relative backdrop-blur-md flex flex-col">
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
                                                vwap={liveQuote?.vwap || initialStockData?.vwap}
                                                gammaFlipLevel={structure?.gammaFlipLevel}
                                                nbbo={(() => {
                                                    const q = typeof wsGetQuote === 'function' ? wsGetQuote(ticker) : undefined;
                                                    return q && q.bid > 0 && q.ask > 0 ? { bid: q.bid, ask: q.ask, bidSize: q.bidSize || 0, askSize: q.askSize || 0 } : null;
                                                })()}
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
                                                    <span className="text-[12px] font-mono text-slate-400 tracking-wider font-jakarta">LOADING CHART DATA</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* GEX Timeline ↔ Technical Levels Map — Toggle Section */}
                            <div className="shrink-0">
                                {/* Tab Header */}
                                <div className="flex items-center gap-1.5 mb-2">
                                    <button
                                        onClick={() => setActiveInsightTab('gex')}
                                        className={`px-3 py-1.5 rounded-lg text-[12px] font-black uppercase tracking-wider transition-all duration-200 font-jakarta flex items-center gap-1.5 ${
                                            activeInsightTab === 'gex'
                                                ? 'bg-indigo-500/20 text-white border border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                                                : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:text-slate-300 hover:border-slate-600/50'
                                        }`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeInsightTab === 'gex' ? 'bg-indigo-400' : 'bg-slate-500'} ${effectiveSession === 'REG' && activeInsightTab !== 'gex' ? 'animate-pulse' : ''}`} />
                                        <CardTooltip tooltip={COMMAND_TOOLTIPS.GEX_TIMELINE.tooltip} badge={COMMAND_TOOLTIPS.GEX_TIMELINE.badge}>GEX Timeline 30D</CardTooltip>
                                    </button>
                                    <button
                                        onClick={() => setActiveInsightTab('levels')}
                                        className={`px-3 py-1.5 rounded-lg text-[12px] font-black uppercase tracking-wider transition-all duration-200 font-jakarta flex items-center gap-1.5 ${
                                            activeInsightTab === 'levels'
                                                ? 'bg-indigo-500/20 text-white border border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                                                : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:text-slate-300 hover:border-slate-600/50'
                                        }`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeInsightTab === 'levels' ? 'bg-indigo-400' : 'bg-slate-500'} ${effectiveSession === 'REG' && activeInsightTab !== 'levels' ? 'animate-pulse' : ''}`} />
                                        <CardTooltip tooltip={COMMAND_TOOLTIPS.TECH_LEVELS.tooltip} badge={COMMAND_TOOLTIPS.TECH_LEVELS.badge}>Tech Levels</CardTooltip>
                                    </button>
                                    <button
                                        onClick={() => setActiveInsightTab('ivskew')}
                                        className={`px-3 py-1.5 rounded-lg text-[12px] font-black uppercase tracking-wider transition-all duration-200 font-jakarta flex items-center gap-1.5 ${
                                            activeInsightTab === 'ivskew'
                                                ? 'bg-indigo-500/20 text-white border border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                                                : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:text-slate-300 hover:border-slate-600/50'
                                        }`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeInsightTab === 'ivskew' ? 'bg-indigo-400' : 'bg-slate-500'} ${effectiveSession === 'REG' && activeInsightTab !== 'ivskew' ? 'animate-pulse' : ''}`} />
                                        <CardTooltip tooltip={COMMAND_TOOLTIPS.IV_SKEW.tooltip} badge={COMMAND_TOOLTIPS.IV_SKEW.badge}>IV Skew</CardTooltip>
                                    </button>
                                </div>

                                {/* Tab Content */}
                                {activeInsightTab === 'gex' ? (
                                    <ProGate title="GEX Timeline 30D" mode="blur" fomoMessage="30-Day Gamma Exposure · Regime Shifts · Gamma Flip Events" fomoTagline={tg('taglineGEXTimeline')} description={tg('descGexTimeline')}>
                                        <GexTimeline ticker={ticker} days={30} onEmpty={() => setActiveInsightTab('levels')} />
                                    </ProGate>
                                ) : activeInsightTab === 'levels' ? (
                                    <TechnicalLevelsMap
                                        currentPrice={displayPrice}
                                        sma50={smaData?.sma50}
                                        sma200={smaData?.sma200}
                                        smaCross={smaData?.cross}
                                        vwap={liveQuote?.vwap || initialStockData?.vwap}
                                        maxPain={structure?.maxPain || initialStockData?.flow?.maxPain}
                                        callWall={structure?.levels?.callWall}
                                        putFloor={structure?.levels?.putFloor}
                                        gammaFlipLevel={structure?.gammaFlipLevel}
                                    />
                                ) : (
                                    <ProGate title="IV Skew Curve" mode="blur" fomoMessage="Call IV · Put IV · Skew Direction · ATM IV Smile · Strike-level Analysis" description={tg('descIvSkew')}>
                                        <IVSkewCurve
                                            ticker={ticker}
                                            atmSlice={options?.atmSlice || []}
                                            underlyingPrice={displayPrice}
                                            expiration={options?.atmSlice?.[0]?.expiration || structure?.expiration}
                                        />
                                    </ProGate>
                                )}
                            </div>

                            {/* B. Advanced Options Analysis — PRO (Separate Gates) */}
                                <div className="min-h-[400px] grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">

                                    {/* 1. TACTICAL RANGE (Depth Gauge + Max Pain) — PRO */}
                                    <ProGate title="Tactical Range" mode="blur" fomoMessage="Max Pain · Call Wall · Put Floor · Support/Resistance · Range Width" fomoTagline={tg('taglineTacticalRange')} description={tg('descPutFloorCallWall')}>
                                    <div className="min-h-[400px] rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col relative group hover:border-white/20 transition-colors">
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
                                                    <span className="text-[12px] text-cyan-400/80 font-bold uppercase tracking-wider font-jakarta">Loading...</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Header */}
                                        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm animate-pulse" />
                                                    <CardTooltip tooltip={COMMAND_TOOLTIPS.TACTICAL_RANGE.tooltip} badge={COMMAND_TOOLTIPS.TACTICAL_RANGE.badge}>Tactical Range</CardTooltip>
                                                </h4>
                                                {structure?.expiration && (() => {
                                                    const expDate = new Date(structure.expiration + 'T16:00:00-05:00');
                                                    const now = new Date();
                                                    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                                    return diffDays >= 0 ? (
                                                        <span className={`text-[12px] font-black px-1.5 py-0.5 rounded font-jakarta ${diffDays <= 1 ? 'bg-rose-950/50 text-rose-400 border border-rose-500/30' : 'bg-cyan-950/50 text-cyan-400 border border-cyan-500/30'}`}>
                                                            D-{diffDays}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-amber-500 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30 flex items-center gap-2 shadow-lg">
                                                    <span className="text-[12px] font-black tracking-tighter font-jakarta">MAX PAIN</span>
                                                    <span className="text-[12px] text-amber-300/70 font-medium uppercase tracking-tighter">({t('maxPainLabel')})</span>
                                                    <span className="text-sm font-black pl-1 border-l border-amber-500/20">${structure?.maxPain || initialStockData.flow?.maxPain || "---"}</span>
                                                    {(structure?.maxPain || initialStockData.flow?.maxPain) && (
                                                        <span className={`text-[12px] font-bold ml-1 font-jakarta ${((displayPrice - (structure?.maxPain || initialStockData.flow?.maxPain)) / (structure?.maxPain || initialStockData.flow?.maxPain)) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
                                                    <span className="text-[12px] font-bold text-rose-400 w-12 text-right font-jakarta">RESIST</span>
                                                    <span className="text-sm font-black text-rose-200 tracking-wider">${structure?.levels?.callWall || "---"}</span>
                                                </div>

                                                {/* Max Pain Marker (Center Concept) */}
                                                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex items-center justify-end pr-8 gap-2 opacity-90">
                                                    <span className="text-[12px] font-bold text-amber-500 uppercase tracking-wider font-jakarta">Max Pain</span>
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
                                                    <span className="text-[12px] font-bold text-emerald-400 w-12 text-right font-jakarta">SUPPORT</span>
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
                                                        <div className="text-[12px] text-slate-400 font-bold uppercase font-jakarta">{t('maxPainDistance')}</div>
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
                                                        <div className="text-[12px] text-slate-400 font-bold uppercase font-jakarta">{t('rangeWidth')}</div>
                                                        <div className={`text-sm font-black ${color}`}>
                                                            {rangeWidth.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Insight Footer */}
                                        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/30">
                                            <p className="text-[12px] text-slate-300 leading-relaxed">
                                                {displayPrice > (structure?.maxPain || 0)
                                                    ? t('aboveMaxPain')
                                                    : displayPrice < (structure?.maxPain || 0)
                                                        ? t('belowMaxPain')
                                                        : t('nearMaxPain')}
                                            </p>
                                        </div>
                                    </div>
                                    </ProGate>

                                    {/* 2. NET GAMMA ENGINE (Infographic Style) — PRO */}
                                    <ProGate title="Net Gamma Engine" mode="blur" fomoMessage="Net GEX · Gamma Flip Level · P/C Ratio · Squeeze Risk · Gamma Concentration" fomoTagline={tg('taglineNetGamma')} description={tg('descNetGamma')}>
                                    <div className="min-h-[400px] rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col relative group hover:border-white/20 transition-colors">
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
                                                    <span className="text-[12px] text-cyan-400/80 font-bold uppercase tracking-wider font-jakarta">Loading...</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Header */}
                                        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 font-jakarta">
                                                <Activity size={10} className={structure?.netGex > 0 ? "text-emerald-400" : "text-rose-400"} />
                                                <CardTooltip tooltip={COMMAND_TOOLTIPS.NET_GAMMA_ENGINE.tooltip} badge={COMMAND_TOOLTIPS.NET_GAMMA_ENGINE.badge}>NET GAMMA ENGINE</CardTooltip>
                                            </h4>
                                            {structure?.expiration && (
                                                <span className="text-xs text-white font-mono font-jakarta">EXP: {structure.expiration}</span>
                                            )}
                                        </div>

                                        {/* Main Content - Infographic Layout */}
                                        <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
                                            {/* Top Row: Core GEX + Status + P/C OI Circle */}
                                            <div className="flex items-center justify-between gap-3">
                                                {/* Left: Reactor Core (GEX Only) */}
                                                <div className="relative shrink-0">
                                                    <div className={`w-20 h-20 rounded-full border-4 border-dashed ${structure?.netGex > 0 ? "border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.5)]"} flex items-center justify-center animate-[spin_10s_linear_infinite]`} />
                                                    <div className={`absolute inset-2 rounded-full bg-slate-900/95 flex flex-col items-center justify-center border ${structure?.netGex > 0 ? "border-emerald-500/50" : "border-rose-500/50"}`}>
                                                        <div className="text-[12px] text-slate-400 uppercase font-bold font-jakarta">NET GEX</div>
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
                                                    <div className="text-[12px] text-white/90 leading-snug mt-0.5">
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
                                                                    <div className="text-[12px] text-white/90 uppercase font-bold font-jakarta">P/C Ratio</div>
                                                                    <div className={`text-sm font-black ${pcrColor}`}>{pcr.toFixed(2)}</div>
                                                                    <div className="text-[12px] text-white/90 uppercase font-bold font-jakarta mt-1">Total OI</div>
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
                                                                    <span className="text-[12px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold font-jakarta">ACTIVE</span>
                                                                </div>
                                                                <div className="text-[12px] text-white/70">{t('gammaFlipLevel')}</div>
                                                            </div>
                                                        </div>

                                                        <div className="text-right">
                                                            <div className="text-2xl font-black text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)] flex items-center justify-end gap-1.5">
                                                                ${structure.gammaFlipLevel}
                                                                {structure.gammaFlipType === 'MULTI_EXP' && (
                                                                    <span className="text-[12px] bg-purple-500/80 text-white px-1 py-0.5 rounded font-bold font-jakarta">60D</span>
                                                                )}
                                                            </div>
                                                            {displayPrice && (
                                                                <div className={`text-[12px] font-bold font-jakarta ${displayPrice > structure.gammaFlipLevel ? "text-emerald-400" : "text-rose-400"}`}>
                                                                    {displayPrice > structure.gammaFlipLevel
                                                                        ? t('longGammaZone')
                                                                        : t('shortGammaZone')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Position Bar with Labels */}
                                                    <div className="relative z-10">
                                                        <div className="flex justify-between text-[12px] mb-0.5">
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
                                                        <div className="flex justify-between text-[12px] text-white/70 mt-0.5">
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
                                                                <span className="text-[12px] bg-slate-600/80 text-white px-1.5 py-0.5 rounded font-bold animate-pulse font-jakarta">LOADING</span>
                                                            </div>
                                                            <div className="text-[12px] text-slate-300">{t('optionsDataLoading')}</div>
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
                                                                        <span className={`text-[12px] px-1.5 py-0.5 rounded font-bold font-jakarta ${badgeColor}`}>{badgeText}</span>
                                                                    </div>
                                                                    <div className="text-[12px] text-slate-300">{message}</div>
                                                                    {interpretation && (
                                                                        <div className={`text-[12px] font-bold mt-0.5 ${gammaFlipType === 'ALL_LONG' ? 'text-emerald-400' : 'text-rose-400'}`}>
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
                                                        <span className="text-[12px] text-white font-bold uppercase font-jakarta">GAMMA CONC. {td('gammaConc')}</span>
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
                                                                <div className="text-[12px] text-white mt-0.5">{desc}</div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Squeeze Risk */}
                                                <div className="bg-slate-800/50 rounded-lg p-2 border border-white/5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[12px] text-white font-bold uppercase font-jakarta">Squeeze Risk</span>
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
                                            <p className="text-[12px] text-slate-300 leading-relaxed">
                                                {structure?.netGex > 0 ? t('longGammaStable') : t('shortGammaWarning')}
                                            </p>
                                        </div>
                                    </div>
                                    </ProGate>
                                </div>


                            <div className="hidden">
                                {/* Gamma Structure */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-3 bg-slate-500 rounded-full" /> Key Market Levels
                                        </h4>
                                        {(structure?.maxPain || initialStockData.flow?.maxPain || initialStockData.flow?.pinZone) && (
                                            <span className="text-[12px] text-amber-500 font-black font-jakarta">
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
                                                <div className="text-[12px] text-slate-400 uppercase tracking-widest mt-1 flex items-center justify-center gap-1 font-jakarta">
                                                    {td('netGexLabel')}
                                                    <span title={td('gexTooltip')}>
                                                        <Info size={10} className="text-slate-500 hover:text-slate-300 cursor-help" />
                                                    </span>
                                                </div>

                                                {/* 0DTE Pulse Indicator (New) */}
                                                {structure?.gexZeroDteRatio !== undefined && (
                                                    <div className="mt-3 px-4">
                                                        <div className="flex items-center justify-between text-[12px] font-bold text-slate-400 mb-1 tracking-wider uppercase font-jakarta">
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
                                                <div className={`mt-4 text-[12px] font-bold px-2 py-1 rounded inline-block ${structure?.netGex > 0 ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20" : structure?.netGex < 0 ? "bg-rose-950/30 text-rose-400 border border-rose-500/20" : "bg-slate-800 text-slate-400"}`}>
                                                    {structure?.netGex > 0 ? td('gexBullish') : structure?.netGex < 0 ? td('gexBearish') : td('gexNeutral')}
                                                </div>
                                                <div className="mt-4 flex justify-center gap-3 text-[12px] font-medium text-slate-400 border-t border-white/5 pt-2">
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


                            {/* C. (Moved to toggle tabs above) */}
                        </div>

                        {/* SIDEBAR (4 Cols) - Glass Stack */}
                        <div className="lg:col-span-4 flex flex-col gap-3 h-full overflow-hidden">

                            {/* 1. AI Deep Analysis — Claude Sonnet 4 (HERO Position) — PRO */}
                            <ProGate title="AI Deep Analysis" mode="blur" fomoMessage="AI Deep Technical · Options Positioning · News & Market Context" fomoTagline={tg('taglineAIDeep')} description={tg('descAiDeep')}>
                            <AIDeepAnalysis
                                ticker={ticker}
                                displayPrice={displayPrice}
                                session={effectiveSession}
                                snapshot={{
                                    price: displayPrice,
                                    priceChange: displayChangePct,
                                    session: effectiveSession,
                                    signalCore: {
                                        direction: 'NEUTRAL',
                                        conviction: 'MIXED',
                                        condition: 'TREND',
                                        conclusion: '',
                                        bullCount: 0,
                                        bearCount: 0,
                                        bullSignals: '',
                                        bearSignals: '',
                                    },
                                    sma: {
                                        cross: effectiveSma?.cross || 'NONE',
                                        sma50: effectiveSma?.sma50 || 0,
                                        sma200: effectiveSma?.sma200 || 0,
                                        trendPhase: effectiveSma?.phase || 'UNKNOWN',
                                    },
                                    vwap: liveQuote?.vwap || initialStockData?.vwap || 0,
                                    vwapDistance: (() => {
                                        const vwap = liveQuote?.vwap || initialStockData?.vwap || 0;
                                        if (!vwap || !displayPrice) return 'N/A';
                                        return `${((displayPrice - vwap) / vwap * 100).toFixed(1)}%`;
                                    })(),
                                    conviction: {
                                        score: conviction?.score || 50,
                                        grade: conviction?.grade || 'C',
                                    },
                                    structure: {
                                        netGex: structure?.netGex || 0,
                                        gammaFlipLevel: structure?.gammaFlipLevel || 0,
                                        squeezeRisk: structure?.squeezeRisk || 'N/A',
                                        squeezeScore: structure?.squeezeScore || 0,
                                        pcRatio: structure?.pcRatio || 0,
                                        callWall: structure?.levels?.callWall || 0,
                                        putFloor: structure?.levels?.putFloor || 0,
                                        maxPain: structure?.maxPain || 0,
                                        gammaConcentration: structure?.gammaConcentration || 0,
                                        gammaConcentrationLabel: structure?.gammaConcentrationLabel || 'NORMAL',
                                    },
                                    flow: {
                                        netPremium: liveQuote?.flow?.netPremium || 0,
                                    },
                                    fundamental: {
                                        score: effectiveFund?.score || 0,
                                        grade: effectiveFund?.grade || 'N/A',
                                        pe: effectiveFund?.pe || 0,
                                        fcfMargin: effectiveFund?.fcfYield || 0,
                                    },
                                    analyst: {
                                        score: (() => {
                                            if (!effectiveAnalyst?.totalAnalysts) return 0;
                                            const bd = effectiveAnalyst.breakdown;
                                            return Math.round(((bd?.strongBuy + bd?.buy) / effectiveAnalyst.totalAnalysts) * 100);
                                        })(),
                                        buyPct: (() => {
                                            if (!effectiveAnalyst?.totalAnalysts) return 0;
                                            const bd = effectiveAnalyst.breakdown;
                                            return Math.round(((bd?.strongBuy + bd?.buy) / effectiveAnalyst.totalAnalysts) * 100);
                                        })(),
                                    },
                                    institutional: {
                                        dpRatio: effectiveInst?.darkPool?.percent || 0,
                                        activity: effectiveInst?.darkPool ? (effectiveInst.darkPool.percent > 50 ? 'ACCUMULATION' : 'DISTRIBUTION') : 'N/A',
                                    },
                                    volatility: {
                                        regime: effectiveVol?.regime || 'N/A',
                                        regimeScore: effectiveVol?.regimeScore || 0,
                                        gexLong: effectiveVol?.gex || 0,
                                    },
                                    squeeze: {
                                        status: effectiveSqueeze?.status || 'N/A',
                                        siPercent: effectiveSqueeze?.siPercent || 0,
                                    },
                                    earnings: {
                                        daysUntil: (() => {
                                            if (!effectiveEarnings?.daysLabel) return 999;
                                            const parsed = parseInt(effectiveEarnings.daysLabel.replace(/\D/g, ''));
                                            return isNaN(parsed) ? 999 : parsed;
                                        })(),
                                        date: effectiveEarnings?.nextDate || 'N/A',
                                        estimatedEps: effectiveEarnings?.epsEstimate || 0,
                                    },
                                    relatedTickers: effectiveRelated?.topRelated?.map((r: any) => r.ticker) || [],
                                }}
                            />
                            </ProGate>

                            {/* 2. Decision Gate (Signal Core) — ELITE */}
                            <EliteGate title="Signal Core" mode="blur" fomoTagline={tg('taglineSignalCore')} description={tg('descSignalCore')}>
                                <div className="shrink-0 relative rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden group hover:border-white/20 transition-colors shadow-lg">
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
                                        smaData={effectiveSma}
                                        newsScore={newsScore}
                                        liveQuote={liveQuote}
                                        analystData={effectiveAnalyst}
                                        fundamentalData={effectiveFund}
                                        institutionalData={effectiveInst}
                                        volatilityData={effectiveVol}
                                        squeezeData={effectiveSqueeze}
                                        convictionData={conviction}
                                        earningsData={effectiveEarnings}
                                    />
                                </div>
                            </EliteGate>

                            {/* 3. Flow Unit — ELITE */}
                            <EliteGate title="Flow Unit" mode="blur" fomoTagline={tg('taglineFlowUnit')} description={tg('descFlowUnit')}>
                                <div className="shrink-0 rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden relative group hover:border-white/20 transition-colors shadow-lg">
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
                                            <span className="text-[12px] font-black text-sky-200 uppercase tracking-widest font-jakarta"><CardTooltip tooltip={COMMAND_TOOLTIPS.FLOW_UNIT.tooltip} badge={COMMAND_TOOLTIPS.FLOW_UNIT.badge}>Flow Unit</CardTooltip></span>
                                        </div>
                                        <span className={`text-[12px] px-1.5 py-0.5 rounded border font-jakarta ${effectiveSession === 'REG' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/20' :
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

                            {/* 2.5 Gamma Pressure Gauge — Bloomberg-tier visual — PRO */}
                            <ProGate title="Gamma Pressure" mode="blur" fomoMessage="Short Gamma · Call Wall · Put Floor · Gamma Flip Level · Squeeze Risk" fomoTagline={tg('taglineGammaPressure')} description={tg('descGammaPressure')}>
                            <GammaPressureGauge
                                netGex={structure?.netGex || 0}
                                callWall={structure?.levels?.callWall || 0}
                                putFloor={structure?.levels?.putFloor || 0}
                                gammaFlipLevel={structure?.gammaFlipLevel || 0}
                                currentPrice={displayPrice}
                                squeezeRisk={structure?.squeezeRisk || 'LOW'}
                                squeezeScore={structure?.squeezeScore ?? 0}
                            />
                            </ProGate>



                        </div>

                    </div >
                )
            }
        </div >
    );
}
