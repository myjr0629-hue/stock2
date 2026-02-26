/**
 * PriceDisplay - Centralized Price Display Component
 * 
 * Standard: Command/Dashboard style
 * - Left (main): Intraday close price + change %
 * - Right (separate): POST/PRE extended price (when available)
 * 
 * @version 1.1.0 — Added price flash animation on change
 */
'use client';

import { useRef, useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

// ============================================
// TYPES
// ============================================

export interface PriceDisplayProps {
    /** Intraday (regular session) close price */
    intradayPrice: number;
    /** Intraday change percentage (e.g., -2.17 for -2.17%) */
    intradayChangePct: number;

    /** Extended session price (POST/PRE) - optional */
    extendedPrice?: number;
    /** Extended session change percentage */
    extendedChangePct?: number;
    /** Extended session label: 'POST' | 'PRE' | 'PRE CLOSE' | '' */
    extendedLabel?: string;

    /** Display size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Layout: horizontal (default) or vertical */
    layout?: 'horizontal' | 'vertical';
    /** Whether to show extended price section */
    showExtended?: boolean;
    /** Session status to show after label: 'CLOSED' | 'TRADING' | '' */
    sessionStatus?: 'CLOSED' | 'TRADING' | '';
    /** Show arrow icons */
    showArrows?: boolean;
}

// ============================================
// STYLING MAPS
// ============================================

const SIZE_CONFIG = {
    sm: {
        price: 'text-sm',
        change: 'text-[10px]',
        extLabel: 'text-[8px]',
        extPrice: 'text-xs',
        extChange: 'text-[9px]',
        arrow: 'w-3 h-3',
        gap: 'gap-1',
    },
    md: {
        price: 'text-xl',
        change: 'text-lg',
        extLabel: 'text-xs',
        extPrice: 'text-base',
        extChange: 'text-sm',
        arrow: 'w-4 h-4',
        gap: 'gap-2',
    },
    lg: {
        price: 'text-2xl',
        change: 'text-xl',
        extLabel: 'text-sm',
        extPrice: 'text-lg',
        extChange: 'text-base',
        arrow: 'w-5 h-5',
        gap: 'gap-3',
    },
};

const EXT_LABEL_COLORS: Record<string, string> = {
    POST: 'text-indigo-400',
    'POST (CLOSED)': 'text-indigo-400',
    PRE: 'text-amber-400',
    'PRE (CLOSED)': 'text-amber-400',
    'PRE CLOSE': 'text-amber-400',
    '': 'text-slate-400',
};

// ============================================
// FLASH ANIMATION HOOK
// ============================================

export function usePriceFlash(price: number, staggerDelay = 0): 'up' | 'down' | null {
    const prevPriceRef = useRef(price);
    const [flash, setFlash] = useState<'up' | 'down' | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const prev = prevPriceRef.current;
        if (prev !== 0 && price !== 0 && prev !== price) {
            // Clear any pending timers
            if (timerRef.current) clearTimeout(timerRef.current);
            if (delayRef.current) clearTimeout(delayRef.current);

            const direction: 'up' | 'down' = price > prev ? 'up' : 'down';

            if (staggerDelay > 0) {
                // Staggered: delay the flash start for a live-feed feel
                delayRef.current = setTimeout(() => {
                    setFlash(direction);
                    timerRef.current = setTimeout(() => setFlash(null), 900);
                }, staggerDelay);
            } else {
                setFlash(direction);
                timerRef.current = setTimeout(() => setFlash(null), 900);
            }
        }
        prevPriceRef.current = price;

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (delayRef.current) clearTimeout(delayRef.current);
        };
    }, [price, staggerDelay]);

    return flash;
}

