import React, { useEffect, useState, useMemo } from "react";
import { Activity, TrendingUp, TrendingDown, BarChart3, Radio, Globe, ShieldAlert, Minus, ChevronUp, ChevronDown, Landmark } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';
import { GuardianTooltip } from './GuardianTooltip';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface RLSIComponents {
    priceActionRaw: number;
    priceActionScore: number;
    breadthPct: number;
    breadthScore: number;
    adRatio: number;
    volumeBreadth: number;
    breadthSignal: string;
    breadthDivergent: boolean;
    sentimentRaw: number;
    sentimentScore: number;
    momentumRaw: number;
    momentumScore: number;
    rotationScore: number;
    yieldRaw: number;
    yieldPenalty: number;
    vix: number;
    vixMultiplier: number;
    // [V2.0] Gamma-Enhanced fields
    gammaScore?: number;
    gexIndex?: number;
    gexLevel?: string;
    squeezeRisk?: number;
    volatilityScore?: number;
    liquidityScore?: number;
    crossAssetMomentumScore?: number;
    breadthMcClellanScore?: number;
    mcClellanOsc?: number;
}

interface GravityGaugeProps {
    score: number;
    loading?: boolean;
    session?: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    components?: RLSIComponents;
    rlsiHistory?: { time: string; score: number }[];
    // [V2.0] Narrative insight
    regime?: string;         // RISK_ON | RISK_OFF | ROTATION | PANIC | NEUTRAL
    zSignal?: string | null; // EXTREME_FEAR_REVERSAL | OVERHEATED | etc.
}

