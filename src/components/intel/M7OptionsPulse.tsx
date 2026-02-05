
// M7 Options Pulse - Aggregated Options Sentiment (Pure White Text)
'use client';
import { useMemo } from 'react';
import { TickerItem } from '@/types/intel';
import { TrendingUp, TrendingDown, BarChart3, Zap, Shield, Target } from 'lucide-react';

interface M7OptionsPulseProps {
    items: TickerItem[];
}

export function M7OptionsPulse({ items }: M7OptionsPulseProps) {
    const aggregated = useMemo(() => {
        if (items.length === 0) return null;

        let totalGex = 0, totalPcr = 0, totalNetPremium = 0;
        let gammaLong = 0, gammaShort = 0, validPcrCount = 0;

        items.forEach(item => {
            const options = item.evidence?.options;
            const flow = item.evidence?.flow;

            if (options) {
                totalGex += options.gex || 0;
                if (options.pcr && options.pcr > 0) {
                    totalPcr += options.pcr;
                    validPcrCount++;
                }
                if (options.gammaRegime === 'LONG') gammaLong++;
                else if (options.gammaRegime === 'SHORT') gammaShort++;
            }
            if (flow) totalNetPremium += flow.netPremium || 0;
        });

        const avgPcr = validPcrCount > 0 ? totalPcr / validPcrCount : 0;
        let gammaRegime = 'NEUTRAL';
        if (gammaLong > gammaShort + 2) gammaRegime = 'LONG';
        else if (gammaShort > gammaLong + 2) gammaRegime = 'SHORT';

        const sentiment = avgPcr < 0.7 ? 'BULLISH' : avgPcr > 1.2 ? 'BEARISH' : 'NEUTRAL';

        return {
            totalGex, avgPcr, totalNetPremium, gammaRegime,
            gammaLong, gammaShort, neutral: items.length - gammaLong - gammaShort, sentiment
        };
    }, [items]);

    if (!aggregated) {
        return (
            <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-white/70">No options data</div>
            </div>
        );
    }

    const formatGex = (gex: number) => {
        const absGex = Math.abs(gex);
        if (absGex >= 1e9) return `${(gex / 1e9).toFixed(1)}B`;
        if (absGex >= 1e6) return `${(gex / 1e6).toFixed(0)}M`;
        return `${(gex / 1e3).toFixed(0)}K`;
    };

    const formatPremium = (premium: number) => {
        const absPremium = Math.abs(premium);
        if (absPremium >= 1e9) return `$${(premium / 1e9).toFixed(2)}B`;
        if (absPremium >= 1e6) return `$${(premium / 1e6).toFixed(0)}M`;
        return `$${(premium / 1e3).toFixed(0)}K`;
    };

    return (
        <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-3 shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">M7 OPTIONS PULSE</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${aggregated.sentiment === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                        aggregated.sentiment === 'BEARISH' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-slate-700 text-white/70'
                    }`}>
                    {aggregated.sentiment}
                </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
                {/* Total GEX */}
                <div className={`p-2.5 rounded-lg border ${aggregated.totalGex > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'
                    }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 className={`w-3 h-3 ${aggregated.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
                        <span className="text-[9px] text-white/70 uppercase">Total GEX</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {aggregated.totalGex > 0 ? '+' : ''}{formatGex(aggregated.totalGex)}
                    </div>
                </div>

                {/* Avg PCR */}
                <div className={`p-2.5 rounded-lg border ${aggregated.avgPcr < 0.8 ? 'bg-emerald-500/5 border-emerald-500/20' :
                        aggregated.avgPcr > 1.1 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-800/30 border-slate-700/50'
                    }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Target className={`w-3 h-3 ${aggregated.avgPcr < 0.8 ? 'text-emerald-400' : aggregated.avgPcr > 1.1 ? 'text-rose-400' : 'text-white/60'
                            }`} />
                        <span className="text-[9px] text-white/70 uppercase">Avg PCR</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.avgPcr < 0.8 ? 'text-emerald-400' : aggregated.avgPcr > 1.1 ? 'text-rose-400' : 'text-white'
                        }`}>
                        {aggregated.avgPcr.toFixed(2)}
                    </div>
                </div>

                {/* Net Premium */}
                <div className={`p-2.5 rounded-lg border ${aggregated.totalNetPremium > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'
                    }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        {aggregated.totalNetPremium > 0
                            ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                            : <TrendingDown className="w-3 h-3 text-rose-400" />
                        }
                        <span className="text-[9px] text-white/70 uppercase">Net Premium</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.totalNetPremium > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {aggregated.totalNetPremium > 0 ? '+' : ''}{formatPremium(aggregated.totalNetPremium)}
                    </div>
                </div>

                {/* Gamma Regime */}
                <div className={`p-2.5 rounded-lg border ${aggregated.gammaRegime === 'LONG' ? 'bg-cyan-500/5 border-cyan-500/20' :
                        aggregated.gammaRegime === 'SHORT' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/30 border-slate-700/50'
                    }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Shield className={`w-3 h-3 ${aggregated.gammaRegime === 'LONG' ? 'text-cyan-400' :
                                aggregated.gammaRegime === 'SHORT' ? 'text-amber-400' : 'text-white/60'
                            }`} />
                        <span className="text-[9px] text-white/70 uppercase">Gamma Regime</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.gammaRegime === 'LONG' ? 'text-cyan-400' :
                            aggregated.gammaRegime === 'SHORT' ? 'text-amber-400' : 'text-white'
                        }`}>
                        {aggregated.gammaRegime}
                    </div>
                    <div className="text-[8px] text-white/50 mt-0.5">
                        L:{aggregated.gammaLong} S:{aggregated.gammaShort} N:{aggregated.neutral}
                    </div>
                </div>
            </div>
        </div>
    );
}
