
// M7 Tactical Deck - Horizontal Command Center
'use client';
import { useMemo } from 'react';
import { TickerItem } from '@/app/intel/IntelClientPage';
import { TacticalCard } from '@/components/TacticalCard';
import { Shield } from 'lucide-react';

export function M7TacticalDeck({ items, selectedTicker, onSelect }: { items: TickerItem[], selectedTicker: TickerItem | null, onSelect: (item: TickerItem) => void }) {

    // 1. Sort: 1st place is ALWAYS the Alpha Leader (Sun).
    const sorted = useMemo(() => [...items].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0)), [items]);

    if (sorted.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                <Shield className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">NO TACTICAL DATA AVAILABLE</span>
            </div>
        );
    }

    return (
        <div className="w-full overflow-x-auto pb-4 scrollbar-hide">
            <div className="flex gap-6 px-2 min-w-max">
                {sorted.map((item, idx) => (
                    <div
                        key={item.ticker}
                        onClick={() => onSelect(item)}
                        className={`w-[320px] transition-all duration-300 ${selectedTicker?.ticker === item.ticker ? 'scale-105 ring-2 ring-emerald-500/50' : 'hover:scale-102 opacity-80 hover:opacity-100'}`}
                    >
                        <TacticalCard
                            ticker={item.ticker}
                            rank={idx + 1}
                            price={item.evidence.price.last}
                            change={
                                (item.evidence.price.last && item.evidence.price.changePct
                                    ? item.evidence.price.last - (item.evidence.price.last / (1 + (item.evidence.price.changePct / 100)))
                                    : 0)
                            }
                            entryBand={
                                item.entryBand
                                    ? { min: item.entryBand.low, max: item.entryBand.high }
                                    : (item.decisionSSOT?.entryBand || undefined)
                            }
                            cutPrice={item.decisionSSOT?.cutPrice}
                            isLocked={item.decisionSSOT?.isLocked}
                            name={item.symbol}
                            rsi={item.evidence.price.rsi14}
                            score={item.alphaScore}
                            isDayTradeOnly={(item as any).risk?.isDayTradeOnly}
                            reasonKR={item.decisionSSOT?.whaleReasonKR || item.qualityReasonKR}
                            // M7 Specifics
                            whaleTargetLevel={item.decisionSSOT?.whaleTargetLevel}
                            whaleConfidence={item.decisionSSOT?.whaleConfidence}
                            dominantContract={item.decisionSSOT?.dominantContract}
                            triggers={item.decisionSSOT?.triggersKR}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
