
// M7 Tactical Deck - Compact Grid Infographic
'use client';
import { useMemo } from 'react';
import Image from 'next/image';
import { TickerItem } from '@/types/intel';
import { ArrowUpRight, ArrowDownRight, Minus, MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function M7TacticalDeck({ items, selectedTicker, onSelect }: { items: TickerItem[], selectedTicker: TickerItem | null, onSelect: (item: TickerItem) => void }) {
    const t = useTranslations('signal');

    // Sort by Alpha Score
    const sorted = useMemo(() => [...items].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0)), [items]);

    // [Fix] Replaced Clearbit with Parqet for better reliability (same as TacticalCard)
    const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    if (sorted.length === 0) return null;

    return (
        <div className="w-full">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sorted.map((item, idx) => {
                    const change = item.evidence?.price?.changePct || 0;
                    const isUp = change >= 0;
                    const isSelected = selectedTicker?.ticker === item.ticker;
                    const action = item.decisionSSOT?.action || "HOLD";
                    const tacticalKey = item.decisionSSOT?.tacticalConclusion?.key;
                    const tacticalDirection = item.decisionSSOT?.tacticalConclusion?.direction;

                    // Colors
                    const borderColor = isSelected ? "border-emerald-500" : "border-slate-800 hover:border-slate-600";
                    const bgGlow = isSelected ? "bg-emerald-900/10" : "bg-[#0a0f18]";
                    const scoreColor = item.alphaScore && item.alphaScore >= 80 ? "text-amber-400" : "text-slate-400";
                    const tacticalColor = tacticalDirection === 'BULLISH' ? 'text-emerald-400'
                        : tacticalDirection === 'BEARISH' ? 'text-rose-400'
                            : tacticalDirection === 'CAUTION' ? 'text-amber-400'
                                : 'text-slate-500';

                    return (
                        <div
                            key={item.ticker}
                            onClick={() => onSelect(item)}
                            className={`relative group cursor-pointer rounded-xl border ${borderColor} ${bgGlow} p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 overflow-hidden`}
                        >
                            {/* Rank Badge */}
                            <div className="absolute top-0 left-0 px-2 py-1 bg-slate-900/80 border-b border-r border-slate-800 rounded-br-lg text-[10px] font-bold text-slate-500 font-mono">
                                #{idx + 1}
                            </div>

                            <div className="flex flex-col items-center text-center space-y-3 mt-2">
                                {/* Logo & Halo */}
                                <div className={`relative w-14 h-14 rounded-full border-2 p-0.5 ${isUp ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.2)]'}`}>
                                    <div className="relative w-full h-full rounded-full overflow-hidden bg-white/5">
                                        <img
                                            src={getLogoUrl(item.ticker)}
                                            alt={item.ticker}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.opacity = '0.5';
                                            }}
                                        />
                                    </div>
                                    {/* Alpha Score Badge */}
                                    <div className="absolute -right-2 -bottom-1 bg-[#050914] border border-slate-700 text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                                        <span className={scoreColor}>{item.alphaScore}</span>
                                    </div>
                                </div>

                                {/* Ticker & Price */}
                                <div>
                                    <h3 className="text-lg font-black text-slate-100 tracking-tight leading-none">{item.ticker}</h3>
                                    <div className={`flex items-center justify-center gap-1.5 mt-1 text-xs font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                        {Math.abs(change).toFixed(2)}%
                                    </div>
                                </div>

                                {/* Action Button Look */}
                                <div className={`w-full py-1.5 rounded text-[10px] font-bold tracking-widest uppercase border ${action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                                    {action}
                                </div>

                                {/* [Phase 5] Tactical Conclusion - One-liner */}
                                {tacticalKey && (
                                    <div className={`w-full text-[9px] px-2 py-1 rounded bg-slate-900/50 ${tacticalColor} truncate`} title={t(tacticalKey)}>
                                        {t(tacticalKey)}
                                    </div>
                                )}
                            </div>

                            {/* Hover Hint */}
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                                <span className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                                    <MousePointerClick className="w-4 h-4 text-emerald-400" />
                                    View Intel
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
