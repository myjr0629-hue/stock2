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
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 border border-white/5">
                        <img
                            loading="eager"
                            src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                            alt={ticker}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-2xl font-black text-white tracking-tighter font-jakarta leading-none">{ticker}</h1>
                        <span className="text-[11px] text-slate-400 font-bold tracking-tight uppercase truncate max-w-[150px] mt-0.5">{name}</span>
                    </div>
                </div>

                <div className="flex flex-col items-end text-right">
                    <span className="text-3xl font-black text-white tracking-tighter tabular-nums leading-none">
                        ${displayPrice.toFixed(2)}
                    </span>
                    <span className={`text-[15px] font-bold font-mono tracking-tighter mt-1 ${displayChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {displayChange > 0 ? '+' : ''}{displayChange.toFixed(2)}%
                    </span>
                </div>
            </div>

            {/* Tags and Extended Hours Row */}
            <div className="flex items-center justify-between mt-3 flex-wrap gap-y-2">
                <div className="flex flex-wrap gap-1.5 items-center">
                    {status && <MarketStatusBadge status={status} />}
                    {sector && (
                        <span className="text-[10px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-sm whitespace-nowrap">
                            {sector}
                        </span>
                    )}
                </div>

                {/* Extended Hours inline for mobile */}
                {ssrExtPrice && ssrExtPrice > 0 && ssrExtLabel && (
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded border shrink-0 ${
                        ssrExtLabel.includes('PRE') ? 'bg-amber-500/10 border-amber-500/20' : 'bg-cyan-500/10 border-cyan-500/20'
                    }`}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            ssrExtLabel.includes('PRE') ? 'bg-amber-400' : 'bg-cyan-400'
                        }`} />
                        <span className={`text-[10px] font-bold whitespace-nowrap ${
                            ssrExtLabel.includes('PRE') ? 'text-amber-400' : 'text-cyan-400'
                        }`}>{ssrExtLabel}</span>
                        <span className="text-[11px] font-black text-white tabular-nums">${ssrExtPrice.toFixed(2)}</span>
                        {ssrExtChangePct != null && (
                            <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${ssrExtChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {ssrExtChangePct > 0 ? '+' : ''}{ssrExtChangePct.toFixed(2)}%
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
