import React from 'react';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { useTranslations } from 'next-intl';
import { useMarketStatus } from '@/hooks/useMarketStatus';

interface MobileCommandHeaderProps {
    ticker: string;
    name: string;
    displayPrice: number;
    displayChange: number;
    sector?: string | null;
    ssrExtPrice?: number | null;
    ssrExtChangePct?: number | null;
    ssrExtLabel?: string;
}

export function MobileCommandHeader({
    ticker,
    name,
    displayPrice,
    displayChange,
    sector,
    ssrExtPrice,
    ssrExtChangePct,
    ssrExtLabel
}: MobileCommandHeaderProps) {
    const td = useTranslations('dashboard');
    const { status } = useMarketStatus();
    
    return (
        <div className="w-full bg-slate-950/90 backdrop-blur-xl border-b border-white/5 pt-4 pb-3 px-5 mb-4 z-40 relative">
            {/* Row 1: Logo + Ticker ← → Price + Change% */}
            <div className="flex items-center gap-3 w-full">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0 border border-white/5">
                    <img
                        loading="eager"
                        src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                        alt={ticker}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
                <h1 className="text-[18px] font-extrabold text-white tracking-tight leading-none shrink-0">{ticker}</h1>
                <div className="ml-auto flex items-baseline gap-1.5 shrink-0">
                    <span className="text-[20px] font-bold text-white tracking-tight tabular-nums leading-none font-mono">
                        ${displayPrice.toFixed(2)}
                    </span>
                    <span className={`text-[13px] font-bold font-mono tracking-tight ${displayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {displayChange > 0 ? '+' : ''}{displayChange.toFixed(2)}%
                    </span>
                </div>
            </div>

            {/* Row 2: POST/PRE badge + Session dot ← → Sector tag */}
            <div className="flex items-center justify-between mt-2 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    {status && (
                        <div className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 relative">
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
                    )}
                    {ssrExtPrice && ssrExtPrice > 0 && ssrExtLabel && (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border shrink-0 ${
                            ssrExtLabel.includes('PRE') ? 'bg-amber-500/10 border-amber-500/20' : 'bg-purple-500/10 border-purple-500/20'
                        }`}>
                            <span className={`text-[10px] font-bold whitespace-nowrap ${
                                ssrExtLabel.includes('PRE') ? 'text-amber-400' : 'text-purple-300'
                            }`}>{ssrExtLabel}</span>
                            <span className="text-[11px] font-bold text-slate-200 tabular-nums font-mono">${ssrExtPrice.toFixed(2)}</span>
                            {ssrExtChangePct != null && (
                                <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap font-mono ${ssrExtChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {ssrExtChangePct > 0 ? '+' : ''}{ssrExtChangePct.toFixed(2)}%
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Sector tag (right-aligned, truncated) */}
                {sector && (
                    <span className="text-[9px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md truncate max-w-[140px]">
                        {sector}
                    </span>
                )}
            </div>
        </div>
    );
}
