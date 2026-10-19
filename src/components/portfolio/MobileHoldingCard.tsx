'use client';

import React, { useState } from 'react';
import type { EnrichedHolding } from '@/hooks/usePortfolio';
import { Link } from '@/i18n/routing';
import {
    TrendingUp, TrendingDown, ChevronDown, ChevronUp,
    Edit3, Trash2, LayoutDashboard
} from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { usePriceFlash, getFlashStyle, tickerDelay } from '@/components/ui/PriceDisplay';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';

// ============================================================================
// MobileHoldingCard — 글래스모피즘 기반 프리미엄 모바일 카드
// Bloomberg Dark + Robinhood 단순화 하이브리드
//
// 1차 영역 (항상 보임): 로고 + 티커 + 가격 + 등락률 + P&L
// 2차 영역 (탭하면 확장): Score + Signal + Weight + Days + Action
// ============================================================================

interface MobileHoldingCardProps {
    holding: EnrichedHolding;
    onRemove: () => void;
    onEdit: () => void;
    totalValue: number;
    index: number;
    currencyMode: 'usd' | 'local';
    fxRate?: number | null;
    fxSymbol?: string;
}

export default function MobileHoldingCard({
    holding, onRemove, onEdit, totalValue, index,
    currencyMode, fxRate, fxSymbol
}: MobileHoldingCardProps) {
    const [expanded, setExpanded] = useState(false);
    const locale = useLocale();
    const t = useTranslations('portfolio');
    const { hasAccess } = useTier();
    const toggleDashboardTicker = useDashboardStore((s) => s.toggleDashboardTicker);
    const dashboardTickers = useDashboardStore((s) => s.dashboardTickers);
    const isInDashboard = dashboardTickers.includes(holding.ticker);

    const pFlash = usePriceFlash(holding.currentPrice, tickerDelay(holding.ticker));
    const pf = getFlashStyle(pFlash);

    const isPositive = holding.gainLossPct >= 0;
    const isTodayPositive = holding.changePct >= 0;
    const weight = totalValue > 0 ? (holding.marketValue / totalValue) * 100 : 0;
    const daysHeld = holding.addedAt ? Math.floor((Date.now() - new Date(holding.addedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    // P&L amounts
    const isLocal = currencyMode === 'local' && fxRate;
    const gainLossVal = isLocal ? holding.gainLoss * fxRate : holding.gainLoss;
    const sym = isLocal ? fxSymbol : '$';
    const todayDollar = (holding.changePct / 100) * holding.currentPrice * holding.quantity;
    const todayVal = isLocal ? todayDollar * fxRate : todayDollar;

    // Score/Grade
    const score = holding.alphaScore;
    const grade = holding.alphaGrade || (score !== undefined ? (score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D') : '-');
    const gradeColor = grade === 'A' ? 'text-emerald-400' : grade === 'B' ? 'text-cyan-400' : grade === 'C' ? 'text-amber-400' : 'text-rose-400';

    // Portfolio Action
    const alpha = holding.alphaScore || 50;
    const isProfitable = holding.gainLossPct > 0;
    const action = alpha >= 50 && isProfitable ? 'RUN' : alpha >= 50 && !isProfitable ? 'HOLD' : alpha < 40 && isProfitable ? 'TAKE' : alpha < 40 && !isProfitable ? 'EXIT' : 'HOLD';

    const accentBorder = isPositive
        ? 'border-l-emerald-500/50'
        : 'border-l-rose-500/50';

    return (
        <div
            className="m-glass-card m-card-stagger border-l-[3px]"
            style={{
                animationDelay: `${index * 50}ms`,
                borderLeftColor: isPositive ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.5)',
            }}
        >
            {/* ── Row 1: Primary (Always Visible) ── */}
            <Link
                href={`/ticker?ticker=${holding.ticker}`}
                className="flex items-center gap-2.5"
                onClick={(e) => { if (expanded) { e.preventDefault(); } }}
            >
                {/* Logo */}
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/80 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                    <img
                        loading="lazy"
                        decoding="async"
                        src={`/api/logo/${holding.ticker}`}
                        alt={holding.ticker}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="text-[8px] font-bold text-slate-600 absolute">{holding.ticker.slice(0, 2)}</span>
                </div>

                {/* Ticker + Company */}
                <div className="flex-1 min-w-0">
                    <div className="font-black text-[15px] text-white tracking-wide leading-tight">
                        {holding.ticker}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-[1px]">
                        {holding.ticker}
                    </div>
                </div>

                {/* Price + Change */}
                <div className="text-right flex-shrink-0">
                    <div className={`font-black tabular-nums text-[15px] tracking-tight ${pf.color}`} style={pf.style}>
                        ${holding.currentPrice.toFixed(2)}
                    </div>
                    <div className={`text-[12px] font-bold tabular-nums flex items-center justify-end gap-1 ${isTodayPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isTodayPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isTodayPositive ? '+' : ''}{holding.changePct.toFixed(2)}%
                    </div>
                </div>
            </Link>

            {/* ── Row 2: Quick Metrics (Always Visible, Compact) ── */}
            <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {/* Total P&L pill */}
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[12px] font-bold tabular-nums border whitespace-nowrap ${
                    isPositive
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`} style={{ boxShadow: isPositive ? 'var(--m-glow-positive)' : 'var(--m-glow-negative)' }}>
                    {isPositive ? '+' : ''}{sym}{Math.abs(gainLossVal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className="opacity-70">({isPositive ? '+' : ''}{holding.gainLossPct.toFixed(1)}%)</span>
                </div>

                {/* Score pill */}
                {score !== undefined && hasAccess('pro') && (
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[12px] font-black tabular-nums border whitespace-nowrap border-white/[0.08] bg-white/[0.04] ${gradeColor}`}
                        style={{ boxShadow: 'var(--m-glow-cyan)' }}>
                        {score} {grade}
                    </div>
                )}

                {/* Weight pill */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[12px] font-bold tabular-nums border border-white/[0.08] bg-white/[0.04] text-slate-300 whitespace-nowrap">
                    <span className="text-[10px] text-slate-500 uppercase">WT</span>
                    {weight.toFixed(1)}%
                </div>

                {/* Today pill */}
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[12px] font-bold tabular-nums border whitespace-nowrap ${
                    todayDollar >= 0
                        ? 'border-emerald-500/15 bg-emerald-500/5 text-emerald-400'
                        : 'border-rose-500/15 bg-rose-500/5 text-rose-400'
                }`}>
                    <span className="text-[10px] opacity-60">TODAY</span>
                    {todayDollar >= 0 ? '+' : ''}{sym}{Math.abs(todayVal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
            </div>

            {/* ── Expand Toggle ── */}
            <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
                className="w-full flex items-center justify-center gap-1 mt-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors"
            >
                {expanded ? (
                    <><ChevronUp className="w-3.5 h-3.5" /> Less</>
                ) : (
                    <><ChevronDown className="w-3.5 h-3.5" /> Details</>
                )}
            </button>

            {/* ── Row 3: Expanded Details (Progressive Disclosure) ── */}
            {expanded && (
                <div className="m-expand-enter mt-2 pt-3 border-t border-white/[0.06] space-y-3">
                    {/* Detail Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Cost Basis */}
                        <div className="space-y-0.5">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{t('avgPrice') || 'Cost Basis'}</div>
                            <div className="text-[14px] font-bold tabular-nums text-slate-200">${holding.avgPrice.toFixed(2)}</div>
                        </div>
                        {/* Quantity */}
                        <div className="space-y-0.5">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{t('quantity')}</div>
                            <div className="text-[14px] font-bold tabular-nums text-slate-200">{holding.quantity} shares</div>
                        </div>
                        {/* Market Value */}
                        <div className="space-y-0.5">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Market Value</div>
                            <div className="text-[14px] font-bold tabular-nums text-white">
                                ${holding.marketValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </div>
                        </div>
                        {/* Days Held */}
                        <div className="space-y-0.5">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{t('daysHeld')}</div>
                            <div className={`text-[14px] font-bold tabular-nums ${daysHeld > 365 ? 'text-cyan-400' : 'text-slate-200'}`}>
                                D+{daysHeld} <span className="text-[10px] text-slate-500">{daysHeld > 365 ? 'Long' : 'Short'}-term</span>
                            </div>
                        </div>
                    </div>

                    {/* Signal + Action row */}
                    {hasAccess('pro') && (
                        <div className="flex items-center gap-2">
                            {/* Signal Badge */}
                            {holding.action && (
                                <div className={`px-3 py-1.5 rounded-xl text-[12px] font-black tracking-wider border ${
                                    holding.action === 'ADD' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                                    holding.action === 'TRIM' ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' :
                                    'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                }`}>
                                    {holding.action}
                                </div>
                            )}
                            {/* Portfolio Action */}
                            {hasAccess('elite') && (
                                <div className={`px-3 py-1.5 rounded-xl text-[12px] font-black tracking-wider border ${
                                    action === 'RUN' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                                    action === 'EXIT' ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' :
                                    action === 'TAKE' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
                                    'bg-slate-500/15 border-slate-500/30 text-slate-300'
                                }`}>
                                    {action}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleDashboardTicker(holding.ticker); }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                                isInDashboard
                                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                            }`}
                        >
                            <LayoutDashboard className="w-3.5 h-3.5" />
                            {isInDashboard ? 'On Board' : 'Board'}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-cyan-400 transition-colors"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-rose-500/15 bg-rose-500/5 text-rose-400/70 hover:text-rose-400 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
