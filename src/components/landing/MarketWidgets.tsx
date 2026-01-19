
"use client";

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, Activity, Newspaper, Smile, Frown, ShieldAlert, BarChart3, Megaphone, Waves } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { NewsItem, MacroData } from '@/services/stockApi';
import { useTranslations } from 'next-intl';

export interface IndexData {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    history: { date: string; close: number }[];
}

interface MarketPulseProps {
    indices: IndexData[];
    fearAndGreed?: {
        value: number;
        label: string;
        previous: string;
    };
    macro?: MacroData;
}

export function MarketPulse({ indices, fearAndGreed, macro }: MarketPulseProps) {
    const t = useTranslations('market');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!indices || indices.length === 0) return <div className="h-full bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-pulse" />;

    const renderIndexCard = (data: IndexData, color: string) => {
        const isPositive = data.change >= 0;
        return (
            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors h-full flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide truncate">{data.name}</h4>
                        <div className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5 ${isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                            }`}>
                            {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {Math.abs(data.changePercent).toFixed(2)}%
                        </div>
                    </div>
                    <div className="text-xl font-bold text-slate-900 tracking-tight tabular-nums">
                        {data.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="h-12 w-full mt-3 flex flex-col min-w-0 min-h-0">
                    {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.history}>
                                <defs>
                                    <linearGradient id={`gradient-${data.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <YAxis domain={['auto', 'auto']} hide />
                                <Area
                                    type="monotone"
                                    dataKey="close"
                                    stroke={color}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    isAnimationActive={true}
                                    fill={`url(#gradient-${data.symbol})`}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <div className="w-full h-full bg-slate-100/50 rounded animate-pulse" />}
                </div>
            </div>
        );
    };

    const renderFearAndGreed = () => {
        if (!fearAndGreed) return null;
        const score = fearAndGreed.value;
        const getStatusInfo = (label: string) => {
            const l = label.toLowerCase();
            if (l.includes("extreme greed")) return { ko: t('extremeGreed'), desc: t('sellConsider') };
            if (l.includes("greed")) return { ko: t('greed'), desc: t('buySpread') };
            if (l.includes("neutral")) return { ko: t('neutral'), desc: t('searchDirection') };
            if (l.includes("extreme fear")) return { ko: t('extremeFear'), desc: t('buyOpportunity') };
            if (l.includes("fear")) return { ko: t('fear'), desc: t('volatilityWarning') };
            return { ko: label, desc: "" };
        };

        const currentInfo = getStatusInfo(fearAndGreed.label);
        let color = "#94a3b8"; // Neutral
        if (score >= 75) color = "#10b981"; // Extreme Greed
        else if (score >= 55) color = "#34d399"; // Greed
        else if (score >= 45) color = "#facc15"; // Neutral
        else if (score >= 25) color = "#fb923c"; // Fear
        else color = "#f43f5e"; // Extreme Fear

        return (
            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors h-full flex flex-col justify-between">
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide truncate">{t('fearGreedTitle')}</h4>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold" style={{ color }}>{Math.round(score)}</span>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{currentInfo.ko}</span>
                        </div>
                    </div>
                </div>
                <div className="mt-3 relative h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
                </div>
                <div className="mt-1 text-[10px] text-slate-400 font-medium text-right">{currentInfo.desc}</div>
            </div>
        );
    }

    // 1. Macro Regime Widget (Treasury Focus)
    const renderRegime = () => {
        if (!macro) return null;
        const regimeColor = macro.regime === "Risk-On" ? "text-emerald-600 bg-emerald-50"
            : macro.regime === "Risk-Off" ? "text-rose-600 bg-rose-50"
                : "text-slate-600 bg-slate-100";

        return (
            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors h-full flex flex-col justify-between">
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide truncate">{t('macroRegime')}</h4>
                    <div className="mt-3 flex items-center justify-between">
                        <span className={`px-2 py-1 rounded-md text-sm font-bold tracking-tight ${regimeColor}`}>{macro.regime}</span>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200/60">
                    <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400">US Treasury 10Y</span>
                            <span className="text-lg font-bold text-slate-700 tabular-nums">{macro.us10y.toFixed(2)}%</span>
                        </div>
                        <Activity className="w-5 h-5 text-slate-300" />
                    </div>
                </div>
            </div>
        );
    };

    // 2. VIX Widget (Volatility Focus)
    const renderVix = () => {
        if (!macro) return null;
        // VIX Interpretation
        const vixLevel = macro.vix > 20 ? "High Volatility" : macro.vix < 13 ? "Complacent" : "Normal";
        const vixColor = macro.vix > 20 ? "text-rose-600" : macro.vix < 13 ? "text-emerald-600" : "text-blue-600";

        return (
            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors h-full flex flex-col justify-between">
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide truncate">{t('vixTitle')}</h4>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`text-2xl font-extrabold ${vixColor}`}>{macro.vix.toFixed(2)}</span>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500">{vixLevel}</span>
                    <Waves className="w-5 h-5 text-slate-300" />
                </div>
                <div className="mt-1 relative h-1 bg-slate-200 rounded-full overflow-hidden">
                    {/* Visual bar relative to 40 max */}
                    <div className="absolute top-0 left-0 h-full rounded-full bg-slate-400" style={{ width: `${Math.min((macro.vix / 40) * 100, 100)}%` }}></div>
                </div>
            </div>
        );
    };

    const colors = ["#3b82f6", "#8b5cf6", "#f59e0b"]; // Blue, Purple, Amber

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    {t('marketPulse')}
                </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {indices.map((index, i) => (
                    <div key={index.symbol}>
                        {renderIndexCard(index, colors[i % colors.length])}
                    </div>
                ))}
                {renderFearAndGreed()}
                {renderRegime()}
                {renderVix()}
            </div>
        </div>
    );
}

