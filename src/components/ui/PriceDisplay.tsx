/**
 * PriceDisplay - Centralized Price Display Component
 * 
 * Standard: Command/Dashboard style
 * - Left (main): Intraday close price + change %
 * - Right (separate): POST/PRE extended price (when available)
 * 
 * @version 1.0.0
 */
'use client';

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
    PRE: 'text-amber-400',
    'PRE CLOSE': 'text-amber-400',
    '': 'text-slate-400',
};

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

    // Determine colors
    const isIntradayUp = intradayChangePct >= 0;
    const intradayColor = isIntradayUp ? 'text-emerald-400' : 'text-rose-400';

    const isExtendedUp = extendedChangePct >= 0;
    const extendedColor = isExtendedUp ? 'text-emerald-400' : 'text-rose-400';

    const hasExtended = showExtended && extendedPrice && extendedPrice > 0 && extendedLabel;

    const containerClass = layout === 'horizontal'
        ? `flex items-center ${config.gap}`
        : `flex flex-col ${config.gap}`;

    return (
        <div className={containerClass}>
            {/* ===== Intraday (Main) Price ===== */}
            <div className={`flex items-center ${config.gap}`}>
                <span className={`font-mono font-bold text-white ${config.price}`}>
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

            {/* ===== Extended (POST/PRE) Price ===== */}
            {hasExtended && (
                <div className={`flex items-center ${config.gap} ml-3`}>
                    {/* Dot separator */}
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-2" />
                    {/* Label with status */}
                    <span className={`font-bold uppercase ${config.extLabel} ${EXT_LABEL_COLORS[extendedLabel]}`}>
                        {extendedLabel}
                        {sessionStatus && <span className="text-slate-500 ml-1">({sessionStatus})</span>}
                    </span>
                    <span className={`font-mono text-slate-300 ${config.extPrice}`}>
                        ${extendedPrice.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </span>
                    <span className={`font-mono ${extendedColor} ${config.extChange}`}>
                        {isExtendedUp ? '+' : ''}{extendedChangePct.toFixed(2)}%
                    </span>
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
}: PriceDisplayCardProps) {
    const isIntradayUp = intradayChangePct >= 0;
    const intradayColor = isIntradayUp ? 'text-emerald-400' : 'text-rose-400';

    const isExtendedUp = extendedChangePct >= 0;
    const extendedColor = isExtendedUp ? 'text-emerald-400' : 'text-rose-400';

    const hasExtended = extendedPrice && extendedPrice > 0 && extendedLabel;

    return (
        <div className="flex flex-col items-center">
            {/* Main Price */}
            <div className="text-xl font-black text-white tracking-tighter tabular-nums drop-shadow-sm">
                ${intradayPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}
            </div>

            {/* Extended Price (if available) */}
            {hasExtended && (
                <div className="flex items-center justify-center gap-1.5 mb-1 animate-in fade-in slide-in-from-bottom-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        {extendedLabel}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                        ${extendedPrice.toFixed(2)}
                    </span>
                    <span className={`text-[9px] font-bold ${extendedColor}`}>
                        {isExtendedUp ? '+' : ''}{extendedChangePct.toFixed(2)}%
                    </span>
                </div>
            )}

            {/* Change Percentage */}
            <div className={`flex items-center justify-center gap-0.5 text-[11px] font-bold tracking-tight ${intradayColor} ${isIntradayUp
                ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                : 'drop-shadow-[0_0_8px_rgba(251,113,133,0.3)]'
                }`}>
                {showArrows && (
                    isIntradayUp
                        ? <ArrowUpRight className="w-3 h-3" />
                        : <ArrowDownRight className="w-3 h-3" />
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
