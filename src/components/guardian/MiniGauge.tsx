"use client";

import React from 'react';
import { useTranslations } from 'next-intl';

interface MiniGaugeProps {
    value: string | number;
    label: string;
    description?: string;
    subLabel?: string;
    colorClass?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    fillPercent?: number;
    secondaryValue?: string;
    /** 주면 게이지가 «누를 수 있는» 상태가 되고, 눌렀을 때 호출된다. */
    onPress?: () => void;
}

/**
 * MiniGauge v51 - Flow Map Glassmorphic Style
 * Premium circular gauge with glassmorphism, thin arc indicator, and glow
 * Labels: 12px, Plus Jakarta Sans, white
 */
export function MiniGauge({
    value,
    label,
    description,
    subLabel,
    colorClass = 'text-white',
    size = 'md',
    fillPercent,
    secondaryValue,
    onPress
}: MiniGaugeProps) {
    // Sizes tuned for 12px Jakarta labels
    const sizeConfig = {
        sm: { px: 68, valueCls: 'text-[14px]', secCls: 'text-[10px]', subCls: 'text-[10px]', stroke: 2 },
        md: { px: 78, valueCls: 'text-[15px]', secCls: 'text-[10px]', subCls: 'text-[10px]', stroke: 2.5 },
        lg: { px: 88, valueCls: 'text-[16px]', secCls: 'text-[12px]', subCls: 'text-[12px]', stroke: 2.5 },
        xl: { px: 100, valueCls: 'text-lg', secCls: 'text-[12px]', subCls: 'text-[12px]', stroke: 3 }
    };
    const cfg = sizeConfig[size];
    const r = (cfg.px / 2) - 7;
    const circ = 2 * Math.PI * r;
    const dash = fillPercent !== undefined
        ? `${(fillPercent / 100) * circ} ${circ}`
        : `${circ} ${circ}`;

    const resolveColor = (): string => {
        if (colorClass.includes('rose') || colorClass.includes('red')) return '#f43f5e';
        if (colorClass.includes('emerald') || colorClass.includes('green')) return '#10b981';
        if (colorClass.includes('amber') || colorClass.includes('yellow')) return '#f59e0b';
        if (colorClass.includes('cyan') || colorClass.includes('blue') || colorClass.includes('sky')) return '#06b6d4';
        if (colorClass.includes('orange')) return '#f97316';
        return '#94a3b8'; // slate-400 — brighter default
    };
    const color = resolveColor();

    // ★ 2026-09-12: subLabel 이 «문장» 이면 원 아래에서 줄바꿈되며 그리드를 통째로 밀어낸다
    //   (대표 지적: NDX 20D / DOW 20D 가 화면을 깨뜨렸다).
    //   개별 문구를 짧게 고치는 것으로 끝내지 않고 **컴포넌트가 구조적으로 못 깨지게** 만든다:
    //   폭을 원 크기로 묶고 subLabel 은 한 줄로 자른다. 설명은 onPress 팝업이 맡는다.
    const Root: React.ElementType = onPress ? 'button' : 'div';
    return (
        <Root
            type={onPress ? 'button' : undefined}
            onClick={onPress}
            aria-label={onPress ? `${label} ${value}` : undefined}
            className={`group flex flex-col items-center gap-1.5 ${onPress ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
            style={{ width: cfg.px }}
        >
            {/* Gauge circle */}
            <div
                className="relative transition-transform duration-300 ease-out group-hover:scale-110"
                style={{ width: cfg.px, height: cfg.px }}
            >
                {/* Glassmorphic base circle — brighter */}
                <div
                    className="absolute inset-0 rounded-full backdrop-blur-md transition-shadow duration-300"
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        border: `1.5px solid rgba(255,255,255,0.18)`,
                        boxShadow: `0 0 24px ${color}30, inset 0 0 12px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.1)`
                    }}
                />

                {/* SVG arc indicator — thin, elegant */}
                <svg width={cfg.px} height={cfg.px} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                    {/* Track */}
                    <circle
                        cx={cfg.px / 2} cy={cfg.px / 2} r={r}
                        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={cfg.stroke}
                    />
                    {/* Active arc */}
                    <circle
                        cx={cfg.px / 2} cy={cfg.px / 2} r={r}
                        fill="none" stroke={color} strokeWidth={cfg.stroke}
                        strokeLinecap="round" strokeDasharray={dash}
                        style={{
                            filter: `drop-shadow(0 0 5px ${color})`,
                            opacity: 0.7,
                            transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)'
                        }}
                    />
                </svg>

                {/* Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {/* Label: 12px, Jakarta Sans, White */}
                    <span className="text-[12px] font-bold text-white uppercase tracking-[0.12em] font-jakarta leading-none">
                        {label}
                    </span>
                    {/* Value */}
                    <span
                        className={`${cfg.valueCls} font-black tabular-nums leading-tight ${colorClass}`}
                        style={{ textShadow: '0 0 14px currentColor' }}
                    >
                        {value}
                    </span>
                    {secondaryValue && (
                        <span className={`${cfg.secCls} font-medium tabular-nums ${colorClass} opacity-80`}>
                            {secondaryValue}
                        </span>
                    )}
                </div>
            </div>

            {/* Labels below circle — «절대» 여러 줄이 되지 않는다 */}
            <div className="flex flex-col items-center w-full min-w-0">
                {description && (
                    <span className="text-[10px] text-white/60 uppercase tracking-wide font-jakarta w-full truncate text-center">
                        {description}
                    </span>
                )}
                {subLabel && (
                    <span
                        className={`${cfg.subCls} font-bold ${colorClass} uppercase tracking-wider font-jakarta w-full truncate text-center leading-tight`}
                        title={subLabel}
                    >
                        {subLabel}
                    </span>
                )}
                {onPress && (
                    <span className="mt-0.5 w-1 h-1 rounded-full bg-white/35 group-active:bg-white/70" aria-hidden />
                )}
            </div>
        </Root>
    );
}

// ─────────────────────────────────────────────────────────────────
// DualGauge — Dual concentric rings for PRICE + FLOW
// ─────────────────────────────────────────────────────────────────

interface DualGaugeProps {
    priceValue: number;
    flowValue: number;
    size?: 'lg' | 'xl' | '2xl';
}

/**
 * DualGauge v51 - Flow Map Premium Dual-Ring
 * Larger glassmorphic circle with two concentric arc indicators
 * Labels: 12px, Plus Jakarta Sans, white
 */
export function DualGauge({ priceValue, flowValue, size = 'xl' }: DualGaugeProps) {
    const t = useTranslations('guardian');
    const sizeConfig = {
        lg: { px: 112, valueCls: 'text-[16px]' },
        xl: { px: 124, valueCls: 'text-lg' },
        '2xl': { px: 140, valueCls: 'text-xl' }
    };
    const cfg = sizeConfig[size];
    const outerR = (cfg.px / 2) - 6;
    const innerR = outerR - 11;
    const outerC = 2 * Math.PI * outerR;
    const innerC = 2 * Math.PI * innerR;

    const priceColor = priceValue >= 0 ? '#10b981' : '#f43f5e';
    const flowColor = flowValue >= 50 ? '#06b6d4' : '#f97316';

    // Overall sentiment
    const isBullish = priceValue >= 0 && flowValue >= 50;
    const isBearish = priceValue < 0 && flowValue < 50;
    const sentimentColor = isBullish ? '#10b981' : isBearish ? '#f43f5e' : '#94a3b8';
    const sentimentText = isBullish ? t('bullMomentum') : isBearish ? t('bearPressure') : t('mixedSignal');

    return (
        <div className="group flex flex-col items-center gap-2">
            <div
                className="relative transition-transform duration-300 ease-out group-hover:scale-105"
                style={{ width: cfg.px, height: cfg.px }}
            >
                {/* Glassmorphic base — brighter */}
                <div
                    className="absolute inset-0 rounded-full backdrop-blur-md transition-shadow duration-300"
                    style={{
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        border: '1.5px solid rgba(255,255,255,0.18)',
                        boxShadow: `0 0 30px ${sentimentColor}25, inset 0 0 12px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.1)`
                    }}
                />

                {/* SVG dual arcs */}
                <svg width={cfg.px} height={cfg.px} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                    {/* Outer track + arc (PRICE) */}
                    <circle cx={cfg.px / 2} cy={cfg.px / 2} r={outerR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
                    <circle
                        cx={cfg.px / 2} cy={cfg.px / 2} r={outerR} fill="none"
                        stroke={priceColor} strokeWidth={2.5} strokeLinecap="round"
                        strokeDasharray={`${Math.abs(priceValue) * 8 + 40} ${outerC}`}
                        style={{ filter: `drop-shadow(0 0 4px ${priceColor})`, opacity: 0.65 }}
                    />
                    {/* Inner track + arc (FLOW) */}
                    <circle cx={cfg.px / 2} cy={cfg.px / 2} r={innerR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
                    <circle
                        cx={cfg.px / 2} cy={cfg.px / 2} r={innerR} fill="none"
                        stroke={flowColor} strokeWidth={2.5} strokeLinecap="round"
                        strokeDasharray={`${flowValue * (innerC / 100)} ${innerC}`}
                        style={{ filter: `drop-shadow(0 0 4px ${flowColor})`, opacity: 0.65 }}
                    />
                </svg>

                {/* Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {/* PRICE label: 12px Jakarta white */}
                    <span className="text-[12px] font-bold text-white uppercase tracking-[0.12em] font-jakarta leading-none">
                        PRICE
                    </span>
                    <span
                        className={`${cfg.valueCls} font-black tabular-nums leading-none`}
                        style={{ color: priceColor, textShadow: `0 0 12px ${priceColor}` }}
                    >
                        {priceValue >= 0 ? '+' : ''}{priceValue.toFixed(1)}%
                    </span>
                    <div className="h-px bg-white/15 my-0.5" style={{ width: 30 }} />
                    {/* FLOW label: 12px Jakarta white */}
                    <span className="text-[12px] font-bold text-white uppercase tracking-[0.12em] font-jakarta leading-none">
                        FLOW
                    </span>
                    <span
                        className={`${cfg.valueCls} font-black tabular-nums leading-none`}
                        style={{ color: flowColor, textShadow: `0 0 12px ${flowColor}` }}
                    >
                        {flowValue.toFixed(0)}
                    </span>
                </div>
            </div>

            {/* Sentiment indicator */}
            <div className="text-center">
                <span className="text-[12px] font-bold text-white/50 uppercase tracking-wider inline-flex items-center gap-1.5 font-jakarta whitespace-nowrap">
                    <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sentimentColor, boxShadow: `0 0 6px ${sentimentColor}` }}
                    />
                    {sentimentText}
                </span>
            </div>
        </div>
    );
}

export default MiniGauge;
