"use client";

import React, { useState, useMemo } from 'react';
import { Activity, AlertTriangle, TrendingUp, Radar, Newspaper, Radio, Globe, Flag, BarChart3, Zap, Shield, Clock } from "lucide-react";
import { useMacroSnapshot } from "@/hooks/useMacroSnapshot";
import { useGuardianNews, type NewsDigestItem } from "@/hooks/useGuardianNews";
import { useTranslations, useLocale } from 'next-intl';
import { MiniGauge, DualGauge } from "./MiniGauge";
import { GuardianTooltip } from './GuardianTooltip';

interface RealityCheckProps {
    nasdaqChange: number;
    guardianScore: number;
    divergenceCase?: 'A' | 'B' | 'C' | 'D' | 'N';
    rvolNdx?: number;
    rvolDow?: number;
    verdict?: {
        title: string;
        desc: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    };
    vixTermStructure?: number;
    bondFlow?: number;
    goldFlow?: number;
}

// ===== Category Config =====
const CATEGORY_CONFIG: Record<string, { icon: typeof Globe; color: string; label: Record<string, string> }> = {
    US_MARKET: { icon: BarChart3, color: 'text-emerald-400', label: { ko: '미국 시장', en: 'US MARKET', ja: '米国市場' } },
    GLOBAL: { icon: Globe, color: 'text-sky-400', label: { ko: '글로벌', en: 'GLOBAL', ja: 'グローバル' } },
    GEOPOLITICAL: { icon: Flag, color: 'text-rose-400', label: { ko: '지정학', en: 'GEOPOLITICAL', ja: '地政学' } },
    MACRO: { icon: TrendingUp, color: 'text-amber-400', label: { ko: '매크로', en: 'MACRO', ja: 'マクロ' } },
    SECTOR: { icon: Zap, color: 'text-violet-400', label: { ko: '섹터', en: 'SECTOR', ja: 'セクター' } },
};

const IMPACT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
    BULLISH: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    BEARISH: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    MIXED: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    NEUTRAL: { color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
};

/**
 * RealityCheck v10.0 — MACRO ALERTS + NEWS PULSE Toggle
 */
