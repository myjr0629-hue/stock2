// Physical AI Analyst Consensus - Darker Orange Theme
'use client';
import { useMemo, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, HardHat, RefreshCw } from 'lucide-react';
import { RecommendationTrend } from '@/services/finnhubClient';

export function PhysicalAIAnalystConsensus() {
    const [recommendations, setRecommendations] = useState<Record<string, RecommendationTrend>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchRecommendations() {
            try {
                const res = await fetch('/api/physicalai/calendar', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setRecommendations(data.recommendations || {});
                }
                setLoading(false);
            } catch (e) {
                console.error('[PhysicalAI] Recommendations fetch failed:', e);
                setLoading(false);
            }
        }
        fetchRecommendations();
    }, []);

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
            <div className="bg-[#1a1208] border border-orange-900/50 rounded-lg p-3 flex items-center justify-center min-h-[120px]">
                <RefreshCw className="w-4 h-4 animate-spin text-orange-600" />
            </div>
        );
    }

    if (!aggregated) {
        return (
            <div className="bg-[#1a1208] border border-orange-900/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                    <HardHat className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">ANALYST CONSENSUS</span>
                </div>
                <p className="text-xs text-white/70 mt-2">No data available</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1a1208] border border-orange-900/50 rounded-lg p-3 shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <HardHat className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">ANALYST CONSENSUS</span>
                </div>
                <span className="text-[9px] text-white/70">{aggregated.total} analysts</span>
            </div>

            {/* Sentiment Bar */}
            <div className="mb-3">
                <div className="flex h-2 rounded-full overflow-hidden bg-stone-800">
                    <div className="bg-gradient-to-r from-orange-700 to-amber-600" style={{ width: `${aggregated.bullishPct}%` }} />
                    <div className="bg-stone-600" style={{ width: `${100 - aggregated.bullishPct - aggregated.bearishPct}%` }} />
                    <div className="bg-gradient-to-r from-stone-400 to-stone-600" style={{ width: `${aggregated.bearishPct}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[9px]">
                    <span className="text-orange-600 font-bold">{aggregated.bullishPct.toFixed(0)}% Bullish</span>
                    <span className="text-stone-400 font-bold">{aggregated.bearishPct.toFixed(0)}% Bearish</span>
                </div>
            </div>

            {/* Compact Breakdown */}
            <div className="grid grid-cols-5 gap-1.5 text-center">
                <div className="bg-orange-700/10 rounded p-1.5 border border-orange-700/20">
                    <div className="text-sm font-black text-white">{aggregated.strongBuy}</div>
                    <div className="text-[7px] text-orange-600 uppercase">Strong Buy</div>
                </div>
                <div className="bg-amber-700/5 rounded p-1.5 border border-amber-700/10">
                    <div className="text-sm font-black text-white">{aggregated.buy}</div>
                    <div className="text-[7px] text-amber-600/80 uppercase">Buy</div>
                </div>
                <div className="bg-stone-700/30 rounded p-1.5 border border-stone-600/30">
                    <div className="text-sm font-black text-white">{aggregated.hold}</div>
                    <div className="text-[7px] text-white/60 uppercase">Hold</div>
                </div>
                <div className="bg-stone-500/5 rounded p-1.5 border border-stone-500/10">
                    <div className="text-sm font-black text-white">{aggregated.sell}</div>
                    <div className="text-[7px] text-stone-400/80 uppercase">Sell</div>
                </div>
                <div className="bg-stone-600/10 rounded p-1.5 border border-stone-500/20">
                    <div className="text-sm font-black text-white">{aggregated.strongSell}</div>
                    <div className="text-[7px] text-stone-400 uppercase">Strong Sell</div>
                </div>
            </div>

            {/* Per-Symbol Badges */}
            <div className="mt-2 pt-2 border-t border-orange-900/30">
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(recommendations).map(([symbol, rec]) => {
                        const bullish = (rec.strongBuy || 0) + (rec.buy || 0);
                        const bearish = (rec.sell || 0) + (rec.strongSell || 0);
                        const sentiment = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';

                        return (
                            <div
                                key={symbol}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${sentiment === 'bullish'
                                    ? 'bg-orange-700/10 border-orange-700/30 text-orange-600'
                                    : sentiment === 'bearish'
                                        ? 'bg-stone-500/10 border-stone-500/30 text-stone-400'
                                        : 'bg-stone-700/30 border-stone-600/30 text-white/70'
                                    }`}
                            >
                                <img src={getLogoUrl(symbol)} alt={symbol} className="w-3.5 h-3.5 rounded-full" />
                                <span>{symbol}</span>
                                {sentiment === 'bullish' && <TrendingUp className="w-2.5 h-2.5" />}
                                {sentiment === 'bearish' && <TrendingDown className="w-2.5 h-2.5" />}
                                {sentiment === 'neutral' && <Minus className="w-2.5 h-2.5" />}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
