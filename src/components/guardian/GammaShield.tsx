'use client';

import React from 'react';
import type { GammaShieldData } from '@/services/guardian/gammaShieldEngine';
import { Shield, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import { useLocale } from 'next-intl';

// === i18n Text Map ===
type Locale = 'ko' | 'en' | 'ja';
const T: Record<string, Record<Locale, string>> = {
    collecting: {
        ko: '옵션 데이터 수집 중...',
        en: 'Collecting options data...',
        ja: 'オプションデータ収集中...',
    },
    triggerCollecting: {
        ko: '데이터 수집 중...',
        en: 'Loading...',
        ja: 'データ収集中...',
    },
    squeezeWarning: {
        ko: '급변동 경고',
        en: 'Volatility Alert',
        ja: '急変動警告',
    },
    // Dynamic insight texts
    squeezeCritical: {
        ko: '옵션 매도자 손절 임박 — 급격한 움직임 대비',
        en: 'Options sellers near forced exits — brace for sharp moves',
        ja: 'オプション売り手の損切り迫る — 急変動に備え',
    },
    resistNear: {
        ko: 'S&P 옵션 벽 {val} 근접 — 돌파 시 급등, 실패 시 반락',
        en: 'S&P options wall {val} nearby — breakout rally or rejection dip',
        ja: 'S&P オプション壁 {val} 接近 — 突破で急騰、失敗で反落',
    },
    supportNear: {
        ko: 'S&P 옵션 지지 {val} 근접 — 반등 또는 이탈 주시',
        en: 'S&P options floor {val} nearby — watch for bounce or breakdown',
        ja: 'S&P オプション支持 {val} 接近 — 反発または離脱注視',
    },
    longGamma: {
        ko: '대형 기관이 하락 방어 중 — 급락 가능성 낮음',
        en: 'Major institutions defending downside — low crash risk',
        ja: '大型機関が下落防御中 — 急落の可能性低い',
    },
    longGammaButSelling: {
        ko: '기관 감마 방어 중이나 매도 압력 우세 — 점진적 하락 주의',
        en: 'Gamma cushion active but sell pressure dominant — gradual decline risk',
        ja: 'ガンマ防御中も売り圧力優勢 — 段階的な下落に注意',
    },
    shortGamma: {
        ko: '기관 헤지가 변동을 키우는 중 — 급등락 주의',
        en: 'Institutional hedging amplifying swings — watch for sharp moves',
        ja: '機関ヘッジが変動を拡大中 — 急騰落に注意',
    },
    shortGammaDropping: {
        ko: 'Short Gamma + 시장 하락 — 딜러 매도 증폭 구간, 포지션 축소 필요',
        en: 'Short Gamma + market dropping — dealer selling amplified, reduce exposure',
        ja: 'ショートガンマ + 市場下落 — ディーラー売り増幅、ポジション縮小推奨',
    },
    squeezeBuilding: {
        ko: 'Squeeze {val}% — 45% 돌파 시 변동성 극대화 구간, 현재 경계 레벨',
        en: 'Squeeze {val}% — volatility extreme zone above 45%, currently at warning level',
        ja: 'Squeeze {val}% — 45%突破時ボラティリティ極大化圈、現在警戒レベル',
    },
    neutral: {
        ko: '옵션 시장 균형 — 큰 변동 없이 횡보 가능성',
        en: 'Options market balanced — sideways movement likely',
        ja: 'オプション市場均衡 — 大きな変動なく横ばいの可能性',
    },
};

function t(key: string, locale: Locale, vars?: Record<string, string>): string {
    const text = T[key]?.[locale] || T[key]?.['en'] || key;
    if (!vars) return text;
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);
}

interface Props {
    data: GammaShieldData | null | undefined;
    isMarketActive: boolean;
}

// === GEX Gauge Colors ===
function getGexColor(index: number): string {
    if (index >= 40) return 'text-emerald-400';
    if (index >= 20) return 'text-emerald-300';
    if (index >= -20) return 'text-slate-300';
    if (index >= -40) return 'text-amber-400';
    return 'text-red-400';
}

