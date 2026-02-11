// M7 Tactical Deck - Independent Post-Market Report (V3.1)
// Supports shared data via props OR independent fetching (fallback mode)
'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Crosshair, BarChart3, FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];

interface M7TacticalItem {
    ticker: string;
    price: number;
    changePct: number;
    alphaScore: number;
    maxPain: number;
    callWall: number;
    putFloor: number;
    gex: number;
    pcr: number;
    gammaRegime: string;
    sparkline: number[];
}

interface M7TacticalDeckProps {
    sharedData?: IntelQuote[];
    sharedRefreshing?: boolean;
}

// Mini Sparkline SVG Component
function MiniSparkline({ data, isUp }: { data: number[], isUp: boolean }) {
    if (!data || data.length < 2) {
        data = isUp ? [50, 52, 51, 54, 53, 56, 55, 58] : [58, 55, 56, 53, 54, 51, 52, 50];
    }
    const width = 60, height = 20, padding = 2;
    const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((val - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={width} height={height} className="overflow-visible">
            <polyline points={points} fill="none" stroke={isUp ? '#10b981' : '#f43f5e'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Price Position Bar Component
function PricePositionBar({ current, putFloor, maxPain, callWall }: { current: number, putFloor: number, maxPain: number, callWall: number }) {
    if (!putFloor || !callWall || putFloor >= callWall) return null;
    const range = callWall - putFloor;
    const maxPainPos = ((maxPain - putFloor) / range) * 100;
    const currentPos = Math.max(0, Math.min(100, ((current - putFloor) / range) * 100));
    return (
        <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
            <div className="absolute left-0 h-full bg-gradient-to-r from-rose-500/30 to-transparent" style={{ width: '30%' }} />
            <div className="absolute right-0 h-full bg-gradient-to-l from-emerald-500/30 to-transparent" style={{ width: '30%' }} />
            <div className="absolute top-0 h-full w-0.5 bg-amber-500" style={{ left: `${maxPainPos}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-900 shadow-lg z-10" style={{ left: `calc(${currentPos}% - 5px)` }} />
        </div>
    );
}

// AI Analysis Generator
function generateAnalysis(ticker: string, price: number, change: number, maxPain: number, callWall: number, putFloor: number, gex: number, pcr: number, gammaRegime: string): string {
    const priceVsMaxPain = maxPain > 0 ? ((price - maxPain) / maxPain * 100) : 0;
    const isAboveMaxPain = priceVsMaxPain > 0;
    let analysis = '';
    if (Math.abs(priceVsMaxPain) < 1) {
        analysis = `Max Pain($${maxPain.toFixed(0)}) 근처에서 마감. `;
    } else if (isAboveMaxPain) {
        analysis = `Max Pain 대비 +${priceVsMaxPain.toFixed(1)}% 상승 마감. `;
    } else {
        analysis = `Max Pain 대비 ${priceVsMaxPain.toFixed(1)}% 하락 마감. `;
    }
    if (gammaRegime === 'LONG') {
        analysis += 'Long Gamma 구간으로 변동성 억제 예상. ';
    } else if (gammaRegime === 'SHORT') {
        analysis += 'Short Gamma 구간으로 변동성 확대 주의. ';
    }
    if (callWall > 0 && price > callWall * 0.97) {
        analysis += `Call Wall($${callWall.toFixed(0)}) 근접, 저항 예상.`;
    } else if (putFloor > 0 && price < putFloor * 1.03) {
        analysis += `Put Floor($${putFloor.toFixed(0)}) 근접, 지지 테스트 가능.`;
    } else if (pcr < 0.7) {
        analysis += '낮은 PCR, 강세 포지셔닝 유지.';
    } else if (pcr > 1.3) {
        analysis += '높은 PCR, 헤지 심리 강화.';
    }
    return analysis;
}

export function M7TacticalDeck({ sharedData, sharedRefreshing }: M7TacticalDeckProps = {}) {
    const [items, setItems] = useState<M7TacticalItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Use shared data mode vs independent fetch mode
    const useSharedMode = sharedData !== undefined;

    // ===== SHARED DATA MODE =====
    useEffect(() => {
        if (!useSharedMode || !sharedData) return;

        // Convert IntelQuote[] to M7TacticalItem[]
        const convertedItems: M7TacticalItem[] = sharedData.map(q => ({
            ticker: q.ticker,
            price: q.price,
            changePct: q.changePct,
            alphaScore: q.alphaScore,
            maxPain: q.maxPain,
            callWall: q.callWall,
            putFloor: q.putFloor,
            gex: q.gex,
            pcr: q.pcr,
            gammaRegime: q.gammaRegime,
            sparkline: q.sparkline
        }));

        // Sort by alpha score (TacticalDeck sorts by alpha)
        convertedItems.sort((a, b) => b.alphaScore - a.alphaScore);
        setItems(convertedItems);
        setLoading(false);
    }, [useSharedMode, sharedData]);

    // ===== INDEPENDENT FETCH MODE (Fallback) =====
    const fetchData = useCallback(async () => {
        if (useSharedMode) return; // Skip if using shared data

        setRefreshing(true);
        try {
            // Parallel fetch: prices + watchlist batch (alpha scores + options)
            const [priceResults, watchlistRes] = await Promise.all([
                Promise.all(M7_TICKERS.map(async (ticker) => {
                    try {
                        const res = await fetch(`/api/live/ticker?t=${ticker}`, { cache: 'no-store' });
                        if (!res.ok) return null;
                        return { ticker, data: await res.json() };
                    } catch { return null; }
                })),
                fetch(`/api/watchlist/batch?tickers=${M7_TICKERS.join(',')}`, { cache: 'no-store' }).then(async r => {
                    if (!r.ok) return null;
                    const t = await r.text();
                    if (!t) return null;
                    try { return JSON.parse(t); } catch { return null; }
                })
            ]);

            // Build watchlist lookup
            const watchlistData: Record<string, any> = {};
            watchlistRes?.results?.forEach((r: any) => {
                watchlistData[r.ticker] = r;
            });

            const newItems: M7TacticalItem[] = [];

            priceResults.forEach((result) => {
                if (!result || !result.data) return;
                const { ticker, data } = result;
                const wl = watchlistData[ticker] || {};

                // Session-aware price (EXACT Flow page logic)
                const session = data.session || 'CLOSED';
                let displayPrice = data.display?.price || data.prices?.prevRegularClose || data.prevClose || 0;
                let displayChangePct = data.display?.changePctPct || 0;

                if (session === 'POST' || session === 'CLOSED') {
                    const regularClose = data.prices?.regularCloseToday;
                    const prevClose = data.prices?.prevRegularClose || data.prevClose;
                    if (regularClose && regularClose > 0) {
                        displayPrice = regularClose;
                        const isNewTradingDay = prevClose && Math.abs(regularClose - prevClose) > 0.001;
                        if (isNewTradingDay && prevClose > 0) {
                            displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
                        } else {
                            displayChangePct = data.prices?.prevChangePct || data.display?.changePctPct || 0;
                        }
                    }
                }

                if (session === 'PRE') {
                    const staticClose = data.prices?.prevRegularClose || data.prevClose;
                    if (staticClose) {
                        displayPrice = staticClose;
                        displayChangePct = data.prices?.prevChangePct ?? 0;
                    }
                }

                // Options data from watchlist batch
                const rt = wl.realtime || {};
                const gex = rt.gex || 0;
                let gammaRegime = 'NEUTRAL';
                if (gex > 0) gammaRegime = 'LONG';
                else if (gex < 0) gammaRegime = 'SHORT';

                newItems.push({
                    ticker,
                    price: displayPrice,
                    changePct: displayChangePct,
                    alphaScore: wl.alphaSnapshot?.score || 0,
                    maxPain: rt.maxPain || 0,
                    callWall: 0, // Will be fetched from structure API if needed
                    putFloor: 0,
                    gex: gex,
                    pcr: rt.pcr || 1,
                    gammaRegime,
                    sparkline: rt.sparkline || []
                });
            });

            // Sort by alpha score
            newItems.sort((a, b) => b.alphaScore - a.alphaScore);
            setItems(newItems);
            setLoading(false);
        } catch (e) {
            console.error('[TacticalDeck] Fetch failed:', e);
        } finally {
            setRefreshing(false);
        }
    }, [useSharedMode]);

    useEffect(() => {
        if (useSharedMode) return; // Skip if using shared data

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData, useSharedMode]);

    // Use shared refreshing state if in shared mode
    const isRefreshing = useSharedMode ? (sharedRefreshing || false) : refreshing;

    const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;
    const formatPrice = (num: number) => num >= 1000 ? `$${(num / 1000).toFixed(1)}K` : `$${num.toFixed(0)}`;
    const formatGex = (gex: number) => {
        const absGex = Math.abs(gex);
        if (absGex >= 1e9) return `${(gex / 1e9).toFixed(1)}B`;
        if (absGex >= 1e6) return `${(gex / 1e6).toFixed(0)}M`;
        return `${(gex / 1e3).toFixed(0)}K`;
    };

    if (loading) {
        return (
            <div className="w-full p-8 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Report Header */}
            <div className="mb-3 px-1 flex items-center justify-between">
                <span className="text-[9px] text-white/60 uppercase tracking-widest">
                    장마감 보고서 | POST-MARKET ANALYSIS
                </span>
                <div className="flex items-center gap-2">
                    {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />}
                    <span className="text-[9px] text-white/40">실시간 데이터</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 border border-slate-600/50 rounded text-[9px] text-white/70 font-bold">
                        📋 SNAPSHOT
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item, idx) => {
                    const isUp = item.changePct >= 0;
                    const isHighGex = Math.abs(item.gex) > 50e6;
                    const isExtremePcr = item.pcr < 0.5 || item.pcr > 1.5;
                    const analysis = generateAnalysis(item.ticker, item.price, item.changePct, item.maxPain, item.callWall, item.putFloor, item.gex, item.pcr, item.gammaRegime);

                    return (
                        <div key={item.ticker} className="relative group rounded-xl border transition-all duration-300 overflow-hidden border-slate-700 bg-[#0a0f18] hover:border-slate-500">
                            {/* Header */}
                            <div className="flex items-center justify-between p-3 bg-slate-800/30 border-b border-slate-700/50">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${idx < 3 ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                                        #{idx + 1}
                                    </span>
                                    <div className={`w-9 h-9 rounded-full border-2 overflow-hidden ${isUp ? 'border-emerald-500' : 'border-rose-500'}`}>
                                        <img src={getLogoUrl(item.ticker)} alt={item.ticker} className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-sm font-black text-white">{item.ticker}</span>
                                            <span className="text-[8px] text-white/50 bg-slate-700 px-1 rounded">CLOSE</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-white">${item.price.toFixed(2)}</span>
                                            <span className={`flex items-center gap-0.5 text-xs font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                {isUp ? '+' : ''}{item.changePct.toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className={`text-lg font-black ${item.alphaScore >= 75 ? 'text-amber-400' : item.alphaScore >= 50 ? 'text-emerald-400' : 'text-white'}`}>
                                        {item.alphaScore > 0 ? item.alphaScore.toFixed(1) : '-'}
                                    </div>
                                    <MiniSparkline data={item.sparkline} isUp={isUp} />
                                </div>
                            </div>

                            {/* Report Body */}
                            <div className="p-3 space-y-3">
                                {/* Key Levels */}
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Crosshair className="w-3 h-3 text-amber-400" />
                                        <span className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Key Levels</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5 text-center mb-2">
                                        <div className="bg-rose-500/10 border border-rose-500/20 rounded p-1.5">
                                            <div className="text-[8px] text-rose-400 uppercase">Put Floor</div>
                                            <div className="text-xs font-bold text-white">{formatPrice(item.putFloor)}</div>
                                        </div>
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-1.5">
                                            <div className="text-[8px] text-amber-400 uppercase">Max Pain</div>
                                            <div className="text-xs font-bold text-white">{formatPrice(item.maxPain)}</div>
                                        </div>
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-1.5">
                                            <div className="text-[8px] text-emerald-400 uppercase">Call Wall</div>
                                            <div className="text-xs font-bold text-white">{formatPrice(item.callWall)}</div>
                                        </div>
                                    </div>
                                    <PricePositionBar current={item.price} putFloor={item.putFloor} maxPain={item.maxPain} callWall={item.callWall} />
                                    <div className="flex justify-between mt-1.5 text-[10px] text-white font-medium">
                                        <span>Put Zone</span>
                                        <span>● 현재가 ${item.price.toFixed(0)}</span>
                                        <span>Call Zone</span>
                                    </div>
                                </div>

                                {/* Options Profile */}
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <BarChart3 className="w-3 h-3 text-cyan-400" />
                                        <span className="text-[9px] font-bold text-white/70 uppercase tracking-wider">Options Profile</span>
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <span className="text-[8px] text-white/50 block">GEX</span>
                                                <span className={`text-sm font-bold ${item.gex > 0 ? 'text-cyan-400' : 'text-amber-400'}`}>
                                                    {item.gex > 0 ? '+' : ''}{formatGex(item.gex)}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[8px] text-white/50 block">PCR</span>
                                                <span className={`text-sm font-bold ${item.pcr < 0.8 ? 'text-emerald-400' : item.pcr > 1.1 ? 'text-rose-400' : 'text-white'}`}>
                                                    {item.pcr.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded ${item.gammaRegime === 'LONG' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                            item.gammaRegime === 'SHORT' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                'bg-slate-700 text-white/60 border border-slate-600'
                                            }`}>
                                            {item.gammaRegime === 'LONG' ? '📈 Long Gamma' : item.gammaRegime === 'SHORT' ? '📉 Short Gamma' : '➖ Neutral'}
                                        </span>
                                    </div>
                                </div>

                                {/* AI Analysis */}
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <FileText className="w-3 h-3 text-purple-400" />
                                        <span className="text-[9px] font-bold text-white/70 uppercase tracking-wider">AI Analysis</span>
                                    </div>
                                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-2.5">
                                        <p className="text-[10px] text-white/80 leading-relaxed">{analysis}</p>
                                    </div>
                                </div>

                                {/* Alerts */}
                                {(isHighGex || isExtremePcr) && (
                                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-700/50">
                                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                                        <div className="flex items-center gap-1">
                                            {isHighGex && (
                                                <span className="text-[8px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                                                    High GEX
                                                </span>
                                            )}
                                            {isExtremePcr && (
                                                <span className="text-[8px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                                    PCR Alert
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
