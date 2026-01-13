
// Physical AI Briefing & Tactical Deck
'use client';
import { useMemo } from 'react';
import Image from 'next/image';
import { TypewriterText } from '@/components/guardian/TypewriterText';
import { Bot, ArrowUpRight, ArrowDownRight, CircuitBoard } from 'lucide-react';
import { TickerItem } from '@/app/intel/IntelClientPage';

// ----------------------------------------------------------------------
// 1. Briefing Bar (Mechanized Font)
// ----------------------------------------------------------------------
export function PhysicalAIBriefingBar({ message }: { message: string }) {
    return (
        <div className="w-full bg-[#0c0a00] border-y border-amber-900/30 py-3 px-6 flex items-center gap-4 shadow-inner relative overflow-hidden">
            <div className="absolute inset-0 bg-amber-900/5 pointer-events-none" />
            <div className="flex items-center gap-2 text-amber-500 animate-[pulse_2s_infinite]">
                <Bot className="w-4 h-4" />
                <span className="text-[10px] font-black tracking-widest uppercase font-mono">SYS_LOG:</span>
            </div>

            <div className="flex-1 font-mono text-sm text-amber-100/80 overflow-hidden whitespace-nowrap z-10">
                <TypewriterText text={message} speed={20} />
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 2. Tactical Deck (Clone of M7 Deck with Amber Theme)
// ----------------------------------------------------------------------
export function PhysicalAITacticalDeck({ items, selectedTicker, onSelect }: { items: TickerItem[], selectedTicker: TickerItem | null, onSelect: (item: TickerItem) => void }) {

    // Sort by Alpha
    const sorted = useMemo(() => [...items].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0)), [items]);
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

                    // [V4.4] Calculate displayScore from evidence when alphaScore is missing
                    // Uses price change as primary signal: +3% = 70, 0% = 50, -3% = 30
                    const displayScore = item.alphaScore || Math.round(50 + (change * 6.67));
                    const clampedScore = Math.max(20, Math.min(90, displayScore));

                    // Amber Industrial Theme
                    const borderColor = isSelected ? "border-amber-500" : "border-slate-800 hover:border-amber-700/50";
                    const bgGlow = isSelected ? "bg-amber-900/20" : "bg-[#0a0f18]";
                    const scoreColor = clampedScore && clampedScore >= 60 ? "text-amber-400" : "text-slate-500";

                    return (
                        <div
                            key={item.ticker}
                            onClick={() => onSelect(item)}
                            className={`relative group cursor-pointer rounded-sm border ${borderColor} ${bgGlow} p-4 transition-all duration-300 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:-translate-y-1 overflow-hidden`}
                        >
                            {/* Corner Decals (Industrial) */}
                            <div className="absolute top-0 right-0 p-1 opacity-20">
                                <CircuitBoard className="w-12 h-12 text-amber-500 transform rotate-45" />
                            </div>

                            {/* Rank Badge */}
                            <div className="absolute top-0 left-0 px-2 py-1 bg-amber-950/50 border-b border-r border-amber-900/30 rounded-br-sm text-[10px] font-bold text-amber-700 font-mono">
                                UNIT_0{idx + 1}
                            </div>

                            <div className="flex flex-col items-center text-center space-y-3 mt-2 relative z-10">
                                {/* Logo & Halo */}
                                <div className={`relative w-14 h-14 rounded-full border-2 p-0.5 ${isUp ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-rose-800/50 shadow-[0_0_15px_rgba(225,29,72,0.2)]'}`}>
                                    <div className="relative w-full h-full rounded-full overflow-hidden bg-white/5">
                                        <img
                                            src={getLogoUrl(item.ticker)}
                                            alt={item.ticker}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.5'; }}
                                        />
                                    </div>
                                    {/* Alpha Score Badge */}
                                    <div className="absolute -right-2 -bottom-1 bg-[#050914] border border-amber-900/50 text-xs font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-0.5 shadow-sm">
                                        <span className={scoreColor}>{clampedScore}</span>
                                    </div>
                                </div>

                                {/* Ticker & Price */}
                                <div>
                                    <h3 className="text-lg font-black text-slate-100 tracking-tight leading-none font-mono">{item.ticker}</h3>
                                    <div className={`flex items-center justify-center gap-1.5 mt-1 text-xs font-bold ${isUp ? 'text-amber-500' : 'text-rose-500'}`}>
                                        {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                        {Math.abs(change).toFixed(2)}%
                                    </div>
                                </div>

                                {/* Action Button */}
                                <div className={`w-full py-1.5 rounded-sm text-[10px] font-black tracking-widest uppercase border ${action === 'BUY' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-600'}`}>
                                    {action}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
