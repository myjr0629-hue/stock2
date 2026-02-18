// M7 Analyst Consensus Component - Infographic bg + per-symbol compact detail
'use client';
import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { RecommendationTrend } from '@/services/finnhubClient';

interface M7AnalystConsensusProps {
    recommendations: Record<string, RecommendationTrend>;
}

// SVG Infographic Background — scale/gauge pattern for analyst consensus
function ConsensusBg() {
    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
            <defs>
                <linearGradient id="csGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.02" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.25" />
                </linearGradient>
            </defs>
            {/* Gauge fill */}
            <path d="M30 140 A70 70 0 0 1 170 140 L155 140 A55 55 0 0 0 45 140 Z" fill="url(#csGrad)" />
            {/* Semi-circle gauge */}
            <path d="M30 140 A70 70 0 0 1 170 140" stroke="#22d3ee" strokeWidth="2.5" fill="none" opacity="0.25" />
            <path d="M45 140 A55 55 0 0 1 155 140" stroke="#22d3ee" strokeWidth="1.5" fill="none" opacity="0.15" />
            {/* Gauge needle */}
            <line x1="100" y1="140" x2="55" y2="85" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <circle cx="100" cy="140" r="4" fill="#22d3ee" opacity="0.25" />
            {/* Scale marks */}
            <line x1="30" y1="140" x2="35" y2="130" stroke="#22d3ee" strokeWidth="1.5" opacity="0.2" />
            <line x1="50" y1="95" x2="58" y2="100" stroke="#22d3ee" strokeWidth="1.5" opacity="0.2" />
            <line x1="100" y1="70" x2="100" y2="78" stroke="#22d3ee" strokeWidth="1.5" opacity="0.2" />
            <line x1="150" y1="95" x2="142" y2="100" stroke="#22d3ee" strokeWidth="1.5" opacity="0.2" />
            <line x1="170" y1="140" x2="165" y2="130" stroke="#22d3ee" strokeWidth="1.5" opacity="0.2" />
            {/* % watermark */}
            <text x="152" y="48" fontSize="34" fill="#22d3ee" opacity="0.12" fontWeight="bold">%</text>
        </svg>
    );
}

export function M7AnalystConsensus({ recommendations }: M7AnalystConsensusProps) {
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

    if (!aggregated) {
        return (
            <div className="relative overflow-hidden bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 h-full">
                <ConsensusBg />
                <div className="relative z-10 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase font-jakarta">ANALYST CONSENSUS</span>
                </div>
                <p className="relative z-10 text-xs text-white/70 mt-2">No data available</p>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 shadow-md h-full">
            <ConsensusBg />
            {/* Top accent */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-bold text-white tracking-wider uppercase font-jakarta">ANALYST CONSENSUS</span>
                    </div>
                    <span className="text-[11px] text-white/70 font-num font-jakarta">{aggregated.total} analysts</span>
                </div>

                {/* Sentiment Bar */}
                <div className="mb-2">
                    <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                        <div className="bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${aggregated.bullishPct}%` }} />
                        <div className="bg-slate-500" style={{ width: `${100 - aggregated.bullishPct - aggregated.bearishPct}%` }} />
                        <div className="bg-gradient-to-r from-rose-400 to-rose-600" style={{ width: `${aggregated.bearishPct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px]">
                        <span className="text-emerald-400 font-bold font-num">{aggregated.bullishPct.toFixed(0)}% Bullish</span>
                        <span className="text-rose-400 font-bold font-num">{aggregated.bearishPct.toFixed(0)}% Bearish</span>
                    </div>
                </div>

                {/* Compact Breakdown */}
                <div className="grid grid-cols-5 gap-1.5 text-center mb-2">
                    <div className="bg-emerald-500/10 rounded p-1.5 border border-emerald-500/20">
                        <div className="text-sm font-extrabold text-white font-num">{aggregated.strongBuy}</div>
                        <div className="text-[9px] text-emerald-400 uppercase font-jakarta">Strong Buy</div>
                    </div>
                    <div className="bg-emerald-500/5 rounded p-1.5 border border-emerald-500/10">
                        <div className="text-sm font-extrabold text-white font-num">{aggregated.buy}</div>
                        <div className="text-[9px] text-emerald-400/80 uppercase font-jakarta">Buy</div>
                    </div>
                    <div className="bg-slate-700/30 rounded p-1.5 border border-slate-600/30">
                        <div className="text-sm font-extrabold text-white font-num">{aggregated.hold}</div>
                        <div className="text-[9px] text-white/60 uppercase font-jakarta">Hold</div>
                    </div>
                    <div className="bg-rose-500/5 rounded p-1.5 border border-rose-500/10">
                        <div className="text-sm font-extrabold text-white font-num">{aggregated.sell}</div>
                        <div className="text-[9px] text-rose-400/80 uppercase font-jakarta">Sell</div>
                    </div>
                    <div className="bg-rose-500/10 rounded p-1.5 border border-rose-500/20">
                        <div className="text-sm font-extrabold text-white font-num">{aggregated.strongSell}</div>
                        <div className="text-[9px] text-rose-400 uppercase font-jakarta">Strong Sell</div>
                    </div>
                </div>

                {/* Per-Symbol compact: 2-column grid fills remaining space */}
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
                                    <span className="text-[11px] font-bold text-white w-9 font-jakarta">{symbol}</span>
                                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${sentiment === 'bullish' ? 'bg-emerald-400/50' : sentiment === 'bearish' ? 'bg-rose-400/50' : 'bg-slate-500/50'}`}
                                            style={{ width: `${bullPct}%` }}
                                        />
                                    </div>
                                    <span className={`text-[11px] font-bold font-num ${sentiment === 'bullish' ? 'text-emerald-400' : sentiment === 'bearish' ? 'text-rose-400' : 'text-white/50'}`}>
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
