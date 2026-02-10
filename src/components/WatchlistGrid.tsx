
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowDownRight, Activity, Zap, TrendingUp, AlertCircle, Heart } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { fetchStockDataAction, fetchOptionsDataAction } from "@/app/actions";
import { StockData, OptionData, analyzeGemsTicker, Tier01Data } from "@/services/stockTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WatchlistRow {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    vwap?: number;
    maxPain?: number;
    pcr?: number;
    return3d?: string;
    pulseScore?: number;
    velocity?: string;
    mmPos?: string;
    session?: 'pre' | 'reg' | 'post';
}

export function WatchlistGrid() {
    const router = useRouter();
    const { favorites, isFavorite, toggleFavorite, isLoaded } = useFavorites();
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
                const results = await Promise.all(favorites.map(async (ticker) => {
                    try {
                        const [stock, options] = await Promise.all([
                            fetchStockDataAction(ticker, '1d'),
                            fetchOptionsDataAction(ticker)
                        ]);

                        if (!stock) return null;

                        // GEMS Logic Light
                        const gems = analyzeGemsTicker({
                            ticker: stock.symbol,
                            todaysChangePerc: stock.changePercent,
                            day: { c: stock.price }
                        }, "Neutral", options);

                        const row: WatchlistRow = {
                            symbol: stock.symbol,
                            name: stock.name,
                            price: stock.price,
                            change: stock.change,
                            changePercent: stock.changePercent,
                            vwap: stock.vwap,
                            maxPain: options?.maxPain,
                            pcr: options?.putCallRatio,
                            return3d: stock.return3d !== undefined ? `${stock.return3d > 0 ? "+" : ""}${stock.return3d.toFixed(2)}%` : undefined,
                            pulseScore: gems.alphaScore,
                            velocity: gems.velocity,
                            mmPos: gems.mmPos,
                            session: stock.session
                        };
                        return row;
                    } catch (e) {
                        console.error(`Failed to fetch ${ticker}`, e);
                        return null;
                    }
                }));

                setData(results.filter((r): r is WatchlistRow => r !== null));
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
                <h3 className="text-xl font-bold text-slate-700">Watchlist is Empty</h3>
                <p className="text-slate-500 mt-2 text-sm">Add tickers to your favorites to see them here.</p>
                <Button onClick={() => router.push('/ticker?ticker=NVDA')} variant="outline" className="mt-6">Go to Dashboard</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                        Your Watchlist
                        <span className="text-sm font-medium text-slate-400 ml-2 bg-slate-100 px-2 py-0.5 rounded-full">{favorites.length} Tickers</span>
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Real-time GEMS V8.1 tracking for your favorite assets.</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {loading && data.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 animate-pulse">Scanning Market Data...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Symbol</th>
                                    <th className="px-6 py-4 text-right">Price</th>
                                    <th className="px-6 py-4 text-right">Change</th>
                                    <th className="px-6 py-4 text-right bg-blue-50/30">VWAP (Stealth)</th>
                                    <th className="px-6 py-4 text-right">Max Pain</th>
                                    <th className="px-6 py-4 text-center">P/C Ratio</th>
                                    <th className="px-6 py-4 text-right">3D Return</th>
                                    <th className="px-6 py-4 text-center bg-slate-100/50">Alpha Pulse</th>
                                    <th className="px-4 py-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.map((row) => (
                                    <tr key={row.symbol} className="hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => router.push(`/ticker?ticker=${row.symbol}`)}>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 text-base">{row.symbol}</div>
                                            <div className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">{row.name}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <div className="font-bold text-slate-900 tabular-nums">
                                                    ${row.price.toFixed(2)}
                                                </div>
                                                {row.session && row.session !== 'reg' && (
                                                    <span className={`text-[9px] font-black uppercase tracking-wider px-1 rounded ${row.session === 'pre' ? "bg-blue-100 text-blue-600" : "bg-indigo-100 text-indigo-600"}`}>
                                                        {row.session}-market
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`inline-flex items-center font-bold text-xs ${row.change >= 0 ? "text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded" : "text-rose-600 bg-rose-50 px-2 py-0.5 rounded"}`}>
                                                {row.change >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right bg-blue-50/10">
                                            {row.vwap !== undefined && row.vwap !== null ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-slate-700">${row.vwap.toFixed(2)}</span>
                                                    <span className={`text-[9px] font-black uppercase tracking-wide ${row.price >= row.vwap ? "text-emerald-600" : "text-rose-500"}`}>
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
                                                    <span className="text-[9px] text-slate-400">{row.pcr > 1 ? "Bearish" : row.pcr < 0.7 ? "Bullish" : "Neutral"}</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold ${row.return3d?.startsWith('+') ? 'text-emerald-600' : row.return3d?.startsWith('-') ? 'text-rose-600' : 'text-slate-600'}`}>
                                            {row.return3d || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center bg-slate-50/30">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center font-black text-slate-900">
                                                    {(row.pulseScore || 0).toFixed(1)}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500">
                                                    {row.velocity === '▲' && <ArrowUpRight className="w-4 h-4 text-emerald-500" />}
                                                    {row.velocity === '►' && <Activity className="w-4 h-4 text-blue-500" />}
                                                    {row.velocity === '▼' && <ArrowDownRight className="w-4 h-4 text-rose-500" />}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