export default function GravityGauge({ score, loading, session, components, rlsiHistory, regime, zSignal }: GravityGaugeProps) {
    const [animatedScore, setAnimatedScore] = useState(0);
    const t = useTranslations('guardian');
    const locale = useLocale();
    const { status: marketStatus } = useMarketStatus();
    const isHoliday = marketStatus.isHoliday;

    useEffect(() => {
        const timer = setTimeout(() => setAnimatedScore(score), 100);
        return () => clearTimeout(timer);
    }, [score]);

    const normalizedScore = Math.min(Math.max(animatedScore, 0), 100);

    // [V2.0] Gamma-Aware Insight Narrative — replaces generic BEARISH/BULLISH
    // gexLevel may be 'NEUTRAL' even when gexIndex is significant (>10 or <-10)
    // Use gexIndex as primary signal for narrative badge
    const gexIdx = components?.gexIndex ?? 0;
    const gammaIsLong = components?.gexLevel === 'LONG_GAMMA' || gexIdx > 10;
    const gammaIsShort = components?.gexLevel === 'SHORT_GAMMA' || gexIdx < -10;

    const getInsightNarrative = (): { text: string; color: string } => {
        // EXTREME CASES
        if (zSignal === 'EXTREME_FEAR_REVERSAL') {
            return locale === 'ko'
                ? { text: '역사적 극단 공포 · 반등 임박', color: '#f59e0b' }
                : locale === 'ja'
                    ? { text: '歴史的極端恐怖 · 反発接近', color: '#f59e0b' }
                    : { text: 'Extreme Fear · Reversal', color: '#f59e0b' };
        }
        if (zSignal === 'EXTREME_OVERHEATED') {
            return locale === 'ko'
                ? { text: '극단적 과열 · 조정 임박', color: '#ef4444' }
                : locale === 'ja'
                    ? { text: '極端過熱 · 調整接近', color: '#ef4444' }
                    : { text: 'Overheated · Correction', color: '#ef4444' };
        }

        // SCORE + GAMMA COMBINATION
        if (normalizedScore <= 30 && gammaIsLong) {
            // Fear extreme BUT institutions defending
            return locale === 'ko'
                ? { text: '공포 극심 · 기관 방어 중', color: '#f59e0b' }
                : locale === 'ja'
                    ? { text: '恐怖極大 · 機関防御中', color: '#f59e0b' }
                    : { text: 'Fear · MM Defending', color: '#f59e0b' };
        }
        if (normalizedScore <= 30 && gammaIsShort) {
            // Fear extreme AND institutions amplifying
            return locale === 'ko'
                ? { text: '공포 + 변동성 증폭 · 위험', color: '#ef4444' }
                : locale === 'ja'
                    ? { text: '恐怖 + 変動性増幅 · 危険', color: '#ef4444' }
                    : { text: 'Fear + Vol Spike', color: '#ef4444' };
        }
        if (normalizedScore <= 30) {
            return locale === 'ko'
                ? { text: '유동성 위축 · 방향성 부재', color: '#f87171' }
                : locale === 'ja'
                    ? { text: '流動性収縮 · 方向性不在', color: '#f87171' }
                    : { text: 'Liquidity Dry · No Dir.', color: '#f87171' };
        }

        if (normalizedScore >= 70 && gammaIsLong) {
            return locale === 'ko'
                ? { text: '모멘텀 확장 · 기관 안정화', color: '#34d399' }
                : locale === 'ja'
                    ? { text: 'モメンタム拡大 · 安定化中', color: '#34d399' }
                    : { text: 'Surge · MM Stable', color: '#34d399' };
        }
        if (normalizedScore >= 70) {
            return locale === 'ko'
                ? { text: '유동성 확장 · 강세 모멘텀', color: '#34d399' }
                : locale === 'ja'
                    ? { text: '流動性拡大 · 強気モメンタム', color: '#34d399' }
                    : { text: 'Expanding · Bullish', color: '#34d399' };
        }

        // REGIME-BASED
        if (regime === 'ROTATION') {
            return locale === 'ko'
                ? { text: '순환매 진행 · 섹터 교체', color: '#818cf8' }
                : locale === 'ja'
                    ? { text: 'ローテーション進行中', color: '#818cf8' }
                    : { text: 'Rotation Active', color: '#818cf8' };
        }
        if (regime === 'PANIC') {
            return locale === 'ko'
                ? { text: '패닉 감지 · 전면 리스크오프', color: '#ef4444' }
                : locale === 'ja'
                    ? { text: 'パニック検知 · 全面リスクオフ', color: '#ef4444' }
                    : { text: 'Panic · Risk-Off', color: '#ef4444' };
        }

        if (normalizedScore <= 40 && gammaIsLong) {
            return locale === 'ko'
                ? { text: '심리 약세 · 기관 흡수 중', color: '#60a5fa' }
                : locale === 'ja'
                    ? { text: '心理弱気 · 機関吸収中', color: '#60a5fa' }
                    : { text: 'Weak · MM Absorbing', color: '#60a5fa' };
        }
        if (normalizedScore <= 40) {
            return locale === 'ko'
                ? { text: '심리 약세 · 관망 구간', color: '#60a5fa' }
                : locale === 'ja'
                    ? { text: '心理弱気 · 様子見', color: '#60a5fa' }
                    : { text: 'Weak · Standby', color: '#60a5fa' };
        }
        if (normalizedScore >= 60) {
            return locale === 'ko'
                ? { text: '심리 개선 · 유동성 유입', color: '#34d399' }
                : locale === 'ja'
                    ? { text: '心理改善 · 流動性流入', color: '#34d399' }
                    : { text: 'Improving · Inflow', color: '#34d399' };
        }

        // NEUTRAL
        return locale === 'ko'
            ? { text: '중립 · 방향성 확인 대기', color: '#94a3b8' }
            : locale === 'ja'
                ? { text: '中立 · 方向性待ち', color: '#94a3b8' }
                : { text: 'Neutral · Standby', color: '#94a3b8' };
    };

    const insight = getInsightNarrative();
    const statusText = insight.text;
    const statusColor = insight.color;

    // Score interpretation helper
    const getInterpretation = (val: number): { text: string; color: string } => {
        if (val >= 80) return { text: t('gauge.robust'), color: '#34d399' };
        if (val >= 60) return { text: t('gauge.healthy'), color: '#6ee7b7' };
        if (val >= 45) return { text: t('gauge.stable'), color: '#94a3b8' };
        if (val >= 30) return { text: t('gauge.caution'), color: '#fbbf24' };
        return { text: t('gauge.weak'), color: '#f87171' };
    };

    // Decomposition data with i18n labels
    const decomposition = components ? [
        {
            label: t('gauge.momentum'),
            score: components.momentumScore,
            icon: TrendingUp,
            color: components.momentumScore >= 55 ? "#34d399" : components.momentumScore <= 45 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.breadth'),
            score: components.breadthScore,
            icon: Globe,
            color: components.breadthScore >= 55 ? "#34d399" : components.breadthScore <= 40 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.priceAction'),
            score: components.priceActionScore,
            icon: BarChart3,
            color: components.priceActionScore >= 55 ? "#34d399" : components.priceActionScore <= 45 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.rotation'),
            score: components.rotationScore,
            icon: Radio,
            color: components.rotationScore >= 55 ? "#34d399" : components.rotationScore <= 40 ? "#f43f5e" : "#94a3b8"
        },
        {
            label: t('gauge.sentiment'),
            score: components.sentimentScore,
            icon: Activity,
            color: components.sentimentScore >= 55 ? "#34d399" : components.sentimentScore <= 45 ? "#f43f5e" : "#94a3b8"
        }
    ] : [];

    // Factor summary: count bullish vs bearish factors
    const factorSummary = useMemo(() => {
        if (!components) return null;
        let bull = 0;
        let bear = 0;
        decomposition.forEach(d => {
            if (d.score >= 60) bull++;
            else if (d.score <= 40) bear++;
        });
        return { bull, bear, total: decomposition.length };
    }, [components, decomposition]);

    // ── ECharts Gauge Option ──
    const gaugeOption = useMemo(() => ({
        series: [
            // Outer decorative ring — gradient arc
            {
                type: 'gauge',
                startAngle: 200,
                endAngle: -20,
                min: 0,
                max: 100,
                radius: '92%',
                center: ['50%', '65%'],
                splitNumber: 10,
                axisLine: {
                    lineStyle: {
                        width: 6,
                        color: [
                            [0.2, '#3b82f6'],    // Oversold — blue
                            [0.4, '#60a5fa'],    // Bearish — light blue
                            [0.5, '#94a3b8'],    // Neutral — slate
                            [0.6, '#34d399'],    // Bullish — emerald
                            [0.8, '#10b981'],    // Strong — green
                            [1, '#f43f5e'],      // Overheated — red
                        ],
                    },
                },
                axisTick: {
                    distance: -12,
                    length: 4,
                    lineStyle: { color: '#475569', width: 1 },
                },
                splitLine: {
                    distance: -14,
                    length: 8,
                    lineStyle: { color: '#475569', width: 1.5 },
                },
                axisLabel: {
                    distance: -22,
                    color: '#64748b',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    formatter: (v: number) => {
                        if (v === 0 || v === 50 || v === 100) return `${v}`;
                        return '';
                    },
                },
                pointer: { show: false },
                detail: { show: false },
            },
            // Main gauge — needle + center display
            {
                type: 'gauge',
                startAngle: 200,
                endAngle: -20,
                min: 0,
                max: 100,
                radius: '80%',
                center: ['50%', '65%'],
                itemStyle: {
                    color: statusColor,
                    shadowColor: `${statusColor}66`,
                    shadowBlur: 12,
                },
                progress: {
                    show: true,
                    roundCap: true,
                    width: 10,
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: '#3b82f6' },
                                { offset: 0.4, color: '#34d399' },
                                { offset: 0.6, color: '#10b981' },
                                { offset: 1, color: '#f43f5e' },
                            ],
                        },
                        shadowColor: 'rgba(52, 211, 153, 0.3)',
                        shadowBlur: 8,
                    },
                },
                axisLine: {
                    roundCap: true,
                    lineStyle: { width: 10, color: [[1, '#1e293b']] },
                },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                pointer: {
                    icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                    length: '55%',
                    width: 8,
                    offsetCenter: [0, '-5%'],
                    itemStyle: {
                        color: statusColor,
                        shadowColor: `${statusColor}44`,
                        shadowBlur: 6,
                        shadowOffsetY: 2,
                    },
                },
                anchor: {
                    show: true,
                    showAbove: true,
                    size: 14,
                    itemStyle: {
                        borderWidth: 3,
                        borderColor: statusColor,
                        color: '#0f172a',
                        shadowColor: `${statusColor}33`,
                        shadowBlur: 8,
                    },
                },
                title: {
                    show: true,
                    offsetCenter: [0, '55%'],
                    fontSize: 12,
                    fontWeight: 900,
                    fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
                    color: statusColor,
                    borderColor: `${statusColor}33`,
                    backgroundColor: `${statusColor}11`,
                    borderWidth: 1,
                    borderRadius: 4,
                    padding: [2, 8, 2, 8],
                },
                detail: {
                    valueAnimation: true,
                    fontSize: 36,
                    fontWeight: 800,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    offsetCenter: [0, '25%'],
                    color: '#ffffff',
                    formatter: loading ? '--' : '{value}',
                },
                data: [{ value: loading ? 0 : Math.round(normalizedScore), name: statusText }],
                animationDuration: 1200,
                animationEasingUpdate: 'cubicOut',
            },
        ],
    }), [normalizedScore, statusText, statusColor, loading]);

    return (
        <div className="flex flex-col items-center h-full relative p-2 pt-1">
            {/* Header — pinned to top */}
            <div className="w-full px-2 mb-0 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-white opacity-70" />
                    <GuardianTooltip sectionId="gravityGauge">
                        <span className="text-xs uppercase tracking-[0.2em] text-white font-black font-jakarta">Gravity Gauge</span>
                    </GuardianTooltip>
                    {session && (
                        <span className={`${session === 'PRE' ? 'text-[12px]' : 'text-[12px]'} font-bold px-1.5 py-0.5 rounded ml-auto whitespace-nowrap ${isHoliday ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            session === 'PRE' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                session === 'REG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    session === 'POST' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                        'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                            }`}>
                            {isHoliday ? 'HOLIDAY' :
                                session === 'PRE' ? t('preMarketEstimate') :
                                    session === 'REG' ? 'LIVE' :
                                        session === 'POST' ? 'AFTER' : 'CLOSED'}
                        </span>
                    )}
                </div>
            </div>

            {/* Content — vertically centered in remaining space */}
            <div className="flex-1 flex flex-col items-center justify-center min-h-0">

            {/* ECharts Gauge */}
            <div className="relative -mt-2 w-full max-w-[280px]" style={{ height: 190 }}>
                <ReactECharts
                    option={gaugeOption}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                />
                {/* RLSI label overlay */}
                <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
                    <span className="text-[14px] font-black uppercase tracking-[4px] text-white/90" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                        RLSI
                    </span>
                </div>
            </div>

            {/* === RLSI DECOMPOSITION BARS === */}
            {components && !loading && (
                <div className="w-full max-w-[290px] border-t border-slate-800/50 pt-2 space-y-[5px]">
                    {decomposition.map((item, idx) => {
                        const Icon = item.icon;
                        const interp = getInterpretation(item.score);
                        return (
                            <div key={idx} className="flex items-center gap-1.5 group">
                                {/* Icon */}
                                <Icon className="w-3 h-3 flex-shrink-0 opacity-60" style={{ color: item.color }} />
                                {/* Label */}
                                <div className="w-[88px] flex-shrink-0">
                                    <div className="text-[12px] font-bold text-white/80 uppercase tracking-wide leading-tight whitespace-nowrap">
                                        {item.label}
                                    </div>
                                </div>
                                {/* Bar */}
                                <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden relative">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${Math.min(100, Math.max(2, item.score))}%`,
                                            background: `linear-gradient(90deg, ${item.color}66, ${item.color})`,
                                            boxShadow: `0 0 6px ${item.color}40`
                                        }}
                                    />
                                    {/* 50% marker */}
                                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600/30" />
                                </div>
                                {/* Score + Interpretation */}
                                <div className="w-[90px] text-right flex-shrink-0 flex items-center justify-end gap-1 whitespace-nowrap">
                                    <span className="text-[12px] font-mono font-bold" style={{ color: item.color }}>
                                        {Math.round(item.score)}
                                    </span>
                                    <span className="text-[12px] font-bold" style={{ color: interp.color }}>
                                        {interp.text}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {/* Factor Summary Row */}
                    {factorSummary && (
                        <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-800/30 mt-1">
                            {factorSummary.bull > 0 && (
                                <div className="flex items-center gap-1">
                                    <ChevronUp className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[12px] font-bold text-emerald-400">
                                        {t('bullish')} ×{factorSummary.bull}
                                    </span>
                                </div>
                            )}
                            {factorSummary.bear > 0 && (
                                <div className="flex items-center gap-1">
                                    <ChevronDown className="w-3 h-3 text-red-400" />
                                    <span className="text-[12px] font-bold text-red-400">
                                        {t('bearish')} ×{factorSummary.bear}
                                    </span>
                                </div>
                            )}
                            {factorSummary.bull === 0 && factorSummary.bear === 0 && (
                                <div className="flex items-center gap-1">
                                    <Minus className="w-3 h-3 text-slate-300" />
                                    <span className="text-[12px] font-bold text-slate-300">
                                        {t('neutral')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Loading state — same layout, just placeholders */}
            {(!components || loading) && (
                <div className="w-full max-w-[290px] border-t border-slate-800/50 pt-2 space-y-[5px]">
                    {['momentum', 'breadth', 'priceAction', 'rotation', 'sentiment'].map((key) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-slate-800 animate-pulse flex-shrink-0" />
                            <div className="flex-shrink-0">
                                <div className="text-[12px] font-bold text-slate-300 uppercase tracking-wide whitespace-nowrap">
                                    {t(`gauge.${key}` as 'gauge.momentum')}
                                </div>
                            </div>
                            <div className="flex-1 h-[5px] bg-slate-800/80 rounded-full overflow-hidden">
                                <div className="h-full w-0 rounded-full bg-slate-700" />
                            </div>
                            <div className="w-[90px] text-right flex-shrink-0">
                                <span className="text-[12px] font-mono text-slate-300">--</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {/* [V10.0] Guardian Score Timeline — ECG-style with insights */}
            {rlsiHistory && rlsiHistory.length >= 2 && !loading && (
                <div className="w-full max-w-[290px] border-t border-slate-800/50 pt-2 mt-1">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-slate-300 font-jakarta">SCORE TIMELINE</span>
                        <span className="text-[12px] font-mono text-slate-300 font-jakarta">{rlsiHistory.length} pts</span>
                    </div>
                    <ScoreTimeline history={rlsiHistory} currentScore={animatedScore} />
                </div>
            )}

            {/* Trend Insight — full card width */}
            {rlsiHistory && rlsiHistory.length >= 4 && !loading && (
                <TimelineInsight history={rlsiHistory} />
            )}
            </div>

            {/* === FOMC FedWatch — outside items-center for full width === */}
            <FedWatchMini />

        </div>
    );
}

// [V10.0] Guardian Score Timeline — ECG-Style Premium Component
function ScoreTimeline({ history, currentScore }: { history: { time: string; score: number }[]; currentScore: number }) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const W = 280;
    const H = 56;
    const PAD_TOP = 6;
    const PAD_BOT = 6;
    const drawH = H - PAD_TOP - PAD_BOT;

    const scores = history.map(h => h.score);
    const minScore = Math.max(0, Math.min(...scores) - 5);
    const maxScore = Math.min(100, Math.max(...scores) + 5);
    const range = maxScore - minScore || 1;

    // Build SVG points
    const points = history.map((h, i) => {
        const x = (i / (history.length - 1)) * W;
        const y = PAD_TOP + drawH - ((h.score - minScore) / range) * drawH;
        return { x, y, score: h.score, time: h.time };
    });

    // Zone color by RLSI score
    const getZoneColor = (s: number) => {
        if (s >= 70) return '#34d399';   // Bullish — emerald
        if (s >= 55) return '#6ee7b7';   // Mild bull — light emerald
        if (s >= 45) return '#94a3b8';   // Neutral — slate
        if (s >= 30) return '#fbbf24';   // Cautious — amber
        return '#f87171';                 // Bearish — red
    };

    // Create colored line segments
    const segments: { path: string; color: string }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const avgScore = (p1.score + p2.score) / 2;
        segments.push({
            path: `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`,
            color: getZoneColor(avgScore),
        });
    }

    // Fill path for gradient area
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L${W},${PAD_TOP + drawH} L0,${PAD_TOP + drawH} Z`;

    // Last point for pulse
    const lastPoint = points[points.length - 1];
    const lastColor = getZoneColor(currentScore);

    // Hovered point
    const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

    // Time format
    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };



    // Zone borders for background bands
    const scoreToY = (s: number) => PAD_TOP + drawH - ((s - minScore) / range) * drawH;
    const zoneWarnTop = Math.max(PAD_TOP, scoreToY(Math.min(maxScore, 60)));
    const zoneWarnBot = Math.min(PAD_TOP + drawH, scoreToY(Math.max(minScore, 40)));
    const showZoneBands = maxScore > 40 && minScore < 60;

    // [FORENSIC] Percentile bands — historical distribution context
    const sortedScores = [...scores].sort((a, b) => a - b);
    const getPercentile = (p: number) => {
        const idx = Math.max(0, Math.min(sortedScores.length - 1, Math.floor(sortedScores.length * p / 100)));
        return sortedScores[idx];
    };
    const p5 = getPercentile(5);
    const p25 = getPercentile(25);
    const p75 = getPercentile(75);
    const p95 = getPercentile(95);
    const showPercentiles = scores.length >= 5; // Need minimum data

    return (
        <div className="relative">
            {/* Score labels */}
            <div className="absolute right-0 top-0 -mr-1 flex flex-col justify-between h-[56px] items-end pointer-events-none" style={{ transform: 'translateX(100%)', paddingLeft: '4px' }}>
                <span className="text-[12px] font-mono font-semibold text-slate-300 leading-none">{maxScore}</span>
                <span className="text-[12px] font-mono font-semibold text-slate-300 leading-none">{minScore}</span>
            </div>

            {/* SVG Chart */}
            <svg
                width="100%"
                height={H}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="overflow-visible cursor-crosshair"
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = ((e.clientX - rect.left) / rect.width) * W;
                    const closest = points.reduce((best, p, i) =>
                        Math.abs(p.x - relX) < Math.abs(points[best].x - relX) ? i : best, 0);
                    setHoveredIdx(closest);
                }}
                onMouseLeave={() => setHoveredIdx(null)}
            >
                <defs>
                    <linearGradient id="ecgFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lastColor} stopOpacity="0.12" />
                        <stop offset="100%" stopColor={lastColor} stopOpacity="0.01" />
                    </linearGradient>
                    <filter id="ecgGlow">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Neutral zone band (40-60) */}
                {showZoneBands && (
                    <rect
                        x={0} y={zoneWarnTop}
                        width={W} height={Math.max(0, zoneWarnBot - zoneWarnTop)}
                        fill="rgba(148,163,184,0.04)"
                        rx={2}
                    />
                )}

                {/* [FORENSIC] Percentile distribution bands */}
                {showPercentiles && (
                    <>
                        {/* P5–P95 outer band — very faint */}
                        <rect
                            x={0} y={scoreToY(Math.min(p95, maxScore))}
                            width={W}
                            height={Math.max(0, scoreToY(Math.max(p5, minScore)) - scoreToY(Math.min(p95, maxScore)))}
                            fill="rgba(99,102,241,0.05)"
                            rx={1}
                        />
                        {/* P25–P75 inner band — slightly stronger */}
                        <rect
                            x={0} y={scoreToY(Math.min(p75, maxScore))}
                            width={W}
                            height={Math.max(0, scoreToY(Math.max(p25, minScore)) - scoreToY(Math.min(p75, maxScore)))}
                            fill="rgba(99,102,241,0.08)"
                            rx={1}
                        />
                        {/* Dashed lines at P5, P25, P75, P95 */}
                        {[
                            { val: p95, label: 'P95' },
                            { val: p75, label: 'P75' },
                            { val: p25, label: 'P25' },
                            { val: p5, label: 'P5' },
                        ].map(({ val, label }) => {
                            const y = scoreToY(Math.max(minScore, Math.min(maxScore, val)));
                            return (
                                <g key={label}>
                                    <line x1={0} y1={y} x2={W} y2={y}
                                        stroke="rgba(129,140,248,0.2)" strokeWidth="0.5" strokeDasharray="2 4" />
                                    <text x={W - 2} y={y - 2}
                                        textAnchor="end" fill="rgba(129,140,248,0.4)"
                                        fontSize="7" fontFamily="monospace" fontWeight="600">
                                        {label}
                                    </text>
                                </g>
                            );
                        })}
                    </>
                )}

                {/* Grid lines */}
                <line x1="0" y1={PAD_TOP} x2={W} y2={PAD_TOP} stroke="rgba(148,163,184,0.12)" strokeWidth="0.5" />
                <line x1="0" y1={PAD_TOP + drawH / 2} x2={W} y2={PAD_TOP + drawH / 2} stroke="rgba(148,163,184,0.08)" strokeWidth="0.5" strokeDasharray="3 6" />
                <line x1="0" y1={PAD_TOP + drawH} x2={W} y2={PAD_TOP + drawH} stroke="rgba(148,163,184,0.12)" strokeWidth="0.5" />

                {/* Gradient fill */}
                <path d={fillPath} fill="url(#ecgFill)" />

                {/* Zone-colored line segments */}
                {segments.map((seg, i) => (
                    <path
                        key={i}
                        d={seg.path}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={hoveredIdx !== null && (hoveredIdx !== i && hoveredIdx !== i + 1) ? 0.4 : 1}
                    />
                ))}

                {/* Hover crosshair + dot */}
                {hoveredPoint && (
                    <>
                        <line x1={hoveredPoint.x} y1={PAD_TOP} x2={hoveredPoint.x} y2={PAD_TOP + drawH} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2 3" />
                        <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="3.5" fill={getZoneColor(hoveredPoint.score)} stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
                    </>
                )}

                {/* Current point — pulse animation */}
                {lastPoint && (
                    <>
                        <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill="none" stroke={lastColor} strokeWidth="0.5" opacity="0.3">
                            <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill={lastColor} filter="url(#ecgGlow)" />
                    </>
                )}
            </svg>

            {/* Hover tooltip */}
            {hoveredPoint && hoveredIdx !== null && (
                <div
                    className="absolute pointer-events-none z-10 px-2 py-1 rounded bg-slate-900/95 border border-slate-700/60 shadow-lg backdrop-blur-sm"
                    style={{
                        left: `${Math.min(78, Math.max(2, (hoveredPoint.x / W) * 100))}%`,
                        top: '-28px',
                        transform: 'translateX(-50%)',
                    }}
                >
                    <span className="text-[12px] font-mono font-bold" style={{ color: getZoneColor(hoveredPoint.score) }}>
                        {Math.round(hoveredPoint.score)}
                    </span>
                    <span className="text-[12px] font-mono text-slate-400 ml-1.5">
                        {formatTime(hoveredPoint.time)}
                    </span>
                </div>
            )}

            {/* Time labels */}
            <div className="flex justify-between mt-1 px-0.5">
                <span className="text-[12px] font-mono font-medium text-slate-300">{formatTime(history[0].time)}</span>
                {history.length > 10 && (
                    <span className="text-[12px] font-mono font-medium text-slate-300">{formatTime(history[Math.floor(history.length / 2)].time)}</span>
                )}
                <span className="text-[12px] font-mono font-bold text-slate-200">NOW</span>
            </div>
        </div>
    );
}

// [V10.0] Timeline Insight — Full-Width Premium Narrative
function TimelineInsight({ history }: { history: { time: string; score: number }[] }) {
    const locale = useLocale();
    const scores = history.map(h => h.score);

    const insight = useMemo(() => {
        if (scores.length < 4) return null;
        const recent5 = scores.slice(-5);
        const older5 = scores.slice(-10, -5);
        const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
        const olderAvg = older5.length > 0 ? older5.reduce((a, b) => a + b, 0) / older5.length : recentAvg;
        const delta = recentAvg - olderAvg;
        const dayHigh = Math.max(...scores);
        const dayLow = Math.min(...scores);
        const volatility = dayHigh - dayLow;

        let direction: 'rising' | 'falling' | 'stable';
        let icon: string;
        let color: string;

        if (delta > 3) { direction = 'rising'; icon = '▲'; color = '#34d399'; }
        else if (delta < -3) { direction = 'falling'; icon = '▼'; color = '#f87171'; }
        else { direction = 'stable'; icon = '─'; color = '#94a3b8'; }

        const d = Math.abs(delta).toFixed(1);
        const vol = volatility >= 15 ? 'high' : volatility >= 8 ? 'mid' : 'low';

        let text: string;
        if (locale === 'ko') {
            const vk = vol === 'high' ? '변동성 확대' : vol === 'mid' ? '보통 변동' : '안정적 흐름';
            if (direction === 'rising') text = `시장 심리 개선 중 (+${d}pt) · 일중 ${dayLow}→${dayHigh} · ${vk}`;
            else if (direction === 'falling') text = `시장 심리 약화 중 (-${d}pt) · 일중 ${dayHigh}→${dayLow} · ${vk}`;
            else text = `시장 심리 횡보 (±${d}pt) · 일중 ${dayLow}~${dayHigh} · ${vk}`;
        } else if (locale === 'ja') {
            const vj = vol === 'high' ? '変動拡大' : vol === 'mid' ? '通常変動' : '安定推移';
            if (direction === 'rising') text = `市場心理が改善中 (+${d}pt) · 日中 ${dayLow}→${dayHigh} · ${vj}`;
            else if (direction === 'falling') text = `市場心理が弱含み (-${d}pt) · 日中 ${dayHigh}→${dayLow} · ${vj}`;
            else text = `市場心理は横ばい (±${d}pt) · 日中 ${dayLow}~${dayHigh} · ${vj}`;
        } else {
            const ve = vol === 'high' ? 'Elevated volatility' : vol === 'mid' ? 'Normal fluctuation' : 'Steady flow';
            if (direction === 'rising') text = `Sentiment improving (+${d}pt) · Range ${dayLow}→${dayHigh} · ${ve}`;
            else if (direction === 'falling') text = `Sentiment weakening (-${d}pt) · Range ${dayHigh}→${dayLow} · ${ve}`;
            else text = `Sentiment ranging (±${d}pt) · Range ${dayLow}~${dayHigh} · ${ve}`;
        }

        return { icon, color, text };
    }, [scores, locale]);

    if (!insight) return null;

    return (
        <div className="w-full px-2 mt-1.5">
            <div className="px-2.5 py-1.5 rounded bg-slate-800/30 border border-slate-700/20">
                <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[12px] font-bold flex-shrink-0" style={{ color: insight.color }}>
                        {insight.icon}
                    </span>
                    <span className="text-[12px] text-slate-300 whitespace-nowrap">
                        {insight.text}
                    </span>
                </div>
            </div>
        </div>
    );
}

// [V14] FOMC FedWatch — Compact premium card, CSS gradient bar, no ECharts
function FedWatchMini() {
    const locale = useLocale();
    const [data, setData] = useState<{
        ease: number; noChange: number; hike: number;
        prevEase?: number; prevNoChange?: number; prevHike?: number;
        targetRate?: string | null; daysUntilFomc?: number | null;
        nextMeetingDate?: string | null; scrapedAt?: string;
    } | null>(null);

    useEffect(() => {
        fetch('/api/guardian/fedwatch')
            .then(r => r.json())
            .then(d => { if (d && typeof d.noChange === 'number' && (d.noChange > 0 || d.hike > 0 || d.ease > 0 || d.targetRate || d.daysUntilFomc)) setData(d); })
            .catch(() => {});
    }, []);

    const L = locale === 'ko'
        ? { cut: '인하', hold: '동결', hike: '인상', target: '목표 금리' }
        : locale === 'ja'
            ? { cut: '利下げ', hold: '据置', hike: '利上げ', target: '目標金利' }
            : { cut: 'CUT', hold: 'HOLD', hike: 'HIKE', target: 'Target' };

    if (!data) return null;
    const total = data.ease + data.noChange + data.hike;
    // Show component even if probabilities are 0, as long as metadata exists
    if (total === 0 && !data.targetRate && !data.daysUntilFomc) return null;

    const fresh = data.scrapedAt ? (() => {
        const m = Math.floor((Date.now() - new Date(data.scrapedAt).getTime()) / 60000);
        if (m < 5) return locale === 'ko' ? '방금' : 'NOW';
        if (m < 60) return `${m}${locale === 'ko' ? '분 전' : 'm ago'}`;
        const h = Math.floor(m / 60);
        return h < 24 ? `${h}${locale === 'ko' ? '시간 전' : 'h ago'}` : `${Math.floor(h / 24)}${locale === 'ko' ? '일 전' : 'd ago'}`;
    })() : '';

    const chg = (cur: number, prev?: number) => {
        if (prev == null) return null;
        const d = cur - prev;
        if (Math.abs(d) < 0.1) return null;
        return { arrow: d > 0 ? '▲' : '▼', val: Math.abs(d).toFixed(1), color: d > 0 ? '#34d399' : '#f87171' };
    };

    // Dominant probability
    const dom = data.noChange >= data.hike && data.noChange >= data.ease
        ? { lbl: L.hold, pct: data.noChange, clr: '#cbd5e1', grad: 'from-slate-400 to-slate-500' }
        : data.hike > data.ease
            ? { lbl: L.hike, pct: data.hike, clr: '#f87171', grad: 'from-rose-400 to-rose-500' }
            : { lbl: L.cut, pct: data.ease, clr: '#60a5fa', grad: 'from-blue-400 to-blue-500' };

    // Bar segments
    const segments = [
        { lbl: L.cut, pct: data.ease, clr: '#3b82f6', bg: 'rgba(59,130,246,0.8)', delta: chg(data.ease, data.prevEase) },
        { lbl: L.hold, pct: data.noChange, clr: '#94a3b8', bg: 'rgba(148,163,184,0.6)', delta: chg(data.noChange, data.prevNoChange) },
        { lbl: L.hike, pct: data.hike, clr: '#ef4444', bg: 'rgba(239,68,68,0.8)', delta: chg(data.hike, data.prevHike) },
    ].filter(s => s.pct > 0);

    return (
        <div className="w-full self-stretch mt-1 mb-1 px-2">
            <div className="relative rounded-lg border border-slate-600/40 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(15,23,42,0.95) 40%, rgba(6,182,212,0.03) 100%)', boxShadow: '0 0 12px rgba(99,102,241,0.12), 0 0 4px rgba(6,182,212,0.08)' }}>
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                <div className="relative z-10 px-4 py-2.5">
                    {/* Row 1: Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Landmark className="w-3.5 h-3.5 text-indigo-400/60" />
                            <span className="text-[13px] font-black uppercase tracking-[0.15em] text-white/80 font-jakarta">FEDWATCH</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {data.targetRate && (
                                <span className="text-[12px] font-mono text-slate-300">{data.targetRate} bps</span>
                            )}
                            {data.daysUntilFomc && (
                                <span className="text-[12px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-400">
                                    FOMC D-{data.daysUntilFomc}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Row 2: Dominant number left + Stacked bar right */}
                    <div className="flex items-center gap-4">
                        {/* Left: Big dominant % */}
                        <div className="flex-shrink-0">
                            <div className="text-[28px] font-mono font-black leading-none tabular-nums" style={{ color: dom.clr }}>
                                {dom.pct}<span className="text-[16px] text-slate-400">%</span>
                            </div>
                            <div className="text-[12px] font-bold text-slate-300 mt-0.5 tracking-wide">{dom.lbl}</div>
                        </div>

                        {/* Right: Stacked horizontal bar + labels */}
                        <div className="flex-1 min-w-0">
                            {/* Gradient stacked bar */}
                            <div className="flex w-full h-2 rounded-full overflow-hidden gap-px bg-slate-800">
                                {segments.map((seg, i) => (
                                    <div key={i} className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${(seg.pct / total) * 100}%`, background: seg.bg }} />
                                ))}
                            </div>
                            {/* Labels below bar */}
                            <div className="flex items-center justify-between mt-1.5">
                                {segments.map((seg, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: seg.clr }} />
                                        <span className="text-[12px] font-bold" style={{ color: seg.clr }}>{seg.lbl}</span>
                                        <span className="text-[13px] font-mono font-bold text-slate-300">{seg.pct}%</span>
                                        {seg.delta && (
                                            <span className="text-[12px] font-mono font-bold" style={{ color: seg.delta.color }}>
                                                {seg.delta.arrow}{seg.delta.val}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
