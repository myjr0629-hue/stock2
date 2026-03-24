
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowDownRight, Activity, Heart } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { Button } from "@/components/ui/button";

interface WatchlistRow {
    symbol: string;
    price: number;
    changePct: number;
    vwap?: number | null;
    maxPain?: number | null;
    pcr?: number | null;
    return3d?: number | null;
    // V5 Alpha Engine fields
    alphaScore: number;
    alphaGrade: string;
    alphaAction: string;
    session?: string;
}

// Grade → color mapping
function gradeColor(grade: string) {
    switch (grade) {
        case 'S': return 'bg-yellow-400 text-black';
        case 'A': return 'bg-emerald-500 text-white';
        case 'B': return 'bg-blue-500 text-white';
        case 'C': return 'bg-slate-400 text-white';
        case 'D': return 'bg-orange-500 text-white';
        case 'F': return 'bg-rose-600 text-white';
        default: return 'bg-slate-300 text-white';
    }
}

function actionDisplay(action: string) {
    switch (action) {
        case 'STRONG_BULLISH':
        case 'STRONG_BUY': return { label: 'STRONG BULLISH', color: 'text-emerald-600', icon: <ArrowUpRight className="w-3.5 h-3.5" /> };
        case 'BULLISH':
        case 'BUY': return { label: 'BULLISH', color: 'text-emerald-500', icon: <ArrowUpRight className="w-3.5 h-3.5" /> };
        case 'WATCH': return { label: 'WATCH', color: 'text-blue-500', icon: <Activity className="w-3.5 h-3.5" /> };
        case 'CAUTION':
        case 'REDUCE': return { label: 'CAUTION', color: 'text-orange-500', icon: <ArrowDownRight className="w-3.5 h-3.5" /> };
        case 'AVOID':
        case 'EXIT': return { label: 'AVOID', color: 'text-rose-600', icon: <ArrowDownRight className="w-3.5 h-3.5" /> };
        default: return { label: action, color: 'text-slate-500', icon: null };
    }
}

