// Physical AI Session Summary - EXACT ORIGINAL (V7.0)
// Restored from user screenshot reference - EXACT MATCH
'use client';
import { useEffect, useState, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, DollarSign, Radio, RefreshCw, HardHat } from 'lucide-react';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];

interface PhysicalAIQuote {
    ticker: string;
    price: number;
    changePct: number;
    prevClose: number;
    volume: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    session: string;
    alphaScore: number;
    grade: string;
}

interface PhysicalAISessionSummaryProps {
    sharedData?: IntelQuote[];
    sharedRefreshing?: boolean;
}

export function PhysicalAISessionSummary({ sharedData, sharedRefreshing }: PhysicalAISessionSummaryProps = {}) {
    const [quotes, setQuotes] = useState<PhysicalAIQuote[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [alphaData, setAlphaData] = useState<Record<string, { score: number; grade: string }>>({});

    const useSharedMode = sharedData !== undefined;

    // ===== SHARED DATA MODE =====
    useEffect(() => {
        if (!useSharedMode || !sharedData) return;
        const convertedQuotes: PhysicalAIQuote[] = sharedData.map(q => ({
            ticker: q.ticker,
            price: q.price,
            changePct: q.changePct,
            prevClose: q.prevClose,
            volume: q.volume,
            extendedPrice: q.extendedPrice,
            extendedChangePct: q.extendedChangePct,
            extendedLabel: q.extendedLabel,
            session: q.session,
            alphaScore: q.alphaScore,
            grade: q.grade
        }));
        setQuotes(convertedQuotes);
        setLoading(false);
    }, [useSharedMode, sharedData]);

    // ===== INDEPENDENT FETCH MODE (Fast API) =====
    const fetchData = useCallback(async () => {
        if (useSharedMode) return;
        setRefreshing(true);
        try {
            const res = await fetch('/api/intel/physicalai-fast', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed');
            const json = await res.json();
            if (!json.success || !json.data) throw new Error('Invalid');

            const newQuotes: PhysicalAIQuote[] = json.data.map((q: any) => ({
                ticker: q.ticker,
                price: q.price,
                changePct: q.changePct,
                prevClose: q.prevClose,
                volume: q.volume,
                extendedPrice: q.extendedPrice || 0,
                extendedChangePct: q.extendedChangePct || 0,
                extendedLabel: q.extendedLabel || '',
                session: q.session,
                // [FIX] Preserve existing alpha data if available
                alphaScore: alphaData[q.ticker]?.score || 0,
                grade: alphaData[q.ticker]?.grade || '-'
            }));
            newQuotes.sort((a, b) => b.changePct - a.changePct);
            setQuotes(newQuotes);
            setLoading(false);
        } catch (e) {
            console.error('[PhysicalAI] Fast API failed:', e);
            setLoading(false);
        } finally {
            setRefreshing(false);
        }
    }, [useSharedMode, alphaData]);

    // Fetch Alpha Scores
    useEffect(() => {
        if (useSharedMode) return;
        async function fetchAlpha() {
            try {
                const res = await fetch(`/api/watchlist/batch?tickers=${PHYSICAL_AI_TICKERS.join(',')}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    const scores: Record<string, { score: number; grade: string }> = {};
                    data.results?.forEach((item: any) => {
                        if (item.alphaSnapshot) {
                            scores[item.ticker] = {
                                score: item.alphaSnapshot.score || 0,
                                grade: item.alphaSnapshot.grade || 'C'
                            };
                        }
                    });
                    setAlphaData(scores);
                }
            } catch (e) { /* ignore */ }
        }
        fetchAlpha();
        const i = setInterval(fetchAlpha, 30000);
        return () => clearInterval(i);
    }, [useSharedMode]);

    useEffect(() => {
        if (useSharedMode) return;
        fetchData();
        const i = setInterval(fetchData, 15000);
        return () => clearInterval(i);
    }, [fetchData, useSharedMode]);

    // Merge alpha
    useEffect(() => {
        if (useSharedMode || !Object.keys(alphaData).length || !quotes.length) return;
        setQuotes(prev => prev.map(q => ({
            ...q,
            alphaScore: alphaData[q.ticker]?.score || q.alphaScore,
            grade: alphaData[q.ticker]?.grade || q.grade
        })));
    }, [alphaData, useSharedMode]); // eslint-disable-line

    const getLogoUrl = (t: string) => `https://assets.parqet.com/logos/symbol/${t}?format=png`;
    const isRefreshing = useSharedMode ? (sharedRefreshing || false) : refreshing;

    const stats = {
        totalVolume: quotes.reduce((a, q) => a + q.volume, 0),
        topGainer: quotes[0] || null,
        topLoser: quotes[quotes.length - 1] || null
    };

    // Grade badge text
    const getGradeBadge = (g: string) => {
        if (g === 'A' || g === 'A+') return 'TRADING';
        if (g === 'B' || g === 'B+') return 'HOLDING';
        return null;
    };

    if (loading) {
        return (
            <div className="w-full bg-[#0a0f14]/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 flex items-center justify-center min-h-[200px]">
                <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="w-full bg-[#0a0f14]/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group/container transition-all duration-500 hover:border-white/20">
            {/* Ambient Lighting Effect (Subtle background glow) */}
            <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none mix-blend-screen" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="text-sm font-bold text-orange-400/90 uppercase tracking-[0.2em] flex items-center gap-2 drop-shadow-sm">
                    <HardHat className="w-4 h-4 text-orange-400 animate-pulse" />
                    Physical AI Session Summary
                </h3>
                <div className="flex items-center gap-3">
                    {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin text-orange-500/60" />}
                    <span className="text-[10px] text-orange-300/80 uppercase flex items-center gap-1.5 font-bold tracking-wider px-2 py-1 rounded-full bg-orange-500/5 border border-orange-500/10 backdrop-blur-sm">
                        <Radio className="w-3 h-3 text-orange-400 animate-pulse" />
                        LIVE
                    </span>
                </div>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-7 gap-3 mb-2 relative z-10">
                {quotes.map((q, idx) => {
                    const isUp = q.changePct >= 0;
                    const hasExt = q.extendedPrice > 0;

                    return (
                        <div
                            key={q.ticker}
                            className={`
                                relative flex flex-col p-4 rounded-xl border transition-all duration-300 overflow-hidden group cursor-pointer
                                bg-slate-800/40 backdrop-blur-md
                                hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]
                                ${idx === 0
                                    ? 'border-orange-500/30 hover:border-orange-400/60 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)] bg-orange-900/10'
                                    : idx === quotes.length - 1
                                        ? 'border-rose-500/30 hover:border-rose-400/60 hover:shadow-[0_0_20px_rgba(244,63,94,0.15)] bg-rose-900/10'
                                        : 'border-white/5 hover:border-slate-400/30 hover:bg-slate-800/60'
                                }
                            `}
                        >
                            {/* Glass Highlight (Top Shine) */}
                            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                            {/* Row 1: Rank + AI Score */}
                            <div className="flex items-center justify-between mb-3">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm ${idx === 0
                                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                    : idx === quotes.length - 1
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                        : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                                    }`}>
                                    {idx + 1}.
                                </span>
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border backdrop-blur-md shadow-sm transition-all duration-300 ${q.alphaScore >= 75 ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]' :
                                        q.alphaScore >= 50 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
                                            'bg-slate-700/30 border-slate-600/30 text-slate-400'
                                    }`}>
                                    <span className="text-[9px] font-bold opacity-70">ALPHA</span>
                                    <span className="text-xs font-black tracking-tight">
                                        {q.alphaScore > 0 ? q.alphaScore.toFixed(1) : '-'}
                                    </span>
                                </div>
                            </div>

                            {/* Row 2: Logo - Glass Circle */}
                            <div className="flex justify-center mb-4 relative">
                                {/* Logo Glow */}
                                <div className={`absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500 ${isUp ? 'bg-orange-500' : 'bg-rose-500'}`} />

                                <div className="w-12 h-12 rounded-full p-[1px] bg-gradient-to-b from-white/20 to-white/5 shadow-lg relative z-10 transition-transform duration-500 group-hover:scale-110">
                                    <div className="w-full h-full rounded-full bg-[#0a0f14] overflow-hidden flex items-center justify-center relative">
                                        <img
                                            src={getLogoUrl(q.ticker)}
                                            alt={q.ticker}
                                            className="w-full h-full object-cover scale-[1.05]"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        {/* Inner gloss */}
                                        <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_10px_rgba(255,255,255,0.1)] pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Row 3: Ticker */}
                            <div className="text-center mb-1">
                                <div className="text-sm font-black text-white tracking-tight drop-shadow-md group-hover:text-orange-100 transition-colors">
                                    {q.ticker}
                                </div>
                            </div>

                            {/* Row 4: Price - Command Style */}
                            <div className="text-center mb-1">
                                <div className="text-xl font-black text-white tracking-tighter tabular-nums drop-shadow-sm">
                                    ${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>


                            {/* Row 4.5: Extended Price (Pre/Post) - User Request */}
                            {
                                hasExt && (
                                    <div className="flex items-center justify-center gap-1.5 mb-1 animate-in fade-in slide-in-from-bottom-1">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{q.extendedLabel}</span>
                                        <span className="text-xs font-mono font-bold text-slate-300">${q.extendedPrice.toFixed(2)}</span>
                                        <span className={`text-[9px] font-bold ${q.extendedChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {q.extendedChangePct >= 0 ? '+' : ''}{q.extendedChangePct.toFixed(2)}%
                                        </span>
                                    </div>
                                )
                            }

                            {/* Row 5: Change % */}
                            <div className={`flex items-center justify-center gap-0.5 text-[11px] font-bold tracking-tight ${isUp ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]' : 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.3)]'
                                }`}>
                                {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {isUp ? '+' : ''}{q.changePct.toFixed(2)}%
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 relative z-10">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
                        <DollarSign className="w-3 h-3 text-slate-400" />
                        Total Volume: <span className="text-slate-300 font-mono">{(stats.totalVolume / 1e6).toFixed(0)}M</span>
                    </span>
                    <span className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500/50" />
                        Net Flow: <span className="text-slate-300 font-mono">--</span>
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    {stats.topGainer && (
                        <span className="flex items-center gap-1.5">
                            <TrendingUp className="w-3 h-3 text-emerald-500" />
                            Top: <span className="font-bold text-emerald-400">{stats.topGainer.ticker}</span>
                            <span className="font-mono text-emerald-500/80">{stats.topGainer.changePct >= 0 ? '+' : ''}{stats.topGainer.changePct.toFixed(2)}%</span>
                        </span>
                    )}
                    {stats.topLoser && (
                        <span className="flex items-center gap-1.5">
                            <TrendingDown className="w-3 h-3 text-rose-500" />
                            Bottom: <span className="font-bold text-rose-400">{stats.topLoser.ticker}</span>
                            <span className="font-mono text-rose-500/80">{stats.topLoser.changePct.toFixed(2)}%</span>
                        </span>
                    )}
                </div>
            </div>
        </div >
    );
}
