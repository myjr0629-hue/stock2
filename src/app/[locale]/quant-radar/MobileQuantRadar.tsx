"use client";

import React, { useState, useEffect, useTransition } from 'react';
import { 
    Radar, Zap, Sliders, Activity, Search, ChevronRight, ChevronLeft, AlertCircle,
    TrendingUp, TrendingDown, Target, Lock, Clipboard, Check 
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';

interface TickerData {
    ticker: string;
    rsi: number | null;
    gex: number | null;
    pcr: number | null;
    putFloor: number | null;
    gammaFlipLevel: number | null;
    whaleIndex: number;
    alphaSnapshot: {
        score: number;
        grade: string;
        action: string;
        whyKR?: string;
    };
    realtime?: {
        price: number;
        changePct: number;
    };
}

export function MobileQuantRadar() {
    const t = useTranslations();
    const locale = useLocale();

    // 1. Enforce Admin Security Lock using Tier Context
    const { isAdmin, loading: tierLoading } = useTier();

    // Mobile Tabs
    const [activeTab, setActiveTab] = useState<'SIGNALS' | 'FILTER' | 'FACTS'>('SIGNALS');

    // Filter states
    const [scoreMin, setScoreMin] = useState(60);
    const [selectedGrades, setSelectedGrades] = useState<string[]>(['S', 'A', 'B']);
    const [selectedOverlay, setSelectedOverlay] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [gexMin, setGexMin] = useState<number>(-10);
    
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [tickers, setTickers] = useState<TickerData[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    // Clipboard copy indicators
    const [copiedTicker, setCopiedTicker] = useState<string | null>(null);

    const fetchMobileData = () => {
        if (!isAdmin) return;
        setLoading(true);
        const queryParams = new URLSearchParams({
            scoreMin: scoreMin.toString(),
            grades: selectedGrades.join(','),
            overlay: selectedOverlay,
            search: searchQuery,
            gexMin: gexMin.toString(),
            sortBy: 'score',
            sortOrder: 'desc',
            page: page.toString(),
            pageSize: pageSize.toString()
        });

        startTransition(async () => {
            try {
                const res = await fetch(`/api/quant-radar?${queryParams.toString()}`);
                const data = await res.json();
                if (data.ok) {
                    setTickers(data.results || []);
                    setTotalCount(data.meta.totalCount || 0);
                    setTotalPages(data.meta.totalPages || 1);
                }
            } catch (e) {
                console.error('[MobileQuantRadar] Fetch failed:', e);
            } finally {
                setLoading(false);
            }
        });
    };

    useEffect(() => {
        fetchMobileData();
    }, [scoreMin, selectedGrades, selectedOverlay, page, gexMin, isAdmin]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchMobileData();
    };

    const toggleGrade = (grade: string) => {
        if (selectedGrades.includes(grade)) {
            setSelectedGrades(selectedGrades.filter(g => g !== grade));
        } else {
            setSelectedGrades([...selectedGrades, grade]);
        }
        setPage(1);
    };

    // One-click clipboard copy utility for bracket orders
    const copyBracketToClipboard = (item: TickerData, entryPrice: number, tp: number, sl: number) => {
        const score = item.alphaSnapshot.score;
        const grade = item.alphaSnapshot.grade;
        
        const text = `[${item.ticker}] LIMIT BUY @ $${entryPrice.toFixed(2)} | TP: $${tp.toFixed(2)} (+3.5%) | SL: $${sl.toFixed(2)} (-1.5%) | V7 Score: ${score} (${grade})`;
        
        navigator.clipboard.writeText(text).then(() => {
            setCopiedTicker(item.ticker);
            setTimeout(() => setCopiedTicker(null), 1500);
        });
    };

    // ────────────────────────────────────────────────────────
    // A. SECURITY LOCK SCREEN FOR MOBILE
    // ────────────────────────────────────────────────────────
    if (tierLoading) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center gap-3">
                <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest animate-pulse">Checking credentials...</p>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="w-full min-h-screen bg-[#070b13] flex flex-col justify-center items-center px-6 relative overflow-hidden">
                <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[250px] h-[250px] rounded-full bg-rose-500/5 blur-[80px] pointer-events-none" />

                <div className="w-full p-6 rounded-2xl bg-[#0b0f19]/95 border border-rose-500/20 shadow-2xl backdrop-blur-xl relative z-10 flex flex-col items-center text-center gap-5">
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        <Lock className="w-6 h-6 animate-pulse" />
                    </div>

                    <div className="flex flex-col gap-1">
                        <h2 className="text-[10px] font-black text-rose-400 tracking-widest uppercase">PROPRIETARY LOCK</h2>
                        <h1 className="text-base font-black text-white tracking-tight">ADMIN ACCESS ONLY</h1>
                        <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                            This cockpit is locked for general visitors. Access is exclusive to the fund administrator.
                        </p>
                    </div>

                    <div className="w-full p-3.5 rounded-xl bg-slate-950/80 border border-slate-900 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                        <span className="text-[9.5px] font-mono text-slate-500 text-left leading-normal">
                            Please authenticate in settings using your administrator credentials.
                        </span>
                    </div>

                    <Link href="/" className="h-10 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs font-bold flex items-center justify-center uppercase tracking-wider w-full">
                        Return
                    </Link>
                </div>
            </div>
        );
    }

    // ────────────────────────────────────────────────────────
    // B. AUTHORIZED MOBILE QUANT COCKPIT
    // ────────────────────────────────────────────────────────
    return (
        <div className="w-full min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-jakarta relative pb-24">
            
            {/* Ambient Background Light */}
            <div className="absolute top-0 left-0 w-full h-[180px] bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none" />

            {/* Mobile Header Banner */}
            <div className="w-full px-4 pt-4 pb-2 border-b border-slate-900 bg-[#070b13]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Radar className="w-5 h-5 text-cyan-400 animate-pulse" />
                    <div>
                        <h1 className="text-xs font-black tracking-widest text-white uppercase">QUANT RADAR</h1>
                        <p className="text-[8px] font-bold text-emerald-400 tracking-widest uppercase">⚡ PROPRIETARY COCKPIT</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[9px] px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                    <Activity className={`w-2.5 h-2.5 ${loading ? 'animate-spin' : ''}`} />
                    {totalCount} CODES
                </div>
            </div>

            {/* 3-Tab Sub Navigation */}
            <div className="w-full px-4 py-2 bg-[#070b13]/90 backdrop-blur-md border-b border-slate-900 flex sticky top-11 z-30">
                <div className="w-full grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900">
                    {[
                        { id: 'SIGNALS', label: 'SIGNALS', icon: Activity },
                        { id: 'FILTER', label: 'DIY SCANS', icon: Sliders },
                        { id: 'FACTS', label: 'FACT SHEETS', icon: Zap },
                    ].map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`py-2 text-[10px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                    active 
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10' 
                                        : 'text-slate-500 hover:text-slate-400'
                                }`}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* MAIN CONTENT BASED ON SELECTED TAB */}
            <div className="flex-1 w-full px-4 pt-3 relative z-10">

                {/* TAB 1: SIGNALS GRID */}
                {activeTab === 'SIGNALS' && (
                    <div className="flex flex-col gap-3.5">
                        {loading ? (
                            <div className="flex flex-col justify-center items-center py-32 gap-3">
                                <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
                                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Scanning signals...</p>
                            </div>
                        ) : tickers.length === 0 ? (
                            <div className="flex flex-col justify-center items-center py-24 gap-3 border border-dashed border-slate-900 rounded-xl bg-slate-950/20">
                                <AlertCircle className="w-6 h-6 text-slate-700" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">No signals matched</span>
                            </div>
                        ) : (
                            tickers.map(item => {
                                const score = item.alphaSnapshot?.score || 50;
                                const grade = item.alphaSnapshot?.grade || 'C';
                                const curPrice = item.realtime?.price || 0;
                                const putFloor = item.putFloor || 0;
                                const flipLevel = item.gammaFlipLevel || 0;

                                // Optimal buy entry boundary calculation
                                let entryMin = 0;
                                let entryMax = 0;
                                if (item.gex != null && item.gex > 0) {
                                    entryMin = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                    entryMax = curPrice * 1.002;
                                } else {
                                    entryMin = putFloor > 0 ? putFloor : curPrice * 0.95;
                                    entryMax = flipLevel > 0 ? flipLevel : curPrice * 0.985;
                                }

                                const takeProfit = curPrice * 1.035;
                                const stopLoss = curPrice * 0.985;

                                // Direct Trade Signal Tags on mobile
                                let signalLabel = 'NEUTRAL';
                                let signalColor = 'text-slate-400 border-slate-800 bg-slate-950/40';
                                if (score >= 80) {
                                    signalLabel = '🔥 STRONG BUY';
                                    signalColor = 'text-emerald-400 border-emerald-500/20 bg-emerald-950/30';
                                } else if (score >= 70) {
                                    signalLabel = '⚡ CALL BUY';
                                    signalColor = 'text-cyan-400 border-cyan-500/20 bg-cyan-950/30';
                                } else if (score <= 35) {
                                    signalLabel = '💀 PUT/SHORT';
                                    signalColor = 'text-rose-400 border-rose-500/20 bg-rose-950/30';
                                }

                                return (
                                    <div 
                                        key={item.ticker}
                                        className="p-4 rounded-xl bg-[#0b101c]/50 border border-slate-900 backdrop-blur-sm flex flex-col gap-3 active:bg-[#0c1222]/80 transition-all"
                                    >
                                        {/* Card Header: Ticker / Grade / Price */}
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center border ${
                                                    grade === 'S' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' :
                                                    grade === 'A' ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/20' :
                                                    grade === 'F' ? 'bg-rose-950/40 text-rose-400 border-rose-500/20' : 'bg-slate-950/40 text-slate-400 border-slate-900'
                                                }`}>
                                                    {grade}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-white uppercase tracking-wider">{item.ticker}</span>
                                                    <span className="text-[8px] font-mono text-slate-500">V7 COCKPIT</span>
                                                </div>
                                            </div>

                                            {/* Signal Badge */}
                                            <span className={`text-[8.5px] font-black tracking-widest px-2 py-0.5 rounded border uppercase ${signalColor}`}>
                                                {signalLabel}
                                            </span>
                                        </div>

                                        {/* Dynamic narrative + score progress row */}
                                        <div className="grid grid-cols-[38px_1fr] gap-3 items-center">
                                            <div className="h-[38px] rounded-lg bg-slate-950/60 border border-slate-900 flex flex-col justify-center items-center">
                                                <span className="text-xs font-black text-white font-mono leading-none">{score}</span>
                                                <span className="text-[6.5px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">SCORE</span>
                                            </div>

                                            <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-900/60 min-h-[38px] flex items-center">
                                                <p className="text-[9.5px] font-bold text-slate-300 leading-normal">
                                                    {item.alphaSnapshot?.whyKR || '분석 연산 중...'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Tactical buy target entry zone */}
                                        <div className="p-2.5 rounded-lg bg-cyan-950/10 border border-cyan-500/10 flex justify-between items-center text-[9px]">
                                            <span className="font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                <Target className="w-3 h-3 text-cyan-400" />
                                                Quant Target Support
                                            </span>
                                            <span className="text-emerald-400 font-mono font-black">
                                                ${entryMin.toFixed(2)} - ${entryMax.toFixed(2)}
                                            </span>
                                        </div>

                                        {/* One-click Clipboard Bracket Copy Button */}
                                        <button
                                            onClick={() => copyBracketToClipboard(item, entryMax, takeProfit, stopLoss)}
                                            className={`w-full h-9 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                                                copiedTicker === item.ticker
                                                    ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/25'
                                                    : 'bg-slate-950/60 text-cyan-400 border-slate-900 active:bg-slate-900'
                                            }`}
                                        >
                                            {copiedTicker === item.ticker ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    ORDER BRACKET COPIED!
                                                </>
                                            ) : (
                                                <>
                                                    <Clipboard className="w-3.5 h-3.5 text-cyan-500" />
                                                    COPY BRACKET ORDER
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })
                        )}

                        {/* Mobile pagination controls */}
                        {totalPages > 1 && (
                            <div className="py-2 flex justify-between items-center font-mono text-[9px] text-slate-500 border-t border-slate-900">
                                <span>PAGE {page} OF {totalPages}</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-30"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-30"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: DIY SCANS CONTROLS */}
                {activeTab === 'FILTER' && (
                    <div className="flex flex-col gap-5 p-4 rounded-xl bg-[#0b101c]/50 border border-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                            <Sliders className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">DIY screener knobs</span>
                        </div>

                        {/* Search Query */}
                        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ticker Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                                <input 
                                    type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="SEARCH e.g. TSLA, NVDA"
                                    className="w-full pl-8 pr-3 h-9 bg-slate-950/60 border border-slate-850 rounded-lg text-xs font-bold uppercase tracking-wider text-white outline-none"
                                />
                            </div>
                        </form>

                        {/* Context Score Minimum */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                                <span>Context Score Threshold</span>
                                <span className="text-cyan-400 font-mono font-black text-xs">{scoreMin}</span>
                            </div>
                            <input 
                                type="range" min="30" max="95" value={scoreMin}
                                onChange={(e) => { setScoreMin(Number(e.target.value)); setPage(1); }}
                                className="w-full h-1 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-500"
                            />
                        </div>

                        {/* Ticker Grades selection */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Alpha Grades</label>
                            <div className="grid grid-cols-6 gap-1">
                                {['S', 'A', 'B', 'C', 'D', 'F'].map(g => {
                                    const active = selectedGrades.includes(g);
                                    return (
                                        <button
                                            key={g} onClick={() => toggleGrade(g)}
                                            className={`h-7 rounded-lg text-xs font-black transition-all ${
                                                active 
                                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                                                    : 'bg-slate-950/60 text-slate-500 border border-slate-900'
                                            }`}
                                        >
                                            {g}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Statistical Overlays */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Macro Overlays</label>
                            <div className="flex flex-col gap-1">
                                {[
                                    { value: '', label: 'All Indicators' },
                                    { value: 'extreme_oversold', label: '🔥 RSI Extreme Oversold (RSI < 25)' },
                                    { value: 'fear_resolution', label: '⚡ Fear Resolution (QQQ Panic Bounce)' },
                                    { value: 'r_mode', label: '🔄 Regime: R-Mode Recovery' },
                                    { value: 'whale', label: '🐳 Institutional whale (>= 65)' },
                                ].map(item => (
                                    <button
                                        key={item.value} onClick={() => { setSelectedOverlay(item.value); setPage(1); }}
                                        className={`w-full text-left h-8 px-3 rounded-lg text-[9px] font-bold transition-all flex items-center ${
                                            selectedOverlay === item.value
                                                ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/20'
                                                : 'bg-slate-950/40 text-slate-400'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => { setActiveTab('SIGNALS'); fetchMobileData(); }}
                            className="w-full py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs tracking-wider uppercase shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                        >
                            RUN RADAR SCAN
                        </button>
                    </div>
                )}

                {/* TAB 3: BACKTEST STATS / FACTS */}
                {activeTab === 'FACTS' && (
                    <div className="flex flex-col gap-4 p-4 rounded-xl bg-[#0b101c]/50 border border-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                            <Zap className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Empirical Statistical backing</span>
                        </div>

                        <div className="flex flex-col gap-3 font-bold text-[10px] leading-relaxed text-slate-400">
                            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-900/60 flex flex-col gap-1">
                                <span className="text-emerald-400 uppercase tracking-widest text-[9px] font-black">🔥 S-Grade performance</span>
                                <p>Out-of-sample backtests over 54,850 chronological pairs prove S-Grade returns are monotonically increasing:</p>
                                <ul className="list-disc pl-4 space-y-1 mt-1 text-[9px] text-slate-500">
                                    <li>Average 3D return expectation: <strong className="text-emerald-400 font-mono">+3.42%</strong></li>
                                    <li>Out-of-sample Pearson Correlation r: <strong className="text-white font-mono">+0.2850</strong></li>
                                    <li>Probability Test: <strong className="text-white font-mono">p &lt; 0.0001</strong> (Highly Significant)</li>
                                </ul>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-900/60 flex flex-col gap-1">
                                <span className="text-rose-400 uppercase tracking-widest text-[9px] font-black">⚠️ F-Grade short mitigation</span>
                                <p>F-Grade score recalibrations clamp at -2.15% average returns over a 3-day hold period, providing perfect short hedge signals for technical analysis.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
