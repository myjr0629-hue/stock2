"use client";

/**
 * TechnicalLevelsMap — Bloomberg-tier horizontal level visualization
 * 
 * Shows current price position relative to all key institutional anchors:
 * Put Floor, SMA 200, VWAP, Max Pain, Current Price, SMA 50, Call Wall
 * Plus optional Gamma Flip Level overlay.
 * 
 * Data: 100% client-side — uses already-loaded smaData, structure, vwap.
 * Zero additional API calls.
 */

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { CardTooltip, COMMAND_TOOLTIPS } from "@/components/ui/CardTooltip";

interface TechnicalLevelsMapProps {
    currentPrice: number;
    sma50?: number;
    sma200?: number;
    smaCross?: string; // 'GOLDEN' | 'DEAD' | ...
    vwap?: number;
    maxPain?: number;
    callWall?: number;
    putFloor?: number;
    gammaFlipLevel?: number;
}

interface LevelPoint {
    label: string;
    labelKo: string;
    labelJa: string;
    value: number;
    color: string;
    dotColor: string;
    isCurrent?: boolean;
    isFlip?: boolean;
    tooltip?: { ko: string; en: string; ja: string };
}

export function TechnicalLevelsMap({
    currentPrice,
    sma50,
    sma200,
    smaCross,
    vwap,
    maxPain,
    callWall,
    putFloor,
    gammaFlipLevel,
}: TechnicalLevelsMapProps) {
    const locale = useLocale() as "ko" | "en" | "ja";

    const { levels, rangeMin, rangeMax, insightText } = useMemo(() => {
        const pts: LevelPoint[] = [];

        if (putFloor && putFloor > 0) pts.push({
            label: "Put Floor", labelKo: "풋 플로어", labelJa: "プットフロア",
            value: putFloor, color: "rgb(52,211,153)", dotColor: "bg-emerald-400",
            tooltip: { ko: '풋 감마 집중 가격대 — 딜러 매수 헤지가 시작되는 지지선 역할', en: 'Put gamma concentration — dealer buy-hedging acts as support', ja: 'プットガンマ集中帯 — ディーラー買いヘッジによるサポート' },
        });
        if (sma200 && sma200 > 0) pts.push({
            label: "SMA 200", labelKo: "SMA 200", labelJa: "SMA 200",
            value: sma200, color: "rgb(248,113,113)", dotColor: "bg-red-400",
            tooltip: { ko: '200일 이동평균 — 장기 추세의 핵심 기준선. 위에 있으면 상승 추세', en: '200-day moving average — key long-term trend anchor. Above = uptrend', ja: '200日移動平均 — 長期トレンドの基準線。上方は上昇トレンド' },
        });
        if (vwap && vwap > 0) pts.push({
            label: "VWAP", labelKo: "VWAP", labelJa: "VWAP",
            value: vwap, color: "rgb(129,140,248)", dotColor: "bg-indigo-400",
            tooltip: { ko: '거래량 가중 평균가 — 기관의 체결 기준가. 위면 매수자 우위, 아래면 매도자 우위', en: 'Volume-weighted avg price — institutional benchmark. Above = buyer control', ja: '出来高加重平均価格 — 機関ベンチマーク。上方は買い手優位' },
        });
        if (maxPain && maxPain > 0) pts.push({
            label: "Max Pain", labelKo: "맥스 페인", labelJa: "マックスペイン",
            value: maxPain, color: "rgb(251,191,36)", dotColor: "bg-amber-400",
            tooltip: { ko: '옵션 보유자 손실 극대화 가격 — 만기일 가격 수렴(피닝) 경향의 핵심 지표', en: 'Price where option holder losses are maximized — key expiry pinning indicator', ja: '満期時オプション保有者損失最大化価格 — ピニング傾向の指標' },
        });
        if (sma50 && sma50 > 0) pts.push({
            label: "SMA 50", labelKo: "SMA 50", labelJa: "SMA 50",
            value: sma50, color: "rgb(56,189,248)", dotColor: "bg-sky-400",
            tooltip: { ko: '50일 이동평균 — 중기 추세 기준선. SMA200과 교차 시 골든/데드 크로스 발생', en: '50-day moving average — mid-term trend line. Cross with SMA200 = golden/dead cross', ja: '50日移動平均 — 中期トレンド基準線。SMA200との交差でゴールデン/デッドクロス' },
        });
        if (callWall && callWall > 0) pts.push({
            label: "Call Wall", labelKo: "콜 월", labelJa: "コールウォール",
            value: callWall, color: "rgb(244,63,94)", dotColor: "bg-rose-400",
            tooltip: { ko: '콜 감마 집중 가격대 — 딜러 매도 헤지가 시작되는 저항선 역할', en: 'Call gamma concentration — dealer sell-hedging acts as resistance', ja: 'コールガンマ集中帯 — ディーラー売りヘッジによるレジスタンス' },
        });

        // Current price always shown
        pts.push({
            label: "Price", labelKo: "현재가", labelJa: "現在価格",
            value: currentPrice, color: "rgb(255,255,255)", dotColor: "bg-white",
            isCurrent: true,
            tooltip: { ko: '실시간 현재가 — 모든 핵심 레벨 대비 현재 포지션', en: 'Current price — position relative to all key institutional levels', ja: '現在価格 — 主要レベル対比のポジション' },
        });

        // Gamma Flip as overlay if available
        if (gammaFlipLevel && gammaFlipLevel > 0) {
            pts.push({
                label: "Gamma Flip", labelKo: "감마 플립", labelJa: "ガンマフリップ",
                value: gammaFlipLevel, color: "rgb(251,191,36)", dotColor: "bg-amber-400",
                isFlip: true,
                tooltip: { ko: '감마 전환 가격 — 위면 변동성 억제, 아래면 변동성 증폭 환경', en: 'Gamma flip level — above = vol suppression, below = vol amplification', ja: 'ガンマ転換価格 — 上方はボラ抑制、下方はボラ増幅' },
            });
        }

        // Sort by value
        pts.sort((a, b) => a.value - b.value);

        // Range: 4% padding on each side
        const values = pts.map(p => p.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const padding = (max - min) * 0.08 || max * 0.02;
        const rangeMin = min - padding;
        const rangeMax = max + padding;

        // Generate insight text
        const above: string[] = [];
        const below: string[] = [];
        const near: string[] = [];

        for (const p of pts) {
            if (p.isCurrent || p.isFlip) continue;
            const diff = ((currentPrice - p.value) / p.value) * 100;
            const name = locale === 'ko' ? p.labelKo : locale === 'ja' ? p.labelJa : p.label;
            if (Math.abs(diff) < 0.5) near.push(name);
            else if (diff > 0) above.push(name);
            else below.push(name);
        }

        let insightText = '';
        const priceStr = `$${currentPrice.toFixed(2)}`;
        if (locale === 'ko') {
            const parts: string[] = [];
            if (above.length) parts.push(`${above.join(', ')} 위`);
            if (below.length) parts.push(`${below.join(', ')} 아래`);
            if (near.length) parts.push(`${near.join(', ')} 근접`);
            insightText = `현재가 ${priceStr} — ${parts.join(' · ')}에 위치. ${above.length >= 4 ? '대부분의 핵심 레벨 위에서 거래 중.' : below.length >= 4 ? '대부분의 핵심 레벨 아래에서 거래 중.' : '핵심 레벨 중간 구간에서 거래 중.'}`;
        } else if (locale === 'ja') {
            const parts: string[] = [];
            if (above.length) parts.push(`${above.join('・')}上`);
            if (below.length) parts.push(`${below.join('・')}下`);
            if (near.length) parts.push(`${near.join('・')}近接`);
            insightText = `現在価格 ${priceStr} — ${parts.join(' · ')}に位置。${above.length >= 4 ? '主要レベルの上方で取引中。' : below.length >= 4 ? '主要レベルの下方で取引中。' : '主要レベル中間帯で取引中。'}`;
        } else {
            const parts: string[] = [];
            if (above.length) parts.push(`above ${above.join(', ')}`);
            if (below.length) parts.push(`below ${below.join(', ')}`);
            if (near.length) parts.push(`near ${near.join(', ')}`);
            insightText = `Price at ${priceStr} — ${parts.join(' · ')}. ${above.length >= 4 ? 'Trading above most key anchors.' : below.length >= 4 ? 'Trading below most key anchors.' : 'Trading within key institutional levels.'}`;
        }

        return { levels: pts, rangeMin, rangeMax, insightText };
    }, [currentPrice, sma50, sma200, vwap, maxPain, callWall, putFloor, gammaFlipLevel, locale]);

    // No useful levels to show
    if (levels.filter(l => !l.isCurrent).length < 2) {
        const msg: Record<string, string> = {
            ko: "표시할 기술적 레벨이 충분하지 않습니다",
            en: "Insufficient technical levels available",
            ja: "表示する技術的レベルが不十分です",
        };
        return (
            <div className="py-3 px-4 flex items-center gap-2 text-[12px] text-slate-300 border border-slate-800/40 rounded-xl bg-slate-900/30">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                <span className="font-jakarta">{msg[locale] || msg.en}</span>
            </div>
        );
    }

    const range = rangeMax - rangeMin || 1;
    const getPos = (v: number) => ((v - rangeMin) / range) * 100;

    // Count levels above/below for summary
    const aboveCount = levels.filter(l => !l.isCurrent && !l.isFlip && l.value < currentPrice).length;
    const belowCount = levels.filter(l => !l.isCurrent && !l.isFlip && l.value > currentPrice).length;
    const totalLevels = levels.filter(l => !l.isCurrent && !l.isFlip).length;

    // Determine if bullish/bearish positioning
    const isBullishPos = aboveCount > belowCount;
    const isBearishPos = belowCount > aboveCount;

    // Badge label: "3/6 Above Support" → clear across languages
    const badgeLabel = (() => {
        if (locale === 'ko') return `${aboveCount}개 지지 / ${belowCount}개 저항`;
        if (locale === 'ja') return `${aboveCount}サポート / ${belowCount}レジスタンス`;
        return `${aboveCount} Support / ${belowCount} Resist`;
    })();

    return (
        <div className={`rounded-xl border backdrop-blur-sm p-3 space-y-2.5 relative overflow-hidden transition-all duration-500 ${
            isBullishPos
                ? 'border-emerald-500/25 bg-slate-900/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                : isBearishPos
                    ? 'border-rose-500/25 bg-slate-900/40 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                    : 'border-indigo-500/25 bg-slate-900/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
        }`}>
            {/* Background mesh */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className={`absolute -top-10 -right-10 w-48 h-48 rounded-full ${isBullishPos ? 'bg-emerald-500/[0.05]' : isBearishPos ? 'bg-rose-500/[0.05]' : 'bg-indigo-500/[0.05]'} blur-3xl`} />
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/[0.03] to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-500/30 to-transparent" />
                {/* Corner accents */}
                <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-slate-500/25 rounded-tl" />
                <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-slate-500/25 rounded-tr" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-slate-500/25 rounded-bl" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-slate-500/25 rounded-br" />
            </div>

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isBullishPos ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : isBearishPos ? 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]' : 'bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.6)]'}`} />
                    <span className="text-[12px] font-semibold text-slate-300 tracking-wider uppercase font-jakarta">
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.TECH_LEVELS.tooltip} badge={COMMAND_TOOLTIPS.TECH_LEVELS.badge}>Technical Levels</CardTooltip>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-black px-1.5 py-0.5 rounded font-jakarta ${isBullishPos ? 'bg-emerald-500/20 text-emerald-400' : isBearishPos ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-300'}`}>
                        {badgeLabel}
                    </span>
                </div>
            </div>

            {/* Insight text */}
            <div className="relative z-10 text-[12px] text-slate-300 leading-[1.6] font-jakarta px-0.5">
                {insightText}
            </div>

            {/* Horizontal Level Map */}
            <div className="relative z-10 px-3">
                {/* Main bar track */}
                <div className="relative h-3 bg-slate-800/80 rounded-full overflow-visible border border-slate-700/50">
                    {/* Gradient zones */}
                    <div className="absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r from-emerald-500/15 to-transparent" style={{ width: '30%' }} />
                    <div className="absolute inset-y-0 right-0 rounded-r-full bg-gradient-to-l from-rose-500/15 to-transparent" style={{ width: '30%' }} />

                    {/* Level markers */}
                    {levels.map((level, i) => {
                        const pos = getPos(level.value);
                        const clamped = Math.max(2, Math.min(98, pos));

                        if (level.isCurrent) {
                            // Current price: prominent marker — centered on bar using top:50% + translate
                            return (
                                <div
                                    key={i}
                                    className="absolute z-20"
                                    style={{ left: `${clamped}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                                >
                                    <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] border-2 border-slate-700 relative">
                                        <div className="absolute inset-0 rounded-full animate-ping bg-white/30" style={{ animationDuration: '2s' }} />
                                    </div>
                                </div>
                            );
                        }

                        if (level.isFlip) {
                            // Gamma flip: diamond marker — centered on bar
                            return (
                                <div
                                    key={i}
                                    className="absolute z-[15]"
                                    style={{ left: `${clamped}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)' }}
                                >
                                    <div className="w-2.5 h-2.5 bg-amber-400/80 border border-amber-300/60 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                                </div>
                            );
                        }

                        // Regular level marker — centered on bar
                        return (
                            <div
                                key={i}
                                className="absolute z-10"
                                style={{ left: `${clamped}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                            >
                                <div
                                    className={`w-2.5 h-2.5 rounded-full border border-slate-600 ${level.dotColor}`}
                                    style={{ boxShadow: `0 0 6px ${level.color}60` }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Price labels below the bar — smart stagger with connector lines */}
                {(() => {
                    const labelData = levels.filter(l => !l.isFlip).map(level => {
                        const pos = getPos(level.value);
                        const clamped = Math.max(2, Math.min(98, pos));
                        const name = locale === 'ko' ? level.labelKo : locale === 'ja' ? level.labelJa : level.label;
                        return { ...level, pos: clamped, name };
                    }).sort((a, b) => a.pos - b.pos);

                    // Assign tiers: if two labels are within 8% of each other, bump to next tier
                    const tiers: number[] = [];
                    const OVERLAP_THRESHOLD = 8;
                    for (let i = 0; i < labelData.length; i++) {
                        if (labelData[i].isCurrent) {
                            tiers.push(2);
                            continue;
                        }
                        let tier = 0;
                        for (let j = 0; j < i; j++) {
                            if (Math.abs(labelData[i].pos - labelData[j].pos) < OVERLAP_THRESHOLD && tiers[j] === tier) {
                                tier++;
                            }
                        }
                        tiers.push(Math.min(tier, 1));
                    }

                    const TIER_OFFSET = [0, 40, 80]; // px offsets per tier
                    const BAR_BOTTOM_GAP = 10; // mt-2.5 gap
                    const maxTier = Math.max(...tiers);
                    const containerHeight = 40 + TIER_OFFSET[maxTier] + 10;

                    return (
                        <>
                            {/* Connector lines — rendered from BAR coordinate system for perfect dot alignment */}
                            <div className="relative" style={{ height: 0 }}>
                                {labelData.map((level, i) => {
                                    const lineHeight = BAR_BOTTOM_GAP + TIER_OFFSET[tiers[i]];
                                    const lineColor = level.isCurrent ? 'rgba(255,255,255,0.5)' : level.color.replace('rgb', 'rgba').replace(')', ',0.5)');
                                    return (
                                        <div
                                            key={`line-${i}`}
                                            className="absolute"
                                            style={{
                                                left: `${level.pos}%`,
                                                top: '0px',
                                                width: '1px',
                                                height: `${lineHeight}px`,
                                                transform: 'translateX(-50%)',
                                                backgroundColor: lineColor,
                                            }}
                                        />
                                    );
                                })}
                            </div>

                            {/* Labels */}
                            <div className="relative" style={{ height: `${containerHeight}px`, marginTop: `${BAR_BOTTOM_GAP}px` }}>
                                {labelData.map((level, i) => (
                                    <div
                                        key={i}
                                        className="absolute flex flex-col items-center"
                                        style={{
                                            left: `${level.pos}%`,
                                            transform: 'translateX(-50%)',
                                            top: `${TIER_OFFSET[tiers[i]]}px`,
                                        }}
                                    >
                                        {/* Label */}
                                        <span className={`text-[12px] font-jakarta whitespace-nowrap mt-0.5 text-slate-300 ${level.isCurrent ? 'font-black' : 'font-semibold'}`}
                                            style={{ color: level.isCurrent ? 'white' : level.color }}>
                                            {level.tooltip ? (
                                                <CardTooltip tooltip={level.tooltip}>{level.name}</CardTooltip>
                                            ) : level.name}
                                        </span>
                                        {/* Value */}
                                        <span className={`text-[12px] font-mono tabular-nums text-slate-300 ${level.isCurrent ? 'font-bold' : ''}`}>
                                            ${level.value.toFixed(0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    );
                })()}
            </div>

            {/* Legend row */}
            <div className="relative z-10 flex items-center justify-between text-[12px] text-slate-300 font-jakarta pt-0.5">
                <div className="flex items-center gap-3 flex-wrap">
                    {smaCross && (
                        <span className={`font-bold ${smaCross === 'GOLDEN' ? 'text-emerald-400' : smaCross === 'DEAD' ? 'text-rose-400' : 'text-slate-400'}`}>
                            {smaCross === 'GOLDEN' ? '✨ Golden Cross' : smaCross === 'DEAD' ? '☠️ Dead Cross' : ''}
                        </span>
                    )}
                    {gammaFlipLevel != null && gammaFlipLevel > 0 && (
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rotate-45 bg-amber-400/80 inline-block" />
                            <span className="text-amber-300/80">Gamma Flip ${gammaFlipLevel.toFixed(0)}</span>
                        </span>
                    )}
                </div>
                <span className="text-slate-300">
                    {totalLevels} {locale === 'ko' ? '개 레벨' : locale === 'ja' ? 'レベル' : 'levels'}
                </span>
            </div>
        </div>
    );
}