function getGexBarGradient(index: number): string {
    if (index >= 40) return 'from-emerald-500 to-emerald-400';
    if (index >= 20) return 'from-emerald-500/80 to-emerald-400/80';
    if (index >= -20) return 'from-slate-500 to-slate-400';
    if (index >= -40) return 'from-amber-500 to-amber-400';
    return 'from-red-600 to-red-400';
}

function getGexBgGlow(index: number): string {
    if (index >= 40) return 'shadow-[0_0_30px_rgba(52,211,153,0.15)]';
    if (index >= 20) return 'shadow-[0_0_20px_rgba(52,211,153,0.08)]';
    if (index >= -20) return '';
    if (index >= -40) return 'shadow-[0_0_20px_rgba(245,158,11,0.12)]';
    return 'shadow-[0_0_30px_rgba(239,68,68,0.2)]';
}

// === Squeeze Colors ===
function getSqueezeColor(level: string): string {
    switch (level) {
        case 'EXTREME': return 'text-red-400';
        case 'HIGH': return 'text-amber-400';
        case 'MEDIUM': return 'text-yellow-300';
        default: return 'text-emerald-400';
    }
}

function getSqueezeBadgeBg(level: string): string {
    switch (level) {
        case 'EXTREME': return 'bg-red-500/20 border-red-500/40';
        case 'HIGH': return 'bg-amber-500/20 border-amber-500/40';
        case 'MEDIUM': return 'bg-yellow-500/20 border-yellow-500/40';
        default: return 'bg-emerald-500/20 border-emerald-500/40';
    }
}

// === Squeeze Ring SVG ===
function SqueezeRing({ value, level }: { value: number; level: string }) {
    const circumference = 2 * Math.PI * 24;
    const offset = circumference - (Math.min(100, value) / 100) * circumference;
    const strokeColor = level === 'EXTREME' ? '#f87171' :
        level === 'HIGH' ? '#fbbf24' :
            level === 'MEDIUM' ? '#fde047' : '#34d399';

    return (
        <svg width="64" height="64" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24"
                fill="none" stroke="rgba(100,116,139,0.2)" strokeWidth="3" />
            <circle cx="28" cy="28" r="24"
                fill="none" stroke={strokeColor} strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform="rotate(-90 28 28)"
                className="transition-all duration-700"
            />
        </svg>
    );
}

