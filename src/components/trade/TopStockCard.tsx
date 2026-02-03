"use client";

interface ScoreBreakdown {
    momentum: number;
    options: number;
    structure: number;
    regime: number;
    risk: number;
}

interface TopStockCardProps {
    rank: number;
    symbol: string;
    price: number;
    changePercent: number;
    volume: string;
    alphaScore: number;
    scores: ScoreBreakdown;
    whaleFlow?: number;           // In millions
    callWall?: number;
    putFloor?: number;
    entryPrice?: number;
    targetPrice?: number;
    targetPercent?: number;
    onViewScenario?: () => void;
}

/**
 * Top Stock Card
 * Premium ranking card with score breakdown and scenario preview
 */
export function TopStockCard({
    rank,
    symbol,
    price,
    changePercent,
    volume,
    alphaScore,
    scores,
    whaleFlow,
    callWall,
    putFloor,
    entryPrice,
    targetPrice,
    targetPercent,
    onViewScenario,
}: TopStockCardProps) {
    const tier = alphaScore >= 75 ? "ACTIONABLE" :
        alphaScore >= 55 ? "WATCH" : "FILLER";

    const tierColor = alphaScore >= 75 ? "emerald" :
        alphaScore >= 55 ? "amber" : "slate";

    const formatPrice = (p: number) => `$${p.toFixed(0)}`;
    const formatPercent = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;

    // Factor bars data
    const factors = [
        { key: "mom", value: scores.momentum, max: 20 },
        { key: "opt", value: scores.options, max: 20 },
        { key: "str", value: scores.structure, max: 20 },
        { key: "reg", value: scores.regime, max: 20 },
        { key: "rsk", value: scores.risk, max: 20 },
    ];

    return (
        <div className="relative bg-gradient-to-br from-[#0a0a1a]/95 to-[#0f1428]/95 backdrop-blur-xl rounded-2xl border border-[#1a2744] shadow-2xl overflow-hidden group hover:border-cyan-500/30 transition-all duration-300">
            {/* Glow effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-transparent group-hover:from-cyan-500/5 transition-all pointer-events-none" />

            {/* Rank Badge */}
            <div className="absolute top-4 left-4 z-10">
                <div className={`text-4xl font-black font-mono leading-none
                    ${rank === 1 ? 'text-amber-400' :
                        rank === 2 ? 'text-slate-300' :
                            rank === 3 ? 'text-amber-600' : 'text-slate-600'}
                    drop-shadow-lg
                `}>
                    {rank}
                </div>
            </div>

            {/* Header */}
            <div className="relative px-6 pt-4 pb-3 pl-16">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-xl font-black text-white tracking-tight group-hover:text-cyan-400 transition-colors">
                            {symbol}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-lg font-mono font-bold text-white">
                                ${price.toFixed(2)}
                            </span>
                            <span className={`text-sm font-mono font-bold flex items-center gap-1
                                ${changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                            `}>
                                <svg
                                    className={`w-3 h-3 ${changePercent < 0 ? 'rotate-180' : ''}`}
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <polygon points="12,4 20,16 4,16" />
                                </svg>
                                {formatPercent(changePercent)}
                            </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                            Vol: {volume}
                        </div>
                    </div>

                    {/* Alpha Score Circle */}
                    <div className="relative">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                            <circle
                                cx="18" cy="18" r="15"
                                fill="none"
                                stroke="#1a2744"
                                strokeWidth="3"
                            />
                            <circle
                                cx="18" cy="18" r="15"
                                fill="none"
                                stroke={tierColor === 'emerald' ? '#10b981' : tierColor === 'amber' ? '#f59e0b' : '#64748b'}
                                strokeWidth="3"
                                strokeDasharray={`${alphaScore * 0.94} 100`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-mono font-black text-white">{alphaScore}</span>
                            <span className="text-[7px] text-slate-500 uppercase">Alpha</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tier Badge */}
            <div className="px-6 pb-3">
                <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border
                    ${tierColor === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : ''}
                    ${tierColor === 'amber' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : ''}
                    ${tierColor === 'slate' ? 'bg-slate-500/10 border-slate-500/30 text-slate-400' : ''}
                `}>
                    {tier}
                </span>
            </div>

            {/* Factor Bars */}
            <div className="px-6 pb-4">
                <div className="flex gap-1">
                    {factors.map((factor) => (
                        <div key={factor.key} className="flex-1">
                            <div className="h-1.5 bg-[#0f1428] rounded-full overflow-hidden border border-[#1a2744]">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full"
                                    style={{ width: `${(factor.value / factor.max) * 100}%` }}
                                />
                            </div>
                            <div className="text-[7px] text-slate-600 text-center mt-1 uppercase">
                                {factor.key}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="px-6 py-3 border-t border-[#1a2744] flex items-center gap-4 text-[10px]">
                {whaleFlow !== undefined && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Whale</span>
                        <span className={`font-mono font-bold ${whaleFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {whaleFlow >= 0 ? '+' : ''}{whaleFlow.toFixed(1)}M
                        </span>
                    </div>
                )}
                {callWall && putFloor && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">CW/PF</span>
                        <span className="font-mono text-slate-300">
                            {formatPrice(callWall)}/{formatPrice(putFloor)}
                        </span>
                    </div>
                )}
            </div>

            {/* Scenario Preview */}
            {entryPrice && targetPrice && (
                <div className="px-6 py-3 border-t border-[#1a2744] bg-[#0a0a14]/50">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] text-slate-500">
                            Entry <span className="font-mono font-bold text-slate-300">{formatPrice(entryPrice)}</span>
                            <span className="mx-2 text-slate-600">→</span>
                            Target <span className="font-mono font-bold text-emerald-400">{formatPrice(targetPrice)}</span>
                            <span className="ml-1 text-emerald-400">({formatPercent(targetPercent || 0)})</span>
                        </div>
                    </div>
                </div>
            )}

            {/* CTA Button */}
            {onViewScenario && (
                <button
                    onClick={onViewScenario}
                    className="w-full py-3 bg-gradient-to-r from-cyan-600/20 to-cyan-500/20 border-t border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider hover:from-cyan-600/30 hover:to-cyan-500/30 transition-all flex items-center justify-center gap-2"
                >
                    View Scenario
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>
            )}
        </div>
    );
}

export default TopStockCard;
