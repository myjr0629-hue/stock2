'use client';

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { Sliders, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Locale = 'ko' | 'en' | 'ja';

const LABELS: Record<string, Record<Locale, string>> = {
    title: { ko: 'WHAT-IF 시뮬레이션', en: 'WHAT-IF SIMULATION', ja: 'WHAT-IFシミュレーション' },
    subtitle: { ko: '매크로 변수를 조정하여 RLSI 변동을 관측합니다', en: 'Adjust macro variables to observe RLSI impact', ja: 'マクロ変数を調整してRLSI変動を観測' },
    current: { ko: '현재', en: 'Current', ja: '現在' },
    simulated: { ko: '시뮬레이션', en: 'Simulated', ja: 'シミュレーション' },
    delta: { ko: '변동', en: 'Change', ja: '変動' },
    reset: { ko: '초기화', en: 'Reset', ja: 'リセット' },
    vix: { ko: 'VIX 변동성 지수', en: 'VIX Volatility Index', ja: 'VIX変動率指数' },
    yield10y: { ko: '미국 10년 국채 금리', en: 'US 10Y Treasury Yield', ja: '米10年国債利回り' },
    sentiment: { ko: '시장 심리 (F&G)', en: 'Market Sentiment (F&G)', ja: '市場心理 (F&G)' },
    momentum: { ko: '모멘텀 (QQQ/20MA)', en: 'Momentum (QQQ/20MA)', ja: 'モメンタム (QQQ/20MA)' },
    impactBreakdown: { ko: '영향 분석', en: 'Impact Breakdown', ja: '影響分析' },
    vixEffect: { ko: 'VIX 승수 효과', en: 'VIX Multiplier Effect', ja: 'VIX乗数効果' },
    yieldPenalty: { ko: '금리 페널티', en: 'Yield Penalty', ja: '金利ペナルティ' },
    sentimentContrib: { ko: '심리 기여도', en: 'Sentiment Contribution', ja: '心理寄与度' },
    momentumContrib: { ko: '모멘텀 기여도', en: 'Momentum Contribution', ja: 'モメンタム寄与度' },
};

function t(key: string, locale: Locale): string {
    return LABELS[key]?.[locale] || LABELS[key]?.['en'] || key;
}

interface WhatIfProps {
    currentScore: number;
    components: {
        vix: number;
        yieldRaw: number;
        sentimentScore: number;
        momentumScore: number;
        priceActionScore: number;
        breadthScore: number;
        rotationScore: number;
        vixMultiplier: number;
        yieldPenalty: number;
        vixTermStructure: number;
    };
}

// RLSI formula (mirrors rlsiEngine.ts exactly)
function simulateRLSI(
    priceAction: number, breadth: number, sentiment: number,
    momentum: number, rotation: number,
    yieldRaw: number, vix: number, vixTermStructure: number
): { score: number; vixMul: number; yieldPen: number } {
    const yieldPen = Math.max(0, (yieldRaw - 3.5) * 10);
    let vixMul = 1.0;
    if (vix > 30) vixMul = 0.5;
    else if (vix > 20) vixMul = 0.8;
    vixMul *= vixTermStructure;

    const baseScore =
        (priceAction * 0.20) + (breadth * 0.20) + (sentiment * 0.10) +
        (momentum * 0.30) + (rotation * 0.10) + 10 - yieldPen;

    const final = Math.max(0, Math.min(100, baseScore * vixMul));
    return { score: Number(final.toFixed(1)), vixMul, yieldPen };
}

export default function WhatIfSimulator({ currentScore, components }: WhatIfProps) {
    const rawLocale = useLocale();
    const locale: Locale = (rawLocale === 'ko' || rawLocale === 'en' || rawLocale === 'ja') ? rawLocale : 'en';

    // Slider states (initialized to current values)
    const [simVix, setSimVix] = useState(components.vix);
    const [simYield, setSimYield] = useState(components.yieldRaw);
    const [simSentiment, setSimSentiment] = useState(components.sentimentScore);
    const [simMomentum, setSimMomentum] = useState(components.momentumScore);

    const simResult = useMemo(() => simulateRLSI(
        components.priceActionScore, components.breadthScore, simSentiment,
        simMomentum, components.rotationScore,
        simYield, simVix, components.vixTermStructure
    ), [simVix, simYield, simSentiment, simMomentum, components]);

    const currentResult = useMemo(() => simulateRLSI(
        components.priceActionScore, components.breadthScore, components.sentimentScore,
        components.momentumScore, components.rotationScore,
        components.yieldRaw, components.vix, components.vixTermStructure
    ), [components]);

    const delta = Number((simResult.score - currentResult.score).toFixed(1));
    const deltaColor = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-300';
    const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

    const handleReset = () => {
        setSimVix(components.vix);
        setSimYield(components.yieldRaw);
        setSimSentiment(components.sentimentScore);
        setSimMomentum(components.momentumScore);
    };

    const sliders = [
        { key: 'vix', label: t('vix', locale), value: simVix, set: setSimVix, min: 10, max: 50, step: 0.5, current: components.vix, fmt: (v: number) => v.toFixed(1), unit: '' },
        { key: 'yield10y', label: t('yield10y', locale), value: simYield, set: setSimYield, min: 2.0, max: 6.0, step: 0.1, current: components.yieldRaw, fmt: (v: number) => v.toFixed(2) + '%', unit: '' },
        { key: 'sentiment', label: t('sentiment', locale), value: simSentiment, set: setSimSentiment, min: 0, max: 100, step: 1, current: components.sentimentScore, fmt: (v: number) => v.toFixed(0), unit: '' },
        { key: 'momentum', label: t('momentum', locale), value: simMomentum, set: setSimMomentum, min: 0, max: 100, step: 1, current: components.momentumScore, fmt: (v: number) => v.toFixed(0), unit: '' },
    ];

    // Level for simulated score
    const getLevel = (s: number) => s >= 71 ? 'OPTIMAL' : s <= 30 ? 'DANGER' : 'NEUTRAL';
    const getLevelColor = (l: string) => l === 'OPTIMAL' ? 'text-emerald-400' : l === 'DANGER' ? 'text-rose-400' : 'text-slate-300';
    const simLevel = getLevel(simResult.score);

    return (
        <div className="flex flex-col gap-3 p-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-violet-400" />
                    <span className="text-[14px] font-black font-jakarta tracking-wider text-white">
                        {t('title', locale)}
                    </span>
                </div>
                <button onClick={handleReset} className="text-[12px] font-jakarta text-slate-300 hover:text-white transition-colors px-2 py-0.5 rounded border border-slate-700/40 hover:border-slate-500/60">
                    {t('reset', locale)}
                </button>
            </div>
            <p className="text-[12px] font-jakarta text-slate-300 -mt-1">{t('subtitle', locale)}</p>

            {/* Score Comparison */}
            <div className="grid grid-cols-3 gap-2 bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/20">
                <div className="flex flex-col items-center">
                    <span className="text-[12px] font-jakarta text-slate-300 mb-1">{t('current', locale)}</span>
                    <span className="text-[20px] font-black font-jakarta tabular-nums text-slate-300">{currentResult.score}</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                    <DeltaIcon className={`w-4 h-4 ${deltaColor}`} />
                    <span className={`text-[16px] font-black font-jakarta tabular-nums ${deltaColor}`}>
                        {delta > 0 ? '+' : ''}{delta}
                    </span>
                    <span className="text-[12px] font-jakarta text-slate-300">{t('delta', locale)}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[12px] font-jakarta text-slate-300 mb-1">{t('simulated', locale)}</span>
                    <span className={`text-[20px] font-black font-jakarta tabular-nums ${getLevelColor(simLevel)}`}>{simResult.score}</span>
                    <span className={`text-[12px] font-bold font-jakarta ${getLevelColor(simLevel)}`}>{simLevel}</span>
                </div>
            </div>

            {/* Sliders */}
            <div className="flex flex-col gap-2.5">
                {sliders.map(s => {
                    const changed = Math.abs(s.value - s.current) > 0.01;
                    return (
                        <div key={s.key} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className={`text-[12px] font-jakarta ${changed ? 'text-violet-300 font-semibold' : 'text-slate-300'}`}>
                                    {s.label}
                                </span>
                                <span className={`text-[13px] font-mono font-bold tabular-nums ${changed ? 'text-white' : 'text-slate-300'}`}>
                                    {s.fmt(s.value)}
                                </span>
                            </div>
                            <input
                                type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                                onChange={(e) => s.set(Number(e.target.value))}
                                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500"
                                style={{
                                    background: `linear-gradient(to right, rgb(139,92,246) 0%, rgb(139,92,246) ${((s.value - s.min) / (s.max - s.min)) * 100}%, rgb(51,65,85) ${((s.value - s.min) / (s.max - s.min)) * 100}%, rgb(51,65,85) 100%)`
                                }}
                            />
                            <div className="flex justify-between text-[12px] font-jakarta text-slate-300">
                                <span>{s.fmt(s.min)}</span>
                                <span className="text-slate-300">{t('current', locale)}: {s.fmt(s.current)}</span>
                                <span>{s.fmt(s.max)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Impact Breakdown */}
            <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/20">
                <span className="text-[12px] font-bold font-jakarta text-slate-400 tracking-wider uppercase">{t('impactBreakdown', locale)}</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5">
                    {[
                        { label: t('vixEffect', locale), cur: `×${currentResult.vixMul.toFixed(2)}`, sim: `×${simResult.vixMul.toFixed(2)}`, changed: Math.abs(simResult.vixMul - currentResult.vixMul) > 0.01 },
                        { label: t('yieldPenalty', locale), cur: `-${currentResult.yieldPen.toFixed(1)}`, sim: `-${simResult.yieldPen.toFixed(1)}`, changed: Math.abs(simResult.yieldPen - currentResult.yieldPen) > 0.1 },
                        { label: t('sentimentContrib', locale), cur: (components.sentimentScore * 0.10).toFixed(1), sim: (simSentiment * 0.10).toFixed(1), changed: Math.abs(simSentiment - components.sentimentScore) > 0.5 },
                        { label: t('momentumContrib', locale), cur: (components.momentumScore * 0.30).toFixed(1), sim: (simMomentum * 0.30).toFixed(1), changed: Math.abs(simMomentum - components.momentumScore) > 0.5 },
                    ].map((row, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <span className="text-[12px] font-jakarta text-slate-400">{row.label}</span>
                            <span className={`text-[12px] font-mono font-bold tabular-nums ${row.changed ? 'text-violet-300' : 'text-slate-300'}`}>
                                {row.sim}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
