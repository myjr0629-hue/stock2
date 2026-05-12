'use client';

// ============================================================================
// MobileTickerSheet — Premium Bottom Sheet (Depth 3)
// iOS-native bottom sheet with drag handle, Context Score circle,
// 4-metric grid, and CTA button.
// ============================================================================

import React from 'react';
import { MobileBottomSheet } from '@/components/mobile/MobileBottomSheet';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { useRouter } from '@/i18n/routing';

interface MobileTickerSheetProps {
    ticker: IntelQuote | null;
    isOpen: boolean;
    onClose: () => void;
}

function formatCompact(v: number): string {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

function getGradeInfo(score: number) {
    if (score >= 70) return { label: 'A', color: '#4ade80', text: 'text-emerald-400', desc: 'Multi-indicator alignment detected.' };
    if (score >= 55) return { label: 'B', color: '#60a5fa', text: 'text-blue-400', desc: 'Moderate signal convergence.' };
    if (score >= 40) return { label: 'C', color: '#fbbf24', text: 'text-amber-400', desc: 'Mixed signals. Selective positioning.' };
    return { label: 'D', color: '#f87171', text: 'text-rose-400', desc: 'Weak positioning. Caution advised.' };
}

const LOGO_URL = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

export function MobileTickerSheet({ ticker, isOpen, onClose }: MobileTickerSheetProps) {
    const router = useRouter();

    if (!ticker) return null;

    const isBullish = ticker.changePct >= 0;
    const grade = getGradeInfo(ticker.alphaScore);

    const handleNavigateToTerminal = () => {
        onClose();
        setTimeout(() => {
            router.push(`/dashboard?t=${ticker.ticker}`);
        }, 150);
    };

    return (
        <MobileBottomSheet isOpen={isOpen} onClose={onClose} title={ticker.ticker}>
            <div className="space-y-4">

                {/* 1. HEADER — Logo + Ticker + Price */}
                <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
                    {/* Logo */}
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 relative overflow-hidden border border-emerald-500/20">
                        <span className="text-[12px] font-bold text-emerald-400 absolute">{ticker.ticker.slice(0, 3)}</span>
                        <img
                            src={LOGO_URL(ticker.ticker)}
                            alt=""
                            className="w-full h-full object-cover absolute inset-0 rounded-xl"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                        <div className="text-[18px] font-bold text-white tracking-tight">{ticker.ticker}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{ticker.session === 'regular' || ticker.session === 'REG' ? 'LIVE' : ticker.session?.toUpperCase() || ''}</div>
                    </div>

                    {/* Price + Change */}
                    <div className="text-right shrink-0">
                        <div className="text-[18px] font-bold text-white font-mono">${ticker.price.toFixed(2)}</div>
                        <div className={`text-[12px] font-semibold mt-0.5 ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isBullish ? '+' : ''}{ticker.changePct.toFixed(2)}%
                        </div>
                    </div>
                </div>

                {/* 2. CONTEXT SCORE — Circle + Description */}
                <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
                    ticker.alphaScore >= 60
                        ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.10] to-emerald-500/[0.02]'
                        : ticker.alphaScore >= 40
                            ? 'border-amber-500/30 bg-gradient-to-r from-amber-500/[0.10] to-amber-500/[0.02]'
                            : 'border-rose-500/30 bg-gradient-to-r from-rose-500/[0.10] to-rose-500/[0.02]'
                }`}>
                    {/* Score Circle */}
                    <div className="shrink-0">
                        <svg width="52" height="52" viewBox="0 0 52 52">
                            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                            <circle
                                cx="26" cy="26" r="22"
                                fill="none"
                                stroke={grade.color}
                                strokeWidth="3"
                                strokeDasharray={`${2 * Math.PI * 22}`}
                                strokeDashoffset={`${2 * Math.PI * 22 * (1 - ticker.alphaScore / 100)}`}
                                strokeLinecap="round"
                                transform="rotate(-90 26 26)"
                                className="transition-all duration-700"
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center" style={{ width: 52, height: 52, marginTop: -52 }}>
                            <span className={`text-[16px] font-bold ${grade.text}`}>{Math.round(ticker.alphaScore)}</span>
                        </div>
                    </div>

                    {/* Score Info */}
                    <div className="flex-1 min-w-0">
                        <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${grade.text}`}>
                            CONTEXT SCORE {grade.label}
                        </div>
                        <div className="text-[12px] text-slate-300 leading-relaxed">
                            {grade.desc}
                        </div>
                    </div>
                </div>

                {/* 3. METRICS GRID */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#0f172a]/50 border border-white/[0.05] rounded-xl p-3">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">GEX</div>
                        <div className={`text-[14px] font-semibold font-mono ${ticker.gex > 0 ? 'text-emerald-400' : ticker.gex < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {ticker.gex !== 0 ? `${ticker.gex > 0 ? '+' : ''}${formatCompact(ticker.gex)}` : '-'}
                        </div>
                    </div>
                    <div className="bg-[#0f172a]/50 border border-white/[0.05] rounded-xl p-3">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Dark Pool</div>
                        <div className="text-[14px] font-semibold font-mono text-white">
                            {ticker.darkPoolPct > 0 ? `${ticker.darkPoolPct.toFixed(0)}%` : '-'}
                        </div>
                    </div>
                    <div className="bg-[#0f172a]/50 border border-white/[0.05] rounded-xl p-3">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">PCR</div>
                        <div className="text-[14px] font-semibold font-mono text-white">
                            {ticker.pcr > 0 ? ticker.pcr.toFixed(2) : '-'}
                        </div>
                    </div>
                    <div className="bg-[#0f172a]/50 border border-white/[0.05] rounded-xl p-3">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Net Prem</div>
                        <div className={`text-[14px] font-semibold font-mono ${ticker.netPremium && ticker.netPremium > 0 ? 'text-emerald-400' : ticker.netPremium && ticker.netPremium < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {ticker.netPremium ? `${ticker.netPremium > 0 ? '+' : ''}${formatCompact(ticker.netPremium)}` : '-'}
                        </div>
                    </div>
                </div>

                {/* 4. CTA BUTTON */}
                <button
                    onClick={handleNavigateToTerminal}
                    className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 touch-manipulation text-[13px] tracking-tight"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    Open Full Analysis →
                </button>
            </div>
        </MobileBottomSheet>
    );
}