/** Generate a stable 0–800ms delay from ticker string (for staggered flash) */
export function tickerDelay(ticker: string): number {
    let hash = 0;
    for (let i = 0; i < ticker.length; i++) {
        hash = ((hash << 5) - hash) + ticker.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 800;
}

/** Returns inline style + className for price flash. Reusable across pages. */
export function getFlashStyle(flash: 'up' | 'down' | null) {
    const color = flash === 'up' ? 'text-green-200' :
        flash === 'down' ? 'text-red-200' : 'text-white';
    const style: React.CSSProperties = flash ? {
        transition: 'color 0.1s ease-in, text-shadow 0.1s ease-in, background-color 0.1s ease-in',
        textShadow: flash === 'up' ? '0 0 12px rgba(74,222,128,0.8)' : '0 0 12px rgba(248,113,113,0.8)',
        backgroundColor: flash === 'up' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
        borderRadius: '4px',
        padding: '0 4px',
        margin: '0 -4px',
    } : {
        transition: 'color 0.5s ease-out, text-shadow 0.5s ease-out, background-color 0.5s ease-out',
        textShadow: 'none',
        backgroundColor: 'transparent',
        borderRadius: '4px',
        padding: '0 4px',
        margin: '0 -4px',
    };
    return { color, style };
}

// ============================================
// COMPONENT
// ============================================

export function PriceDisplay({
    intradayPrice,
    intradayChangePct,
    extendedPrice,
    extendedChangePct = 0,
    extendedLabel = '',
    size = 'md',
    layout = 'horizontal',
    showExtended = true,
    sessionStatus = 'CLOSED',
    showArrows = false,
}: PriceDisplayProps) {
    const config = SIZE_CONFIG[size];
    const flash = usePriceFlash(intradayPrice);

    // Determine colors
    const isIntradayUp = intradayChangePct >= 0;
    const intradayColor = isIntradayUp ? 'text-emerald-400' : 'text-rose-400';

    const isExtendedUp = extendedChangePct >= 0;
    const extendedColor = isExtendedUp ? 'text-emerald-400' : 'text-rose-400';

    const hasExtended = showExtended && extendedPrice && extendedPrice > 0 && extendedLabel;

    const containerClass = layout === 'horizontal'
        ? `flex items-center ${config.gap}`
        : `flex flex-col ${config.gap}`;

    // Flash color: text briefly turns bright green/red then fades back (Yahoo style)
    const priceColor = flash === 'up' ? 'text-green-200' :
        flash === 'down' ? 'text-red-200' : 'text-white';

    // [STRONG] Triple combo: background highlight + text color + glow
    const flashStyle: React.CSSProperties = flash ? {
        transition: 'color 0.1s ease-in, text-shadow 0.1s ease-in, background-color 0.1s ease-in',
        textShadow: flash === 'up' ? '0 0 12px rgba(74,222,128,0.8)' : '0 0 12px rgba(248,113,113,0.8)',
        backgroundColor: flash === 'up' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
        borderRadius: '4px',
        padding: '0 4px',
        margin: '0 -4px',
    } : {
        transition: 'color 0.5s ease-out, text-shadow 0.5s ease-out, background-color 0.5s ease-out',
        textShadow: 'none',
        backgroundColor: 'transparent',
        borderRadius: '4px',
        padding: '0 4px',
        margin: '0 -4px',
    };

    return (
        <div className={containerClass}>
            {/* ===== Intraday (Main) Price ===== */}
            <div className={`flex items-center ${config.gap}`}>
                <span className={`font-mono font-bold ${priceColor} ${config.price}`}
                    style={flashStyle}>
                    ${intradayPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </span>
                <span className={`font-medium ${intradayColor} ${config.change}`}>
                    {showArrows && (
                        isIntradayUp
                            ? <ArrowUpRight className={`inline ${config.arrow}`} />
                            : <ArrowDownRight className={`inline ${config.arrow}`} />
                    )}
                    {isIntradayUp ? '+' : ''}{intradayChangePct.toFixed(2)}%
                </span>
            </div>

            {/* ===== Extended (POST/PRE) Price — Command-style pill ===== */}
            {hasExtended && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/50 border border-slate-700/50 backdrop-blur-md ml-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${extendedLabel.includes('PRE') ? 'bg-amber-500' : 'bg-indigo-500'
                        } animate-pulse`} />
                    <div className="flex items-baseline gap-1.5">
                        <span className={`text-[11px] font-black uppercase tracking-widest ${EXT_LABEL_COLORS[extendedLabel]}`}>
                            {extendedLabel}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-200">
                            ${extendedPrice.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}
                        </span>
                        <span className={`text-[12px] font-mono font-bold ${extendedColor}`}>
                            {isExtendedUp ? '+' : ''}{extendedChangePct.toFixed(2)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// VERTICAL CARD VARIANT (for M7/Physical AI cards)
// ============================================

export interface PriceDisplayCardProps {
    /** Intraday (regular session) close price */
    intradayPrice: number;
    /** Intraday change percentage */
    intradayChangePct: number;

    /** Extended session price (POST/PRE) - optional */
    extendedPrice?: number;
    /** Extended session change percentage */
    extendedChangePct?: number;
    /** Extended session label */
    extendedLabel?: 'POST' | 'PRE' | '';

    /** Show arrows in change percentage */
    showArrows?: boolean;
    /** Flash direction for price update animation */
    priceFlash?: 'up' | 'down' | null;
}

/**
 * Vertical price display for card layouts (M7, Physical AI)
 * Shows price centered, extended below, change at bottom
 */
export function PriceDisplayCard({
    intradayPrice,
    intradayChangePct,
    extendedPrice,
    extendedChangePct = 0,
    extendedLabel = '',
    showArrows = true,
    priceFlash,
}: PriceDisplayCardProps) {
    const isIntradayUp = intradayChangePct >= 0;
    const intradayColor = isIntradayUp ? 'text-emerald-400' : 'text-rose-400';

    const isExtendedUp = extendedChangePct >= 0;
    const extendedColor = isExtendedUp ? 'text-emerald-400' : 'text-rose-400';

    // Show extended data even when session is over (user wants to see last known POST/PRE data)
    const hasExtended = extendedPrice && extendedPrice > 0;

    // Flash animation class
    const flashClass = priceFlash === 'up'
        ? 'animate-[priceFlashUp_0.6s_ease-out]'
        : priceFlash === 'down'
            ? 'animate-[priceFlashDown_0.6s_ease-out]'
            : '';

    return (
        <div className="flex flex-col items-center">
            {/* Main Price */}
            <div
                key={priceFlash ? `${intradayPrice}-${Date.now()}` : undefined}
                className={`text-2xl font-bold text-white tracking-tighter drop-shadow-sm font-jakarta font-num ${flashClass}`}
            >
                ${intradayPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}
            </div>

            {/* Extended Price (if available) */}
            {hasExtended && (
                <div className="flex items-center justify-center gap-1.5 mb-1 animate-in fade-in slide-in-from-bottom-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border font-jakarta ${(extendedLabel || 'POST') === 'POST'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                        {extendedLabel || 'POST'}
                    </span>
                    <span className="text-xs font-bold text-white/90 font-num">
                        ${extendedPrice.toFixed(2)}
                    </span>
                    <span className={`text-[10px] font-semibold font-num ${extendedColor}`}>
                        {isExtendedUp ? '+' : ''}{extendedChangePct.toFixed(2)}%
                    </span>
                </div>
            )}

            {/* Change Percentage */}
            <div className={`flex items-center justify-center gap-0.5 text-sm font-semibold tracking-tight font-num ${intradayColor} ${isIntradayUp
                ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                : 'drop-shadow-[0_0_8px_rgba(251,113,133,0.3)]'
                }`}>
                {showArrows && (
                    isIntradayUp
                        ? <ArrowUpRight className="w-3.5 h-3.5" />
                        : <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {isIntradayUp ? '+' : ''}{intradayChangePct.toFixed(2)}%
            </div>
        </div>
    );
}

// ============================================
// EXPORTS
// ============================================

export default PriceDisplay;
