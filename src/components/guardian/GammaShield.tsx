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
        ko: '옵션 매도자 손절 구간 — 급변동 구간 진입',
        en: 'Options sellers near forced exits — high swing zone',
        ja: 'オプション売り手の損切り圏 — 急変動圏突入',
    },
    resistNear: {
        ko: 'S&P 옵션 벽 {val} 근접 — 저항 테스트 구간',
        en: 'S&P options wall {val} nearby — resistance test zone',
        ja: 'S&P オプション壁 {val} 接近 — 抵抗テスト圏',
    },
    supportNear: {
        ko: 'S&P 옵션 지지 {val} 근접 — 지지 테스트 구간',
        en: 'S&P options floor {val} nearby — support test zone',
        ja: 'S&P オプション支持 {val} 接近 — サポートテスト圏',
    },
    longGamma: {
        ko: '기관 감마 매수 우위 — 하방 쿠션 활성',
        en: 'Institutional long gamma dominant — downside cushion active',
        ja: '機関ガンマ買い優位 — 下方クッション活性',
    },
    longGammaButSelling: {
        ko: '감마 방어 중이나 매도 압력 관측 — 쿠션 약화 구간',
        en: 'Gamma cushion active but sell pressure observed — cushion weakening',
        ja: 'ガンマ防御中も売り圧力観測 — クッション弱化圏',
    },
    shortGamma: {
        ko: '기관 헤지가 변동 증폭 중 — 숏감마 구간',
        en: 'Institutional hedging amplifying swings — short gamma zone',
        ja: '機関ヘッジが変動増幅中 — ショートガンマ圏',
    },
    shortGammaDropping: {
        ko: '숏감마 + 하락 — 딜러 매도 증폭 관측',
        en: 'Short gamma + declining — dealer selling amplified',
        ja: 'ショートガンマ + 下落 — ディーラー売り増幅観測',
    },
    squeezeBuilding: {
        ko: 'Squeeze {val}% — 변동성 축적 구간, 경계 레벨',
        en: 'Squeeze {val}% — volatility compression zone, alert level',
        ja: 'Squeeze {val}% — ボラ蓄積圏、警戒レベル',
    },
    neutral: {
        ko: '옵션 시장 균형 — 감마 중립 구간',
        en: 'Options market balanced — gamma neutral zone',
        ja: 'オプション市場均衡 — ガンマ中立圏',
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
            <div className="text-[12px] text-slate-300 font-jakarta text-center">
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

// === Directional Insight Generator (v3 → v4 Compliance) ===
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
            ko: `S&P ${sp} — Squeeze ${squeezeRisk}% 임계 구간 · 레인지 ${sup}↔${res}`,
            en: `S&P ${sp} — Squeeze ${squeezeRisk}% critical zone · range ${sup}↔${res}`,
            ja: `S&P ${sp} — Squeeze ${squeezeRisk}%臨界圏 · レンジ ${sup}↔${res}`
        };
        return base[locale];
    }

    // Priority 2: Short Gamma danger (≤-20) — emphasis on amplification
    if (gexIndex <= -20 && sup && distDown) {
        const base = {
            ko: `S&P ${sp} — ${gexStr(locale)}(${gexIndex}), 지지 ${sup}(-${distDown}%) 하방 증폭 구간${res ? ` · 저항 ${res}` : ''}`,
            en: `S&P ${sp} — ${gexStr(locale)}(${gexIndex}), floor ${sup}(-${distDown}%) downside amplified${res ? ` · cap ${res}` : ''}`,
            ja: `S&P ${sp} — ${gexStr(locale)}(${gexIndex}), 支持 ${sup}(-${distDown}%) 下方増幅圏${res ? ` · 抵抗 ${res}` : ''}`
        };
        return base[locale];
    }

    // Priority 3: Directional structure based on GEX + levels
    if (sup && res && distDown && distUp) {
        // Strong long gamma (GEX ≥ 40)
        if (gexIndex >= 40) {
            const base = {
                ko: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), 저항 ${res}(+${distUp}%) · 지지 ${sup} 쿠션`,
                en: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), resistance ${res}(+${distUp}%) · floor ${sup} cushion`,
                ja: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), 抵抗 ${res}(+${distUp}%) · 支持 ${sup} クッション`
            };
            return base[locale];
        }
        // Moderate gamma defense (GEX 20-39)
        if (gexIndex >= 20) {
            const base = {
                ko: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), 저항 ${res}(+${distUp}%) 테스트 구간 · 지지 ${sup}`,
                en: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), resistance ${res}(+${distUp}%) test zone · floor ${sup}`,
                ja: `S&P ${sp} — ${gexStr(locale)}(+${gexIndex}), 抵抗 ${res}(+${distUp}%) テスト圏 · 支持 ${sup}`
            };
            return base[locale];
        }
        // Weak/neutral GEX (−19 to +19)
        const gexSign = gexIndex >= 0 ? `+${gexIndex}` : `${gexIndex}`;
        const sqCtx = squeezeRisk >= 30
            ? { ko: `, Squeeze ${squeezeRisk}%`, en: `, Squeeze ${squeezeRisk}%`, ja: `, Squeeze ${squeezeRisk}%` }[locale]
            : '';
        const base = {
            ko: `S&P ${sp} — ${gexStr(locale)}(${gexSign})${sqCtx}, 지지 ${sup}(-${distDown}%) · 저항 ${res}`,
            en: `S&P ${sp} — ${gexStr(locale)}(${gexSign})${sqCtx}, floor ${sup}(-${distDown}%) · cap ${res}`,
            ja: `S&P ${sp} — ${gexStr(locale)}(${gexSign})${sqCtx}, 支持 ${sup}(-${distDown}%) · 抵抗 ${res}`
        };
        return base[locale];
    }

    // Fallback if missing support/resistance
    return t('neutral', locale);
}

// === Summary Strip — Institutional-Grade Conditional Insight ===
// Data-driven: output varies by GEX × Squeeze × Level Proximity combinations
function getSummaryInsight(
    gexIndex: number,
    squeezeRisk: number,
    squeezeLevel: string,
    currentPrice: number | null,
    supportWall: number | null,
    resistanceWall: number | null,
    locale: Locale
): string[] {
    const sup = supportWall && supportWall > 0 ? supportWall.toLocaleString() : null;
    const res = resistanceWall && resistanceWall > 0 ? resistanceWall.toLocaleString() : null;
    const distDown = supportWall && supportWall > 0 && currentPrice ? ((currentPrice - supportWall) / currentPrice * 100) : null;
    const distUp = resistanceWall && resistanceWall > 0 && currentPrice ? ((resistanceWall - currentPrice) / currentPrice * 100) : null;
    const nearSupport = distDown !== null && distDown < 1.5;
    const nearResist = distUp !== null && distUp < 1.5;
    const dD = distDown?.toFixed(1);
    const dU = distUp?.toFixed(1);

    // Institutional-grade: different insight for every meaningful data combination
    if (locale === 'ko') {
        // CASE: High Squeeze + Short Gamma — most dangerous
        if (squeezeRisk >= 55 && gexIndex <= -20)
            return [`숏감마(${gexIndex}) · Squeeze ${squeezeRisk}% 임계 — 딜러 헤지 매도가 하방 변동을 증폭시키는 구조. 지지 ${sup || '—'}${dD ? `(-${dD}%)` : ''} 이탈 시 연쇄 청산 압력 확대 가능성 관측.`];

        // CASE: High Squeeze + Long Gamma — coiled spring
        if (squeezeRisk >= 55 && gexIndex >= 20)
            return [`감마 방어(+${gexIndex}) · Squeeze ${squeezeRisk}% 임계 — 딜러 롱감마가 변동 억제 중이나 Squeeze 에너지 축적 상태. 저항 ${res || '—'}${dU ? `(+${dU}%)` : ''} 돌파 시 감마 언와인딩 동반 급등 구조 형성 관측.`];

        // CASE: High Squeeze + Neutral — directionless pressure
        if (squeezeRisk >= 55)
            return [`감마 중립(${gexIndex >= 0 ? '+' : ''}${gexIndex}) · Squeeze ${squeezeRisk}% 임계 — 방향 미확정 상태에서 변동성 에너지 축적. ${sup && res ? `${sup}~${res} 레인지` : '현재 레인지'} 이탈 시 방향 불문 급변동 가능성 관측.`];

        // CASE: Near resistance + Long Gamma — pinning
        if (nearResist && gexIndex >= 20)
            return [`감마 방어(+${gexIndex}) — 저항 ${res}(+${dU}%) 근접. 딜러 매도 헤지가 상방 억제 역할 중, 레인지 바운드 구조 형성. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' 축적 중' : ' 안정'}.`];

        // CASE: Near support + Short Gamma — amplification zone
        if (nearSupport && gexIndex <= -20)
            return [`숏감마(${gexIndex}) — 지지 ${sup}(-${dD}%) 근접, 딜러 숏감마 포지션이 하방 이탈 시 매도 가속 구조. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ', 에너지 축적 상태' : ''}.`];

        // CASE: Near support + Neutral
        if (nearSupport)
            return [`감마 중립(${gexIndex >= 0 ? '+' : ''}${gexIndex}) — 지지 ${sup}(-${dD}%) 테스트 구간. 옵션 시장 방어력 부족(감마 약), 이탈 시 추가 하락 폭 확대 가능성. Squeeze ${squeezeRisk}%.`];

        // CASE: Strong Long Gamma — stability regime
        if (gexIndex >= 40)
            return [`감마 매수 우위(+${gexIndex}) — 딜러 롱감마 클램핑으로 ${sup && res ? `${sup}~${res}` : '현재'} 레인지 변동 억제 구조. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' 축적 중, 돌파 시 감마 해제 동반 변동성 확대 관측' : ' 안정, 레인지 바운드 지속 관측'}.`];

        // CASE: Moderate Long Gamma
        if (gexIndex >= 20)
            return [`감마 방어(+${gexIndex}) — 기관 포지션이 변동성 흡수 중. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' 축적 중' : ' 안정'}. 지지 ${sup || '—'}${dD ? `(-${dD}%)` : ''}, 저항 ${res || '—'}${dU ? `(+${dU}%)` : ''} 관측.`];

        // CASE: Moderate Short Gamma
        if (gexIndex <= -20)
            return [`숏감마(${gexIndex}) — 기관 헤지 매도가 변동 폭 증폭 구간. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' 축적 중, 방향성 변동 가속 관측' : ''}. 지지 ${sup || '—'}${dD ? `(-${dD}%)` : ''}, 저항 ${res || '—'} 관측.`];

        // DEFAULT: Neutral GEX
        return [`감마 중립(${gexIndex >= 0 ? '+' : ''}${gexIndex}) — 옵션 시장 균형. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' 축적 중' : ' 안정'}. 지지 ${sup || '—'}${dD ? `(-${dD}%)` : ''}, 저항 ${res || '—'}${dU ? `(+${dU}%)` : ''} 관측.`];
    }

    if (locale === 'ja') {
        if (squeezeRisk >= 55 && gexIndex <= -20)
            return [`ショートガンマ(${gexIndex}) · Squeeze ${squeezeRisk}%臨界 — ディーラーヘッジ売りが下方変動増幅構造。支持${sup || '—'}${dD ? `(-${dD}%)` : ''}割れで連鎖清算圧力拡大の可能性。`];
        if (squeezeRisk >= 55 && gexIndex >= 20)
            return [`ガンマ防御(+${gexIndex}) · Squeeze ${squeezeRisk}%臨界 — ロングガンマが変動抑制もSqueeze蓄積。抵抗${res || '—'}${dU ? `(+${dU}%)` : ''}突破時、ガンマ解除急騰構造観測。`];
        if (squeezeRisk >= 55)
            return [`ガンマ中立(${gexIndex >= 0 ? '+' : ''}${gexIndex}) · Squeeze ${squeezeRisk}%臨界 — 方向未確定でボラ蓄積。${sup && res ? `${sup}~${res}レンジ` : '現レンジ'}離脱時、方向不問急変動の可能性。`];
        if (gexIndex >= 40)
            return [`ガンマ買い優位(+${gexIndex}) — ディーラークランプで変動抑制構造。Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? '蓄積中' : '安定'}。支持${sup || '—'}、抵抗${res || '—'}観測。`];
        if (gexIndex >= 20)
            return [`ガンマ防御(+${gexIndex}) — 機関ポジションがボラ吸収中。Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? '蓄積中' : '安定'}。支持${sup || '—'}${dD ? `(-${dD}%)` : ''}、抵抗${res || '—'}観測。`];
        if (gexIndex <= -20)
            return [`ショートガンマ(${gexIndex}) — 機関ヘッジ売りが変動増幅圏。Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? '蓄積中' : ''}。支持${sup || '—'}${dD ? `(-${dD}%)` : ''}、抵抗${res || '—'}観測。`];
        return [`ガンマ中立(${gexIndex >= 0 ? '+' : ''}${gexIndex}) — 市場均衡。Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? '蓄積中' : '安定'}。支持${sup || '—'}${dD ? `(-${dD}%)` : ''}、抵抗${res || '—'}${dU ? `(+${dU}%)` : ''}観測。`];
    }

    // EN
    if (squeezeRisk >= 55 && gexIndex <= -20)
        return [`Short gamma (${gexIndex}) · Squeeze ${squeezeRisk}% critical — dealer hedge selling amplifies downside. Floor ${sup || '—'}${dD ? ` (-${dD}%)` : ''} breach risks cascading liquidation pressure.`];
    if (squeezeRisk >= 55 && gexIndex >= 20)
        return [`Gamma defense (+${gexIndex}) · Squeeze ${squeezeRisk}% critical — long gamma dampening vol but squeeze energy building. Cap ${res || '—'}${dU ? ` (+${dU}%)` : ''} breakout may trigger gamma unwind rally.`];
    if (squeezeRisk >= 55)
        return [`Gamma neutral (${gexIndex >= 0 ? '+' : ''}${gexIndex}) · Squeeze ${squeezeRisk}% critical — directionless vol compression. ${sup && res ? `${sup}–${res} range` : 'Range'} breach triggers sharp move either direction.`];
    if (gexIndex >= 40)
        return [`Long gamma dominant (+${gexIndex}) — dealer clamping suppresses ${sup && res ? `${sup}–${res}` : ''} range vol. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' building — breakout triggers gamma unwind' : ' stable, range-bound regime'}.`];
    if (gexIndex >= 20)
        return [`Gamma defense (+${gexIndex}) — institutional positioning absorbs vol. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' building' : ' stable'}. Floor ${sup || '—'}${dD ? ` (-${dD}%)` : ''}, cap ${res || '—'}${dU ? ` (+${dU}%)` : ''}.`];
    if (gexIndex <= -20)
        return [`Short gamma (${gexIndex}) — dealer hedging amplifies swings. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' building, directional acceleration observed' : ''}. Floor ${sup || '—'}${dD ? ` (-${dD}%)` : ''}, cap ${res || '—'}.`];
    return [`Gamma neutral (${gexIndex >= 0 ? '+' : ''}${gexIndex}) — options market balanced. Squeeze ${squeezeRisk}%${squeezeRisk >= 30 ? ' building' : ' stable'}. Floor ${sup || '—'}${dD ? ` (-${dD}%)` : ''}, cap ${res || '—'}${dU ? ` (+${dU}%)` : ''}.`];
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
                <div className="flex items-center justify-center h-[120px] text-[13px] text-slate-300 font-jakarta">
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
            {/* Header — Clean */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 shrink-0 ${gexIndex >= 0 ? 'text-cyan-400' : 'text-amber-400'}`} />
                    <span className="text-[14px] font-black font-jakarta tracking-[0.08em] text-slate-200">
                        GAMMA SHIELD
                    </span>
                    <span className={`text-[12px] font-bold font-jakarta px-1.5 py-0.5 rounded-sm border ${confidence === 'HIGH' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : confidence === 'MEDIUM' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-slate-300 border-slate-500/30 bg-slate-500/10'}`}>
                        {confidence}
                    </span>
                </div>
                <span className={`text-[12px] font-bold font-jakarta px-2 py-0.5 rounded border shrink-0 ${isMarketActive ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 animate-pulse' : 'text-slate-300 border-slate-600/30 bg-slate-600/10'}`}>
                    {isMarketActive ? '● LIVE' : 'STANDBY'}
                </span>
            </div>

            {/* Summary Strip — readable multi-line insight */}
            <div className="px-4 pb-2">
                <div className="bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/20">
                    {getSummaryInsight(gexIndex, squeezeRisk, squeezeLevel, currentPrice, supportWall, resistanceWall, locale).map((line, i) => (
                        <p key={i} className={`text-[13px] font-jakarta leading-relaxed ${i === 0 ? 'text-slate-200 font-semibold' : 'text-slate-400 mt-0.5'}`}>
                            {i === 0 ? '⚡ ' : '  '}{line}
                        </p>
                    ))}
                </div>
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
                            <span className="text-[12px] font-jakarta text-slate-300">0</span>
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
                    <span className="text-[12px] font-jakarta text-slate-300 text-center -mt-1">
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
