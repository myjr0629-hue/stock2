"use client";

import React from 'react';

interface MiniGaugeProps {
    value: string | number;
    label: string;
    description?: string;
    subLabel?: string;
    colorClass?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    fillPercent?: number;
    secondaryValue?: string;
}

/**
 * MiniGauge V45.5 - SVG Only, NO frame
 * 완전히 투명한 배경, SVG 링만 표시
 */
export function MiniGauge({
    value,
    label,
    description,
    subLabel,
    colorClass = 'text-white',
    size = 'md',
    fillPercent,
    secondaryValue
}: MiniGaugeProps) {
    // Size configurations
    const sizeConfig = {
        sm: { px: 64, value: 'text-sm', label: 'text-[11px]', subLabel: 'text-[11px]', desc: 'text-[11px]', secondary: 'text-[11px]', stroke: 3 },
        md: { px: 80, value: 'text-base', label: 'text-[11px]', subLabel: 'text-[11px]', desc: 'text-[11px]', secondary: 'text-[11px]', stroke: 3.5 },
        lg: { px: 96, value: 'text-lg', label: 'text-[11px]', subLabel: 'text-[11px]', desc: 'text-[11px]', secondary: 'text-xs', stroke: 4 },
        xl: { px: 112, value: 'text-xl', label: 'text-xs', subLabel: 'text-[11px]', desc: 'text-[11px]', secondary: 'text-[11px]', stroke: 4.5 }
    };
    const cfg = sizeConfig[size];
    const radius = (cfg.px / 2) - 8;
    const circumference = 2 * Math.PI * radius;
    const dasharray = fillPercent !== undefined
        ? `${(fillPercent / 100) * circumference} ${circumference}`
        : `${circumference} ${circumference}`;

    // Ring color
    const getRingColor = () => {
        if (colorClass.includes('rose') || colorClass.includes('red')) return '#f43f5e';
        if (colorClass.includes('emerald') || colorClass.includes('green')) return '#10b981';
        if (colorClass.includes('amber') || colorClass.includes('yellow')) return '#f59e0b';
        if (colorClass.includes('cyan') || colorClass.includes('blue') || colorClass.includes('sky')) return '#06b6d4';
        if (colorClass.includes('orange')) return '#f97316';
        return '#64748b';
    };

    return (
        <div className="flex flex-col items-center gap-1">
            {/* SVG Gauge - completely transparent background */}
            <div style={{ width: cfg.px, height: cfg.px, position: 'relative' }}>
                <svg width={cfg.px} height={cfg.px} style={{ position: 'absolute', top: 0, left: 0 }}>
                    {/* Background ring */}
                    <circle
                        cx={cfg.px / 2}
                        cy={cfg.px / 2}
                        r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth={cfg.stroke}
                    />
                    {/* Fill ring */}
                    <circle
                        cx={cfg.px / 2}
                        cy={cfg.px / 2}
                        r={radius}
                        fill="none"
                        stroke={getRingColor()}
                        strokeWidth={cfg.stroke}
                        strokeLinecap="round"
                        strokeDasharray={dasharray}
                        transform={`rotate(-90 ${cfg.px / 2} ${cfg.px / 2})`}
                        style={{ filter: `drop-shadow(0 0 6px ${getRingColor()})`, opacity: 0.7, transition: 'stroke-dasharray 1s' }}
                    />
                </svg>
                {/* Content */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span className={`${cfg.label} font-bold text-white uppercase tracking-wider`}>{label}</span>
                    <span className={`${cfg.value} font-black tabular-nums ${colorClass}`} style={{ textShadow: `0 0 10px currentColor` }}>{value}</span>
                    {secondaryValue && <span className={`${cfg.secondary} font-medium ${colorClass} opacity-80`}>{secondaryValue}</span>}
                </div>
            </div>
            {/* Labels below - transparent */}
            <div className="flex flex-col items-center">
                {description && <span className={`${cfg.desc} text-white/70 uppercase tracking-wide`}>{description}</span>}
                {subLabel && <span className={`${cfg.subLabel} font-bold text-white uppercase tracking-wider`}>{subLabel}</span>}
            </div>
        </div>
    );
}

interface DualGaugeProps {
    priceValue: number;
    flowValue: number;
    size?: 'lg' | 'xl' | '2xl';
}

export function DualGauge({ priceValue, flowValue, size = 'xl' }: DualGaugeProps) {
    const sizeConfig = {
        lg: { px: 112, value: 'text-lg', label: 'text-[11px]' },
        xl: { px: 128, value: 'text-xl', label: 'text-[11px]' },
        '2xl': { px: 144, value: 'text-2xl', label: 'text-xs' }
    };
    const cfg = sizeConfig[size];
    const outerR = (cfg.px / 2) - 6;
    const innerR = outerR - 12;
    const outerCircum = 2 * Math.PI * outerR;
    const innerCircum = 2 * Math.PI * innerR;

    const priceColor = priceValue >= 0 ? '#10b981' : '#f43f5e';
    const flowColor = flowValue >= 50 ? '#06b6d4' : '#f97316';

    return (
        <div className="flex flex-col items-center gap-2">
            {/* SVG Dual Gauge - transparent */}
            <div style={{ width: cfg.px, height: cfg.px, position: 'relative' }}>
                <svg width={cfg.px} height={cfg.px} style={{ position: 'absolute', top: 0, left: 0 }}>
                    {/* Outer ring - PRICE */}
                    <circle cx={cfg.px / 2} cy={cfg.px / 2} r={outerR} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
                    <circle
                        cx={cfg.px / 2} cy={cfg.px / 2} r={outerR} fill="none"
                        stroke={priceColor} strokeWidth={3.5} strokeLinecap="round"
                        strokeDasharray={`${Math.abs(priceValue) * 10 + 50} ${outerCircum}`}
                        transform={`rotate(-90 ${cfg.px / 2} ${cfg.px / 2})`}
                        style={{ filter: `drop-shadow(0 0 4px ${priceColor})`, opacity: 0.7 }}
                    />
                    {/* Inner ring - FLOW */}
                    <circle cx={cfg.px / 2} cy={cfg.px / 2} r={innerR} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
                    <circle
                        cx={cfg.px / 2} cy={cfg.px / 2} r={innerR} fill="none"
                        stroke={flowColor} strokeWidth={3.5} strokeLinecap="round"
                        strokeDasharray={`${flowValue * (innerCircum / 100)} ${innerCircum}`}
                        transform={`rotate(-90 ${cfg.px / 2} ${cfg.px / 2})`}
                        style={{ filter: `drop-shadow(0 0 4px ${flowColor})`, opacity: 0.7 }}
                    />
                </svg>
                {/* Content */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span className={`${cfg.label} font-bold text-white uppercase tracking-wider`}>PRICE</span>
                    <span className={`${cfg.value} font-black tabular-nums`} style={{ color: priceColor, textShadow: `0 0 8px ${priceColor}` }}>
                        {priceValue >= 0 ? '+' : ''}{priceValue.toFixed(1)}%
                    </span>
                    <div className="w-10 h-px bg-white/30 my-1" />
                    <span className={`${cfg.label} font-bold text-white uppercase tracking-wider`}>FLOW</span>
                    <span className={`${cfg.value} font-black tabular-nums`} style={{ color: flowColor, textShadow: `0 0 8px ${flowColor}` }}>
                        {flowValue.toFixed(0)}
                    </span>
                </div>
            </div>
            {/* Interpretation */}
            <span className="text-[11px] font-bold text-white uppercase tracking-wide flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${priceValue >= 0 && flowValue >= 50 ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : priceValue < 0 && flowValue < 50 ? 'bg-rose-400 shadow-[0_0_6px_#f43f5e]' : 'bg-slate-400'}`} />
                {priceValue >= 0 && flowValue >= 50 ? '상승 모멘텀' : priceValue < 0 && flowValue < 50 ? '하락 압력' : '혼조세'}
            </span>
        </div>
    );
}

export default MiniGauge;
