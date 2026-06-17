"use client";

import React, { useState, useEffect, useMemo } from 'react';
import type { GammaShieldData } from '@/services/guardian/gammaShieldEngine';
import { Shield, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import { useLocale } from 'next-intl';
import { GuardianTooltip } from '../GuardianTooltip';

// === History Data Types ===
interface GexHistoryPoint {
    timestamp: number;
    gex: number;
    callWall: number | null;
    putFloor: number | null;
    price: number;
    gammaRegime: string;
}

interface HistStats {
    percentile: number;
    percentileLabel: string;
    streak: number;
    regimeLabel: string;
    regimeShifts: number;
    cwAccuracy: number | null;
    cwHit: number;
    cwTotal: number;
    pfAccuracy: number | null;
    pfHit: number;
    pfTotal: number;
    cwTrend: number | null;
    cwTrendDir: 'up' | 'down' | 'flat';
    sparklinePoints: number[];
}

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

// === Speedometer Gauge Component ===
function Gauge({ value, color, size = 180 }: { value: number; color: string; size?: number }) {
    const [v, setV] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setV(value), 350);
        return () => clearTimeout(t);
    }, [value]);

    const W = size;
    const H = size / 2 + 14;
    const cx = W / 2;
    const cy = size / 2 + 4;
    const R = size / 2 - 16;

    const arc = (a0: number, a1: number, col: string, op: number) => {
        const p = (a: number) => [
            cx + R * Math.cos(Math.PI * (1 - a)),
            cy - R * Math.sin(Math.PI * (1 - a))
        ];
        const [x0, y0] = p(a0);
        const [x1, y1] = p(a1);
        return (
            <path
                d={`M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`}
                fill="none"
                stroke={col}
                strokeWidth="8"
                strokeLinecap="round"
                opacity={op}
            />
        );
    };

    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', margin: '0 auto' }}>
            {/* Speedometer limits / segments */}
            {arc(0.02, 0.32, '#ef4444', 0.55)}  {/* High Squeeze */}
            {arc(0.36, 0.64, '#fbbf24', 0.55)}  {/* Medium Squeeze */}
            {arc(0.68, 0.98, '#10b981', 0.55)}  {/* Low Squeeze */}

            {/* Scale Ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map(f => {
                const a = Math.PI * (1 - f);
                const r1 = R - 10;
                const r2 = R - 15;
                return (
                    <line
                        key={f}
                        x1={cx + r1 * Math.cos(a)}
                        y1={cy - r1 * Math.sin(a)}
                        x2={cx + r2 * Math.cos(a)}
                        y2={cy - r2 * Math.sin(a)}
                        stroke="rgba(255,255,255,0.35)"
                        strokeWidth="1.5"
                    />
                );
            })}

            {/* Rotating Needle */}
            <g
                style={{
                    transform: `rotate(${(v / 100) * 180 - 90}deg)`,
                    transformOrigin: `${cx}px ${cy}px`,
                    transition: 'transform 1.3s cubic-bezier(0.22, 1, 0.36, 1)'
                }}
            >
                <line
                    x1={cx}
                    y1={cy}
                    x2={cx}
                    y2={cy - R + 20}
                    stroke={color}
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                />
                <circle cx={cx} cy={cy - R + 17} r="3" fill={color} />
            </g>
            <circle cx={cx} cy={cy} r="6" fill="#0f172a" stroke={color} strokeWidth="2" />
        </svg>
    );
}