import { Link } from '@/i18n/routing';

export function MarketMovers({ gainers = [], losers = [] }: { gainers: any[], losers: any[] }) {
    const t = useTranslations('market');
    const [activeTab, setActiveTab] = useState<'gainers' | 'losers'>('gainers');
    const data = activeTab === 'gainers' ? gainers : losers;
    const isGainers = activeTab === 'gainers';

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Market Movers (S&P 500)</h3>
            </div>
            <div className="flex p-1 bg-slate-100 rounded-lg mb-4">
                <button
                    onClick={() => setActiveTab('gainers')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'gainers' ? "bg-white text-emerald-600 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}>
                    <TrendingUp className="w-3.5 h-3.5" /> {t('gainers')}
                </button>
                <button
                    onClick={() => setActiveTab('losers')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'losers' ? "bg-white text-rose-600 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}>
                    <TrendingDown className="w-3.5 h-3.5" /> {t('losers')}
                </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {data.map((stock) => (
                    <Link key={stock.symbol} href={`/ticker?ticker=${stock.symbol}`} className="block">
                        <div className="flex items-center justify-between group cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors -mx-2">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isGainers ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                    {stock.symbol[0]}
                                </div>
                                <div>
                                    <div className="font-semibold text-sm text-slate-900">{stock.symbol}</div>
                                    <div className="text-xs text-slate-400 truncate w-24">{stock.name}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium text-sm text-slate-900">${stock.price.toFixed(2)}</div>
                                <div className={`text-xs font-medium ${stock.changePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

interface NewsFeedProps {
    news?: NewsItem[];
}

export function NewsFeed({ news = [] }: NewsFeedProps) {
    const [activeTab, setActiveTab] = useState<'all' | 'official' | 'opinion'>('all');

    // Filter Logic
    const displayNews = news.filter(n => {
        if (activeTab === 'all') return true;
        if (activeTab === 'official') return n.type === 'Official';
        return n.type === 'News' || n.type === 'Opinion';
    });

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-primary" />
                    Global News (GEMS Intel)
                </h3>
            </div>

            <div className="flex p-1 bg-slate-100 rounded-lg mb-4">
                <button onClick={() => setActiveTab('all')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'all' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>All</button>
                <button onClick={() => setActiveTab('official')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'official' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>Official</button>
                <button onClick={() => setActiveTab('opinion')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'opinion' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>News</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin">
                {displayNews.length > 0 ? (
                    displayNews.map((item, i) => (
                        <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="block group">
                            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all">
                                <div className="flex justify-between items-start gap-2 mb-1">
                                    <div className="flex items-center gap-1.5">
                                        {item.type === 'Official' && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold flex items-center gap-0.5"><Megaphone className="w-2 h-2" /> Official</span>}
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.publisher}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 whitespace-nowrap">{item.time}</span>
                                </div>
                                <h4 className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-primary transition-colors line-clamp-2">
                                    {item.title}
                                </h4>
                            </div>
                        </a>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                        <Newspaper className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-xs">No Intel Available</p>
                    </div>
                )}
            </div>
        </div>
    );
}