// === Trigger Band Visualization ===
function TriggerBand({
    support, current, resistance, locale
}: { support: number | null; current: number | null; resistance: number | null; locale: Locale }) {
    if (!support || !current || !resistance || resistance <= support) {
        return (
            <div className="text-[12px] text-slate-400 font-jakarta text-center">
                {t('triggerCollecting', locale)}
            </div>
        );
    }

    const range = resistance - support;
    const position = Math.max(0, Math.min(100, ((current - support) / range) * 100));

    return (
        <div className="flex flex-col gap-1.5">
            {/* Resistance */}
            <div className="flex items-center justify-between">
                <span className="text-[12px] font-jakarta text-red-400 tracking-wide">RESISTANCE</span>
                <span className="text-[13px] font-black font-jakarta text-red-400 tabular-nums">
                    {resistance.toLocaleString()}
                </span>
            </div>

            {/* Visual bar */}
            <div className="relative h-[28px] rounded-md bg-slate-800/60 border border-slate-700/40 overflow-hidden">
                {/* Gradient background */}
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/8 via-transparent to-red-500/8" />

                {/* Current position indicator */}
                <div
                    className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center transition-all duration-700"
                    style={{ bottom: `${position}%`, transform: `translateX(-50%) translateY(50%)` }}
                >
                    <div className="w-2.5 h-2.5 rotate-45 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
                </div>

                {/* Current price label */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[13px] font-black font-jakarta text-white/90 tabular-nums bg-slate-900/60 px-2 py-0.5 rounded">
                        {current.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Support */}
            <div className="flex items-center justify-between">
                <span className="text-[12px] font-jakarta text-emerald-400 tracking-wide">SUPPORT</span>
                <span className="text-[13px] font-black font-jakarta text-emerald-400 tabular-nums">
                    {support.toLocaleString()}
                </span>
            </div>
        </div>
    );
}

// === Directional Insight Generator (v3) ===
function getInsightText(
    gexIndex: number,
    squeezeRisk: number,
    currentPrice: number | null,
    supportWall: number | null,
    resistanceWall: number | null,
    locale: Locale
): string {
    // If no price data, fallback
    if (!currentPrice) return t('neutral', locale);

    const sp = currentPrice.toLocaleString();
    const sup = supportWall && supportWall > 0 ? supportWall.toLocaleString() : null;
    const res = resistanceWall && resistanceWall > 0 ? resistanceWall.toLocaleString() : null;
    const distDown = supportWall && supportWall > 0 ? (((currentPrice - supportWall) / currentPrice) * 100).toFixed(1) : null;
    const distUp = resistanceWall && resistanceWall > 0 ? (((resistanceWall - currentPrice) / currentPrice) * 100).toFixed(1) : null;

    // GEX strength label
    const gexStr = (l: Locale) => {
        if (gexIndex <= -30) return { ko: '매도 증폭', en: 'sell amplified', ja: '売り増幅' }[l];
        if (gexIndex <= -20) return { ko: '숏 감마', en: 'short gamma', ja: 'ショートガンマ' }[l];
        if (gexIndex < 20) return { ko: '감마 약', en: 'weak gamma', ja: 'ガンマ弱' }[l];
        if (gexIndex < 40) return { ko: '감마 방어', en: 'gamma defense', ja: 'ガンマ防御' }[l];
        return { ko: '감마 강', en: 'strong gamma', ja: 'ガンマ強' }[l];
    };

    // Priority 1: Squeeze critical (≥55%)
    if (squeezeRisk >= 55 && sup && res) {
        const base = {
            ko: `S&P ${sp} — Squeeze ${squeezeRisk}% 변동성 임계, 이탈 방향 급가속 · ${sup}↔${res}`,
            en: `S&P ${sp} — Squeeze ${squeezeRisk}% volatility critical, breakout accelerates · ${sup}↔${res}`,
            ja: `S&P ${sp} — Squeeze ${squeezeRisk}%急変動迫る、突破方向急加速 · ${sup}↔${res}`
        };
        return base[locale];
    }

    // Priority 2: Short Gamma danger (≤-20) — directional with emphasis on downside
    if (gexIndex <= -20 && sup && distDown) {
        const base = {
            ko: `S&P ${sp} — ${gexStr(locale)}(${gexIndex}), ▼${sup}(-${distDown}%) 급락 경고${res ? ` · 상한 ${res}` : ''}`,
            en: `S&P ${sp} — ${gexStr(locale)}(${gexIndex}), ▼${sup}(-${distDown}%) crash warning${res ? ` · cap ${res}` : ''}`,
            ja: `S&P ${sp} — ${gexStr(locale)}(${gexIndex}), ▼${sup}(-${distDown}%) 急落警告${res ? ` · 上限 ${res}` : ''}`
        };
        return base[locale];
    }

    // Priority 3: Directional bias based on GEX + price targets
    if (sup && res && distDown && distUp) {
        // Strong upside bias (GEX ≥ 40)
        if (gexIndex >= 40) {
            const base = {
                ko: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), ▲${res}(+${distUp}%) 상방 편향 · 하한 ${sup}`,
                en: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), ▲${res}(+${distUp}%) upside bias · floor ${sup}`,
                ja: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), ▲${res}(+${distUp}%) 上方偏向 · 下限 ${sup}`
            };
            return base[locale];
        }
        // Mild upside bias (GEX 20-39)
        if (gexIndex >= 20) {
            const base = {
                ko: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), ▲${res}(+${distUp}%) 돌파 시도 예상 · 하한 ${sup}`,
                en: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), ▲${res}(+${distUp}%) breakout attempt · floor ${sup}`,
                ja: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), ▲${res}(+${distUp}%) 突破試行予想 · 下限 ${sup}`
            };
            return base[locale];
        }
        // Weak/neutral GEX (−19 to +19) — downside bias
        const gexSign = gexIndex >= 0 ? `+${gexIndex}` : `${gexIndex}`;
        // Add squeeze context if meaningful
        const sqCtx = squeezeRisk >= 30
            ? { ko: `, Squeeze ${squeezeRisk}%`, en: `, Squeeze ${squeezeRisk}%`, ja: `, Squeeze ${squeezeRisk}%` }[locale]
            : '';
        const base = {
            ko: `S&P ${sp} — ${gexStr(locale)}(${gexSign})${sqCtx}, ▼${sup}(-${distDown}%) 하방 편향 · 상한 ${res}`,
            en: `S&P ${sp} — ${gexStr(locale)}(${gexSign})${sqCtx}, ▼${sup}(-${distDown}%) downside bias · cap ${res}`,
            ja: `S&P ${sp} — ${gexStr(locale)}(${gexSign})${sqCtx}, ▼${sup}(-${distDown}%) 下方偏向 · 上限 ${res}`
        };
        return base[locale];
    }

    // Fallback if missing support/resistance
    return t('neutral', locale);
}

