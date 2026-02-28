"use client";

/**
 * LiveFeedTicker — 랜딩 페이지용 실시간 마퀴 피드
 *
 * 히어로 섹션 바로 아래에서 "지금 이 순간" 일어나는 시장 데이터를
 * 흐르는 텍스트로 보여줘 FOMO를 극대화합니다.
 *
 * 실제 /api/live/options/structure 데이터 기반.
 */

import React, { useEffect, useState, useRef } from "react";
import { Activity, TrendingUp, Target, Zap, Eye, AlertTriangle } from "lucide-react";

// ============================================================
// TYPES
// ============================================================
interface FeedItem {
    icon: React.ReactNode;
    text: string;
    color: string;
}

interface TickerData {
    symbol: string;
    underlyingPrice?: number;
    changePercent?: number;
    netGex?: number;
    maxPain?: number;
    isGammaSqueeze?: boolean;
    pcr?: number;
}

// ============================================================
// DATA BUILDER
// ============================================================
function buildFeedItems(data: TickerData[]): FeedItem[] {
    const items: FeedItem[] = [];

    for (const d of data) {
        if (!d.underlyingPrice) continue;

        // GEX Alert
        if (d.netGex && Math.abs(d.netGex) > 500_000_000) {
            const gexVal = (d.netGex / 1e9).toFixed(1);
            const isPositive = d.netGex > 0;
            items.push({
                icon: <Activity className="w-3.5 h-3.5" />,
                text: `${d.symbol} GEX ${isPositive ? '+' : ''}${gexVal}B`,
                color: isPositive ? "text-emerald-400" : "text-rose-400",
            });
        }

        // Max Pain Distance
        if (d.maxPain && d.underlyingPrice) {
            const dist = ((d.underlyingPrice - d.maxPain) / d.maxPain * 100).toFixed(1);
            const above = parseFloat(dist) > 0;
            items.push({
                icon: <Target className="w-3.5 h-3.5" />,
                text: `${d.symbol} Max Pain $${d.maxPain.toFixed(0)} (${above ? '+' : ''}${dist}%)`,
                color: Math.abs(parseFloat(dist)) > 2 ? "text-amber-400" : "text-slate-300",
            });
        }

        // Squeeze Alert
        if (d.isGammaSqueeze) {
            items.push({
                icon: <TrendingUp className="w-3.5 h-3.5" />,
                text: `${d.symbol} GAMMA SQUEEZE 감지`,
                color: "text-cyan-400",
            });
        }

        // Price Change Highlight
        if (d.changePercent && Math.abs(d.changePercent) > 1) {
            const isUp = d.changePercent > 0;
            items.push({
                icon: <Zap className="w-3.5 h-3.5" />,
                text: `${d.symbol} ${isUp ? '▲' : '▼'} ${d.changePercent > 0 ? '+' : ''}${d.changePercent.toFixed(2)}%`,
                color: isUp ? "text-emerald-400" : "text-rose-400",
            });
        }
    }

    return items;
}

// ============================================================
// COMPONENT
// ============================================================
const M7_TICKERS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META"];

export function LiveFeedTicker() {
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function fetchFeeds() {
            try {
                const results: TickerData[] = [];

                // Fetch structure data for all M7 tickers in parallel
                const promises = M7_TICKERS.map(async (symbol) => {
                    try {
                        const res = await fetch(`/api/live/options/structure?t=${symbol}`);
                        if (!res.ok) return null;
                        const data = await res.json();
                        return { symbol, ...data } as TickerData;
                    } catch {
                        return null;
                    }
                });

                const settled = await Promise.all(promises);
                for (const r of settled) {
                    if (r) results.push(r);
                }

                const items = buildFeedItems(results);
                if (items.length > 0) {
                    setFeedItems(items);
                }
            } catch (e) {
                console.warn('[LiveFeedTicker] fetch error:', e);
            } finally {
                setLoading(false);
            }
        }

        fetchFeeds();
        const interval = setInterval(fetchFeeds, 60000); // 60초마다 갱신
        return () => clearInterval(interval);
    }, []);

    // 피드 아이템을 3번 반복해 무한 루프 효과
    const repeatedItems = [...feedItems, ...feedItems, ...feedItems];

    if (loading || feedItems.length === 0) {
        return (
            <div className="w-full py-2.5 bg-[#070e1b]/80 border-y border-white/5">
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    <span className="uppercase tracking-widest font-bold text-xs">
                        Loading live feed...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full py-2.5 bg-[#070e1b]/80 border-y border-white/5 overflow-hidden">
            <div className="flex items-center">
                {/* LIVE badge */}
                <div className="flex-shrink-0 flex items-center gap-1.5 px-4 border-r border-white/10">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                    </span>
                    <span className="text-xs font-black text-red-400 uppercase tracking-widest">
                        LIVE
                    </span>
                </div>

                {/* Scrolling Feed */}
                <div className="overflow-hidden flex-1">
                    <div
                        ref={scrollRef}
                        className="flex items-center gap-6 animate-marquee whitespace-nowrap"
                        style={{
                            animation: `marquee ${feedItems.length * 4}s linear infinite`,
                        }}
                    >
                        {repeatedItems.map((item, i) => (
                            <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={item.color}>{item.icon}</span>
                                <span className={`text-xs font-mono font-medium ${item.color}`}>
                                    {item.text}
                                </span>
                                {i < repeatedItems.length - 1 && (
                                    <span className="text-slate-700 mx-2">│</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