// === Trigger Band Visualization ===
function TriggerBand({
    support, current, resistance, locale
}: { support: number | null; current: number | null; resistance: number | null; locale: Locale }) {
    if (!support || !current || !resistance || resistance <= support) {
        return (
            <div className="text-[12px] text-slate-300 font-jakarta text-center py-2">
                {t('triggerCollecting', locale)}
            </div>
        );
    }

    const range = resistance - support;
    const rawPos = ((current - support) / range) * 100;
    const position = Math.max(5, Math.min(95, rawPos)); 

    return (
        <div className="flex flex-col gap-2.5 w-full">
            {/* Columns layout: Support | Current | Resistance */}
            <div className="grid grid-cols-3 gap-2 text-center items-end">
                {/* Support */}
                <div className="flex flex-col items-start text-left">
                    <span className="text-[10px] font-bold font-jakarta text-slate-400 tracking-wider">SUPPORT</span>
                    <span className="text-[13px] font-black font-jakarta text-emerald-400 tabular-nums">
                        {support.toLocaleString()}
                    </span>
                </div>
                {/* Current */}
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold font-jakarta text-slate-300 tracking-wider mb-0.5">CURRENT</span>
                    <span className="text-[14px] font-black font-jakarta text-cyan-300 bg-slate-950/80 border border-cyan-500/30 px-2.5 py-1 rounded-md tabular-nums leading-none">
                        {current.toLocaleString()}
                    </span>
                </div>
                {/* Resistance */}
                <div className="flex flex-col items-end text-right">
                    <span className="text-[10px] font-bold font-jakarta text-slate-400 tracking-wider">RESISTANCE</span>
                    <span className="text-[13px] font-black font-jakarta text-rose-400 tabular-nums">
                        {resistance.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Slider Track */}
            <div className="relative h-2.5 rounded-full bg-slate-800/90 border border-slate-700/60 mt-1.5">
                {/* Soft gradient background */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/10 to-rose-500/20" />

                {/* Sliding indicator dot — centered vertically on the track */}
                <div
                    className="absolute w-4 h-4 rounded-full bg-cyan-400 border-2 border-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.9)] transition-all duration-700 z-10"
                    style={{ left: `${position}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                />
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
    locale: Locale,
    hist?: HistStats | null
): string[] {
    // Build history context suffix
    const hCtx = hist ? {
        regime: `${hist.regimeLabel} ${hist.streak}D`,
        cw: hist.cwAccuracy !== null ? `CW ${hist.cwAccuracy}%(${hist.cwHit}/${hist.cwTotal})` : null,
        pf: hist.pfAccuracy !== null ? `PF ${hist.pfAccuracy}%` : null,
        pctl: `${hist.percentile}th pctl`,
        shifts: hist.regimeShifts,
    } : null;
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
        {
            let base = `감마 중립(${gexIndex >= 0 ? '+' : ''}${gexIndex}) — ${sup && res ? `${sup}~${res} 레인지` : '현재 레인지'}에서 균형 유지 구조.`;
            if (hCtx) {
                base += ` ${hCtx.regime} 지속${hCtx.shifts === 0 ? ', 전환 없음' : ''}.`;
                if (hCtx.cw && hist!.cwAccuracy! >= 80) base += ` ${hCtx.cw} 유지.`;
            }
            if (squeezeRisk >= 30) base += ` Squeeze ${squeezeRisk}% 축적 중 — 레인지 이탈 시 방향성 확대 가능.`;
            return [base];
        }
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
    if (gexIndex >= 20) {
        let base = `Gamma defense (+${gexIndex}) — dealer positioning absorbs volatility within ${sup && res ? `${sup}–${res}` : 'current'} range.`;
        if (hCtx) {
            base += ` ${hCtx.regime} sustained${hCtx.shifts === 0 ? ', no regime flips' : ''}.`;
            if (hCtx.cw && hist!.cwAccuracy! >= 80) base += ` ${hCtx.cw} held.`;
        }
        if (squeezeRisk >= 30) base += ` Squeeze ${squeezeRisk}% building.`;
        return [base];
    }
    if (gexIndex <= -20) {
        let base = `Short gamma (${gexIndex}) — dealer hedging amplifies directional moves.`;
        if (hCtx) {
            base += ` ${hCtx.regime}${hCtx.shifts >= 2 ? `, ${hCtx.shifts} regime flips in 30D — unstable` : ''}.`;
        }
        base += ` Floor ${sup || '—'}${dD ? ` (-${dD}%)` : ''}, cap ${res || '—'}.`;
        if (squeezeRisk >= 30) base += ` Squeeze ${squeezeRisk}% — directional acceleration likely.`;
        return [base];
    }
    // DEFAULT: Neutral EN
    {
        let base = `Gamma neutral (${gexIndex >= 0 ? '+' : ''}${gexIndex}) — balanced positioning suggests range-bound ${sup && res ? `${sup}–${res}` : 'conditions'}.`;
        if (hCtx) {
            base += ` ${hCtx.regime} sustained${hCtx.shifts === 0 ? ', no regime flips' : ''}.`;
            if (hCtx.cw && hist!.cwAccuracy! >= 80) base += ` ${hCtx.cw} held.`;
        }
        if (squeezeRisk >= 30) base += ` Squeeze ${squeezeRisk}% building — range breach may trigger directional expansion.`;
        else base += ` Squeeze ${squeezeRisk}% stable.`;
        return [base];
    }
}

// === GEX Normalization (for sparkline) ===
function normalizeGexToIndex(rawGex: number): number {
    const EXTREME_SHORT = -3_000_000_000;
    const EXTREME_LONG = 6_000_000_000;
    if (rawGex >= 0) return Math.min(100, Math.round((rawGex / EXTREME_LONG) * 100));
    return Math.max(-100, Math.round((rawGex / EXTREME_SHORT) * -100));
}

// === Main Component ===
export default function GammaShield({ data, isMarketActive }: Props) {
    const rawLocale = useLocale();
    const locale: Locale = (rawLocale === 'ko' || rawLocale === 'en' || rawLocale === 'ja') ? rawLocale : 'en';

    // === SPY 30D History Fetch ===
    const [histData, setHistData] = useState<GexHistoryPoint[]>([]);
    useEffect(() => {
        fetch('/api/history?type=gex&ticker=SPY&days=30')
            .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
            .then(d => setHistData(d.data || []))
            .catch(() => {});
    }, []);

    // === History Stats Calculation ===
    const histStats = useMemo((): HistStats | null => {
        if (!histData.length) return null;

        // Filter trading hours + daily close aggregation
        const dayMap = new Map<string, GexHistoryPoint[]>();
        histData.filter(d => {
            const dt = new Date(d.timestamp);
            const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York' });
            const et = new Date(etStr);
            const day = et.getDay();
            if (day === 0 || day === 6) return false;
            const timeMin = et.getHours() * 60 + et.getMinutes();
            return timeMin >= 570 && timeMin <= 960;
        }).forEach(d => {
            const dt = new Date(d.timestamp);
            const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York' });
            const et = new Date(etStr);
            const dayKey = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
            if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
            dayMap.get(dayKey)!.push(d);
        });

        const daily: GexHistoryPoint[] = [];
        const sortedDays = [...dayMap.keys()].sort();
        for (const day of sortedDays) {
            const pts = dayMap.get(day)!;
            daily.push(pts[pts.length - 1]);
        }
        if (daily.length < 2) return null;

        const gexIndices = daily.map(d => normalizeGexToIndex(d.gex));
        const latestIdx = data ? normalizeGexToIndex((data.spyGex ?? 0) + (data.qqqGex ?? 0)) : gexIndices[gexIndices.length - 1];

        // 1. Percentile
        const sorted = [...gexIndices].sort((a, b) => a - b);
        const pctIdx = sorted.findIndex(v => v >= latestIdx);
        const percentile = Math.round(((pctIdx >= 0 ? pctIdx : sorted.length) / sorted.length) * 100);
        const percentileLabel = percentile <= 10 ? 'extreme low' : percentile <= 25 ? 'low' : percentile >= 90 ? 'extreme high' : percentile >= 75 ? 'high' : 'normal';

        // 2. Regime streak
        const getRegime = (idx: number) => idx >= 20 ? 'POSITIVE' : idx <= -20 ? 'NEGATIVE' : 'NEUTRAL';
        const latestRegime = data ? (data.gexLevel === 'LONG_GAMMA' ? 'POSITIVE' : data.gexLevel === 'SHORT_GAMMA' ? 'NEGATIVE' : 'NEUTRAL') : getRegime(gexIndices[gexIndices.length - 1]);
        let streak = 0;
        for (let i = daily.length - 1; i >= 0; i--) {
            if (getRegime(gexIndices[i]) === latestRegime) streak++;
            else break;
        }

        // 3. Regime shifts
        let regimeShifts = 0;
        for (let i = 1; i < daily.length; i++) {
            if (getRegime(gexIndices[i]) !== getRegime(gexIndices[i-1])) regimeShifts++;
        }

        // 4. Call Wall accuracy
        let cwHit = 0, cwTotal = 0;
        daily.forEach(d => {
            if (d.callWall && d.callWall > 100 && d.price) {
                cwTotal++;
                if (d.price < d.callWall) cwHit++;
            }
        });

        // 5. Put Floor accuracy
        let pfHit = 0, pfTotal = 0;
        daily.forEach(d => {
            if (d.putFloor && d.putFloor > 100 && d.price) {
                pfTotal++;
                if (d.price > d.putFloor) pfHit++;
            }
        });

        // 6. Call Wall trend
        const cwValues = daily.filter(d => d.callWall && d.callWall > 100).map(d => d.callWall!);
        const cwTrend = cwValues.length >= 2 ? cwValues[cwValues.length - 1] - cwValues[0] : null;
        const cwTrendDir: 'up' | 'down' | 'flat' = cwTrend === null ? 'flat' : cwTrend > 50 ? 'up' : cwTrend < -50 ? 'down' : 'flat';

        // 7. Sparkline (last 7 days)
        const sparkSlice = gexIndices.slice(-7);

        return {
            percentile, percentileLabel,
            streak, regimeLabel: latestRegime,
            regimeShifts,
            cwAccuracy: cwTotal > 0 ? Math.round((cwHit / cwTotal) * 100) : null,
            cwHit, cwTotal,
            pfAccuracy: pfTotal > 0 ? Math.round((pfHit / pfTotal) * 100) : null,
            pfHit, pfTotal,
            cwTrend, cwTrendDir,
            sparklinePoints: sparkSlice,
        };
    }, [histData, data]);

    if (!data) {
        return (
            <div className="bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-700/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <GuardianTooltip sectionId="gammaShield">
                        <span className="text-[14px] font-black font-jakarta tracking-wider text-slate-200">
                            GAMMA SHIELD
                        </span>
                    </GuardianTooltip>
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
            <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
                <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 shrink-0 ${gexIndex >= 0 ? 'text-cyan-400' : 'text-amber-400'}`} />
                    <GuardianTooltip sectionId="gammaShield">
                        <span className="text-[13px] font-bold font-jakarta tracking-[0.08em] text-slate-200">
                            GAMMA SHIELD
                        </span>
                    </GuardianTooltip>
                    <span className={`text-[10px] font-bold font-jakarta px-1.5 py-0.5 rounded border ${confidence === 'HIGH' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : confidence === 'MEDIUM' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-slate-300 border-slate-500/30 bg-slate-500/10'}`}>
                        {confidence}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10.5px] font-jakarta text-slate-400">SPY + QQQ</span>
                    <span className={`text-[10px] font-bold font-jakarta px-2 py-0.5 rounded border ${isMarketActive ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 animate-pulse' : 'text-slate-300 border-slate-600/30 bg-slate-600/10'}`}>
                        {isMarketActive ? 'LIVE' : 'STANDBY'}
                    </span>
                </div>
            </div>

            {/* Summary Strip — readable multi-line insight */}
            <div className="px-4 pb-3">
                <div className="bg-slate-800/40 rounded-xl px-3.5 py-2.5 border border-slate-700/20 shadow-inner">
                    {getSummaryInsight(gexIndex, squeezeRisk, squeezeLevel, currentPrice, supportWall, resistanceWall, locale, histStats).map((line, i) => (
                        <p key={i} className={`text-[12.5px] font-jakarta leading-relaxed ${i === 0 ? 'text-slate-200 font-semibold' : 'text-slate-400 mt-1'}`}>
                            {i === 0 ? '⚡ ' : '  '}{line}
                        </p>
                    ))}
                </div>
            </div>

            {/* Content Stack — Stacked layers instead of squished columns */}
            <div className="flex flex-col gap-3.5 px-4 pb-4">

                {/* ── Layer 1: Gamma Pressure Index ── */}
                <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3.5 flex flex-col gap-3 shadow-inner">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-1.5">
                        <span className="text-[11px] font-bold font-jakarta tracking-[0.1em] text-cyan-400 uppercase">
                            Gamma Pressure Index
                        </span>
                        {histStats && (
                            <span className="text-[11px] font-bold font-jakarta text-slate-300">
                                {histStats.percentile}th percentile
                            </span>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        {/* Value + Badge + Change */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-baseline gap-2">
                                <div className={`text-[32px] font-black font-jakarta tabular-nums leading-none ${getGexColor(gexIndex)}`}>
                                    {gexIndex >= 0 ? '+' : ''}{gexIndex}
                                </div>
                                <div className={`text-[10px] font-bold font-jakarta px-1.5 py-0.5 rounded border ${gexLevel === 'LONG_GAMMA' ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15' : gexLevel === 'SHORT_GAMMA' ? 'text-red-400 border-red-500/40 bg-red-500/15' : 'text-slate-300 border-slate-600/40 bg-slate-600/15'}`}>
                                    {gexLevel?.replace('_', ' ') || ''}
                                </div>
                            </div>
                            {gexChange !== null && (
                                <span className={`text-[11px] font-medium font-jakarta tabular-nums ${gexChange > 0 ? 'text-emerald-400' : gexChange < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                    {gexChange > 0 ? `▲ ${gexChange}` : gexChange < 0 ? `▼ ${Math.abs(gexChange)}` : '±0'} vs yesterday
                                </span>
                            )}
                        </div>

                        {/* Sparkline (right side) */}
                        {histStats && histStats.sparklinePoints.length >= 2 && (() => {
                            const pts = histStats.sparklinePoints;
                            const min = Math.min(...pts);
                            const max = Math.max(...pts);
                            const range = max - min || 1;
                            const W = 130, H = 40, PX = 4, PY = 4;
                            const coords = pts.map((v, i) => ({
                                x: PX + (i / (pts.length - 1)) * (W - PX * 2),
                                y: PY + (1 - (v - min) / range) * (H - PY * 2),
                            }));
                            const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
                            const fillD = d + ` L ${coords[coords.length-1].x.toFixed(1)} ${H} L ${coords[0].x.toFixed(1)} ${H} Z`;
                            const lastPt = coords[coords.length - 1];
                            const lastVal = pts[pts.length - 1];
                            const firstVal = pts[0];
                            const trendUp = lastVal >= firstVal;
                            const lineColor = trendUp ? '#10b981' : '#ef4444';
                            const fillColor = trendUp ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
                            return (
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-[10px] font-semibold font-jakarta text-slate-300 uppercase tracking-wider">7D GEX Trend</span>
                                    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="rounded">
                                        <path d={fillD} fill={fillColor} />
                                        <path d={d} fill="none" stroke={lineColor} strokeWidth="1.6" strokeLinejoin="round" />
                                        <circle cx={lastPt.x} cy={lastPt.y} r="2.5" fill={lineColor} />
                                    </svg>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* ── Layer 2: Squeeze Risk ── */}
                <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3.5 flex flex-col items-center gap-2.5 shadow-inner relative overflow-hidden">
                    {/* HUD Corner Tech Decorations */}
                    <div className="absolute top-2 left-2 w-1.5 h-1.5 border-t border-l border-cyan-500/50" />
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 border-t border-r border-cyan-500/50" />
                    <div className="absolute bottom-2 left-2 w-1.5 h-1.5 border-b border-l border-cyan-500/50" />
                    <div className="absolute bottom-2 right-2 w-1.5 h-1.5 border-b border-r border-cyan-500/50" />

                    <div className="flex items-center justify-between w-full border-b border-slate-700/60 pb-1.5">
                        <span className="text-[11px] font-bold font-jakarta tracking-[0.1em] text-cyan-400 uppercase">
                            Squeeze Risk
                        </span>
                        <span className={`text-[10px] font-bold font-jakarta uppercase tracking-wider px-2 py-0.5 rounded border ${getSqueezeBadgeBg(squeezeLevel)}`}>
                            {squeezeLevel}
                        </span>
                    </div>

                    {/* Gauge Visual */}
                    <div className="relative w-full flex flex-col items-center mt-1">
                        <Gauge value={squeezeRisk} color={squeezeRisk >= 70 ? '#ef4444' : squeezeRisk >= 45 ? '#f59e0b' : squeezeRisk >= 25 ? '#fde047' : '#10b981'} size={150} />
                        {/* Gauge Value and Badge overlay */}
                        <div className="absolute top-[42px] flex flex-col items-center justify-center">
                            <span className={`text-[25px] font-black font-jakarta tabular-nums leading-none ${getSqueezeColor(squeezeLevel)}`}>
                                {squeezeRisk}<span className="text-[12px] font-medium text-slate-400 ml-0.5">%</span>
                            </span>
                            <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase mt-1">
                                Compression
                            </span>
                        </div>
                    </div>

                    {/* LOW/HIGH/EXTREME scales */}
                    <div className="flex justify-between w-full max-w-[150px] text-[9px] text-slate-400 font-bold font-jakarta -mt-1 px-1">
                        <span>LOW</span>
                        <span>HIGH 45</span>
                        <span>EXTREME 70</span>
                    </div>

                    {/* Threshold Distance */}
                    {squeezeRisk < 70 && (
                        <div className="text-[11.5px] font-medium font-jakarta text-slate-200 text-center mt-1 leading-snug">
                            {squeezeRisk < 45
                                ? <span>→ <span className="text-amber-400 font-semibold">HIGH</span> if +{45 - squeezeRisk}pt · compression building</span>
                                : <span>→ <span className="text-red-400 font-semibold">EXTREME</span> if +{70 - squeezeRisk}pt · compression building</span>
                            }
                        </div>
                    )}

                    {/* Warning message at high levels */}
                    {squeezeRisk >= 70 && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                            <span className="text-[11px] font-bold font-jakarta text-red-400">
                                {t('squeezeWarning', locale)}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Layer 3: Trigger Band ── */}
                <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3.5 flex flex-col gap-3 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-1.5">
                        <span className="text-[11px] font-bold font-jakarta tracking-[0.1em] text-cyan-400 uppercase">
                            Trigger Band
                        </span>
                        <span className="text-[10px] font-bold font-jakarta text-emerald-400 tracking-wider">
                            S&P 500 · REALTIME
                        </span>
                    </div>
                    
                    <TriggerBand
                        support={supportWall}
                        current={currentPrice}
                        resistance={resistanceWall}
                        locale={locale}
                    />

                    {/* Gamma Flip Point */}
                    {gammaFlipPoint && currentPrice && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                            <span className="text-[11px] font-bold font-jakarta text-amber-400 tracking-wider">⚡ FLIP POINT</span>
                            <div className="flex items-center gap-1.5">
                                <span className={`text-[13px] font-bold font-jakarta tabular-nums ${Math.abs(currentPrice - gammaFlipPoint) / currentPrice < 0.02 ? 'text-amber-400 animate-pulse' : 'text-slate-200'}`}>
                                    {gammaFlipPoint.toLocaleString()}
                                </span>
                                <span className="text-[11px] font-medium font-jakarta text-slate-400 tabular-nums">
                                    ({currentPrice > gammaFlipPoint ? '+' : ''}{(((currentPrice - gammaFlipPoint) / gammaFlipPoint) * 100).toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ HISTORICAL CONTEXT (30D) ═══ */}
            {histStats && (
                <div className="px-4 pb-4">
                    <div className="border-t border-slate-700/50 pt-3.5">
                        {/* Section Label */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                                <span className="text-[11px] text-slate-200 font-bold font-jakarta uppercase tracking-wider">
                                    Historical Context (30D)
                                </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold font-jakarta">
                                DynamoDB History
                            </span>
                        </div>

                        {/* 6 Metric Cards — 3 columns, 2 rows grid layout for mobile viewports */}
                        <div className="grid grid-cols-3 gap-2 pb-1.5">

                            {/* 1. GEX 30D Percentile */}
                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1 shadow-inner h-[88px] justify-between">
                                <span className="text-[9px] font-bold font-jakarta text-slate-300 uppercase tracking-wider text-center w-full truncate">GEX 30D Pctl</span>
                                <div className={`text-[16px] font-black font-jakarta tabular-nums leading-none text-center ${histStats.percentile <= 25 ? 'text-amber-400' : histStats.percentile >= 75 ? 'text-emerald-400' : 'text-white'}`}>
                                    {histStats.percentile}<small className="text-[10px] font-bold text-slate-400 ml-0.5">th</small>
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium font-jakarta text-center leading-tight line-clamp-2 w-full mt-auto">
                                    {locale === 'ko' ? '30일 대비 감마 위치' : locale === 'ja' ? '30日基準ガンマ位置' : 'GEX position vs 30D'}
                                </span>
                            </div>

                            {/* 2. Current Regime Streak */}
                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1 shadow-inner h-[88px] justify-between">
                                <span className="text-[9px] font-bold font-jakarta text-slate-300 uppercase tracking-wider text-center w-full truncate">Regime Streak</span>
                                <div className="text-[11.5px] font-black font-jakarta leading-none text-center truncate w-full flex items-center justify-center">
                                    <span className={`${histStats.regimeLabel === 'POSITIVE' ? 'text-emerald-400' : histStats.regimeLabel === 'NEGATIVE' ? 'text-red-400' : 'text-slate-300'}`}>
                                        {histStats.regimeLabel === 'POSITIVE' ? 'POS' : histStats.regimeLabel === 'NEGATIVE' ? 'NEG' : histStats.regimeLabel}
                                    </span>
                                    <small className="text-[10px] font-bold text-slate-400 ml-1 whitespace-nowrap">{histStats.streak}D</small>
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium font-jakarta text-center leading-tight line-clamp-2 w-full mt-auto">
                                    {locale === 'ko' ? '현재 레짐 지속 기간' : locale === 'ja' ? '現在レジーム継続期間' : 'How long regime lasted'}
                                </span>
                            </div>

                            {/* 3. Regime Shifts */}
                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1 shadow-inner h-[88px] justify-between">
                                <span className="text-[9px] font-bold font-jakarta text-slate-300 uppercase tracking-wider text-center w-full truncate">Regime Shifts</span>
                                <div className={`text-[16px] font-black font-jakarta tabular-nums leading-none text-center ${histStats.regimeShifts === 0 ? 'text-emerald-400' : histStats.regimeShifts >= 3 ? 'text-amber-400' : 'text-white'}`}>
                                    {histStats.regimeShifts}
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium font-jakarta text-center leading-tight line-clamp-2 w-full mt-auto">
                                    {locale === 'ko' ? '시장 안정성/불안정' : locale === 'ja' ? '市場安定性/不安定' : 'Market stability metric'}
                                </span>
                            </div>

                            {/* 4. Call Wall Hit Rate */}
                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1 shadow-inner h-[88px] justify-between">
                                <span className="text-[9px] font-bold font-jakarta text-slate-300 uppercase tracking-wider text-center w-full truncate">CW Hit Rate</span>
                                <div className={`text-[16px] font-black font-jakarta tabular-nums leading-none text-center ${(histStats.cwAccuracy ?? 0) >= 80 ? 'text-emerald-400' : (histStats.cwAccuracy ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {histStats.cwAccuracy !== null ? (
                                        <>{histStats.cwAccuracy}<small className="text-[10px] font-bold text-slate-400 ml-0.5">%</small></>
                                    ) : '—'}
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium font-jakarta text-center leading-tight line-clamp-2 w-full mt-auto">
                                    {locale === 'ko' ? '저항선 신뢰도' : locale === 'ja' ? '抵抗線信頼度' : 'Resistance reliability'}
                                </span>
                            </div>

                            {/* 5. Put Floor Hit Rate */}
                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1 shadow-inner h-[88px] justify-between">
                                <span className="text-[9px] font-bold font-jakarta text-slate-300 uppercase tracking-wider text-center w-full truncate">PF Hit Rate</span>
                                <div className={`text-[16px] font-black font-jakarta tabular-nums leading-none text-center ${(histStats.pfAccuracy ?? 0) >= 80 ? 'text-emerald-400' : (histStats.pfAccuracy ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {histStats.pfAccuracy !== null ? (
                                        <>{histStats.pfAccuracy}<small className="text-[10px] font-bold text-slate-400 ml-0.5">%</small></>
                                    ) : '—'}
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium font-jakarta text-center leading-tight line-clamp-2 w-full mt-auto">
                                    {locale === 'ko' ? '지지선 신뢰도' : locale === 'ja' ? '支持線信頼度' : 'Support reliability'}
                                </span>
                            </div>

                            {/* 6. Call Wall Trend */}
                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1 shadow-inner h-[88px] justify-between">
                                <span className="text-[9px] font-bold font-jakarta text-slate-300 uppercase tracking-wider text-center w-full truncate">CW Trend</span>
                                <div className={`text-[16px] font-black font-jakarta tabular-nums leading-none text-center truncate w-full ${histStats.cwTrendDir === 'up' ? 'text-cyan-400' : histStats.cwTrendDir === 'down' ? 'text-red-400' : 'text-slate-300'}`}>
                                    {histStats.cwTrend !== null ? (
                                        <>
                                            {histStats.cwTrendDir === 'up' ? '↑' : histStats.cwTrendDir === 'down' ? '↓' : '→'}{' '}
                                            {histStats.cwTrend > 0 ? '+' : ''}{histStats.cwTrend}
                                            <small className="text-[10px] font-bold text-slate-400 ml-0.5">pt</small>
                                        </>
                                    ) : '—'}
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium font-jakarta text-center leading-tight line-clamp-2 w-full mt-auto">
                                    {locale === 'ko' ? '기관 포지셔닝 방향' : locale === 'ja' ? 'ディーラーポジショニング' : 'Dealer positioning direction'}
                                </span>
                            </div>

                        </div>

                        {/* Disclaimer */}
                        <div className="text-[11.5px] text-slate-400 text-right mt-2 font-jakarta italic">
                            {locale === 'ko' ? '실시간 구조 + 30일 히스토리 참조. 정보 제공 목적.' : locale === 'ja' ? 'ライブ構造 + 30日ヒストリカル参照。情報提供目的。' : 'Live structure + 30D historical context. Informational only.'}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
