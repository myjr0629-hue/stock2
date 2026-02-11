// ============================================================================
// Sector Analyst Consensus — Generic config-driven component
// Works with any SectorConfig (M7, Physical AI, Bio, Crypto...)
// Template: M7 design with infographic gauge background + per-symbol mini bars
// ============================================================================
'use client';
import { useMemo, useEffect, useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { RecommendationTrend } from '@/services/finnhubClient';
import type { SectorConfig } from '@/types/sector';

// SVG Infographic Background — gauge pattern
function GaugeBg() {
    return (
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            <path d="M30 140 A70 70 0 0 1 170 140" stroke="currentColor" strokeWidth="3" fill="none" />
            <path d="M45 140 A55 55 0 0 1 155 140" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <line x1="100" y1="140" x2="55" y2="85" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="100" cy="140" r="4" fill="currentColor" />
            <line x1="30" y1="140" x2="35" y2="130" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="95" x2="58" y2="100" stroke="currentColor" strokeWidth="1.5" />
            <line x1="100" y1="70" x2="100" y2="78" stroke="currentColor" strokeWidth="1.5" />
            <line x1="150" y1="95" x2="142" y2="100" stroke="currentColor" strokeWidth="1.5" />
            <line x1="170" y1="140" x2="165" y2="130" stroke="currentColor" strokeWidth="1.5" />
            <text x="155" y="45" fontSize="32" fill="currentColor" opacity="0.25" fontWeight="bold">%</text>
        </svg>
    );
}

interface SectorAnalystConsensusProps {
    config: SectorConfig;
    /** Pass recommendations directly, or leave undefined to auto-fetch from config.apiEndpoints.calendar */
    recommendations?: Record<string, RecommendationTrend>;
}

export function SectorAnalystConsensus({ config, recommendations: propRecs }: SectorAnalystConsensusProps) {
    const [fetchedRecs, setFetchedRecs] = useState<Record<string, RecommendationTrend>>({});
    const [loading, setLoading] = useState(!propRecs);

    // Auto-fetch if no props provided
    useEffect(() => {
        if (propRecs) return;
        const endpoint = config.apiEndpoints.calendar;
        if (!endpoint) { setLoading(false); return; }

        async function fetchData() {
            try {
                const res = await fetch(endpoint!, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setFetchedRecs(data.recommendations || {});
                }
            } catch (e) {
                console.error(`[${config.shortName}] Recommendations fetch failed:`, e);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [propRecs, config]);

    const recommendations = propRecs || fetchedRecs;

    const aggregated = useMemo(() => {
        const symbols = Object.keys(recommendations);
        if (symbols.length === 0) return null;

        let totalStrongBuy = 0, totalBuy = 0, totalHold = 0, totalSell = 0, totalStrongSell = 0;

        symbols.forEach(symbol => {
            const rec = recommendations[symbol];
            totalStrongBuy += rec.strongBuy || 0;
            totalBuy += rec.buy || 0;
            totalHold += rec.hold || 0;
            totalSell += rec.sell || 0;
            totalStrongSell += rec.strongSell || 0;
        });

        const total = totalStrongBuy + totalBuy + totalHold + totalSell + totalStrongSell;
        const bullish = totalStrongBuy + totalBuy;
        const bearish = totalSell + totalStrongSell;

        return {
            strongBuy: totalStrongBuy, buy: totalBuy, hold: totalHold, sell: totalSell, strongSell: totalStrongSell,
            total, bullishPct: total > 0 ? (bullish / total) * 100 : 0, bearishPct: total > 0 ? (bearish / total) * 100 : 0
        };
    }, [recommendations]);

    const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    if (loading) {
        return (
            <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 flex items-center justify-center min-h-[120px] h-full">
                <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
            </div>
        );
    }

    if (!aggregated) {
        return (
            <div className="relative overflow-hidden bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 h-full">
                <GaugeBg />
                <div className="relative z-10 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-bold text-white tracking-wider uppercase">ANALYST CONSENSUS</span>
                </div>
                <p className="relative z-10 text-xs text-white/70 mt-2">No data available</p>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 shadow-md h-full">
            <GaugeBg />
            {/* Top accent */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-bold text-white tracking-wider uppercase">ANALYST CONSENSUS</span>
                    </div>
                    <span className="text-[11px] text-white/70">{aggregated.total} analysts</span>
                </div>

                {/* Sentiment Bar */}
                <div className="mb-2">
                    <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                        <div className="bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${aggregated.bullishPct}%` }} />
                        <div className="bg-slate-500" style={{ width: `${100 - aggregated.bullishPct - aggregated.bearishPct}%` }} />
                        <div className="bg-gradient-to-r from-rose-400 to-rose-600" style={{ width: `${aggregated.bearishPct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px]">
                        <span className="text-emerald-400 font-bold">{aggregated.bullishPct.toFixed(0)}% Bullish</span>
                        <span className="text-rose-400 font-bold">{aggregated.bearishPct.toFixed(0)}% Bearish</span>
                    </div>
                </div>

                {/* Compact Breakdown */}
                <div className="grid grid-cols-5 gap-1.5 text-center mb-2">
                    <div className="bg-emerald-500/10 rounded p-1.5 border border-emerald-500/20">
                        <div className="text-sm font-black text-white">{aggregated.strongBuy}</div>
                        <div className="text-[7px] text-emerald-400 uppercase">Strong Buy</div>
                    </div>
                    <div className="bg-emerald-500/5 rounded p-1.5 border border-emerald-500/10">
                        <div className="text-sm font-black text-white">{aggregated.buy}</div>
                        <div className="text-[7px] text-emerald-400/80 uppercase">Buy</div>
                    </div>
                    <div className="bg-slate-700/30 rounded p-1.5 border border-slate-600/30">
                        <div className="text-sm font-black text-white">{aggregated.hold}</div>
                        <div className="text-[7px] text-white/60 uppercase">Hold</div>
                    </div>
                    <div className="bg-rose-500/5 rounded p-1.5 border border-rose-500/10">
                        <div className="text-sm font-black text-white">{aggregated.sell}</div>
                        <div className="text-[7px] text-rose-400/80 uppercase">Sell</div>
                    </div>
                    <div className="bg-rose-500/10 rounded p-1.5 border border-rose-500/20">
                        <div className="text-sm font-black text-white">{aggregated.strongSell}</div>
                        <div className="text-[7px] text-rose-400 uppercase">Strong Sell</div>
                    </div>
                </div>

                {/* Per-Symbol compact: 2-column grid */}
                <div className="border-t border-slate-800/50 pt-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {Object.entries(recommendations).map(([symbol, rec]) => {
                            const bullish = (rec.strongBuy || 0) + (rec.buy || 0);
                            const bearish = (rec.sell || 0) + (rec.strongSell || 0);
                            const total = bullish + bearish + (rec.hold || 0);
                            const bullPct = total > 0 ? (bullish / total) * 100 : 0;
                            const sentiment = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';

                            return (
                                <div key={symbol} className="flex items-center gap-1.5">
                                    <img src={getLogoUrl(symbol)} alt={symbol} className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
                                    <span className="text-[11px] font-bold text-white w-9">{symbol}</span>
                                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${sentiment === 'bullish' ? 'bg-emerald-400/50' : sentiment === 'bearish' ? 'bg-rose-400/50' : 'bg-slate-500/50'}`}
                                            style={{ width: `${bullPct}%` }}
                                        />
                                    </div>
                                    <span className={`text-[10px] font-bold ${sentiment === 'bullish' ? 'text-emerald-400' : sentiment === 'bearish' ? 'text-rose-400' : 'text-white/50'}`}>
                                        {bullPct.toFixed(0)}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