export function RealityCheck({
    nasdaqChange,
    guardianScore,
    divergenceCase = 'N',
    rvolNdx = 1.0,
    rvolDow = 1.0,
    vixTermStructure,
    bondFlow,
    goldFlow,
}: RealityCheckProps) {
    const t = useTranslations('guardian');
    const locale = useLocale();
    const [activeTab, setActiveTab] = useState<'gauges' | 'radar'>('gauges');
    const [bottomTab, setBottomTab] = useState<'alerts' | 'news'>('news');
    const isDivergent = divergenceCase === 'A' || divergenceCase === 'B';
    const statusText = isDivergent ? "DIVERGENCE" : "ALIGNED";
    const statusColor = isDivergent
        ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
        : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

    const { snapshot } = useMacroSnapshot();
    const { items: newsItems, hasBreaking, isLoading: newsLoading } = useGuardianNews(true);
    const yieldCurve = snapshot?.yieldCurve;
    const realYield = snapshot?.realYield;
    const us10yFactor = snapshot?.factors?.us10y;
    const us10yChangePct = us10yFactor?.chgPct ?? 0;

    // Check if macro alerts exist
    const hasVixAlert = vixTermStructure !== undefined && vixTermStructure <= 0.95;
    const hasRiskOff = bondFlow !== undefined && goldFlow !== undefined && (bondFlow + goldFlow) > 0.5;
    const hasMacroAlerts = hasVixAlert || hasRiskOff;

    const getRvolColor = (val: number) => val > 1.0 ? 'text-cyan-400' : 'text-slate-400';
    const get10YColor = (change: number) => change >= 0 ? 'text-rose-400' : 'text-emerald-400';
    const getSpreadColor = (val: number) => {
        if (val < 0) return 'text-rose-400';
        if (val < 0.25) return 'text-amber-400';
        return 'text-emerald-400';
    };
    const getRealColor = (stance: string) => {
        if (stance === 'TIGHT') return 'text-rose-400';
        if (stance === 'LOOSE') return 'text-emerald-400';
        return 'text-sky-400';
    };

    // i18n helper for bottom section
    const bt = (key: string): string => {
        const map: Record<string, Record<string, string>> = {
            macroAlerts: { ko: '매크로 경보', en: 'MACRO ALERTS', ja: 'マクロ警報' },
            newsPulse: { ko: '뉴스 펄스', en: 'NEWS PULSE', ja: 'ニュースパルス' },
            noAlerts: { ko: '현재 매크로 경보 없음 — 정상 구간', en: 'No active macro alerts — Normal conditions', ja: '現在マクロ警報なし — 正常区間' },
            breaking: { ko: '속보', en: 'BREAKING', ja: '速報' },
            ago: { ko: '전', en: 'ago', ja: '前' },
            min: { ko: '분', en: 'min', ja: '分' },
            hour: { ko: '시간', en: 'h', ja: '時間' },
            updated: { ko: '갱신', en: 'Updated', ja: '更新' },
            loading: { ko: '뉴스 분석 중...', en: 'Analyzing news...', ja: 'ニュース分析中...' },
            noNews: { ko: '뉴스를 불러오는 중...', en: 'Loading news...', ja: 'ニュースを読み込み中...' },
            impact: { ko: '임팩트', en: 'Impact', ja: 'インパクト' },
        };
        return map[key]?.[locale] || map[key]?.en || key;
    };

    // Get localized summary/analysis
    const getLocalizedSummary = (item: NewsDigestItem): string => {
        if (locale === 'ko') return item.summaryKR || item.summaryEN;
        if (locale === 'ja') return item.summaryJP || item.summaryEN;
        return item.summaryEN || item.summaryKR;
    };
    const getLocalizedAnalysis = (item: NewsDigestItem): string => {
        if (locale === 'ko') return item.analysisKR || item.analysisEN;
        if (locale === 'ja') return item.analysisJP || item.analysisEN;
        return item.analysisEN || item.analysisKR;
    };

    // Age formatter
    const formatAge = (minutes: number): string => {
        if (minutes < 60) return `${minutes}${bt('min')} ${bt('ago')}`;
        const hours = Math.floor(minutes / 60);
        return `${hours}${bt('hour')} ${bt('ago')}`;
    };

    return (
        <div className="h-full flex flex-col p-3">
            {/* HEADER with tab toggle */}
            <div className="flex justify-between items-center mb-3 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400/60" />
                    <GuardianTooltip sectionId="realityCheck">
                        <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-white/70 font-jakarta">
                            REALITY CHECK
                        </h3>
                    </GuardianTooltip>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="flex bg-slate-800/60 rounded-full p-0.5 border border-slate-700/30">
                        <button
                            onClick={() => setActiveTab('gauges')}
                            className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full transition-all duration-200 ${activeTab === 'gauges'
                                ? 'bg-slate-600/80 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            GAUGES
                        </button>
                        <button
                            onClick={() => setActiveTab('radar')}
                            className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full transition-all duration-200 flex items-center gap-1 ${activeTab === 'radar'
                                ? 'bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/30'
                                : 'text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            <Radar className="w-3 h-3" />
                            RADAR
                        </button>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColor}`}>
                        {statusText}
                    </span>
                </div>
            </div>

            {/* ===== GAUGES TAB ===== */}
            {activeTab === 'gauges' && (
                <>
                    <div className="flex-none grid grid-cols-3 gap-x-2 gap-y-3 place-items-center content-center">
                        <DualGauge priceValue={nasdaqChange} flowValue={guardianScore} size="lg" />
                        <MiniGauge label="NDX 20D" value={`${Math.round(rvolNdx * 100)}%`}
                            subLabel={rvolNdx > 1.5 ? t('rvolActive') : rvolNdx > 1.0 ? t('rvolNormal') : t('rvolLow')}
                            colorClass={getRvolColor(rvolNdx)} size="lg" fillPercent={Math.min(rvolNdx * 50, 100)} />
                        <MiniGauge label="DOW 20D" value={`${Math.round(rvolDow * 100)}%`}
                            subLabel={rvolDow > 1.5 ? t('rvolActive') : rvolDow > 1.0 ? t('rvolNormal') : t('rvolLow')}
                            colorClass={rvolDow > 1.0 ? 'text-orange-400' : 'text-slate-400'} size="lg" fillPercent={Math.min(rvolDow * 50, 100)} />
                        <MiniGauge label="US10Y" value={yieldCurve ? `${yieldCurve.us10y.toFixed(2)}%` : '—'}
                            secondaryValue={`${us10yChangePct >= 0 ? '+' : ''}${us10yChangePct.toFixed(2)}%`}
                            subLabel={us10yChangePct > 0 ? t('yieldUp') : us10yChangePct < 0 ? t('yieldDown') : t('yieldFlat')}
                            colorClass={get10YColor(us10yChangePct)} size="lg" fillPercent={50 + us10yChangePct * 10} />
                        <MiniGauge label="2S10S" value={yieldCurve ? `${yieldCurve.spread2s10s > 0 ? '+' : ''}${yieldCurve.spread2s10s.toFixed(2)}%` : '—'}
                            subLabel={yieldCurve ? (yieldCurve.spread2s10s < 0 ? t('yieldInverted') : yieldCurve.spread2s10s < 0.25 ? t('yieldFlattening') : t('yieldNormal')) : '—'}
                            colorClass={yieldCurve ? getSpreadColor(yieldCurve.spread2s10s) : 'text-slate-400'} size="lg"
                            fillPercent={yieldCurve ? Math.min((yieldCurve.spread2s10s + 1) * 50, 100) : 50} />
                        <MiniGauge label="REAL" value={realYield ? `${realYield.realYield > 0 ? '+' : ''}${realYield.realYield.toFixed(2)}%` : '—'}
                            subLabel={realYield?.stance === 'TIGHT' ? t('stanceTight') : realYield?.stance === 'LOOSE' ? t('stanceLoose') : t('stanceNeutral')}
                            colorClass={realYield ? getRealColor(realYield.stance) : 'text-slate-400'} size="lg"
                            fillPercent={realYield ? Math.min((realYield.realYield + 2) * 25, 100) : 50} />
                    </div>

                    {/* ===== BOTTOM TOGGLE: MACRO ALERTS / NEWS PULSE ===== */}
                    <div className="flex flex-col mt-3 flex-1 min-h-0">
                        {/* Toggle Tabs */}
                        <div className="flex items-center gap-0 mb-2 flex-none">
                            <button
                                onClick={() => setBottomTab('alerts')}
                                className={`flex items-center gap-1.5 text-[12px] font-bold px-3 py-1 rounded-l-lg border transition-all duration-200 ${bottomTab === 'alerts'
                                    ? 'bg-slate-700/60 text-white border-slate-500/70 shadow-sm'
                                    : 'bg-transparent text-slate-500 border-slate-600/40 hover:text-slate-400 hover:border-slate-500/50'
                                    }`}
                            >
                                <Shield className="w-3 h-3" />
                                {bt('macroAlerts')}
                                {hasMacroAlerts && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                )}
                            </button>
                            <button
                                onClick={() => setBottomTab('news')}
                                className={`flex items-center gap-1.5 text-[12px] font-bold px-3 py-1 rounded-r-lg border-y border-r transition-all duration-200 ${bottomTab === 'news'
                                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-400/40 shadow-sm shadow-indigo-500/10'
                                    : 'bg-transparent text-slate-500 border-slate-600/40 hover:text-slate-400 hover:border-slate-500/50'
                                    }`}
                            >
                                <Radio className="w-3 h-3" />
                                {bt('newsPulse')}
                                {bottomTab === 'news' && (
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                                    </span>
                                )}
                                {hasBreaking && (
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Bottom Content */}
                        <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' } as React.CSSProperties}>
                            {bottomTab === 'alerts' && (
                                <MacroAlertsContent
                                    vixTermStructure={vixTermStructure}
                                    bondFlow={bondFlow}
                                    goldFlow={goldFlow}
                                    hasMacroAlerts={hasMacroAlerts}
                                    t={t}
                                    bt={bt}
                                />
                            )}
                            {bottomTab === 'news' && (
                                <NewsPulseContent
                                    items={newsItems}
                                    isLoading={newsLoading}
                                    locale={locale}
                                    bt={bt}
                                    getLocalizedSummary={getLocalizedSummary}
                                    getLocalizedAnalysis={getLocalizedAnalysis}
                                    formatAge={formatAge}
                                />
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ===== RADAR TAB ===== */}
            {activeTab === 'radar' && (
                <RiskRadarHUD snapshot={snapshot} />
            )}
        </div>
    );
}

// ===== MACRO ALERTS Sub-Component =====
function MacroAlertsContent({
    vixTermStructure, bondFlow, goldFlow, hasMacroAlerts, t, bt,
}: {
    vixTermStructure?: number; bondFlow?: number; goldFlow?: number;
    hasMacroAlerts: boolean;
    t: (key: string) => string; bt: (key: string) => string;
}) {
    return (
        <div className="flex flex-col gap-2">
            {vixTermStructure !== undefined && vixTermStructure <= 0.95 && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <div className="text-[13px] font-bold text-rose-400 uppercase tracking-wider font-jakarta">VIX Backwardation (Panic)</div>
                        <div className="text-[13px] text-rose-300/85 mt-0.5 leading-[1.5]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {t('vixBackwardationDesc')}
                        </div>
                    </div>
                </div>
            )}
            {bondFlow !== undefined && goldFlow !== undefined && (bondFlow + goldFlow) > 0.5 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
                    <TrendingUp className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <div className="text-[13px] font-bold text-amber-400 uppercase tracking-wider font-jakarta">Risk-Off Rotation</div>
                        <div className="text-[13px] text-amber-300/85 mt-0.5 leading-[1.5]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {t('riskOffDesc')} (Bonds: {(bondFlow > 0 ? '+' : '')}{bondFlow.toFixed(1)}%, Gold: {(goldFlow > 0 ? '+' : '')}{goldFlow.toFixed(1)}%)
                        </div>
                    </div>
                </div>
            )}
            {!hasMacroAlerts && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
                    <Shield className="w-4 h-4 text-emerald-400/60 flex-shrink-0" />
                    <div className="text-[13px] text-slate-300 leading-[1.5]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                        ✅ {bt('noAlerts')}
                    </div>
                </div>
            )}
        </div>
    );
}

// ===== NEWS PULSE Sub-Component — Single-Item Auto-Carousel =====
function NewsPulseContent({
    items, isLoading, locale, bt, getLocalizedSummary, getLocalizedAnalysis, formatAge,
}: {
    items: NewsDigestItem[];
    isLoading: boolean;
    locale: string;
    bt: (key: string) => string;
    getLocalizedSummary: (item: NewsDigestItem) => string;
    getLocalizedAnalysis: (item: NewsDigestItem) => string;
    formatAge: (minutes: number) => string;
}) {
    const [currentIdx, setCurrentIdx] = React.useState(0);
    const displayItems = items.slice(0, 10);
    const total = displayItems.length;

    // Auto-rotation: 8 seconds per item
    React.useEffect(() => {
        if (total <= 1) return;
        const timer = setInterval(() => {
            setCurrentIdx(prev => (prev + 1) % total);
        }, 10000);
        return () => clearInterval(timer);
    }, [total]);

    // Reset index when items change
    React.useEffect(() => { setCurrentIdx(0); }, [items.length]);

    if (isLoading || total === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-4 gap-2">
                <Radio className="w-5 h-5 text-indigo-400/50 animate-pulse" />
                <span className="text-[13px] text-slate-400" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                    {isLoading ? bt('loading') : bt('noNews')}
                </span>
            </div>
        );
    }

    const item = displayItems[currentIdx];
    if (!item) return null;

    const isBreaking = item.urgency >= 8;
    const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.US_MARKET;
    const imp = IMPACT_CONFIG[item.impact] || IMPACT_CONFIG.NEUTRAL;
    const CatIcon = cat.icon;
    const summary = getLocalizedSummary(item);
    const analysis = getLocalizedAnalysis(item);

    return (
        <div className="flex flex-col">
            {/* Single News Card */}
            <div
                key={`${item.id}-${currentIdx}`}
                className={`relative rounded-lg p-3 transition-all duration-500 overflow-hidden ${isBreaking
                    ? 'border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                    : 'border border-slate-600/50'
                    }`}
                style={{
                    background: isBreaking
                        ? 'linear-gradient(135deg, rgba(244,63,94,0.06) 0%, rgba(15,23,42,0.95) 50%, rgba(244,63,94,0.04) 100%)'
                        : 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(15,23,42,0.95) 40%, rgba(6,182,212,0.04) 100%)',
                }}
            >
                {/* Infographic grid pattern overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)
                        `,
                        backgroundSize: '20px 20px',
                    }}
                />
                {/* Subtle corner accent */}
                <div className="absolute top-0 right-0 w-28 h-28 pointer-events-none"
                    style={{ background: 'radial-gradient(circle at top right, rgba(99,102,241,0.18), transparent 70%)' }}
                />

                <div className="relative z-10">
                    {/* Header: Breaking + Category + Impact + Time */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                        {isBreaking && (
                            <span className="flex items-center gap-1 text-[12px] font-black text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded border border-rose-500/30 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                {bt('breaking')}
                            </span>
                        )}
                        <span className={`flex items-center gap-1 text-[12px] font-bold ${cat.color}`}>
                            <CatIcon className="w-3 h-3" />
                            {cat.label[locale] || cat.label.en}
                        </span>
                        <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${imp.bg} ${imp.border} border ${imp.color}`}>
                            {item.impact}
                        </span>
                        <span className="text-[12px] text-slate-500 ml-auto flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatAge(item.ageMinutes)}
                        </span>
                    </div>

                    {/* Summary — main headline */}
                    <div className="text-[13px] text-slate-300 font-medium leading-[1.6]" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                        {summary}
                    </div>

                    {/* Analysis — much more visible with separator */}
                    {analysis && (
                        <div className="mt-2 pt-2 border-t border-slate-700/30">
                            <div className="flex items-start gap-1.5">
                                <span className="flex-shrink-0 mt-0.5">
                                    <img
                                        src="/signum-sg-vectorized.svg"
                                        alt="AI"
                                        width={12}
                                        height={12}
                                        style={{
                                            objectFit: 'contain' as const,
                                            filter: 'drop-shadow(0 0 2px rgba(245,158,11,0.3)) drop-shadow(0 0 1px rgba(245,158,11,0.2))',
                                            animation: 'aiLogoPulse 2.5s ease-in-out infinite',
                                        }}
                                    />
                                </span>
                                <span className="text-[13px] text-cyan-300/90 leading-[1.6] font-medium" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {analysis}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Source */}
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[12px] text-slate-500 italic">
                            {item.source}
                        </span>
                    </div>
                </div>
            </div>

            {/* Progress Dots + Navigation */}
            {total > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                    {displayItems.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIdx(idx)}
                            className={`rounded-full transition-all duration-300 ${idx === currentIdx
                                ? 'w-4 h-1.5 bg-indigo-400'
                                : 'w-1.5 h-1.5 bg-slate-600 hover:bg-slate-500'
                                }`}
                        />
                    ))}
                </div>
            )}


        </div>
    );
}

// ========================================================
// Risk Radar HUD — 6-Axis Hexagon (Larger, Center-Aligned)
// VIX | 10Y | OIL | DXY | GOLD | BTC
// ========================================================
function RiskRadarHUD({ snapshot }: { snapshot: ReturnType<typeof useMacroSnapshot>['snapshot'] }) {
    const locale = useLocale();
    const factors = snapshot?.factors;

    const axes = useMemo(() => {
        const vixLevel = factors?.vix?.level ?? 15;
        const vixChg = factors?.vix?.chgPct ?? 0;
        const us10yLevel = factors?.us10y?.level ?? 4.0;
        const us10yChg = factors?.us10y?.chgPct ?? 0;
        const oilLevel = factors?.oil?.level ?? 70;
        const oilChg = factors?.oil?.chgPct ?? 0;
        const dxyLevel = factors?.dxy?.level ?? 103;
        const dxyChg = factors?.dxy?.chgPct ?? 0;
        const goldLevel = factors?.gold?.level ?? 2000;
        const goldChg = factors?.gold?.chgPct ?? 0;
        const btcLevel = factors?.btc?.level ?? 60000;
        const btcChg = factors?.btc?.chgPct ?? 0;

        const vixNorm = Math.min(100, Math.max(0, ((vixLevel - 10) / 30) * 100));
        const yieldNorm = Math.min(100, Math.max(0, ((us10yLevel - 3) / 2.5) * 100));
        const oilNorm = Math.min(100, Math.max(0, ((oilLevel - 40) / 80) * 100));
        const dxyNorm = Math.min(100, Math.max(0, ((dxyLevel - 95) / 15) * 100));
        const goldNorm = Math.min(100, Math.max(0, (goldChg + 2) / 4 * 100));
        const btcNorm = Math.min(100, Math.max(0, (btcChg + 5) / 10 * 100));

        const step = (2 * Math.PI) / 6;
        return [
            { key: 'VIX', label: 'VIX', value: vixLevel.toFixed(1), chg: vixChg, norm: vixNorm, angle: -Math.PI / 2 },
            { key: '10Y', label: '10Y', value: `${us10yLevel.toFixed(2)}%`, chg: us10yChg, norm: yieldNorm, angle: -Math.PI / 2 + step },
            { key: 'OIL', label: 'OIL', value: `$${oilLevel.toFixed(0)}`, chg: oilChg, norm: oilNorm, angle: -Math.PI / 2 + step * 2 },
            { key: 'DXY', label: 'DXY', value: dxyLevel.toFixed(1), chg: dxyChg, norm: dxyNorm, angle: -Math.PI / 2 + step * 3 },
            { key: 'GOLD', label: 'GOLD', value: `$${goldLevel.toFixed(0)}`, chg: goldChg, norm: goldNorm, angle: -Math.PI / 2 + step * 4 },
            { key: 'BTC', label: 'BTC', value: `$${(btcLevel / 1000).toFixed(1)}K`, chg: btcChg, norm: btcNorm, angle: -Math.PI / 2 + step * 5 },
        ];
    }, [factors]);

    const regime = useMemo(() => {
        const vix = axes[0].norm;
        const goldChg = axes[4].chg;
        const btcChg = axes[5].chg;
        const oilChg = axes[2].chg;

        const riskScore = (vix * 0.35) +
            (Math.max(0, goldChg) * 8) +
            (Math.max(0, -btcChg) * 5) +
            (Math.abs(oilChg) > 3 ? 15 : 0) +
            (axes[1].norm * 0.15);

        if (riskScore > 55) return { label: 'RISK-OFF', color: '#f87171', bgColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)' };
        if (riskScore > 30) return { label: 'MIXED', color: '#fbbf24', bgColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' };
        return { label: 'RISK-ON', color: '#34d399', bgColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.25)' };
    }, [axes]);

    // ★ LARGER hexagon
    const CX = 150, CY = 115, R = 80;
    const getPoint = (angle: number, radius: number) => ({
        x: CX + radius * Math.cos(angle),
        y: CY + radius * Math.sin(angle),
    });
    const rings = [0.25, 0.5, 0.75, 1.0];
    const dataPoints = axes.map(a => {
        const r = (a.norm / 100) * R;
        return getPoint(a.angle, r);
    });

    const insightText = useMemo(() => {
        const vixState = axes[0].norm > 60 ? 'high' : axes[0].norm < 30 ? 'low' : 'mid';
        const btcDir = axes[5].chg > 1 ? 'up' : axes[5].chg < -1 ? 'down' : 'flat';
        const oilDir = axes[2].chg > 1 ? 'up' : axes[2].chg < -1 ? 'down' : 'flat';

        if (locale === 'ko') {
            if (regime.label === 'RISK-OFF') return `VIX ${vixState === 'high' ? '급등' : '경계'} · ${btcDir === 'down' ? '투기심리 위축' : '안전자산 이동'} · 방어적 환경`;
            if (regime.label === 'RISK-ON') return `VIX 안정 · ${btcDir === 'up' ? 'BTC 강세 · 위험선호' : '전반적 낙관'} · 공격적 환경`;
            return `혼재 신호 · ${oilDir === 'up' ? '원유 부담' : '방향 탐색 중'} · 선별적 접근`;
        }
        if (locale === 'ja') {
            if (regime.label === 'RISK-OFF') return `VIX${vixState === 'high' ? '急騰' : '警戒'} · ${btcDir === 'down' ? '投機心理縮小' : '安全資産移動'} · 防衛的環境`;
            if (regime.label === 'RISK-ON') return `VIX安定 · ${btcDir === 'up' ? 'BTC強気·リスク選好' : '全般楽観'} · 攻勢的環境`;
            return `混在シグナル · ${oilDir === 'up' ? '原油負担' : '方向模索中'} · 選別的アプローチ`;
        }
        if (regime.label === 'RISK-OFF') return `VIX ${vixState === 'high' ? 'surging' : 'elevated'} · ${btcDir === 'down' ? 'Spec sentiment weak' : 'Safe haven bid'} · Defensive`;
        if (regime.label === 'RISK-ON') return `VIX stable · ${btcDir === 'up' ? 'BTC strong · Risk-on' : 'Broad optimism'} · Offensive`;
        return `Mixed signals · ${oilDir === 'up' ? 'Oil pressure' : 'Seeking direction'} · Selective`;
    }, [axes, regime, locale]);

    const chgColor = (chg: number, invert = false) => {
        if (invert) return chg > 0.1 ? '#f87171' : chg < -0.1 ? '#34d399' : '#94a3b8';
        return chg > 0.1 ? '#34d399' : chg < -0.1 ? '#f87171' : '#94a3b8';
    };

    // Label component for DRY — always center-aligned
    const AxisLabel = ({ idx, invert = false }: { idx: number; invert?: boolean }) => (
        <>
            <div className="text-[13px] font-bold text-slate-400 tracking-wider font-jakarta">{axes[idx].label}</div>
            <div className="text-[14px] font-mono font-bold text-white leading-tight">{axes[idx].value}</div>
            <div className="text-[13px] font-mono font-semibold leading-tight" style={{ color: chgColor(axes[idx].chg, invert) }}>
                {axes[idx].chg > 0 ? '+' : ''}{axes[idx].chg.toFixed(2)}%
            </div>
        </>
    );

    return (
        <div className="flex-1 flex flex-col items-center justify-start mt-4">
            <div className="relative" style={{ width: 300, height: 240 }}>
                <svg width="300" height="240" viewBox="0 0 300 240" className="overflow-visible">
                    <defs>
                        <radialGradient id="radarBg6" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="rgba(6,182,212,0.06)" />
                            <stop offset="100%" stopColor="rgba(6,182,212,0.01)" />
                        </radialGradient>
                        <filter id="radarGlow6">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <linearGradient id="radarFill6" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={regime.color} stopOpacity="0.2" />
                            <stop offset="100%" stopColor={regime.color} stopOpacity="0.05" />
                        </linearGradient>
                    </defs>

                    <circle cx={CX} cy={CY} r={R + 5} fill="url(#radarBg6)" />

                    {/* Grid hexagons */}
                    {rings.map((r, i) => (
                        <polygon key={i}
                            points={axes.map(a => { const p = getPoint(a.angle, R * r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')}
                            fill="none"
                            stroke={i === rings.length - 1 ? "rgba(148,163,184,0.4)" : "rgba(148,163,184,0.15)"}
                            strokeWidth={i === rings.length - 1 ? "1" : "0.5"}
                        />
                    ))}

                    {/* Axis lines */}
                    {axes.map((a, i) => {
                        const p = getPoint(a.angle, R);
                        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" />;
                    })}

                    {/* Data polygon */}
                    <polygon
                        points={dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                        fill="url(#radarFill6)" stroke={regime.color} strokeWidth="1.5"
                        strokeLinejoin="round" filter="url(#radarGlow6)" opacity="0.9"
                    />

                    {/* Data points with pulse */}
                    {dataPoints.map((p, i) => (
                        <g key={i}>
                            <circle cx={p.x} cy={p.y} r="5" fill="none" stroke={regime.color} strokeWidth="0.5" opacity="0.3">
                                <animate attributeName="r" values="3;7;3" dur="3s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
                                <animate attributeName="opacity" values="0.4;0.1;0.4" dur="3s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
                            </circle>
                            <circle cx={p.x} cy={p.y} r="3" fill={regime.color} opacity="0.9" />
                        </g>
                    ))}

                    {/* Center regime label */}
                    <text x={CX} y={CY - 3} textAnchor="middle"
                        className="font-jakarta" style={{ fontSize: '14px', fontWeight: 900, fill: regime.color, letterSpacing: '0.12em' }}>
                        {regime.label}
                    </text>
                    <circle cx={CX} cy={CY + 10} r="2.5" fill={regime.color} opacity="0.6">
                        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
                    </circle>
                </svg>

                {/* HTML Labels — ALL center-aligned */}
                {/* VIX — top */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '-14px' }}>
                    <AxisLabel idx={0} invert />
                </div>
                {/* 10Y — top-right */}
                <div className="absolute text-center" style={{ right: '-24px', top: `${CY - R * 0.5 - 22}px` }}>
                    <AxisLabel idx={1} invert />
                </div>
                {/* OIL — bottom-right */}
                <div className="absolute text-center" style={{ right: '-24px', top: `${CY + R * 0.5 - 6}px` }}>
                    <AxisLabel idx={2} />
                </div>
                {/* DXY — bottom */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ bottom: '-44px' }}>
                    <AxisLabel idx={3} invert />
                </div>
                {/* GOLD — bottom-left */}
                <div className="absolute text-center" style={{ left: '-28px', top: `${CY + R * 0.5 - 6}px` }}>
                    <AxisLabel idx={4} />
                </div>
                {/* BTC — top-left */}
                <div className="absolute text-center" style={{ left: '-28px', top: `${CY - R * 0.5 - 22}px` }}>
                    <AxisLabel idx={5} />
                </div>
            </div>

            {/* Insight bar */}
            <div className="w-full px-1 mt-12">
                <div className="px-3 py-1.5 rounded border text-center" style={{ backgroundColor: regime.bgColor, borderColor: regime.borderColor }}>
                    <span className="text-[12px] text-slate-300">{insightText}</span>
                </div>
            </div>
        </div>
    );
}
