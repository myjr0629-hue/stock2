'use client';

import { useTranslations } from 'next-intl';
import { Zap, Loader2 } from 'lucide-react';
import { CardTooltip, COMMAND_TOOLTIPS } from '@/components/ui/CardTooltip';

export const DecisionGate = ({ ticker, displayPrice, session, structure, krNews, smaData, newsScore, liveQuote, analystData, fundamentalData, institutionalData, volatilityData, squeezeData, convictionData, earningsData }: any) => {
    const t = useTranslations('command');
    const td = useTranslations('dashboard');
    const ts = useTranslations('signalCoreV3');

    // === Data Completeness Check ===
    const options_status = structure?.options_status;
    const isNoMarket = options_status === 'NO_MARKET';
    const hasStructure = structure && (options_status === 'OK' || isNoMarket);
    const validation = structure?.validation;
    const isLoading = !hasStructure;
    const isFail = (!isNoMarket && options_status !== 'OK') || (!isNoMarket && validation?.confidence === 'LOW');

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
    if (isNoMarket) {
        keyObservation = 'EQUITIES ONLY: NO OPTIONS MARKET';
    } else if (isREG && !isFail && callWall > 0 && putFloor > 0) {
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


