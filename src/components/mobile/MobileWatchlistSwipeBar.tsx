'use client';
// ═══ MobileWatchlistSwipeBar — Shared WL bar for Flow/Command mobile pages ═══
// Displays main watchlist tickers with live prices in a horizontal scroll bar.
// Fixed above bottom nav. ZERO desktop impact — mobile-only component.

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ChevronRight } from 'lucide-react';

interface Props {
    currentTicker: string;
    /** Where to navigate: 'flow' → /flow?ticker=X, 'command' → /ticker/X */
    targetPage?: 'flow' | 'command';
}

export function MobileWatchlistSwipeBar({ currentTicker, targetPage = 'flow' }: Props) {
    const router = useRouter();
    const locale = useLocale();
    const [wlTickers, setWlTickers] = useState<string[]>([]);
    const [prices, setPrices] = useState<Record<string, { price: number; changePct: number }>>({});

    // Load main watchlist tickers from Supabase (one-time)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { getWatchlist } = await import('@/lib/storage/watchlistStore');
                const data = await getWatchlist();
                if (!cancelled) {
                    setWlTickers(data.items.map(i => i.ticker));
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, []);

    // Fetch live prices for watchlist tickers
    const tickerStr = wlTickers.filter(t => t !== currentTicker).join(',');
    useEffect(() => {
        if (!tickerStr) return;
        const fetchPrices = async () => {
            try {
                const r = await fetch(`/api/live/quotes?symbols=${tickerStr}`);
                if (r.ok) {
                    const j = await r.json();
                    const p: Record<string, { price: number; changePct: number }> = {};
                    if (j.data) {
                        Object.entries(j.data).forEach(([t, d]: [string, any]) => {
                            if (d?.price > 0) p[t] = { price: d.price, changePct: d.changePercent || 0 };
                        });
                    }
                    setPrices(p);
                }
            } catch {}
        };
        fetchPrices();
        const iv = setInterval(fetchPrices, 10000);
        return () => clearInterval(iv);
    }, [tickerStr]);

    const displayTickers = wlTickers.filter(t => t !== currentTicker);
    if (displayTickers.length === 0) return null;

    const navigate = (t: string) => {
        if (targetPage === 'command') {
            router.push(`/${locale}/ticker/${t}`);
        } else {
            router.push(`/${locale}/flow?ticker=${t}`);
        }
    };

    return (
        <div className="fixed bottom-[56px] left-0 right-0 z-20 bg-[#0a0f1a]/95 backdrop-blur-xl border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 px-2 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500/70 px-1 shrink-0">WL</span>
                <div className="flex-1 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {displayTickers.map(t => {
                        const p = prices[t];
                        const pct = p?.changePct ?? 0;
                        const up = pct >= 0;
                        return (
                            <button
                                key={t}
                                onClick={() => navigate(t)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] active:bg-white/[0.10] shrink-0 transition-all"
                            >
                                <div className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                    <img loading="lazy" src={`/api/logo/${t}`} alt="" className="w-4 h-4 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                                <span className="text-[11px] font-bold text-white">{t}</span>
                                <span className={`text-[10px] font-mono font-bold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {up ? '+' : ''}{pct.toFixed(1)}%
                                </span>
                            </button>
                        );
                    })}
                </div>
                <ChevronRight size={14} className="text-slate-500 shrink-0" />
            </div>
        </div>
    );
}