export function WatchlistGrid() {
    const router = useRouter();
    const { favorites, toggleFavorite, isLoaded } = useFavorites();
    const [data, setData] = useState<WatchlistRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isLoaded) return;
        if (favorites.length === 0) {
            setData([]);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // [V5] Single batch API call — uses V5 Alpha Engine (calculateAlphaScore)
                const res = await fetch(`/api/watchlist/batch?tickers=${favorites.join(',')}`, { cache: 'no-store' });
                if (!res.ok) throw new Error('Batch API failed');
                const json = await res.json();

                const rows: WatchlistRow[] = (json.results || [])
                    .filter((r: any) => r && !r.error)
                    .map((r: any) => ({
                        symbol: r.ticker,
                        price: r.realtime?.price || 0,
                        changePct: r.realtime?.changePct || 0,
                        vwap: r.realtime?.vwap ?? null,
                        maxPain: r.realtime?.maxPain ?? null,
                        pcr: r.realtime?.pcr ?? null,
                        return3d: r.realtime?.return3d ?? null,
                        alphaScore: r.alphaSnapshot?.score ?? 0,
                        alphaGrade: r.alphaSnapshot?.grade ?? '-',
                        alphaAction: r.alphaSnapshot?.action ?? 'WATCH',
                        session: r.realtime?.session || 'reg',
                    }));

                setData(rows);
            } catch (e) {
                console.error('Watchlist batch fetch failed:', e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [favorites, isLoaded]);

    if (!isLoaded) return null;

    if (favorites.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                <Heart className="w-16 h-16 text-slate-200 mb-4" />
                <h3 className="text-xl font-bold text-slate-700 font-jakarta">Watchlist is Empty</h3>
                <p className="text-slate-500 mt-2 text-sm">Add tickers to your favorites to see them here.</p>
                <Button onClick={() => router.push('/ticker?ticker=NVDA')} variant="outline" className="mt-6">Go to Dashboard</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 font-jakarta">
                        <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                        Your Watchlist
                        <span className="text-sm font-medium text-slate-400 ml-2 bg-slate-100 px-2 py-0.5 rounded-full">{favorites.length} Tickers</span>
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Real-time Analytics Engine tracking for your favorite assets.</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {loading && data.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 animate-pulse">Scanning Market Data...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider font-jakarta">
                                <tr>
                                    <th className="px-6 py-4">Symbol</th>
                                    <th className="px-6 py-4 text-right">Price</th>
                                    <th className="px-6 py-4 text-right">Change</th>
                                    <th className="px-6 py-4 text-right bg-blue-50/30">VWAP (Stealth)</th>
                                    <th className="px-6 py-4 text-right">Max Pain</th>
                                    <th className="px-6 py-4 text-center">P/C Ratio</th>
                                    <th className="px-6 py-4 text-right">3D Return</th>
                                    <th className="px-6 py-4 text-center bg-slate-100/50">Analytics</th>
                                    <th className="px-4 py-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.map((row) => {
                                    const action = actionDisplay(row.alphaAction);
                                    const return3dStr = row.return3d != null
                                        ? `${row.return3d > 0 ? '+' : ''}${row.return3d.toFixed(2)}%`
                                        : null;

                                    return (
                                        <tr key={row.symbol} className="hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => router.push(`/ticker?ticker=${row.symbol}`)}>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900 text-base font-jakarta">{row.symbol}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="font-bold text-slate-900 tabular-nums">
                                                        ${row.price.toFixed(2)}
                                                    </div>
                                                    {row.session && row.session !== 'reg' && (
                                                        <span className={`text-[9px] font-black uppercase tracking-wider px-1 rounded font-jakarta ${row.session === 'pre' ? "bg-blue-100 text-blue-600" : "bg-indigo-100 text-indigo-600"}`}>
                                                            {row.session}-market
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`inline-flex items-center font-bold text-xs ${row.changePct >= 0 ? "text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded" : "text-rose-600 bg-rose-50 px-2 py-0.5 rounded"}`}>
                                                    {row.changePct >= 0 ? "+" : ""}{row.changePct.toFixed(2)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right bg-blue-50/10">
                                                {row.vwap != null ? (
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold text-slate-700">${row.vwap.toFixed(2)}</span>
                                                        <span className={`text-[9px] font-black uppercase tracking-wide font-jakarta ${row.price >= row.vwap ? "text-emerald-600" : "text-rose-500"}`}>
                                                            {row.price >= row.vwap ? "ABOVE" : "BELOW"}
                                                        </span>
                                                    </div>
                                                ) : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-slate-600">
                                                {row.maxPain ? `$${row.maxPain}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {row.pcr ? (
                                                    <div className="inline-flex flex-col items-center">
                                                        <span className="font-bold text-slate-700">{row.pcr.toFixed(2)}</span>
                                                        <span className="text-[9px] text-slate-400 font-jakarta">{row.pcr > 1 ? "Bearish" : row.pcr < 0.7 ? "Bullish" : "Neutral"}</span>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td className={`px-6 py-4 text-right font-bold ${return3dStr?.startsWith('+') ? 'text-emerald-600' : return3dStr?.startsWith('-') ? 'text-rose-600' : 'text-slate-600'}`}>
                                                {return3dStr || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-center bg-slate-50/30">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${gradeColor(row.alphaGrade)}`}>
                                                        {row.alphaGrade}
                                                    </div>
                                                    <div className="flex flex-col items-start">
                                                        <span className="font-bold text-slate-900 text-sm tabular-nums">{Math.round(row.alphaScore)}</span>
                                                        <span className={`text-[9px] font-bold ${action.color} flex items-center gap-0.5`}>
                                                            {action.icon}
                                                            {action.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-full"
                                                    onClick={() => toggleFavorite(row.symbol)}
                                                >
                                                    <Heart className="w-4 h-4 fill-current" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