// === Main Component ===
export default function GammaShield({ data, isMarketActive }: Props) {
    const rawLocale = useLocale();
    const locale: Locale = (rawLocale === 'ko' || rawLocale === 'en' || rawLocale === 'ja') ? rawLocale : 'en';

    if (!data) {
        return (
            <div className="bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-700/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <span className="text-[14px] font-black font-jakarta tracking-wider text-slate-200">
                        GAMMA SHIELD
                    </span>
                </div>
                <div className="flex items-center justify-center h-[120px] text-[13px] text-slate-400 font-jakarta">
                    {isMarketActive ? t('collecting', locale) : 'Regular Session Only'}
                </div>
            </div>
        );
    }

    const { gexIndex, gexLevel, gexLabel, squeezeRisk, squeezeLevel, supportWall, resistanceWall, currentPrice, gammaFlipPoint, confidence, prevGexIndex, gexChange, spyGexIndex, qqqGexIndex, spySqueezeScore = 0, qqqSqueezeScore = 0 } = data;

    return (
        <div className={`
            bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-800/30
            backdrop-blur-xl rounded-xl
            border border-slate-700/30
            ${getGexBgGlow(gexIndex)}
            transition-all duration-500
        `}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Shield className={`w-4 h-4 shrink-0 ${gexIndex >= 0 ? 'text-cyan-400' : 'text-amber-400'}`} />
                    <span className="text-[14px] font-black font-jakarta tracking-[0.08em] text-slate-200 shrink-0">
                        GAMMA SHIELD
                    </span>
                    <span className={`text-[12px] font-bold font-jakarta px-1.5 py-0.5 rounded-sm border shrink-0 ${confidence === 'HIGH' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : confidence === 'MEDIUM' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-slate-300 border-slate-500/30 bg-slate-500/10'}`}>
                        {confidence}
                    </span>
                    <span className="text-[13px] font-jakarta text-slate-300 truncate">
                        · {getInsightText(gexIndex, squeezeRisk, currentPrice, supportWall, resistanceWall, locale)}
                    </span>
                </div>
                <span className={`text-[12px] font-bold font-jakarta px-2 py-0.5 rounded border shrink-0 ml-2 ${isMarketActive ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 animate-pulse' : 'text-slate-400 border-slate-600/30 bg-slate-600/10'}`}>
                    {isMarketActive ? '● LIVE' : 'STANDBY'}
                </span>
            </div>

            {/* Content Grid — 3 columns */}
            <div className="grid grid-cols-3 gap-3 px-4 pb-4">

                {/* Column 1: GEX Pressure Index */}
                <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] font-bold font-jakarta tracking-[0.10em] text-slate-300 uppercase">
                        Gamma Pressure
                    </span>

                    <div className={`text-[28px] font-black font-jakarta tabular-nums leading-none ${getGexColor(gexIndex)}`}>
                        {gexIndex >= 0 ? '+' : ''}{gexIndex}
                    </div>

                    {/* Level Badge */}
                    <div className={`text-[12px] font-bold font-jakarta px-2 py-0.5 rounded-sm border ${gexLevel === 'LONG_GAMMA' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : gexLevel === 'SHORT_GAMMA' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-slate-300 border-slate-600/30 bg-slate-600/10'}`}>
                        {gexLevel.replace('_', ' ')}
                    </div>

                    {/* GEX Bar */}
                    <div className="w-full max-w-[160px]">
                        <div className="relative h-[6px] rounded-full bg-slate-800 overflow-hidden">
                            <div
                                className={`absolute h-full rounded-full bg-gradient-to-r ${getGexBarGradient(gexIndex)} transition-all duration-700`}
                                style={{
                                    left: gexIndex >= 0 ? '50%' : `${50 + (gexIndex / 2)}%`,
                                    width: `${Math.abs(gexIndex) / 2}%`,
                                }}
                            />
                            {/* Center marker */}
                            <div className="absolute left-1/2 top-0 w-[1px] h-full bg-slate-500/60" />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[12px] font-jakarta text-red-400/70">-100</span>
                            <span className="text-[12px] font-jakarta text-slate-400">0</span>
                            <span className="text-[12px] font-jakarta text-emerald-400/70">+100</span>
                        </div>
                    </div>

                    {/* Label + Description */}
                    <span className="text-[12px] font-jakarta text-slate-300 mt-0.5">
                        {gexLabel}
                    </span>

                    {/* v2: GEX Trend */}
                    {gexChange !== null && (
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[12px] font-black font-jakarta tabular-nums ${gexChange > 0 ? 'text-emerald-400' : gexChange < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                {gexChange > 0 ? `▲${gexChange}` : gexChange < 0 ? `▼${Math.abs(gexChange)}` : '±0'}
                            </span>
                            <span className="text-[12px] font-jakarta text-slate-300">vs prev</span>
                        </div>
                    )}

                    {/* v2: SPY / QQQ Split */}
                    <div className="w-full max-w-[160px] mt-1">
                        <div className="flex items-center justify-between gap-1">
                            <span className="text-[12px] font-bold font-jakarta text-slate-300 w-[26px]">SPY</span>
                            <div className="flex-1 h-[4px] rounded-full bg-slate-800 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${spyGexIndex >= 0 ? 'bg-emerald-400/70' : 'bg-red-400/70'}`}
                                    style={{ width: `${Math.min(100, Math.abs(spyGexIndex))}%`, marginLeft: spyGexIndex < 0 ? 'auto' : undefined }}
                                />
                            </div>
                            <span className={`text-[12px] font-bold font-jakarta tabular-nums w-[28px] text-right ${spyGexIndex >= 20 ? 'text-emerald-400' : spyGexIndex <= -20 ? 'text-red-400' : 'text-slate-300'}`}>
                                {spyGexIndex >= 0 ? '+' : ''}{spyGexIndex}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="text-[12px] font-bold font-jakarta text-slate-300 w-[26px]">QQQ</span>
                            <div className="flex-1 h-[4px] rounded-full bg-slate-800 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${qqqGexIndex >= 0 ? 'bg-emerald-400/70' : 'bg-red-400/70'}`}
                                    style={{ width: `${Math.min(100, Math.abs(qqqGexIndex))}%`, marginLeft: qqqGexIndex < 0 ? 'auto' : undefined }}
                                />
                            </div>
                            <span className={`text-[12px] font-bold font-jakarta tabular-nums w-[28px] text-right ${qqqGexIndex >= 20 ? 'text-emerald-400' : qqqGexIndex <= -20 ? 'text-red-400' : 'text-slate-300'}`}>
                                {qqqGexIndex >= 0 ? '+' : ''}{qqqGexIndex}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Column 2: Squeeze Risk */}
                <div className="flex flex-col items-center gap-2 border-x border-slate-700/25 px-2">
                    <span className="text-[12px] font-bold font-jakarta tracking-[0.10em] text-slate-300 uppercase">
                        Squeeze Risk
                    </span>

                    {/* Circular Ring */}
                    <div className="relative">
                        <SqueezeRing value={squeezeRisk} level={squeezeLevel} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-[18px] font-black font-jakarta tabular-nums leading-none ${getSqueezeColor(squeezeLevel)}`}>
                                {squeezeRisk}
                            </span>
                            <span className="text-[12px] font-jakarta text-slate-300">%</span>
                        </div>
                    </div>

                    {/* Level Badge */}
                    <div className={`text-[12px] font-bold font-jakarta px-2 py-0.5 rounded-sm border ${getSqueezeBadgeBg(squeezeLevel)}`}>
                        <span className={getSqueezeColor(squeezeLevel)}>{squeezeLevel}</span>
                    </div>

                    {/* SPY / QQQ Squeeze Split */}
                    <div className="w-full max-w-[140px]">
                        <div className="flex items-center justify-between gap-1">
                            <span className="text-[12px] font-bold font-jakarta text-slate-300 w-[26px]">SPY</span>
                            <div className="flex-1 h-[4px] rounded-full bg-slate-800 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${spySqueezeScore >= 45 ? 'bg-amber-400' : spySqueezeScore >= 20 ? 'bg-yellow-400/70' : 'bg-emerald-400/60'}`}
                                    style={{ width: `${Math.min(100, spySqueezeScore)}%` }}
                                />
                            </div>
                            <span className={`text-[12px] font-bold font-jakarta tabular-nums w-[28px] text-right ${spySqueezeScore >= 45 ? 'text-amber-400' : 'text-slate-300'}`}>
                                {spySqueezeScore}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="text-[12px] font-bold font-jakarta text-slate-300 w-[26px]">QQQ</span>
                            <div className="flex-1 h-[4px] rounded-full bg-slate-800 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${qqqSqueezeScore >= 45 ? 'bg-amber-400' : qqqSqueezeScore >= 20 ? 'bg-yellow-400/70' : 'bg-emerald-400/60'}`}
                                    style={{ width: `${Math.min(100, qqqSqueezeScore)}%` }}
                                />
                            </div>
                            <span className={`text-[12px] font-bold font-jakarta tabular-nums w-[28px] text-right ${qqqSqueezeScore >= 45 ? 'text-amber-400' : 'text-slate-300'}`}>
                                {qqqSqueezeScore}
                            </span>
                        </div>
                    </div>

                    {/* Threshold Distance */}
                    {squeezeRisk < 70 && (
                        <div className="text-[12px] font-jakarta text-slate-300 text-center">
                            {squeezeRisk < 45
                                ? <span>→ <span className="text-amber-400 font-bold">HIGH</span> {`${45 - squeezeRisk}pt`}</span>
                                : <span>→ <span className="text-red-400 font-bold">EXTREME</span> {`${70 - squeezeRisk}pt`}</span>
                            }
                        </div>
                    )}

                    {/* Warning message at high levels */}
                    {squeezeRisk >= 70 && (
                        <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                            <span className="text-[12px] font-jakarta text-red-400">
                                {t('squeezeWarning', locale)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Column 3: Trigger Band */}
                <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold font-jakarta tracking-[0.10em] text-slate-300 uppercase text-center">
                        Trigger Band
                    </span>
                    <span className="text-[12px] font-jakarta text-slate-400 text-center -mt-1">
                        S&P 500
                    </span>
                    <TriggerBand
                        support={supportWall}
                        current={currentPrice}
                        resistance={resistanceWall}
                        locale={locale}
                    />
                    {/* v2: Gamma Flip Point */}
                    {gammaFlipPoint && currentPrice && (
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-[12px] font-bold font-jakarta text-amber-400/90">⚡ FLIP</span>
                            <span className={`text-[12px] font-bold font-jakarta tabular-nums ${Math.abs(currentPrice - gammaFlipPoint) / currentPrice < 0.02 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
                                {gammaFlipPoint.toLocaleString()}
                            </span>
                            <span className="text-[12px] font-jakarta text-slate-300">
                                ({currentPrice > gammaFlipPoint ? '+' : ''}{(((currentPrice - gammaFlipPoint) / gammaFlipPoint) * 100).toFixed(1)}%)
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
