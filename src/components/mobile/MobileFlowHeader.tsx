"use client";

import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { FavoriteToggle } from '@/components/FavoriteToggle';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useRouter } from 'next/navigation';

interface MobileFlowHeaderProps {
    ticker: string;
    name?: string;
    displayPrice: number;
    displayChangePct: number;
    activeExtPrice?: number;
    activeExtPct?: number;
    activeExtLabel?: string;
    activeExtType?: string;
    /** SVG polyline points for mini sparkline */
    sparklinePath?: string | null;
    sparklineIsUp?: boolean;
}

export function MobileFlowHeader({
    ticker,
    name,
    displayPrice,
    displayChangePct,
    activeExtPrice,
    activeExtPct,
    activeExtLabel,
    activeExtType,
    sparklinePath,
    sparklineIsUp = true,
}: MobileFlowHeaderProps) {
    const { status } = useMarketStatus();
    const router = useRouter();
    const isPositive = displayChangePct >= 0;

    return (
        <div className="sticky top-14 z-40 bg-[#0a0f1a]/95 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-3 pb-2.5">
            {/* ===== ROW 1: Back + Logo + Ticker + Name + ♥ ===== */}
            <div className="flex items-center gap-2 mb-2">
                {/* Back button */}
                <button
                    onClick={() => router.back()}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] border border-white/[0.08] shrink-0 active:bg-white/10 transition-colors"
                    aria-label="Go back"
                >
                    <ChevronLeft size={16} className="text-slate-300" />
                </button>

                {/* Ticker logo */}
                <div className="relative w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0 border border-white/[0.08]">
                    <img
                        loading="eager"
                        src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                        alt={ticker}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>

                {/* Ticker + Company name */}
                <div className="flex flex-col min-w-0">
                    <span className="text-[17px] font-black text-white tracking-tight leading-tight">{ticker}</span>
                    <span className="text-[11px] text-slate-400 font-medium tracking-tight truncate max-w-[180px] leading-tight">
                        {name || 'Loading...'}
                    </span>
                </div>

                {/* Favorite heart — next to ticker per 시안 */}
                <div className="ml-1 shrink-0">
                    <FavoriteToggle ticker={ticker} name={name} />
                </div>

                {/* ••• more menu placeholder (matches 시안) */}
                <div className="ml-auto shrink-0">
                    <div className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.06]">
                        <span className="text-slate-400 text-[14px] font-bold tracking-widest leading-none">···</span>
                    </div>
                </div>
            </div>

            {/* ===== ROW 2: Price + Change% + Sparkline ===== */}
            <div className="flex items-center gap-3 mb-1.5">
                <span className="text-[26px] font-black text-white tracking-tight tabular-nums leading-none">
                    ${displayPrice?.toFixed(2) || '—'}
                </span>
                <span className={`text-[15px] font-bold tabular-nums tracking-tight ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {displayChangePct > 0 ? '+' : ''}{displayChangePct?.toFixed(2)}%
                </span>

                {/* Sparkline — right side */}
                {sparklinePath && (
                    <div className="ml-auto shrink-0">
                        <svg width="60" height="24" viewBox="0 0 60 24" className="opacity-80">
                            <polyline
                                points={sparklinePath}
                                fill="none"
                                stroke={sparklineIsUp ? '#10b981' : '#f43f5e'}
                                strokeWidth="1.8"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                )}
            </div>

            {/* ===== ROW 3: Session status + Extended price ===== */}
            <div className="flex items-center gap-2">
                {status && (
                    <>
                        {/* Session dot */}
                        <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                            {status.session !== 'closed' && (
                                <span className={`absolute inline-flex h-2 w-2 rounded-full opacity-75 animate-ping ${
                                    status.session === 'regular' ? 'bg-emerald-400' :
                                    status.session === 'pre' ? 'bg-amber-400' :
                                    'bg-indigo-400'
                                }`}></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                status.session === 'regular' ? 'bg-emerald-500' :
                                status.session === 'pre' ? 'bg-amber-500' :
                                status.session === 'post' ? 'bg-indigo-500' :
                                'bg-slate-500'
                            }`}></span>
                        </div>
                    </>
                )}

                {/* Extended price info */}
                {activeExtPrice && activeExtPrice > 0 && activeExtLabel ? (
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border shrink-0 ${
                        activeExtType?.includes('PRE') ? 'bg-amber-500/10 border-amber-500/20' : 'bg-cyan-500/10 border-cyan-500/20'
                    }`}>
                        <span className={`text-[11px] font-bold whitespace-nowrap ${
                            activeExtType?.includes('PRE') ? 'text-amber-400' : 'text-cyan-400'
                        }`}>{activeExtLabel}</span>
                        <span className="text-[12px] font-black text-white tabular-nums">${activeExtPrice.toFixed(2)}</span>
                        {activeExtPct != null && (
                            <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${activeExtPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {activeExtPct > 0 ? '+' : ''}{activeExtPct.toFixed(2)}%
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-[11px] text-slate-500 font-medium">
                        {status?.session === 'regular' ? 'MARKET OPEN' : status?.session === 'pre' ? 'PRE-MARKET' : status?.session === 'post' ? 'AFTER HOURS' : 'MARKET CLOSED'}
                    </span>
                )}
            </div>
        </div>
    );
}
