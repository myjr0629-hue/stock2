// Physical AI Options Pulse - Darker Orange Theme
'use client';
import { useEffect, useState } from 'react';
import { Zap, RefreshCw } from 'lucide-react';

const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];

interface OptionsData {
    ticker: string;
    gex: number;
    pcr: number;
    netPremium: number;
    gammaRegime: string;
}

export function PhysicalAIOptionsPulse() {
    const [items, setItems] = useState<OptionsData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch(`/api/watchlist/batch?tickers=${PHYSICAL_AI_TICKERS.join(',')}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    const newItems: OptionsData[] = [];
                    data.results?.forEach((item: any) => {
                        const rt = item.realtime || {};
                        const gex = rt.gex || 0;
                        let gammaRegime = 'NEUTRAL';
                        if (gex > 0) gammaRegime = 'LONG';
                        else if (gex < 0) gammaRegime = 'SHORT';

                        newItems.push({
                            ticker: item.ticker,
                            gex: gex,
                            pcr: rt.pcr || 1,
                            netPremium: rt.netPremium || 0,
                            gammaRegime
                        });
                    });
                    setItems(newItems);
                }
                setLoading(false);
            } catch (e) {
                console.error('[PhysicalAI] Options fetch failed:', e);
                setLoading(false);
            }
        }
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const aggregated = {
        totalGex: items.reduce((acc, i) => acc + i.gex, 0),
        avgPcr: items.length > 0 ? items.reduce((acc, i) => acc + i.pcr, 0) / items.length : 1,
        totalNetPremium: items.reduce((acc, i) => acc + i.netPremium, 0),
        gammaRegime: items.filter(i => i.gammaRegime === 'LONG').length > items.filter(i => i.gammaRegime === 'SHORT').length ? 'LONG' :
            items.filter(i => i.gammaRegime === 'SHORT').length > items.filter(i => i.gammaRegime === 'LONG').length ? 'SHORT' : 'NEUTRAL'
    };

    const formatGex = (gex: number) => {
        const absGex = Math.abs(gex);
        if (absGex >= 1e9) return `${(gex / 1e9).toFixed(1)}B`;
        if (absGex >= 1e6) return `${(gex / 1e6).toFixed(0)}M`;
        return `${(gex / 1e3).toFixed(0)}K`;
    };

    const formatPremium = (premium: number) => {
        const absPremium = Math.abs(premium);
        if (absPremium >= 1e9) return `$${(premium / 1e9).toFixed(1)}B`;
        if (absPremium >= 1e6) return `$${(premium / 1e6).toFixed(0)}M`;
        return `$${(premium / 1e3).toFixed(0)}K`;
    };

    if (loading) {
        return (
            <div className="bg-[#1a1208] border border-orange-900/50 rounded-lg p-3 flex items-center justify-center min-h-[100px]">
                <RefreshCw className="w-4 h-4 animate-spin text-orange-600" />
            </div>
        );
    }

    const sentiment = aggregated.totalGex > 0 && aggregated.avgPcr < 0.9 ? 'BULLISH' :
        aggregated.totalGex < 0 && aggregated.avgPcr > 1.1 ? 'BEARISH' : 'NEUTRAL';

    return (
        <div className="bg-[#1a1208] border border-orange-900/50 rounded-lg p-3 shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-[10px] font-bold text-white tracking-wider uppercase">PHYSICAL AI OPTIONS PULSE</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${sentiment === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                        sentiment === 'BEARISH' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-stone-700 text-white/60'
                    }`}>
                    {sentiment}
                </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
                {/* Total GEX */}
                <div className={`p-2.5 rounded-lg border ${aggregated.totalGex > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-white/60 uppercase">Total GEX</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.totalGex > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {aggregated.totalGex > 0 ? '+' : ''}{formatGex(aggregated.totalGex)}
                    </div>
                </div>

                {/* Avg PCR */}
                <div className={`p-2.5 rounded-lg border ${aggregated.avgPcr < 0.8 ? 'bg-emerald-500/5 border-emerald-500/20' : aggregated.avgPcr > 1.1 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-stone-800/50 border-stone-700/30'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-white/60 uppercase">Avg PCR</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.avgPcr < 0.8 ? 'text-emerald-400' : aggregated.avgPcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                        {aggregated.avgPcr.toFixed(2)}
                    </div>
                </div>

                {/* Net Premium */}
                <div className={`p-2.5 rounded-lg border ${aggregated.totalNetPremium > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-white/60 uppercase">Net Premium</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.totalNetPremium > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPremium(aggregated.totalNetPremium)}
                    </div>
                </div>

                {/* Gamma Regime */}
                <div className={`p-2.5 rounded-lg border ${aggregated.gammaRegime === 'LONG' ? 'bg-orange-700/10 border-orange-700/20' : aggregated.gammaRegime === 'SHORT' ? 'bg-amber-700/10 border-amber-700/20' : 'bg-stone-800/50 border-stone-700/30'}`}>
                    <div className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-white/60 uppercase">Gamma Regime</span>
                    </div>
                    <div className={`text-lg font-black ${aggregated.gammaRegime === 'LONG' ? 'text-orange-600' : aggregated.gammaRegime === 'SHORT' ? 'text-amber-600' : 'text-white'}`}>
                        {aggregated.gammaRegime}
                    </div>
                </div>
            </div>
        </div>
    );
}
