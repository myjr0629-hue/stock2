'use client';

import { Zap, TrendingUp, TrendingDown, AlertTriangle, Shield, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CommandInsightProps {
    ticker: string;
    displayPrice: number;
    structure: any;
    liveQuote: any;
    newsScore: { score: number; label: string } | null;
    smaData: { cross: string; crossType: string; label: string; sma50: number; sma200: number; distance: number; isImminent: boolean; phase: string } | null;
    session: string;
}

type Verdict = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION';

interface InsightResult {
    verdict: Verdict;
    briefing: string;
    factors: { label: string; status: 'positive' | 'negative' | 'neutral' }[];
}

export function CommandInsight({
    ticker,
    displayPrice,
    structure,
    liveQuote,
    newsScore,
    smaData,
    session
}: CommandInsightProps) {
    const t = useTranslations('commandInsight');
    const td = useTranslations('dashboard');

    // === Data Extraction ===
    const netGex = structure?.netGex || 0;
    const maxPain = structure?.maxPain || 0;
    const callWall = structure?.levels?.callWall || 0;
    const putFloor = structure?.levels?.putFloor || 0;
    const gammaFlip = structure?.gammaFlipLevel || 0;
    const netPremium = liveQuote?.flow?.netPremium || 0;
    const zeroDteRatio = structure?.gexZeroDteRatio || 0;
    const optionsStatus = structure?.options_status;

    // === Scoring System ===
    let bullScore = 0;
    let bearScore = 0;
    const factors: InsightResult['factors'] = [];

    // 1. Price Position vs Max Pain
    if (maxPain > 0) {
        const mpDist = ((displayPrice - maxPain) / maxPain) * 100;
        if (mpDist > 2) {
            bullScore += 15;
            factors.push({ label: td('insight.maxPainAbove'), status: 'positive' });
        } else if (mpDist < -2) {
            bearScore += 15;
            factors.push({ label: td('insight.maxPainBelow'), status: 'negative' });
        } else {
            factors.push({ label: td('insight.maxPainNear'), status: 'neutral' });
        }
    }

    // 2. Gamma Zone
    if (netGex > 0) {
        bullScore += 10; // Long gamma = stable, slightly bullish
        factors.push({ label: t('longGamma'), status: 'positive' });
    } else if (netGex < 0) {
        // Short gamma = volatile, can go either way
        factors.push({ label: t('shortGamma'), status: 'neutral' });
    }

    // 3. Price vs Support/Resistance
    if (callWall > 0 && putFloor > 0) {
        if (displayPrice >= putFloor && displayPrice <= callWall) {
            bullScore += 10;
            factors.push({ label: t('inRange'), status: 'positive' });
        } else if (displayPrice > callWall) {
            bearScore += 10; // Extended above resistance
            factors.push({ label: t('aboveResistance'), status: 'neutral' });
        } else if (displayPrice < putFloor) {
            bearScore += 15;
            factors.push({ label: t('belowSupport'), status: 'negative' });
        }
    }

    // 4. SMA Trend (replaces MACD)
    if (smaData) {
        if (smaData.cross === 'GOLDEN') {
            bullScore += 20;
            factors.push({ label: 'Golden Cross', status: 'positive' });
        } else if (smaData.cross === 'DEAD') {
            bearScore += 20;
            factors.push({ label: 'Dead Cross', status: 'negative' });
        }
    }

    // 5. News Sentiment
    if (newsScore) {
        if (newsScore.score >= 70) {
            bullScore += 15;
            factors.push({ label: t('newsPositive'), status: 'positive' });
        } else if (newsScore.score < 40) {
            bearScore += 15;
            factors.push({ label: t('newsNegative'), status: 'negative' });
        }
    }

    // 6. Flow Direction
    if (netPremium > 100000) {
        bullScore += 10;
        factors.push({ label: t('callDominant'), status: 'positive' });
    } else if (netPremium < -100000) {
        bearScore += 10;
        factors.push({ label: t('putDominant'), status: 'negative' });
    }

    // 7. 0DTE Risk
    if (zeroDteRatio > 0.3) {
        // High 0DTE = more volatility
        factors.push({ label: '0DTE High', status: 'neutral' });
    }

    // === Determine Verdict ===
    let verdict: Verdict = 'NEUTRAL';
    const diff = bullScore - bearScore;

    if (optionsStatus !== 'OK') {
        verdict = 'CAUTION';
    } else if (diff >= 25) {
        verdict = 'BULLISH';
    } else if (diff <= -25) {
        verdict = 'BEARISH';
    } else if (session === 'CLOSED') {
        verdict = 'NEUTRAL';
    } else {
        verdict = 'NEUTRAL';
    }

    // === Generate Briefing ===
    let briefing = '';

    if (optionsStatus !== 'OK') {
        briefing = `${ticker} — ${td('briefing.dataValidating')}`;
    } else if (verdict === 'BULLISH') {
        if (smaData?.cross === 'GOLDEN' && netGex > 0) {
            briefing = td('briefing.bullishGoldenCross', { ticker });
        } else if (displayPrice > maxPain && netPremium > 0) {
            briefing = td('briefing.bullishCallFlow', { ticker });
        } else {
            briefing = td('briefing.bullishComposite', { ticker });
        }
    } else if (verdict === 'BEARISH') {
        if (smaData?.cross === 'DEAD' && displayPrice < putFloor) {
            briefing = td('briefing.bearishDeadCross', { ticker });
        } else if (netGex < 0 && zeroDteRatio > 0.3) {
            briefing = td('briefing.bearishComposite', { ticker });
        } else {
            briefing = td('briefing.bearishComposite', { ticker });
        }
    } else {
        if (session === 'CLOSED') {
            briefing = t('marketClosedBriefing', { ticker });
        } else if (Math.abs(displayPrice - maxPain) / maxPain < 0.01) {
            briefing = td('briefing.neutralDirection', { ticker });
        } else {
            briefing = td('briefing.neutralDirection', { ticker });
        }
    }

    // === Styling ===
    const verdictConfig = {
        BULLISH: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: TrendingUp },
        BEARISH: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', icon: TrendingDown },
        NEUTRAL: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30', icon: Activity },
        CAUTION: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', icon: AlertTriangle },
    };

    const config = verdictConfig[verdict];
    const VerdictIcon = config.icon;

    return (
        <div className={`rounded-xl border ${config.border} ${config.bg} backdrop-blur-md p-4 relative overflow-hidden`}>
            {/* Background glow */}
            <div className={`absolute inset-0 bg-gradient-to-r ${verdict === 'BULLISH' ? 'from-emerald-500/5' : verdict === 'BEARISH' ? 'from-rose-500/5' : 'from-slate-500/5'} to-transparent pointer-events-none`} />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white uppercase tracking-widest">Command Insight</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg} ${config.text} border ${config.border}`}>
                        <VerdictIcon className="w-4 h-4" />
                        <span className="text-sm font-black">{verdict}</span>
                    </div>
                </div>

                {/* Briefing */}
                <p className="text-sm text-white/90 leading-relaxed mb-3">
                    {briefing}
                </p>

                {/* Factor Pills */}
                <div className="flex flex-wrap gap-1.5">
                    {factors.slice(0, 6).map((f, i) => (
                        <span
                            key={i}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${f.status === 'positive' ? 'bg-emerald-500/20 text-emerald-400' :
                                f.status === 'negative' ? 'bg-rose-500/20 text-rose-400' :
                                    'bg-slate-600/30 text-slate-400'
                                }`}
                        >
                            {f.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
